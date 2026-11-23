import "server-only";
// Payroll period workflow (server only): calculate → approve → pay → close, payslip publishing.
// All functions check permissions first, then use the service-role client with bulk queries
// (≈20 round trips per calculation regardless of headcount).

import { supabaseAdmin } from "@/lib/supabase/admin";
import { requirePerm } from "@/lib/auth";
import { summarize } from "@/lib/attendance/engine";
import { computeEntry, DEFAULT_PAYROLL_CONFIG, type EmployeePayInput, type LineInput, type PayItemDef, type PayrollConfig } from "./engine";
import { DEFAULT_SSO_CONFIG, DEFAULT_TAX_CONFIG, type SsoConfig, type TaxConfig } from "./tax";
import { computeLeavePay, expandLeaveRequest, nextDate, type LeaveDay, type LeaveTypeRule } from "./leave";
import { PENDING_SOURCE_LABEL, pendingToRelease, selectPendingForPeriod, type PendingItem } from "./pending";
import { salaryAsOf } from "./retro";
import { adjustmentKey, commissionKey, debtKey, inputsChanged, leaveUnitsByDate, prevEmployerApplies, regularWorkMinutes, workedDayUnits } from "./period-rules";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Q = any;
const PAGE = 1000;
const IN_CHUNK = 200;

