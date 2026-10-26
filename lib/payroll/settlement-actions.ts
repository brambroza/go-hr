"use server";
// เคลียร์เงินพนักงานพ้นสภาพ — server actions. Amounts are always recomputed here from the database
// (lib/payroll/settlement.ts); the client only sends HR's overrides.

import { revalidatePath } from "next/cache";
import { requirePerm, safeAction, type ActionResult } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  DEFAULT_SEVERANCE_EXEMPTIONS,
  SETTLEMENT_PAY_ITEM,
  computeSettlement,
  type SettlementInput,
  type SettlementResult,
  type SeveranceExemption,
  type VoluntaryLeavePayout,
} from "./settlement";

export type SettlementOverride = NonNullable<SettlementInput["override"]>;

export interface SettlementListRow {
  employee_id: number;
  code: string;
  name: string;
  resign_date: string;
  resign_type: string | null;
  settlement: { id: number; total: number; created_at: string; paid: boolean } | null;
}

export interface SettlementPreview {
  employee: { id: number; code: string; name: string; hire_date: string; resign_date: string; resign_type: string | null; status: string };
  result: SettlementResult;
  leave: { code: string; quota_days: number; carried_days: number; adjust_days: number; used_days: number; pending_days: number } | null;
  debts: { label: string; remaining: number }[];
  /** fixed recurring allowances counted in the daily wage */
  allowances: { name: string; amount: number }[];
  existing: {
    id: number;
    total: number;
    note: string | null;
    created_at: string;
    detail: { override?: SettlementOverride } | null;
    items: { id: number; source: string; amount: number; status: string; period_id: number | null; period_name: string | null }[];
  } | null;
}

type PayCfg = { hours_per_day?: number; severance_exemptions?: SeveranceExemption[]; voluntary_leave_payout?: VoluntaryLeavePayout; annual_leave_code?: string };

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

function must<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
}

function checkId(id: number) {
  if (!Number.isInteger(id) || id <= 0) throw new Error("รหัสพนักงานไม่ถูกต้อง");
}

/** keep only sane override values: days 0–1000, refund 0–10,000,000 */
function cleanOverride(o: SettlementOverride | null | undefined): SettlementOverride {
  const out: SettlementOverride = {};
  if (!o) return out;
  const days = (v: unknown) => {
    if (v === null || v === undefined || v === "") return undefined;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0 || n > 1000) throw new Error("จำนวนวันต้องอยู่ระหว่าง 0–1000");
    return Math.round(n * 2) / 2;
  };
  if (typeof o.severance_eligible === "boolean") out.severance_eligible = o.severance_eligible;
  const sd = days(o.severance_days);
  if (sd !== undefined) out.severance_days = sd;
  const ld = days(o.leave_days);
  if (ld !== undefined) out.leave_days = ld;
  const nd = days(o.notice_days);
  if (nd !== undefined) out.notice_days = nd;
  if (o.guarantee_refund !== null && o.guarantee_refund !== undefined) {
    const g = Number(o.guarantee_refund);
    if (!Number.isFinite(g) || g < 0 || g > 10_000_000) throw new Error("ยอดคืนเงินประกันไม่ถูกต้อง");
    out.guarantee_refund = r2(g);
  }
  return out;
}

