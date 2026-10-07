import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { computeDay, type AttendanceSettings, type LeaveIn, type LogIn, type OtRequestIn, type ShiftDef } from "./engine";
import { ScheduleIndex, bkkStart, eachDate, isIsoDate, plusDays, resolveDay, type EmpSchedule, type HolidayRow, type ScheduleRow, type SpecialWorkdayRow } from "./schedule";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Q = any;
const PAGE = 1000; // PostgREST max-rows on stock Supabase
const IN_CHUNK = 200; // ids per `in.(...)` filter (keeps the URL short)

/** Read every row of a query, paging past PostgREST's max-rows limit. `build` must return a fresh, ordered query. */
export async function fetchAll<T>(build: () => Q): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) return out;
  }
}

/** fetchAll over chunks of ids (for `.in(column, ids)` filters) */
export async function fetchByIds<T>(ids: number[] | null, build: (ids: number[] | null) => Q): Promise<T[]> {
  if (!ids) return fetchAll<T>(() => build(null));
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const part = ids.slice(i, i + IN_CHUNK);
    out.push(...(await fetchAll<T>(() => build(part))));
  }
  return out;
}

export const DEFAULT_ATT_SETTINGS = {
  absent_if_no_scan: true,
  auto_ot_without_request: false,
  ot_rates: { workday: 1.5, holiday_monthly: 1, holiday_daily: 2, holiday_ot: 3 },
};

type EmpRow = EmpSchedule & { employee_type: string; hire_date: string; resign_date: string | null };
type ShiftRow = ShiftDef & { id: number };
type LogRow = { employee_id: number; log_time: string; direction: string };
type LeaveReq = { employee_id: number; start_date: string; end_date: string | null; payload: Record<string, unknown> | null };
type OtReq = { employee_id: number; start_at: string; end_at: string; start_date: string | null };
type ExistingDay = { employee_id: number; work_date: string; is_locked: boolean; status: string };

/**
 * Recalculate attendance_days for a date range (Asia/Bangkok calendar dates, inclusive).
 * Bulk loads everything once (≈10 queries regardless of employees × days), resolves each day like
 * app.employee_day, runs computeDay() and upserts. Locked rows are skipped unless `force`.
 * `onlyDirty` limits work to rows marked status='dirty' (set when requests are approved/cancelled).
 * Uses the service-role client — callers MUST check permissions first.
 */