/** every row of a query, page by page (the API returns at most 1,000 rows per call) — the query needs a stable order */
async function fetchAll<T>(build: () => Q): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) return out;
  }
}
/** fetchAll for an `in (...)` filter, split so the URL stays short */
async function fetchByIds<T>(ids: number[], build: (ids: number[]) => Q): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK) out.push(...(await fetchAll<T>(() => build(ids.slice(i, i + IN_CHUNK)))));
  return out;
}
/** insert rows in chunks of 500 */
async function insertChunks<T>(table: string, rows: Record<string, unknown>[], select?: string): Promise<T[]> {
  const sb = supabaseAdmin();
  const out: T[] = [];
  for (let i = 0; i < rows.length; i += 500) {
    const q = sb.from(table).insert(rows.slice(i, i + 500), { defaultToNull: false });
    const { data, error } = select ? await q.select(select) : await q;
    if (error) throw new Error(error.message);
    if (data) out.push(...(data as T[]));
  }
  return out;
}
/** unwrap a Supabase result or throw its error */
function must<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
}
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const firstOfMonth = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}-01`;
const dow = (d: string) => new Date(d + "T00:00:00Z").getUTCDay();
const shiftDate = (d: string, n: number) => new Date(Date.parse(d + "T00:00:00Z") + n * 86_400_000).toISOString().slice(0, 10);

export interface PeriodRow {
  id: number;
  code: string;
  name: string;
  period_type: string;
  pay_year: number;
  pay_month: number;
  start_date: string;
  end_date: string;
  att_start_date: string | null;
  att_end_date: string | null;
  pay_date: string;
  include_salary: boolean;
  include_attendance: boolean;
  include_constants: boolean;
  include_tax: boolean;
  include_sso: boolean;
  include_pvd: boolean;
  filter: { branch_ids?: number[]; employee_types?: string[]; employee_ids?: number[] } | null;
  status: "open" | "calculated" | "approved" | "paid" | "closed";
  payslip_published: boolean;
}

async function loadPeriod(id: number): Promise<PeriodRow> {
  const sb = supabaseAdmin();
  const p = must(await sb.from("payroll_periods").select("*").eq("id", id).maybeSingle()) as PeriodRow | null;
  if (!p) throw new Error("ไม่พบงวดเงินเดือนนี้");
  return p;
}

async function settings<T>(key: string, fallback: T): Promise<T> {
  const { data } = await supabaseAdmin().from("settings").select("value").eq("key", key).maybeSingle();
  return { ...fallback, ...((data?.value as T) ?? {}) };
}

type Emp = {
  id: number; code: string; prefix: string | null; first_name: string; last_name: string; employee_type: string; status: string;
  hire_date: string; resign_date: string | null; branch_id: number | null; org_unit_id: number | null; position_id: number | null; weekly_off_days: number[] | null;
  attendance_exempt: boolean;
};
type Priv = {
  employee_id: number; salary: number; salary_unit: "month" | "day" | "hour"; pay_method: string; bank_code: string | null; bank_account: string | null;
  sso_enabled: boolean; pvd_enabled: boolean; pvd_employee_rate: number | null; pvd_employer_rate: number | null; tax_method: "annualized" | "none" | "fixed_rate";
  tax_fixed_rate: number | null; tax_paid_by_employer?: boolean; prev_employer_income: number; prev_employer_tax: number; prev_employer_sso: number; prev_employer_pvd: number;
  ytd_open_year?: number | null; ytd_open_income?: number; ytd_open_tax?: number; ytd_open_sso?: number; ytd_open_pvd?: number;
};
type AttDay = {
  employee_id: number; work_date: string; day_type: string; work_minutes: number; late_minutes: number; early_minutes: number; break_over_minutes: number;
  absent: boolean; missing_scan: boolean; ot_approved_minutes: Record<string, number> | null; leave_minutes: number;
};

export interface CalcResult {
  employees: number;
  warnings: number;
  total_net: number;
  ms: number;
  attendance_recalc: string;
}

/**
 * Calculate (or recalculate) every entry of a payroll period.
 * Replaces payroll_entries + payroll_entry_items (all, or only `opts.employeeIds`). Period must be open / calculated.
 */
export async function calculatePeriod(periodId: number, opts: { employeeIds?: number[] } = {}): Promise<CalcResult> {
  await requirePerm("payroll", "edit");
  return calculatePeriodUnchecked(periodId, opts);
}

/** in-memory recalculation of a period (retro pay): nothing is written except a forced attendance recalculation */
export interface SimulatedEntry {
  employee_id: number;
  lines: ReturnType<typeof computeEntry>["lines"];
  warnings: string[];
}

/**
 * calculation without the permission check — for cron jobs / scripts that already authorised the caller.
 * `simulate`: recalculate an approved / paid / closed period in memory with today's data and put the result in
 * `simulate.result` instead of writing entries (lib/payroll/retro.ts). Attendance of the range is recalculated with
 * force (re-locked afterwards for a closed period); the salary is the one in force at the period end; only pending
 * money already paid in this period is included.
 */
export async function calculatePeriodUnchecked(periodId: number, opts: { employeeIds?: number[]; simulate?: { result?: SimulatedEntry[] } } = {}): Promise<CalcResult> {
  const t0 = Date.now();
  const sb = supabaseAdmin();
  const period = await loadPeriod(periodId);
  const sim = opts.simulate;
  if (!sim && !["open", "calculated"].includes(period.status)) throw new Error("งวดนี้อนุมัติแล้ว ต้องกด \"เปิดแก้ไข\" ก่อนจึงจะคำนวณใหม่ได้");
  if (sim && !opts.employeeIds?.length) throw new Error("ระบุพนักงานที่ต้องการคำนวณตกเบิก");

  const [payCfgRaw, ssoCfg, taxCfg, attCfg] = await Promise.all([
    settings<Record<string, unknown>>("payroll", {}),
    settings<SsoConfig>("sso_config", DEFAULT_SSO_CONFIG),
    settings<TaxConfig>("tax_config", DEFAULT_TAX_CONFIG),
    settings<{ diligence?: { enabled?: boolean; pay_item_code?: string; steps?: number[] } }>("attendance", {}),
  ]);
  const cfg: PayrollConfig = { ...DEFAULT_PAYROLL_CONFIG };
  for (const k of Object.keys(DEFAULT_PAYROLL_CONFIG) as (keyof PayrollConfig)[]) if (payCfgRaw[k] !== undefined) (cfg as unknown as Record<string, unknown>)[k] = payCfgRaw[k];

  // ---- pay items ------------------------------------------------------------------------
  const allItems = must(await sb.from("pay_items").select("id, code, name, category, direction, is_taxable, is_sso, is_pvd_base, is_regular, calc_type, rate, system_key")) as PayItemDef[];
  const itemById = new Map(allItems.map((i) => [i.id, { ...i, rate: i.rate == null ? null : Number(i.rate) }]));
  const bySys: Record<string, PayItemDef> = {};
  for (const i of itemById.values()) if (i.system_key) bySys[i.system_key] = i;
  const byCode = new Map([...itemById.values()].map((i) => [i.code, i]));

  // ---- employees ----------------------------------------------------------------------------
  const f = period.filter ?? {};
  let emps = await fetchAll<Emp>(() => {
    let q = sb
      .from("employees")
      .select("id, code, prefix, first_name, last_name, employee_type, status, hire_date, resign_date, branch_id, org_unit_id, position_id, weekly_off_days, attendance_exempt")
      .lte("hire_date", period.end_date)
      .or(`resign_date.is.null,resign_date.gte.${period.start_date}`)
      .order("id");
    if (f.branch_ids?.length) q = q.in("branch_id", f.branch_ids);
    if (f.employee_types?.length) q = q.in("employee_type", f.employee_types);
    if (f.employee_ids?.length) q = q.in("id", f.employee_ids);
    return q;
  });
  emps = emps.filter((e) => e.status !== "resigned" || (e.resign_date && e.resign_date >= period.start_date));
  // people who left before this period but still have money in the pending inbox (final settlement, retro) due in it:
  // they get an entry with only that money — no salary, attendance, recurring items, loans or guarantee
  const pendingOnly = new Set<number>();
  if (!sim) {
    const inRun = new Set(emps.map((e) => e.id));
    const pendingRows = await fetchAll<{ employee_id: number }>(() => {
      const pq = sb.from("payroll_pending_items").select("id, employee_id").neq("status", "cancelled").neq("status", "paid").order("id");
      return period.period_type === "monthly" ? pq.or(`period_id.eq.${period.id},and(period_id.is.null,effective_date.lte.${period.end_date})`) : pq.eq("period_id", period.id);
    });
    const waiting = [...new Set(pendingRows.map((r) => Number(r.employee_id)))].filter((id) => !inRun.has(id));
    if (waiting.length) {
      const extra = await fetchByIds<Emp>(waiting, (part) => {
        let q = sb.from("employees").select("id, code, prefix, first_name, last_name, employee_type, status, hire_date, resign_date, branch_id, org_unit_id, position_id, weekly_off_days, attendance_exempt").in("id", part).not("resign_date", "is", null).lt("resign_date", period.start_date).order("id");
        if (f.branch_ids?.length) q = q.in("branch_id", f.branch_ids);
        if (f.employee_types?.length) q = q.in("employee_type", f.employee_types);
        if (f.employee_ids?.length) q = q.in("id", f.employee_ids);
        return q;
      });
      for (const e of extra) pendingOnly.add(e.id);
      emps = [...emps, ...extra];
    }
  }
  if (opts.employeeIds?.length) {
    const want = new Set(opts.employeeIds.map(Number));
    emps = emps.filter((e) => want.has(e.id));
  }
  const ids = emps.map((e) => e.id);
  const attFrom = period.att_start_date ?? period.start_date;
  const attTo = period.att_end_date ?? period.end_date;
  const monthFirst = firstOfMonth(period.pay_year, period.pay_month);

  // ---- attendance recalculation (module from the attendance team; optional) -------------------
  let attendanceRecalc = "skipped";
  if (period.include_attendance && ids.length) {
    try {
      const mod = (await import("@/lib/attendance/server").catch(() => null)) as null | { recalcAttendance?: (o: { from: string; to: string; employeeIds?: number[]; force?: boolean }) => Promise<{ days: number }> };
      if (mod?.recalcAttendance) {
        const r = await mod.recalcAttendance({ from: attFrom, to: attTo, employeeIds: ids.filter((id) => !pendingOnly.has(id)), force: !!sim });
        attendanceRecalc = `recalculated ${r.days} days`;
        if (sim && period.status === "closed")
          must(await sb.from("attendance_days").update({ is_locked: true }).in("employee_id", ids).gte("work_date", attFrom).lte("work_date", attTo).select("id"));
      } else attendanceRecalc = "module not available";
    } catch (e) {
      attendanceRecalc = `failed: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  // ---- bulk loads ------------------------------------------------------------------------------
  const inIds = <T,>(table: string, select: string, extra?: (q: Q) => Q, col = "employee_id") =>
    fetchByIds<T>(ids, (part) => {
      let q = sb.from(table).select(select).in(col, part).order("id");
      if (extra) q = extra(q);
      return q;
    });

  const prevPeriods = must(
    await sb.from("payroll_periods").select("id, pay_year, pay_month, pay_date, status").eq("pay_year", period.pay_year).in("status", ["approved", "paid", "closed"]).neq("id", period.id),
  ) as { id: number; pay_month: number; pay_date: string }[];
  const ytdPeriodIds = prevPeriods.filter((p) => p.pay_month < period.pay_month).map((p) => p.id);
  const monthPeriodIds = prevPeriods.filter((p) => p.pay_month === period.pay_month && (p.pay_date < period.pay_date || (p.pay_date === period.pay_date && p.id < period.id))).map((p) => p.id);
  const histIds = [...ytdPeriodIds, ...monthPeriodIds];
  // last approved period before this one (any year) → diligence step
  const lastPrev = must(
    await sb.from("payroll_periods").select("id").in("status", ["approved", "paid", "closed"]).lt("pay_date", period.pay_date).eq("period_type", "monthly").order("pay_date", { ascending: false }).limit(1),
  ) as { id: number }[];

  // a loan instalment, an advance and the guarantee are monthly amounts: when another period of the same pay month
  // (bonus run, second half of a semi-monthly pair, ...) already carries the line, this one leaves it out
  const sameMonth = must(await sb.from("payroll_periods").select("id").eq("pay_year", period.pay_year).eq("pay_month", period.pay_month).neq("id", period.id)) as { id: number }[];
  const debtTaken = new Set<string>();
  if (sameMonth.length && ids.length) {
    const otherEntries = await fetchByIds<{ id: number }>(ids, (part) => sb.from("payroll_entries").select("id").in("employee_id", part).in("period_id", sameMonth.map((p) => p.id)).order("id"));
    const otherItems = await fetchByIds<{ source: string; source_id: number | null }>(otherEntries.map((e) => e.id), (part) =>
      sb.from("payroll_entry_items").select("id, source, source_id").in("entry_id", part).in("source", ["loan", "advance", "guarantee"]).order("id"),
    );
    for (const i of otherItems) if (i.source_id != null) debtTaken.add(debtKey(i.source, i.source_id));
  }

  const [privs, positions, constants, adjustments, commissions, plans, loans, advances, guarantees, attDays, leaveReqs, leaveTypes, taxDed, family, hist, prevDil, pendingAll] = await Promise.all([
    fetchByIds<Priv>(ids, (part) =>
      sb.from("employee_private").select("employee_id, salary, salary_unit, pay_method, bank_code, bank_account, sso_enabled, pvd_enabled, pvd_employee_rate, pvd_employer_rate, tax_method, tax_fixed_rate, tax_paid_by_employer, prev_employer_income, prev_employer_tax, prev_employer_sso, prev_employer_pvd, ytd_open_year, ytd_open_income, ytd_open_tax, ytd_open_sso, ytd_open_pvd").in("employee_id", part).order("employee_id"),
    ),
    fetchAll<{ id: number; name: string }>(() => sb.from("positions").select("id, name").order("id")),
    inIds<{ employee_id: number; pay_item_id: number; amount: number; qty: number | null; note: string | null; start_month: string | null; end_month: string | null; id: number }>(
      "employee_pay_items", "id, employee_id, pay_item_id, amount, qty, note, start_month, end_month",
      (q) => q.or(`start_month.is.null,start_month.lte.${monthFirst}`).or(`end_month.is.null,end_month.gte.${monthFirst}`),
    ),
    fetchAll<{ id: number; employee_id: number; pay_item_id: number; amount: number; qty: number | null; note: string | null; source: string }>(() =>
      sb.from("payroll_adjustments").select("id, employee_id, pay_item_id, amount, qty, note, source").eq("period_id", period.id).order("id"),
    ),
    fetchAll<{ id: number; employee_id: number; plan_id: number | null; commission: number; note: string | null }>(() =>
      sb.from("commission_entries").select("id, employee_id, plan_id, commission, note").eq("period_id", period.id).order("id"),
    ),
    fetchAll<{ id: number; name: string; pay_item_id: number | null }>(() => sb.from("commission_plans").select("id, name, pay_item_id").order("id")),
    inIds<{ id: number; employee_id: number; pay_item_id: number | null; loan_name: string; total_payable: number; installment_amount: number; paid_amount: number; start_month: string }>(
      "employee_loans", "id, employee_id, pay_item_id, loan_name, total_payable, installment_amount, paid_amount, start_month",
      (q) => q.eq("status", "active").lte("start_month", monthFirst),
    ),
    inIds<{ id: number; employee_id: number; amount: number; note: string | null }>(
      "salary_advances", "id, employee_id, amount, note",
      (q) => q.in("status", ["approved", "paid"]).eq("deduct_year", period.pay_year).eq("deduct_month", period.pay_month),
    ),
    inIds<{ id: number; employee_id: number; total_amount: number; monthly_amount: number; collected_amount: number; start_date: string | null; refunded_date: string | null }>(
      "employee_guarantees", "id, employee_id, total_amount, monthly_amount, collected_amount, start_date, refunded_date",
      (q) => q.is("refunded_date", null),
    ),
    period.include_attendance
      ? inIds<AttDay>("attendance_days", "employee_id, work_date, day_type, work_minutes, late_minutes, early_minutes, break_over_minutes, absent, missing_scan, ot_approved_minutes, leave_minutes", (q) => q.gte("work_date", attFrom).lte("work_date", attTo))
      : Promise.resolve([] as AttDay[]),
    inIds<{ id: number; employee_id: number; start_date: string; end_date: string | null; days: number | null; payload: { leave_type_id?: number | string; unit?: string } | null }>(
      "requests", "id, employee_id, start_date, end_date, days, payload",
      // from 1 Jan for per-year caps; 300 days further back for per-episode caps (maternity leave that started last year)
      (q) => q.eq("request_type", "leave").eq("status", "approved").lte("start_date", attTo).gte("end_date", shiftDate(`${attFrom.slice(0, 4)}-01-01`, -300)),
    ),
    fetchAll<{ id: number; name: string; is_paid: boolean; paid_days_limit: number | null; pay_rate_percent: number; count_non_workdays: boolean; paid_limit_scope?: string | null }>(() =>
      sb.from("leave_types").select("*").order("id"),
    ),
    inIds<{ employee_id: number; deduction_code: string; amount: number }>("employee_tax_deductions", "id, employee_id, deduction_code, amount", (q) => q.eq("tax_year", period.pay_year)),
    inIds<{ employee_id: number; relation: string; is_tax_allowance: boolean; is_alive: boolean; is_disabled: boolean }>(
      "employee_family", "id, employee_id, relation, is_tax_allowance, is_alive, is_disabled", (q) => q.eq("is_tax_allowance", true),
    ),
    histIds.length
      ? inIds<{ employee_id: number; period_id: number; taxable_income: number; tax: number; sso_wage: number; sso_employee: number; sso_employer: number; pvd_employee: number; calc_detail: { regular_taxable?: number; irregular_taxable?: number } | null }>(
          "payroll_entries", "id, employee_id, period_id, taxable_income, tax, sso_wage, sso_employee, sso_employer, pvd_employee, calc_detail", (q) => q.in("period_id", histIds),
        )
      : Promise.resolve([]),
    lastPrev.length
      ? inIds<{ employee_id: number; calc_detail: { diligence_step?: number | null } | null }>("payroll_entries", "id, employee_id, calc_detail", (q) => q.eq("period_id", lastPrev[0].id))
      : Promise.resolve([]),
    // เงินค้างจ่ายรอเข้างวด (สวัสดิการ เงินสดย่อย ตกเบิก ...) — unassigned rows + rows already claimed by this period
    inIds<PendingItem>(
      "payroll_pending_items", "id, employee_id, pay_item_id, amount, qty, note, source, source_id, effective_date, status, period_id",
      (q) => q.neq("status", "cancelled").or(`period_id.eq.${period.id},period_id.is.null`),
    ),
  ]);
  const pendingSel = sim
    ? pendingAll.filter((p) => Number(p.period_id) === period.id && p.status !== "pending")
    : selectPendingForPeriod(pendingAll, { id: period.id, period_type: period.period_type, end_date: period.end_date }, ids);
  if (sim) {
    // the salary in force at the end of the period, not today's (a later raise is not retro pay)
    const hist = await fetchByIds<{ employee_id: number; effective_date: string; new_salary: number }>(ids, (part) =>
      sb.from("salary_history").select("id, employee_id, effective_date, new_salary").in("employee_id", part).order("id"),
    );
    for (const p of privs) {
      const asOf = salaryAsOf(hist.filter((h) => Number(h.employee_id) === Number(p.employee_id)), period.end_date);
      if (asOf != null) p.salary = asOf;
    }
  }

  // ---- index by employee -------------------------------------------------------------------------
  const group = <T extends { employee_id: number }>(rows: T[]) => {
    const m = new Map<number, T[]>();
    for (const r of rows) {
      const k = Number(r.employee_id);
      const a = m.get(k);
      if (a) a.push(r);
      else m.set(k, [r]);
    }
    return m;
  };
  const privBy = new Map(privs.map((p) => [Number(p.employee_id), p]));
  const posBy = new Map(positions.map((p) => [p.id, p.name]));
  const constBy = group(constants);
  const adjBy = group(adjustments);
  const pendingBy = group(pendingSel);
  const comBy = group(commissions);
  const planBy = new Map(plans.map((p) => [p.id, p]));
  const loanBy = group(loans);
  const advBy = group(advances);
  const guarBy = group(guarantees.filter((g) => (!g.start_date || g.start_date <= period.end_date) && Number(g.collected_amount) < Number(g.total_amount)));
  const attBy = group(attDays);
  const leaveBy = group(leaveReqs);
  const ltBy = new Map(leaveTypes.map((t) => [t.id, t]));
  const ltRules: Record<number, LeaveTypeRule> = {};
  for (const t of leaveTypes) ltRules[t.id] = { is_paid: t.is_paid, paid_days_limit: t.paid_days_limit == null ? null : Number(t.paid_days_limit), pay_rate_percent: Number(t.pay_rate_percent), name: t.name, paid_limit_scope: t.paid_limit_scope === "episode" ? "episode" : "year" };
  const dedBy = group(taxDed);
  const famBy = group(family);
  const histBy = group(hist);
  const dilBy = new Map(prevDil.map((r) => [Number(r.employee_id), Number(r.calc_detail?.diligence_step ?? 0) || 0]));

  // diligence
  const dil = attCfg.diligence;
  const dilItem = dil?.enabled ? byCode.get(dil.pay_item_code ?? "DILIGENCE") ?? bySys.diligence ?? null : null;
  const commissionItem = bySys.commission ?? byCode.get("COMMISSION");
  const loanItem = bySys.loan ?? byCode.get("LOAN");

  const ytdSet = new Set(ytdPeriodIds);
  const entries: Record<string, unknown>[] = [];
  const lineSets: ReturnType<typeof computeEntry>["lines"][] = [];
  let warnCount = 0;

  for (const e of emps) {
    const p = privBy.get(e.id);
    const warnings: string[] = [];
    if (!p) {
      warnings.push("ไม่พบข้อมูลเงินเดือน (employee_private)");
    }
    const priv = p ?? ({ employee_id: e.id, salary: 0, salary_unit: "month", pay_method: "cash", bank_code: null, bank_account: null, sso_enabled: false, pvd_enabled: false, pvd_employee_rate: 0, pvd_employer_rate: 0, tax_method: "none", tax_fixed_rate: null, prev_employer_income: 0, prev_employer_tax: 0, prev_employer_sso: 0, prev_employer_pvd: 0 } as Priv);
    const leaverOnly = pendingOnly.has(e.id);
    if (leaverOnly) warnings.push(`พ้นสภาพแล้ว (${e.resign_date}) — จ่ายเฉพาะเงินค้างจ่ายในคิว`);
    else if (!(Number(priv.salary) > 0)) warnings.push("ยังไม่ได้กำหนดเงินเดือน/ค่าจ้าง");
    if (priv.pay_method === "bank" && (!priv.bank_account || !priv.bank_code)) warnings.push("จ่ายผ่านธนาคารแต่ยังไม่มีเลขบัญชี");

    // ---- attendance summary ----
    const days = attBy.get(e.id) ?? [];
    const empFrom = e.hire_date > attFrom ? e.hire_date : attFrom;
    const empTo = e.resign_date && e.resign_date < attTo ? e.resign_date : attTo;
    const off = new Set(e.weekly_off_days ?? [0]);
    const dayType = new Map(days.map((d) => [d.work_date, d.day_type]));
    let att: EmployeePayInput["att"];
    let summary: ReturnType<typeof summarize> | null = null;
    let leaveInfo: ReturnType<typeof computeLeavePay> | null = null;
    // leave → paid / unpaid split
    const reqs = leaveBy.get(e.id) ?? [];
    const leaveDays: LeaveDay[] = [];
    if (reqs.length) {
      for (const r of reqs) {
        const ltId = Number(r.payload?.leave_type_id);
        const lt = ltBy.get(ltId);
        if (!lt) continue;
        const countable = (d: string) => lt.count_non_workdays || (dayType.has(d) ? ["work", "special"].includes(dayType.get(d)!) : !off.has(dow(d)));
        leaveDays.push(...expandLeaveRequest({ start_date: r.start_date, end_date: r.end_date, days: r.days, unit: r.payload?.unit ?? "full", leave_type_id: ltId }, countable));
      }
      leaveInfo = computeLeavePay(leaveDays, ltRules, empFrom, empTo);
    }
    if (!period.include_attendance) {
      att = { work_days: 0, paid_holiday_days: 0, paid_leave_days: 0, unpaid_leave_days: 0, absent_days: 0, late_minutes: 0, early_minutes: 0, work_minutes: 0, ot_minutes: {}, late_count: 0 };
    } else if (!days.length || e.attendance_exempt) {
      // no attendance data → full attendance on scheduled work days
      let wd = 0;
      for (let d = empFrom; d <= empTo; d = nextDate(d)) if (!off.has(dow(d))) wd++;
      if (!e.attendance_exempt && !leaverOnly) warnings.push("ไม่พบข้อมูลเวลาทำงานในช่วงตัดรอบ — คำนวณเสมือนมาทำงานครบ");
      att = {
        work_days: wd, paid_holiday_days: 0, paid_leave_days: leaveInfo?.paid_leave_days ?? 0, unpaid_leave_days: leaveInfo?.unpaid_leave_days ?? 0, absent_days: 0,
        late_minutes: 0, early_minutes: 0, work_minutes: wd * cfg.hours_per_day * 60, ot_minutes: {}, late_count: 0,
      };
      if (priv.salary_unit !== "month") {
        att.work_days = Math.max(0, wd - att.paid_leave_days - att.unpaid_leave_days);
        att.work_minutes = att.work_days * cfg.hours_per_day * 60; // hourly: leave hours are paid through paid_leave_days
      }
    } else {
      const inRange = days.filter((d) => d.work_date >= empFrom && d.work_date <= empTo);
      summary = summarize(inRange.map((d) => ({ ...d, ot_approved_minutes: d.ot_approved_minutes ?? {} })));
      // a leave day is never "absent" (the attendance engine normally takes care of this; double-check here)
      const leaveDates = new Set(inRange.filter((d) => d.leave_minutes > 0).map((d) => d.work_date));
      const absent = inRange.filter((d) => d.absent && !leaveDates.has(d.work_date)).length;
      // hourly: plain-rate minutes exclude day-off / holiday work (paid through the multiplier);
      // daily: a day partly on leave counts only for the part worked
      const workMinutes = priv.salary_unit === "hour" ? regularWorkMinutes(inRange) : inRange.reduce((s, d) => s + (Number(d.work_minutes) || 0), 0);
      att = {
        work_days: priv.salary_unit === "day" ? workedDayUnits(inRange, leaveUnitsByDate(leaveDays.filter((l) => l.date >= empFrom && l.date <= empTo))) : summary.work_days,
        paid_holiday_days: summary.holiday_days_paid,
        paid_leave_days: leaveInfo?.paid_leave_days ?? 0,
        unpaid_leave_days: leaveInfo?.unpaid_leave_days ?? 0,
        absent_days: absent,
        late_minutes: summary.late_minutes,
        early_minutes: summary.early_minutes,
        work_minutes: workMinutes,
        ot_minutes: summary.ot_minutes,
        late_count: summary.late_count,
      };
      if (summary.missing_scan_days) warnings.push(`ลืมสแกน ${summary.missing_scan_days} วัน`);
      const covered = new Set(inRange.map((d) => d.work_date));
      let missing = 0;
      for (let d = empFrom; d <= empTo; d = nextDate(d)) if (!covered.has(d)) missing++;
      if (missing) warnings.push(`ไม่มีผลคำนวณเวลา ${missing} วันในช่วงตัดรอบ`);
    }

    // ---- lines from tables ----
    const line = (item: PayItemDef | undefined, amount: number, extra: Partial<LineInput> = {}): LineInput[] => (item ? [{ item, amount: Number(amount) || 0, ...extra }] : []);
    const consts = (constBy.get(e.id) ?? []).flatMap((c) => line(itemById.get(c.pay_item_id), c.amount, { qty: c.qty, note: c.note, source: "constant", source_id: c.id }));
    const adjs = (adjBy.get(e.id) ?? []).flatMap((a) => line(itemById.get(a.pay_item_id), a.amount, { qty: a.qty, note: a.note, source: a.source ?? "manual", source_id: a.id }));
    // retro pay belongs to earlier months: irregular, so the withholding does not project it over the rest of the year
    for (const pi of pendingBy.get(e.id) ?? []) adjs.push(...line(itemById.get(pi.pay_item_id), pi.amount, { qty: pi.qty, note: pi.note, source: pi.source, source_id: pi.id, irregular: pi.source === "retro" }));
    for (const c of comBy.get(e.id) ?? []) {
      const plan = c.plan_id ? planBy.get(c.plan_id) : undefined;
      const it = (plan?.pay_item_id ? itemById.get(plan.pay_item_id) : undefined) ?? commissionItem;
      adjs.push(...line(it, c.commission, { note: plan?.name ?? c.note, source: "commission", source_id: c.id }));
    }
    const loanLines = (loanBy.get(e.id) ?? []).flatMap((l) => {
      if (debtTaken.has(debtKey("loan", l.id))) return [];
      const remaining = r2(Number(l.total_payable) - Number(l.paid_amount));
      const amt = Math.min(Number(l.installment_amount), remaining);
      if (amt <= 0) return [];
      return line((l.pay_item_id ? itemById.get(l.pay_item_id) : undefined) ?? loanItem, amt, { note: l.loan_name, source: "loan", source_id: l.id });
    });
    const advLines = (advBy.get(e.id) ?? []).filter((a) => !debtTaken.has(debtKey("advance", a.id))).flatMap((a) => line(bySys.advance, a.amount, { source: "advance", source_id: a.id }));
    const g = (guarBy.get(e.id) ?? [])[0];
    let guarantee: LineInput | null = null;
    if (g && bySys.guarantee && !debtTaken.has(debtKey("guarantee", g.id))) {
      const remaining = r2(Number(g.total_amount) - Number(g.collected_amount));
      const amt = Number(g.monthly_amount) > 0 ? Math.min(Number(g.monthly_amount), remaining) : remaining;
      if (amt > 0) guarantee = { item: bySys.guarantee, amount: amt, source: "guarantee", source_id: g.id };
    }

    // ---- YTD / same month ----
    // income from a previous employer belongs to the year the employee joined only
    const prevEmp = prevEmployerApplies(e.hire_date, period.pay_year);
    const ytd = prevEmp
      ? { regular: Number(priv.prev_employer_income) || 0, irregular: 0, tax: Number(priv.prev_employer_tax) || 0, sso: Number(priv.prev_employer_sso) || 0, pvd: Number(priv.prev_employer_pvd) || 0 }
      : { regular: 0, irregular: 0, tax: 0, sso: 0, pvd: 0 };
    if (priv.tax_paid_by_employer && priv.tax_method !== "none" && !leaverOnly)
      warnings.push("ตั้งค่า \"นายจ้างออกภาษีแทน\" ไว้ แต่ระบบยังหักภาษีจากพนักงานตามปกติ — เพิ่มรายการเงินได้ \"ภาษีที่นายจ้างออกให้\" เองหากต้องการ");
    if (Number(priv.ytd_open_year) === period.pay_year) {
      ytd.regular += Number(priv.ytd_open_income) || 0;
      ytd.tax += Number(priv.ytd_open_tax) || 0;
      ytd.sso += Number(priv.ytd_open_sso) || 0;
      ytd.pvd += Number(priv.ytd_open_pvd) || 0;
    }
    if (!(histBy.get(e.id) ?? []).length && ytd.regular === 0 && period.pay_month > 1 && e.hire_date < `${period.pay_year}-01-01` && priv.tax_method === "annualized" && Number(priv.salary) * (priv.salary_unit === "month" ? 12 : 300) > 310000)
      warnings.push("ไม่มียอดเงินได้สะสมต้นปี — ภาษีอาจต่ำกว่าจริง (บันทึกยอดยกมาที่ข้อมูลพนักงาน)");
    const monthPrev = { regular: 0, irregular: 0, tax: 0, sso_wage: 0, sso_employee: 0, sso_employer: 0 };
    for (const h of histBy.get(e.id) ?? []) {
      const reg = h.calc_detail?.regular_taxable != null ? Number(h.calc_detail.regular_taxable) : Number(h.taxable_income);
      const irr = h.calc_detail?.irregular_taxable != null ? Number(h.calc_detail.irregular_taxable) : 0;
      if (ytdSet.has(Number(h.period_id))) {
        ytd.regular += reg;
        ytd.irregular += irr;
        ytd.tax += Number(h.tax);
        ytd.sso += Number(h.sso_employee);
        ytd.pvd += Number(h.pvd_employee);
      } else {
        monthPrev.regular += reg;
        monthPrev.irregular += irr;
        monthPrev.tax += Number(h.tax);
        monthPrev.sso_wage += Number(h.sso_wage);
        monthPrev.sso_employee += Number(h.sso_employee);
        monthPrev.sso_employer += Number(h.sso_employer);
      }
    }

    // ---- tax deductions (ล.ย.01) ----
    const deductions = (dedBy.get(e.id) ?? []).map((d) => ({ code: d.deduction_code, amount: Number(d.amount) }));
    const has = (code: string) => deductions.some((d) => d.code === code);
    const fam = (famBy.get(e.id) ?? []).filter((x) => x.is_alive !== false);
    const famCount = (rels: string[]) => fam.filter((x) => rels.includes(x.relation)).length;
    if (!has("child") && !has("child_2nd_2561") && famCount(["child"])) deductions.push({ code: "child", amount: famCount(["child"]) });
    if (!has("parent") && famCount(["father", "mother"])) deductions.push({ code: "parent", amount: Math.min(4, famCount(["father", "mother"])) });
    if (!has("spouse") && famCount(["spouse"])) deductions.push({ code: "spouse", amount: 60000 });

    let remainingMonths: number | undefined;
    if (e.resign_date && e.resign_date.slice(0, 4) === String(period.pay_year)) remainingMonths = Math.max(1, Number(e.resign_date.slice(5, 7)) - period.pay_month + 1);

    const res = computeEntry({
      employee: { id: e.id, employee_type: e.employee_type, hire_date: e.hire_date, resign_date: e.resign_date },
      priv: {
        salary: Number(priv.salary) || 0, salary_unit: priv.salary_unit, sso_enabled: priv.sso_enabled, pvd_enabled: priv.pvd_enabled,
        pvd_employee_rate: Number(priv.pvd_employee_rate) || 0, pvd_employer_rate: Number(priv.pvd_employer_rate) || 0, tax_method: priv.tax_method, tax_fixed_rate: priv.tax_fixed_rate == null ? null : Number(priv.tax_fixed_rate),
      },
      period: leaverOnly ? { ...period, include_salary: false, include_attendance: false, include_constants: false } : { ...period },
      att,
      items: bySys,
      constants: leaverOnly ? [] : consts,
      adjustments: adjs,
      // deducting debts from final money needs the employee's written consent (ม.76) — HR adds those lines by hand
      loans: leaverOnly ? [] : loanLines,
      advances: leaverOnly ? [] : advLines,
      guarantee: leaverOnly ? null : guarantee,
      diligence: dilItem && !leaverOnly && period.period_type === "monthly" ? { enabled: true, steps: (dil?.steps ?? []).map(Number), prevStep: dilBy.get(e.id) ?? 0, item: dilItem } : null,
      ytd,
      monthPrev,
      deductions,
      cfg,
      taxCfg,
      ssoCfg,
      remainingMonths,
    });
    const allWarnings = [...warnings, ...res.warnings];
    if (allWarnings.length) warnCount++;
    const paidDays = priv.salary_unit === "month" ? Math.max(0, att.work_days + att.paid_leave_days) : att.work_days + att.paid_holiday_days + att.paid_leave_days;
    entries.push({
      period_id: period.id,
      employee_id: e.id,
      emp_code: e.code,
      emp_name: `${e.prefix ?? ""}${e.first_name} ${e.last_name}`.trim(),
      branch_id: e.branch_id,
      org_unit_id: e.org_unit_id,
      position_name: e.position_id ? posBy.get(e.position_id) ?? null : null,
      bank_code: priv.bank_code,
      bank_account: priv.bank_account,
      pay_method: priv.pay_method,
      base_salary: Number(priv.salary) || 0,
      salary_unit: priv.salary_unit,
      work_days: att.work_days,
      paid_days: r2(paidDays),
      absent_days: att.absent_days,
      unpaid_leave_days: r2(att.unpaid_leave_days),
      late_minutes: att.late_minutes,
      early_minutes: att.early_minutes,
      ot_minutes: att.ot_minutes,
      total_income: res.total_income,
      total_deduction: res.total_deduction,
      taxable_income: res.taxable_income,
      sso_wage: res.sso_wage,
      sso_employee: res.sso_employee,
      sso_employer: res.sso_employer,
      pvd_employee: res.pvd_employee,
      pvd_employer: res.pvd_employer,
      tax: res.tax,
      net_pay: res.net_pay,
      ytd_income: res.ytd_income,
      ytd_tax: res.ytd_tax,
      ytd_sso: res.ytd_sso,
      ytd_pvd: r2(res.ytd_pvd),
      calc_detail: {
        ...res.detail,
        warnings: allWarnings,
        rates: res.rates,
        attendance: { ...att, summary, leave: leaveInfo, range: [empFrom, empTo] },
        ytd_before: ytd,
        month_prev: monthPrev,
        deductions,
        attendance_recalc: attendanceRecalc,
        // what the calculation read from the adjustment / commission tables — approval compares it with the tables
        inputs: { adjustments: (adjBy.get(e.id) ?? []).map(adjustmentKey), commissions: (comBy.get(e.id) ?? []).map(commissionKey) },
      },
    });
    lineSets.push(res.lines);
  }

  if (sim) {
    sim.result = entries.map((en, i) => ({ employee_id: Number(en.employee_id), lines: lineSets[i], warnings: ((en.calc_detail as { warnings?: string[] }).warnings ?? []) }));
    return { employees: entries.length, warnings: warnCount, total_net: r2(entries.reduce((s, e) => s + Number(e.net_pay), 0)), ms: Date.now() - t0, attendance_recalc: attendanceRecalc };
  }

  // ---- write: one transaction in the database (public.payroll_save_calculation) -------------------
  // entries, pay lines, pending-inbox claims and the status change succeed or fail together, and the period row is
  // locked meanwhile, so a second "calculate" or an approval cannot interleave
  const payload = entries.map((en, i) => ({
    ...en,
    lines: lineSets[i].map((l, j) => ({
      pay_item_id: l.pay_item_id, code: l.code, name: l.name, category: l.category, direction: l.direction, qty: l.qty, rate: l.rate == null ? null : r2(l.rate),
      amount: l.amount, is_taxable: l.is_taxable, is_sso: l.is_sso, source: l.source, source_id: l.source_id, sort_order: j,
    })),
  }));
  // claim the pending items that are now part of this period; release the ones that dropped out (employee no longer in the run)
  const claim = pendingSel.filter((p) => p.status === "pending" || p.period_id == null || (p.status === "applied" && Number(p.period_id) !== period.id)).map((p) => p.id);
  const release = opts.employeeIds?.length ? [] : pendingToRelease(pendingAll, period.id, pendingSel).map((p) => p.id);
  must(
    await sb.rpc("payroll_save_calculation", {
      p_period_id: period.id,
      p_employee_ids: opts.employeeIds?.length ? opts.employeeIds.map(Number) : null,
      p_entries: payload,
      p_claim: claim,
      p_release: release,
    }),
  );

  return { employees: entries.length, warnings: warnCount, total_net: r2(entries.reduce((s, e) => s + Number(e.net_pay), 0)), ms: Date.now() - t0, attendance_recalc: attendanceRecalc };
}