async function build(employeeId: number, override: SettlementOverride): Promise<SettlementPreview & { guarantees: { id: number; collected: number }[] }> {
  const sb = supabaseAdmin();
  const emp = must(
    await sb.from("employees").select("id, code, prefix, first_name, last_name, hire_date, resign_date, resign_type, status").eq("id", employeeId).maybeSingle(),
  ) as { id: number; code: string; prefix: string | null; first_name: string; last_name: string; hire_date: string; resign_date: string | null; resign_type: string | null; status: string } | null;
  if (!emp) throw new Error("ไม่พบพนักงาน");
  if (!emp.resign_date) throw new Error("พนักงานคนนี้ยังไม่มีวันพ้นสภาพ — บันทึกการพ้นสภาพและวันทำงานวันสุดท้ายที่ประวัติพนักงานก่อน");
  const lastDay = emp.resign_date;
  const year = Number(lastDay.slice(0, 4));

  const monthFirst = `${lastDay.slice(0, 7)}-01`;
  const [cfgRow, priv, guarantees, loans, advances, settlement, recurring, openEntries] = await Promise.all([
    sb.from("settings").select("value").eq("key", "payroll").maybeSingle(),
    sb.from("employee_private").select("salary, salary_unit").eq("employee_id", employeeId).maybeSingle(),
    sb.from("employee_guarantees").select("id, collected_amount, refunded_date").eq("employee_id", employeeId).is("refunded_date", null),
    sb.from("employee_loans").select("loan_name, total_payable, paid_amount").eq("employee_id", employeeId).eq("status", "active"),
    sb.from("salary_advances").select("amount, deduct_year, deduct_month").eq("employee_id", employeeId).in("status", ["approved", "paid"]),
    sb.from("final_settlements").select("id, total, note, created_at, detail").eq("employee_id", employeeId).eq("status", "confirmed").maybeSingle(),
    sb.from("employee_pay_items").select("amount, start_month, end_month, pay_items!inner(name, direction, is_regular, is_sso, calc_type)").eq("employee_id", employeeId),
    sb.from("payroll_entries").select("id, payroll_periods!inner(name, status)").eq("employee_id", employeeId).in("payroll_periods.status", ["open", "calculated", "approved"]),
  ]);
  const cfg = ((cfgRow.data?.value as PayCfg) ?? {}) as PayCfg;
  const p = must(priv) as { salary: number; salary_unit: "month" | "day" | "hour" } | null;

  const leaveCode = cfg.annual_leave_code || "VACATION";
  const bal = must(
    await sb.from("v_leave_balances").select("code, quota_days, carried_days, adjust_days, used_days, pending_days").eq("employee_id", employeeId).eq("leave_year", year).eq("code", leaveCode).maybeSingle(),
  ) as { code: string; quota_days: number; carried_days: number; adjust_days: number; used_days: number; pending_days: number } | null;
  const leave = bal
    ? { code: bal.code, quota_days: Number(bal.quota_days), carried_days: Number(bal.carried_days), adjust_days: Number(bal.adjust_days), used_days: Number(bal.used_days), pending_days: Number(bal.pending_days) }
    : null;

  const gRows = (must(guarantees) ?? []) as { id: number; collected_amount: number }[];
  // ค่าจ้าง = salary + fixed allowances paid every month (wage-like: regular, SSO wage, fixed amount) in force in the last month
  type Rec = { amount: number; start_month: string | null; end_month: string | null; pay_items: { name: string; direction: number; is_regular: boolean; is_sso: boolean; calc_type: string } | null };
  const allowances = ((must(recurring) ?? []) as unknown as Rec[])
    .filter((r) => r.pay_items && Number(r.pay_items.direction) === 1 && r.pay_items.is_regular && r.pay_items.is_sso && r.pay_items.calc_type === "fixed")
    .filter((r) => (!r.start_month || r.start_month <= monthFirst) && (!r.end_month || r.end_month >= monthFirst))
    .map((r) => ({ name: r.pay_items!.name, amount: Number(r.amount) || 0 }))
    .filter((r) => r.amount > 0);
  const result = computeSettlement({
    hire_date: emp.hire_date,
    last_day: lastDay,
    resign_type: emp.resign_type,
    salary: Number(p?.salary) || 0,
    salary_unit: p?.salary_unit ?? "month",
    hours_per_day: Number(cfg.hours_per_day) || 8,
    monthly_allowance: allowances.reduce((s, a) => s + a.amount, 0),
    leave,
    guarantee_held: r2(gRows.reduce((s, g) => s + (Number(g.collected_amount) || 0), 0)),
    exemptions: cfg.severance_exemptions?.length ? cfg.severance_exemptions : DEFAULT_SEVERANCE_EXEMPTIONS,
    voluntary_leave_payout: cfg.voluntary_leave_payout === "carried_only" ? "carried_only" : "prorata",
    override,
  });
  if (!leave) result.warnings.push(`ไม่พบโควต้าลาพักร้อน (${leaveCode}) ปี ${year + 543} — ระบุจำนวนวันเองถ้ามีวันคงเหลือ`);
  if (leave && leave.pending_days > 0) result.warnings.push(`มีใบลาพักร้อนรออนุมัติ ${leave.pending_days} วัน — อนุมัติหรือยกเลิกก่อน แล้วคำนวณใหม่`);
  if (allowances.length) result.warnings.push(`ค่าจ้างต่อวันรวมค่าตอบแทนประจำ: ${allowances.map((a) => `${a.name} ${a.amount.toLocaleString("th-TH")}`).join(", ")} บาท/เดือน — ตรวจว่าเป็นค่าจ้างตามกฎหมาย`);
  // an unpaid period may still collect a guarantee instalment after the refund amount is fixed here
  const open = (must(openEntries) ?? []) as unknown as { id: number; payroll_periods: { name: string; status: string } }[];
  if (open.length && gRows.length) {
    const gl = (must(await sb.from("payroll_entry_items").select("entry_id").in("entry_id", open.map((e) => e.id)).eq("source", "guarantee")) ?? []) as { entry_id: number }[];
    const names = open.filter((e) => gl.some((g) => g.entry_id === e.id)).map((e) => e.payroll_periods.name);
    if (names.length) result.warnings.push(`งวด ${names.join(", ")} ยังหักเงินประกันอยู่และยังไม่จ่าย — จ่ายงวดนั้นก่อนแล้วค่อยยืนยัน มิฉะนั้นยอดคืนเงินประกันจะขาดงวดนั้น`);
  }

  const debts: SettlementPreview["debts"] = [];
  for (const l of (must(loans) ?? []) as { loan_name: string; total_payable: number; paid_amount: number }[]) {
    const rem = r2(Number(l.total_payable) - Number(l.paid_amount));
    if (rem > 0) debts.push({ label: `เงินกู้: ${l.loan_name}`, remaining: rem });
  }
  const ym = Number(lastDay.slice(0, 4)) * 12 + Number(lastDay.slice(5, 7));
  for (const a of (must(advances) ?? []) as { amount: number; deduct_year: number; deduct_month: number }[]) {
    if (a.deduct_year * 12 + a.deduct_month > ym) debts.push({ label: `เบิกล่วงหน้า (หักเดือน ${a.deduct_month}/${a.deduct_year + 543})`, remaining: Number(a.amount) });
  }

  let existing: SettlementPreview["existing"] = null;
  const s = must(settlement) as { id: number; total: number; note: string | null; created_at: string; detail: { override?: SettlementOverride } | null } | null;
  if (s) {
    const items = (must(await sb.from("payroll_pending_items").select("id, source, amount, status, period_id").eq("source_id", s.id).in("source", Object.keys(SETTLEMENT_PAY_ITEM)).order("id")) ?? []) as {
      id: number; source: string; amount: number; status: string; period_id: number | null;
    }[];
    const pids = [...new Set(items.map((i) => i.period_id).filter((v): v is number => v != null))];
    const periods = pids.length ? ((must(await sb.from("payroll_periods").select("id, name").in("id", pids)) ?? []) as { id: number; name: string }[]) : [];
    const pname = new Map(periods.map((x) => [x.id, x.name]));
    existing = { ...s, total: Number(s.total), items: items.map((i) => ({ ...i, amount: Number(i.amount), period_name: i.period_id ? pname.get(i.period_id) ?? null : null })) };
  }

  return {
    employee: { id: emp.id, code: emp.code, name: `${emp.prefix ?? ""}${emp.first_name} ${emp.last_name}`, hire_date: emp.hire_date, resign_date: lastDay, resign_type: emp.resign_type, status: emp.status },
    result,
    leave,
    debts,
    allowances,
    existing,
    guarantees: gRows.map((g) => ({ id: g.id, collected: Number(g.collected_amount) || 0 })),
  };
}

