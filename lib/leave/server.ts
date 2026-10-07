import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { fetchAll, fetchByIds } from "@/lib/attendance/server";
import { computeQuota, type QuotaEmployee, type QuotaLeaveType } from "./quota";

/**
 * Create / refresh leave_quotas for a year from leave_types.default_quota_days.
 * - skips unlimited types, gender-restricted types for the other gender, and employees not employed in the year
 * - min_service_months (e.g. VACATION = 12) → no quota until eligible; prorated when prorate_first_year
 * - carryOver (default true): unused days of year-1 (from v_leave_balances) up to carry_over_max_days
 * Existing rows keep their adjust_days / note (only quota_days & carried_days are written).
 * Uses the service-role client — callers MUST check permissions first. Returns the number of rows written.
 */
export async function generateLeaveQuotas(year: number, opts?: { employeeIds?: number[]; carryOver?: boolean }): Promise<number> {
  if (!Number.isInteger(year) || year < 2000 || year > 2200) throw new Error("ปีไม่ถูกต้อง");
  const sb = supabaseAdmin();
  const carryOver = opts?.carryOver ?? true;
  const ids = opts?.employeeIds?.length ? [...new Set(opts.employeeIds.map(Number))] : null;

  const [types, emps] = await Promise.all([
    fetchAll<QuotaLeaveType>(() => sb.from("leave_types").select("id, code, default_quota_days, is_unlimited, carry_over_max_days, min_service_months, prorate_first_year, gender, is_active").eq("is_active", true).order("id")),
    fetchByIds<QuotaEmployee>(ids, (part) => {
      let q = sb.from("employees").select("id, gender, hire_date, resign_date").lte("hire_date", `${year}-12-31`).or(`resign_date.is.null,resign_date.gte.${year}-01-01`).order("id");
      if (part) q = q.in("id", part);
      return q;
    }),
  ]);
  if (!emps.length || !types.length) return 0;

  const prev = new Map<string, number>();
  const carryTypes = types.filter((t) => Number(t.carry_over_max_days) > 0).map((t) => Number(t.id));
  if (carryOver && carryTypes.length) {
    const rows = await fetchByIds<{ employee_id: number; leave_type_id: number; remaining_days: number }>(
      emps.map((e) => Number(e.id)),
      (part) => sb.from("v_leave_balances").select("employee_id, leave_type_id, remaining_days").eq("leave_year", year - 1).in("leave_type_id", carryTypes).in("employee_id", part!).order("id"),
    );
    for (const r of rows) prev.set(`${r.employee_id}|${r.leave_type_id}`, Number(r.remaining_days));
  }

  const out: Record<string, unknown>[] = [];
  for (const e of emps) {
    for (const t of types) {
      const q = computeQuota(t, e, year, prev.get(`${e.id}|${t.id}`));
      if (!q) continue;
      out.push({ employee_id: Number(e.id), leave_year: year, leave_type_id: Number(t.id), quota_days: q.quota_days, carried_days: q.carried_days });
    }
  }
  for (let i = 0; i < out.length; i += 500) {
    const { error } = await sb.from("leave_quotas").upsert(out.slice(i, i + 500), { onConflict: "employee_id,leave_year,leave_type_id", defaultToNull: false });
    if (error) throw new Error(error.message);
  }
  return out.length;
}