// ---------------------------------------------------------------------------------------------- workflow
export const STATUS_LABEL: Record<string, string> = { open: "เปิดงวด", calculated: "คำนวณแล้ว", approved: "อนุมัติแล้ว", paid: "จ่ายแล้ว", closed: "ปิดงวด" };

/**
 * Move a period from one of `from` to `to` in a single conditional update, so two people pressing a button at the
 * same time cannot both succeed. `calculatedAt` (approval) also requires that nobody recalculated in between.
 * @returns the period as it was before the change
 */
async function setStatus(periodId: number, from: string[], to: string, extra: Record<string, unknown> = {}, guard?: { calculatedAt: string | null }) {
  const p = await loadPeriod(periodId);
  if (!from.includes(p.status)) throw new Error(`ทำรายการไม่ได้ในสถานะปัจจุบัน (${STATUS_LABEL[p.status] ?? p.status})`);
  let q = supabaseAdmin().from("payroll_periods").update({ status: to, ...extra }).eq("id", periodId).in("status", from);
  if (guard) q = guard.calculatedAt == null ? q.is("calculated_at", null) : q.eq("calculated_at", guard.calculatedAt);
  const rows = must(await q.select("id")) as { id: number }[];
  if (!rows.length) throw new Error("งวดนี้ถูกเปลี่ยนสถานะหรือคำนวณใหม่โดยผู้ใช้อื่นเมื่อสักครู่ กรุณาโหลดหน้าใหม่แล้วตรวจสอบอีกครั้ง");
  return p;
}