/** resigned employees (last working day within the past 13 months or in the future) and their settlement status */
export async function listSettlementsAction(): Promise<ActionResult<SettlementListRow[]>> {
  return safeAction(async () => {
    await requirePerm("payroll");
    const sb = supabaseAdmin();
    const since = new Date(Date.now() - 400 * 86_400_000).toISOString().slice(0, 10);
    const emps = (must(
      await sb.from("employees").select("id, code, prefix, first_name, last_name, resign_date, resign_type").not("resign_date", "is", null).gte("resign_date", since).order("resign_date", { ascending: false }).limit(500),
    ) ?? []) as { id: number; code: string; prefix: string | null; first_name: string; last_name: string; resign_date: string; resign_type: string | null }[];
    const ids = emps.map((e) => e.id);
    const sets = ids.length ? ((must(await sb.from("final_settlements").select("id, employee_id, total, created_at").in("employee_id", ids).eq("status", "confirmed")) ?? []) as { id: number; employee_id: number; total: number; created_at: string }[]) : [];
    const sids = sets.map((s) => s.id);
    const unpaid = sids.length
      ? ((must(await sb.from("payroll_pending_items").select("source_id").in("source_id", sids).in("source", Object.keys(SETTLEMENT_PAY_ITEM)).neq("status", "paid").neq("status", "cancelled")) ?? []) as { source_id: number }[])
      : [];
    const open = new Set(unpaid.map((u) => Number(u.source_id)));
    const byEmp = new Map(sets.map((s) => [Number(s.employee_id), s]));
    return emps.map((e) => {
      const s = byEmp.get(e.id);
      return {
        employee_id: e.id,
        code: e.code,
        name: `${e.prefix ?? ""}${e.first_name} ${e.last_name}`,
        resign_date: e.resign_date,
        resign_type: e.resign_type,
        settlement: s ? { id: s.id, total: Number(s.total), created_at: s.created_at, paid: !open.has(s.id) } : null,
      };
    });
  });
}

