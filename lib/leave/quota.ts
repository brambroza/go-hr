// Annual leave quota calculation — pure, unit tested (tests/attendance-extra.test.ts).

export interface QuotaLeaveType {
  id: number;
  code: string;
  default_quota_days: number;
  is_unlimited: boolean;
  carry_over_max_days: number;
  min_service_months: number;
  prorate_first_year: boolean;
  gender: string | null;
  is_active?: boolean;
}

export interface QuotaEmployee {
  id: number;
  gender: string | null;
  hire_date: string;
  resign_date?: string | null;
}

function addMonths(date: string, months: number): string {
  const [y, m, d] = date.slice(0, 10).split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(d, last));
  return t.toISOString().slice(0, 10);
}

const floorHalf = (n: number) => Math.floor(n * 2) / 2;

/**
 * Quota for one employee × leave type × year, or null when the type does not apply.
 * - unlimited types and types with no default quota are skipped (handled by request rules / manual adjust)
 * - gender-restricted types are skipped for the other gender
 * - min_service_months: eligible from hire_date + months (VACATION = 12 → Thai LPA s.30, 1 year of service);
 *   eligibility after 31 Dec → no quota; eligibility within the year → full quota, or prorated by remaining
 *   months (rounded down to 0.5 day) when prorate_first_year
 * - carry over: unused days of the previous year, capped at carry_over_max_days
 */
export function computeQuota(
  lt: QuotaLeaveType,
  emp: QuotaEmployee,
  year: number,
  prevRemaining?: number | null,
): { quota_days: number; carried_days: number } | null {
  if (lt.is_unlimited || lt.is_active === false) return null;
  if (lt.gender && emp.gender !== lt.gender) return null;
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  if (emp.hire_date > yearEnd) return null;
  if (emp.resign_date && emp.resign_date < yearStart) return null;
  const base = Number(lt.default_quota_days) || 0;
  const carried = Math.max(0, Math.min(Number(lt.carry_over_max_days) || 0, Number(prevRemaining ?? 0)));
  if (base <= 0 && carried <= 0) return null;

  const eligibleFrom = addMonths(emp.hire_date, lt.min_service_months || 0);
  if (eligibleFrom > yearEnd) return carried > 0 ? { quota_days: 0, carried_days: carried } : null;
  let quota = base;
  if (lt.prorate_first_year && eligibleFrom > yearStart) {
    const month = Number(eligibleFrom.slice(5, 7)); // 1..12 — the eligibility month counts
    quota = floorHalf((base * (12 - month + 1)) / 12);
  }
  return { quota_days: quota, carried_days: carried };
}