/** calculated → approved; refuses when the calculation no longer matches its inputs or changed while approving */
export async function approvePeriod(periodId: number) {
  const me = await requirePerm("payroll", "approve");
  const sb = supabaseAdmin();
  const before = must(await sb.from("payroll_periods").select("calculated_at").eq("id", periodId).maybeSingle()) as { calculated_at: string | null } | null;
  if (!before) throw new Error("ไม่พบงวดเงินเดือนนี้");
  const { count } = await sb.from("payroll_entries").select("id", { count: "exact", head: true }).eq("period_id", periodId);
  if (!count) throw new Error("ยังไม่มีรายการเงินเดือน กรุณาคำนวณก่อนอนุมัติ");
  const stale = await staleCalculationReasons(periodId);
  if (stale.length) throw new Error(`ผลคำนวณล้าสมัย: ${stale.join(", ")} — กรุณากด "คำนวณเงินเดือน" ใหม่ก่อนอนุมัติ`);
  await setStatus(periodId, ["calculated"], "approved", { approved_at: new Date().toISOString(), approved_by: me.userId }, { calculatedAt: before.calculated_at });
}

/**
 * Why the current calculation no longer matches its inputs:
 *   * a pay line still references a pending item that was cancelled after the calculation (money would be overpaid)
 *   * an item approved after the calculation is still waiting and belongs in this (monthly) period (money would be missing)
 *   * a manual adjustment or a commission row was added, removed or edited after the calculation
 * Empty array = up to date.
 */