export async function previewSettlementAction(employeeId: number, override?: SettlementOverride | null): Promise<ActionResult<SettlementPreview>> {
  return safeAction(async () => {
    await requirePerm("payroll");
    checkId(employeeId);
    let built = await build(employeeId, cleanOverride(override));
    // a confirmed settlement is shown with the overrides it was confirmed with
    const stored = built.existing?.detail?.override;
    if (stored && Object.keys(stored).length) built = await build(employeeId, cleanOverride(stored));
    const { guarantees: _g, ...rest } = built;
    void _g;
    return rest;
  });
}

export async function confirmSettlementAction(employeeId: number, override: SettlementOverride | null, note: string): Promise<ActionResult<number>> {
  return safeAction(async () => {
    const me = await requirePerm("payroll", "create");
    checkId(employeeId);
    const cleanNote = String(note ?? "").trim().slice(0, 500);
    const ov = cleanOverride(override);
    const b = await build(employeeId, ov);
    if (b.existing) throw new Error("พนักงานคนนี้มีรายการเคลียร์เงินที่ยืนยันแล้ว — ยกเลิกรายการเดิมก่อนถ้าต้องการคำนวณใหม่");
    const r = b.result;
    if (!r.lines.length) throw new Error("ไม่มียอดที่ต้องจ่าย");
    if (Object.keys(ov).length && !cleanNote) throw new Error("มีการแก้ไขค่าที่ระบบคำนวณ — กรุณาระบุเหตุผลในหมายเหตุ");

    const sb = supabaseAdmin();
    const items = (must(await sb.from("pay_items").select("id, system_key").in("system_key", Object.values(SETTLEMENT_PAY_ITEM))) ?? []) as { id: number; system_key: string }[];
    const itemBy = new Map(items.map((i) => [i.system_key, i.id]));
    for (const l of r.lines) if (!itemBy.get(SETTLEMENT_PAY_ITEM[l.key])) throw new Error(`ไม่พบรายการเงินเดือน ${SETTLEMENT_PAY_ITEM[l.key]} — ติดตั้ง migration 20261026010000 ก่อน`);

    const refunds = r.guarantee_refund > 0 ? b.guarantees : [];
    const refundIds = refunds.map((g) => g.id);
    const row = must(
      await sb
        .from("final_settlements")
        .insert({
          employee_id: employeeId,
          last_day: b.employee.resign_date,
          resign_type: b.employee.resign_type,
          daily_rate: r.daily_rate,
          service_days: r.service.days,
          service_years: r.service.years,
          severance_eligible: r.severance_eligible,
          severance_days: r.severance_days,
          severance_amount: r.severance_amount,
          exempt_amount: r.exempt_amount,
          leave_days: r.leave_days,
          leave_amount: r.leave_amount,
          notice_days: r.notice_days,
          notice_amount: r.notice_amount,
          guarantee_refund: r.guarantee_refund,
          total: r.total,
          detail: { override: ov, exemption: r.exemption, leave: b.leave, leave_detail: r.leave_detail, warnings: r.warnings, guarantee_ids: refundIds },
          note: cleanNote || null,
          created_by: me.userId,
        })
        .select("id")
        .single(),
    ) as { id: number };

    const pending = r.lines.map((l) => ({
      employee_id: employeeId,
      pay_item_id: itemBy.get(SETTLEMENT_PAY_ITEM[l.key])!,
      amount: l.amount,
      qty: l.qty,
      note: l.note,
      source: l.key,
      source_id: row.id,
      effective_date: b.employee.resign_date,
      status: "pending",
      created_by: me.userId,
    }));
    const ins = await sb.from("payroll_pending_items").insert(pending);
    if (ins.error) {
      await sb.from("final_settlements").delete().eq("id", row.id);
      throw new Error(ins.error.message);
    }
    // a single guarantee takes HR's refund amount (it may be reduced for damages); several are refunded in full
    for (const g of refunds) {
      const amount = refunds.length === 1 ? r.guarantee_refund : g.collected;
      must(await sb.from("employee_guarantees").update({ refunded_date: b.employee.resign_date, refunded_amount: amount }).eq("id", g.id).select("id"));
    }
    await sb.from("audit_logs").insert({ user_id: me.userId, user_name: me.displayName, action: "SETTLEMENT_CONFIRM", table_name: "final_settlements", record_id: String(row.id), note: `${b.employee.code} รวม ${r.total.toFixed(2)} บาท` });
    revalidatePath("/payroll/settlements");
    return row.id;
  }, "ยืนยันแล้ว — ยอดเงินเข้าคิวรอเข้างวดเงินเดือน");
}