export async function recalcAttendance(opts: { from: string; to: string; employeeIds?: number[]; onlyDirty?: boolean; force?: boolean }): Promise<{ days: number; employees: number }> {
  const { from, to } = opts;
  if (!isIsoDate(from) || !isIsoDate(to) || from > to) throw new Error("ช่วงวันที่ไม่ถูกต้อง");
  if (eachDate(from, to).length > 400) throw new Error("คำนวณได้ครั้งละไม่เกิน 400 วัน");
  const sb = supabaseAdmin();

  // ---- what to calculate ------------------------------------------------------------------------
  let dirty: Set<string> | null = null;
  let empFilter: number[] | null = opts.employeeIds?.length ? [...new Set(opts.employeeIds.map(Number))] : null;
  if (opts.onlyDirty) {
    const rows = await fetchByIds<ExistingDay>(empFilter, (ids) => {
      let q = sb.from("attendance_days").select("employee_id, work_date").eq("status", "dirty").gte("work_date", from).lte("work_date", to).order("id");
      if (ids) q = q.in("employee_id", ids);
      return q;
    });
    if (!rows.length) return { days: 0, employees: 0 };
    dirty = new Set(rows.map((r) => `${r.employee_id}|${r.work_date}`));
    empFilter = [...new Set(rows.map((r) => Number(r.employee_id)))];
  }

  const employees = (
    await fetchByIds<EmpRow & { attendance_exempt: boolean }>(empFilter, (ids) => {
      let q = sb
        .from("employees")
        .select("id, branch_id, org_unit_id, default_shift_id, weekly_off_days, employee_type, hire_date, resign_date, attendance_exempt")
        .eq("attendance_exempt", false)
        .lte("hire_date", to)
        .or(`resign_date.is.null,resign_date.gte.${from}`)
        .order("id");
      if (ids) q = q.in("id", ids);
      return q;
    })
  ).map((e) => ({ ...e, id: Number(e.id) }));
  if (!employees.length) return { days: 0, employees: 0 };
  const empIds = employees.map((e) => e.id);
  const scoped = empIds.length <= 2000 ? empIds : null; // very large companies: load the range for everyone

  const logFrom = bkkStart(plusDays(from, -1));
  const logTo = bkkStart(plusDays(to, 2));

  const [settingsRes, shifts, holidays, specials, schedules, logs, leaves, ots, existing] = await Promise.all([
    sb.from("settings").select("value").eq("key", "attendance").maybeSingle(),
    fetchAll<ShiftRow>(() => sb.from("shifts").select("*").order("id")),
    fetchAll<HolidayRow>(() => sb.from("holidays").select("holiday_date, name, branch_id, org_unit_id, employee_ids").gte("holiday_date", from).lte("holiday_date", to).order("id")),
    fetchAll<SpecialWorkdayRow>(() => sb.from("special_workdays").select("work_date, name, branch_id, org_unit_id, shift_id").gte("work_date", from).lte("work_date", to).order("id")),
    fetchByIds<ScheduleRow>(scoped, (ids) => {
      let q = sb.from("work_schedules").select("employee_id, work_date, shift_id, is_day_off").gte("work_date", from).lte("work_date", to).order("id");
      if (ids) q = q.in("employee_id", ids);
      return q;
    }),
    fetchByIds<LogRow>(scoped, (ids) => {
      let q = sb.from("time_logs").select("employee_id, log_time, direction").eq("is_void", false).gte("log_time", logFrom).lt("log_time", logTo).order("id");
      if (ids) q = q.in("employee_id", ids);
      return q;
    }),
    fetchByIds<LeaveReq>(scoped, (ids) => {
      let q = sb.from("requests").select("employee_id, start_date, end_date, payload").eq("request_type", "leave").eq("status", "approved").lte("start_date", to).or(`end_date.gte.${from},and(end_date.is.null,start_date.gte.${from})`).order("id");
      if (ids) q = q.in("employee_id", ids);
      return q;
    }),
    fetchByIds<OtReq>(scoped, (ids) => {
      let q = sb.from("requests").select("employee_id, start_at, end_at, start_date").eq("request_type", "ot").eq("status", "approved").lt("start_at", logTo).gt("end_at", logFrom).order("id");
      if (ids) q = q.in("employee_id", ids);
      return q;
    }),
    fetchByIds<ExistingDay>(scoped, (ids) => {
      let q = sb.from("attendance_days").select("employee_id, work_date, is_locked, status").gte("work_date", from).lte("work_date", to).order("id");
      if (ids) q = q.in("employee_id", ids);
      return q;
    }),
  ]);
  if (settingsRes.error) throw new Error(settingsRes.error.message);

  const cfg = (settingsRes.data?.value ?? {}) as Partial<typeof DEFAULT_ATT_SETTINGS>;
  const baseSettings = {
    absent_if_no_scan: cfg.absent_if_no_scan ?? DEFAULT_ATT_SETTINGS.absent_if_no_scan,
    auto_ot_without_request: cfg.auto_ot_without_request ?? DEFAULT_ATT_SETTINGS.auto_ot_without_request,
    ot_rates: { ...DEFAULT_ATT_SETTINGS.ot_rates, ...(cfg.ot_rates ?? {}) },
  };

  const shiftById = new Map(shifts.map((s) => [Number(s.id), { ...s, id: Number(s.id) }]));
  const idx = new ScheduleIndex(holidays, specials, schedules.map((s) => ({ ...s, employee_id: Number(s.employee_id) })));
  const logsBy = groupBy(logs, (l) => Number(l.employee_id));
  const otBy = groupBy(ots, (o) => Number(o.employee_id));
  const locked = new Set(existing.filter((d) => d.is_locked).map((d) => `${d.employee_id}|${d.work_date}`));

  // leave by employee+date
  const leaveMap = new Map<string, LeaveIn[]>();
  for (const r of leaves) {
    const p = r.payload ?? {};
    const unit = (["full", "half_am", "half_pm", "hours"].includes(String(p.unit)) ? p.unit : "full") as LeaveIn["unit"];
    const start = r.start_date < from ? from : r.start_date;
    const endRaw = r.end_date ?? r.start_date;
    const end = endRaw > to ? to : endRaw;
    for (const d of eachDate(start, end)) {
      const k = `${r.employee_id}|${d}`;
      const arr = leaveMap.get(k) ?? [];
      arr.push({ unit, minutes: unit === "hours" ? Math.round(Number(p.hours ?? 0) * 60) : undefined, leave_type_id: p.leave_type_id != null ? Number(p.leave_type_id) : undefined });
      leaveMap.set(k, arr);
    }
  }

  const now = new Date().toISOString();
  const nowMs = Date.now();
  const rows: Record<string, unknown>[] = [];
  const dates = eachDate(from, to);
  for (const e of employees) {
    const empLogs: LogIn[] = (logsBy.get(e.id) ?? []).map((l) => ({ time: l.log_time, direction: l.direction }));
    const empOt = otBy.get(e.id) ?? [];
    const settings: AttendanceSettings = { ...baseSettings, employee_type: e.employee_type };
    for (const d of dates) {
      if (d < e.hire_date || (e.resign_date && d > e.resign_date)) continue;
      const k = `${e.id}|${d}`;
      if (dirty && !dirty.has(k)) continue;
      if (!opts.force && locked.has(k)) continue;
      const day = resolveDay(e, d, idx);
      const shift = day.shift_id != null ? shiftById.get(Number(day.shift_id)) ?? null : null;
      const otRequests: OtRequestIn[] = empOt
        .filter((o) => (o.start_date ?? bkk(o.start_at)) === d)
        .map((o) => ({ start: o.start_at, end: o.end_at }));
      const r = computeDay({ date: d, dayType: day.day_type, shift, logs: empLogs, leaves: leaveMap.get(k) ?? [], otRequests, settings });
      // shift not finished yet (today / future): not absent and not "forgot to scan" — yet
      if (r.sched_out && nowMs < Date.parse(r.sched_out) + (shift?.scan_out_after_min ?? 0) * 60_000 && nowMs < Date.parse(r.sched_out) + 4 * 3_600_000) {
        r.absent = false;
        r.missing_scan = false;
      }
      rows.push({
        employee_id: e.id,
        work_date: d,
        shift_id: shift?.id ?? null,
        day_type: day.day_type,
        ...r,
        leave_type_ids: r.leave_type_ids.length ? r.leave_type_ids : null,
        status: "calculated",
        calculated_at: now,
      });
    }
  }

  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await sb.from("attendance_days").upsert(rows.slice(i, i + 500), { onConflict: "employee_id,work_date", defaultToNull: false });
    if (error) throw new Error(error.message);
  }
  return { days: rows.length, employees: new Set(rows.map((r) => r.employee_id)).size };
}

function groupBy<T, K>(arr: T[], key: (x: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const x of arr) {
    const k = key(x);
    const a = m.get(k);
    if (a) a.push(x);
    else m.set(k, [x]);
  }
  return m;
}

function bkk(ts: string): string {
  return new Date(new Date(ts).getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
}

/** Bangkok "today" */
export function todayBkk(): string {
  return bkk(new Date().toISOString());
}

export type AdminClient = SupabaseClient;