export async function staleCalculationReasons(periodId: number): Promise<string[]> {
  const sb = supabaseAdmin();
  const period = await loadPeriod(periodId);
  const out: string[] = [];
  // pay lines that came from the pending inbox carry source = <pending source> (incl. "<source>_revert") and source_id = pending item id.
  // Adjustments share the same source values ("manual" …) with their own id sequence, so a cancelled pending item only counts
  // when source, id, employee and amount all match the line.
  const sources = Object.keys(PENDING_SOURCE_LABEL).flatMap((k) => [k, `${k}_revert`]);
  const { entries, items } = await entryItemsBySource(periodId, sources);
  const empOfEntry = new Map(entries.map((e) => [e.id, Number(e.employee_id)]));
  // pay lines store the absolute amount (a negative pending row becomes a reversed line) — compare absolute values
  const lineKeys = new Set(items.map((i) => `${i.source}:${i.source_id}:${empOfEntry.get(i.entry_id)}:${r2(Math.abs(Number(i.amount)))}`));
  const refs = [...new Set(items.map((i) => i.source_id).filter((v): v is number => v != null))];
  if (refs.length) {
    const cancelled = await fetchByIds<{ id: number; employee_id: number; source: string; amount: number }>(refs, (part) =>
      sb.from("payroll_pending_items").select("id, employee_id, source, amount").in("id", part).eq("status", "cancelled").order("id"),
    );
    const hit = cancelled.filter((c) => lineKeys.has(`${c.source}:${c.id}:${Number(c.employee_id)}:${r2(Math.abs(Number(c.amount)))}`));
    if (hit.length) out.push(`รายการที่ถูกยกเลิกหลังคำนวณ ${hit.length} รายการ`);
  }
  if (period.period_type === "monthly" && entries.length) {
    // same rule as selectPendingForPeriod(): unassigned rows (pending, or applied whose period was deleted) due on or before the period end
    const waiting = await fetchByIds<{ id: number }>(
      entries.map((e) => e.employee_id),
      (part) => sb.from("payroll_pending_items").select("id").in("employee_id", part).in("status", ["pending", "applied"]).is("period_id", null).lte("effective_date", period.end_date).order("id"),
    );
    if (waiting.length) out.push(`สวัสดิการ / เงินสดย่อยที่อนุมัติหลังคำนวณ ${waiting.length} รายการ`);
  }
  // adjustments / commissions: compare what each entry was calculated from with the tables now. Entries calculated
  // before this check existed carry no "inputs" and are skipped; rows of employees without an entry do not count.
  const seen = await fetchAll<{ employee_id: number; inputs: { adjustments?: string[]; commissions?: string[] } | null }>(() =>
    sb.from("payroll_entries").select("id, employee_id, inputs:calc_detail->inputs").eq("period_id", periodId).order("id"),
  );
  const tracked = new Set(seen.filter((e) => e.inputs).map((e) => Number(e.employee_id)));
  if (tracked.size) {
    const [adjNow, comNow] = await Promise.all([
      fetchAll<{ id: number; employee_id: number; pay_item_id: number; amount: number; qty: number | null }>(() => sb.from("payroll_adjustments").select("id, employee_id, pay_item_id, amount, qty").eq("period_id", periodId).order("id")),
      fetchAll<{ id: number; employee_id: number; plan_id: number | null; commission: number }>(() => sb.from("commission_entries").select("id, employee_id, plan_id, commission").eq("period_id", periodId).order("id")),
    ]);
    const stored = seen.filter((e) => e.inputs);
    if (inputsChanged(stored.flatMap((e) => e.inputs?.adjustments ?? []), adjNow.filter((a) => tracked.has(Number(a.employee_id))).map(adjustmentKey)))
      out.push("รายการปรับเงินเพิ่ม/หักถูกแก้ไขหลังคำนวณ");
    if (inputsChanged(stored.flatMap((e) => e.inputs?.commissions ?? []), comNow.filter((c) => tracked.has(Number(c.employee_id))).map(commissionKey)))
      out.push("ค่าคอมมิชชั่นถูกแก้ไขหลังคำนวณ");
  }
  return out;
}