export async function cancelSettlementAction(settlementId: number, reason: string): Promise<ActionResult<void>> {
  return safeAction(async () => {
    const me = await requirePerm("payroll", "edit");
    checkId(settlementId);
    const why = String(reason ?? "").trim().slice(0, 500);
    if (!why) throw new Error("กรุณาระบุเหตุผลที่ยกเลิก");
    const sb = supabaseAdmin();
    const s = must(await sb.from("final_settlements").select("id, employee_id, status, detail, note").eq("id", settlementId).maybeSingle()) as {
      id: number; employee_id: number; status: string; detail: { guarantee_ids?: number[] } | null; note: string | null;
    } | null;
    if (!s || s.status !== "confirmed") throw new Error("ไม่พบรายการที่ยืนยันแล้ว");
    const items = (must(await sb.from("payroll_pending_items").select("id, status, period_id").eq("source_id", s.id).in("source", Object.keys(SETTLEMENT_PAY_ITEM))) ?? []) as { id: number; status: string; period_id: number | null }[];
    if (items.some((i) => i.status === "paid")) throw new Error("จ่ายเงินไปแล้วในงวดเงินเดือน ยกเลิกไม่ได้ — ถ้าต้องแก้ยอด ให้บันทึกรายการปรับปรุงในงวดถัดไป");
    // same rule as app.revert_request: money in an approved period is already in the bank file
    const pids = [...new Set(items.filter((i) => i.status === "applied" && i.period_id != null).map((i) => i.period_id as number))];
    if (pids.length) {
      const ps = (must(await sb.from("payroll_periods").select("name, status").in("id", pids)) ?? []) as { name: string; status: string }[];
      const locked = ps.filter((p) => !["open", "calculated"].includes(p.status));
      if (locked.length) throw new Error(`ยอดอยู่ในงวด ${locked.map((p) => p.name).join(", ")} ที่อนุมัติแล้ว — เปิดแก้ไขงวดก่อน หรือบันทึกรายการปรับปรุงในงวดถัดไป`);
    }
    const ids = items.filter((i) => i.status !== "cancelled").map((i) => i.id);
    // rows already applied to an open period stay referenced by its pay lines; the period then refuses approval until recalculated
    if (ids.length) must(await sb.from("payroll_pending_items").update({ status: "cancelled" }).in("id", ids).select("id"));
    const gids = s.detail?.guarantee_ids ?? [];
    if (gids.length) must(await sb.from("employee_guarantees").update({ refunded_date: null, refunded_amount: null }).in("id", gids).select("id"));
    must(
      await sb
        .from("final_settlements")
        .update({ status: "cancelled", cancelled_by: me.userId, cancelled_at: new Date().toISOString(), note: [s.note, `ยกเลิก: ${why}`].filter(Boolean).join("\n") })
        .eq("id", s.id)
        .select("id"),
    );
    await sb.from("audit_logs").insert({ user_id: me.userId, user_name: me.displayName, action: "SETTLEMENT_CANCEL", table_name: "final_settlements", record_id: String(s.id), note: why });
    revalidatePath("/payroll/settlements");
  }, "ยกเลิกรายการเคลียร์เงินแล้ว");
}