/** shortest reason accepted when a period that was already paid is opened again */
export const REOPEN_REASON_MIN = 5;

/**
 * Back to 'calculated' (undoes the "paid" side effects in the same transaction); not allowed once closed.
 * A paid period needs a reason — the money already left the company, so the audit log must say why it was reopened.
 * @returns the status the period was in
 */
export async function reopenPeriod(periodId: number, reason?: string): Promise<string> {
  await requirePerm("payroll", "approve");
  const p = await loadPeriod(periodId);
  if (p.status === "closed") throw new Error("งวดที่ปิดแล้วเปิดแก้ไขไม่ได้");
  if (p.status === "paid" && (reason ?? "").trim().length < REOPEN_REASON_MIN) throw new Error(`งวดนี้จ่ายเงินแล้ว กรุณาระบุเหตุผลที่เปิดแก้ไข (อย่างน้อย ${REOPEN_REASON_MIN} ตัวอักษร)`);
  return String(must(await supabaseAdmin().rpc("payroll_reopen", { p_period_id: periodId })));
}

/** pay lines of a period for the given sources, with the entries they belong to */
async function entryItemsBySource(periodId: number, sources: string[]) {
  const sb = supabaseAdmin();
  const entries = await fetchAll<{ id: number; employee_id: number }>(() => sb.from("payroll_entries").select("id, employee_id").eq("period_id", periodId).order("id"));
  const items = await fetchByIds<{ entry_id: number; source: string; source_id: number | null; amount: number }>(
    entries.map((e) => e.id),
    (part) => sb.from("payroll_entry_items").select("id, entry_id, source, source_id, amount").in("entry_id", part).in("source", sources).order("id"),
  );
  return { entries, items };
}

/**
 * approved → paid: loan instalments, advances, guarantee collections and pending-inbox money are recorded together
 * with the status change in one transaction (public.payroll_mark_paid); a second call fails the status check.
 */
export async function markPaid(periodId: number) {
  await requirePerm("payroll", "approve");
  must(await supabaseAdmin().rpc("payroll_mark_paid", { p_period_id: periodId }));
}

/** paid → closed; locks the attendance days of the period's cut-off range for the employees in it */
export async function closePeriod(periodId: number) {
  await requirePerm("payroll", "approve");
  const p = await setStatus(periodId, ["paid"], "closed");
  const sb = supabaseAdmin();
  const entries = await fetchAll<{ employee_id: number }>(() => sb.from("payroll_entries").select("id, employee_id").eq("period_id", periodId).order("id"));
  const ids = entries.map((e) => e.employee_id);
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    must(await sb.from("attendance_days").update({ is_locked: true }).in("employee_id", ids.slice(i, i + IN_CHUNK)).gte("work_date", p.att_start_date ?? p.start_date).lte("work_date", p.att_end_date ?? p.end_date).select("id"));
  }
}

export async function publishPayslips(periodId: number, publish: boolean) {
  await requirePerm("payroll", "approve");
  const sb = supabaseAdmin();
  const p = await loadPeriod(periodId);
  if (publish && !["approved", "paid", "closed"].includes(p.status)) throw new Error("ต้องอนุมัติงวดก่อนเผยแพร่สลิป");
  must(await sb.from("payroll_periods").update({ payslip_published: publish }).eq("id", periodId).select("id"));
  if (!publish) return { notified: 0 };
  const entries = await fetchAll<{ id: number; employee_id: number }>(() => sb.from("payroll_entries").select("id, employee_id").eq("period_id", periodId).order("id"));
  const entryBy = new Map(entries.map((e) => [Number(e.employee_id), e.id]));
  const profiles = await fetchByIds<{ id: string; employee_id: number }>(
    entries.map((e) => e.employee_id),
    (part) => sb.from("profiles").select("id, employee_id").in("employee_id", part).eq("is_active", true).order("id"),
  );
  const rows = profiles.map((u) => ({
    user_id: u.id,
    title: `สลิปเงินเดือน ${p.name}`,
    body: `สลิปเงินเดือนงวด ${p.name} พร้อมให้ดูแล้ว`,
    link: `/m/payslips/${entryBy.get(Number(u.employee_id))}`,
    category: "payslip",
  }));
  await insertChunks("notifications", rows);
  return { notified: rows.length };
}

/** create a period with a unique code (PR<YYYYMM>-n) */
export async function createPeriod(input: Partial<PeriodRow> & { name: string; pay_year: number; pay_month: number; start_date: string; end_date: string; pay_date: string }) {
  await requirePerm("payroll", "create");
  const sb = supabaseAdmin();
  const prefix = `PR${input.pay_year}${String(input.pay_month).padStart(2, "0")}`;
  const { count } = await sb.from("payroll_periods").select("id", { count: "exact", head: true }).like("code", `${prefix}%`);
  const code = `${prefix}-${(count ?? 0) + 1}`;
  if (input.end_date < input.start_date) throw new Error("วันที่สิ้นสุดงวดต้องไม่น้อยกว่าวันที่เริ่ม");
  if (input.att_start_date && input.att_end_date && input.att_end_date < input.att_start_date) throw new Error("ช่วงตัดเวลาไม่ถูกต้อง");
  const row = must(
    await sb
      .from("payroll_periods")
      .insert({
        code, name: input.name, period_type: input.period_type ?? "monthly", pay_year: input.pay_year, pay_month: input.pay_month, start_date: input.start_date, end_date: input.end_date,
        att_start_date: input.att_start_date ?? input.start_date, att_end_date: input.att_end_date ?? input.end_date, pay_date: input.pay_date,
        include_salary: input.include_salary ?? true, include_attendance: input.include_attendance ?? true, include_constants: input.include_constants ?? true,
        include_tax: input.include_tax ?? true, include_sso: input.include_sso ?? true, include_pvd: input.include_pvd ?? true, filter: input.filter ?? {},
      })
      .select("id")
      .single(),
  ) as { id: number };
  return row.id;
}

export async function deletePeriod(periodId: number) {
  await requirePerm("payroll", "delete");
  const p = await loadPeriod(periodId);
  if (!["open", "calculated"].includes(p.status)) throw new Error("ลบได้เฉพาะงวดที่ยังไม่อนุมัติ");
  must(await supabaseAdmin().from("payroll_periods").delete().eq("id", periodId).select("id"));
}
