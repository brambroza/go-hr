// Rules the period calculation applies around the per-employee engine — pure helpers, unit tested in
// tests/payroll-rules.test.ts. (lib/payroll/server.ts does the loading and writing.)

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const r4 = (n: number) => Math.round(n * 10000) / 10000;

/** one calculated attendance day, as far as pay is concerned */
export interface PayDay {
  work_date: string;
  day_type: string;
  work_minutes: number;
}

const isWorkDay = (d: PayDay) => d.day_type === "work" || d.day_type === "special";

/**
 * Days of wage a daily-paid employee earned by working.
 * A work day with a scan counts 1, minus the part of that day covered by approved leave (0.5 for a half day):
 * the leave part is paid — or not — through paid_leave_days / unpaid_leave_days, so counting the whole day here
 * as well paid a half-day leave 1.5 days.
 * @param days attendance days inside the employee's range
 * @param leaveByDate leave taken per date in day-equivalents (same numbers the leave pay split uses)
 */
export function workedDayUnits(days: PayDay[], leaveByDate: Map<string, number>): number {
  let units = 0;
  for (const d of days) {
    if (!isWorkDay(d) || !(Number(d.work_minutes) > 0)) continue;
    units += Math.max(0, 1 - Math.min(1, leaveByDate.get(d.work_date) ?? 0));
  }
  return r4(units);
}

/**
 * Minutes an hourly-paid employee is paid at the plain hourly rate: work on scheduled work days only.
 * Work on a day off or a public holiday is paid through the holiday multiplier (ot_minutes), which already is the
 * whole pay for those hours — adding the same minutes here paid them a third time.
 */
export function regularWorkMinutes(days: PayDay[]): number {
  return days.reduce((sum, d) => sum + (isWorkDay(d) ? Number(d.work_minutes) || 0 : 0), 0);
}

/** leave taken per date (day-equivalents), several requests on one date added up */
export function leaveUnitsByDate(leaveDays: { date: string; days: number }[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const l of leaveDays) out.set(l.date, r4((out.get(l.date) ?? 0) + (Number(l.days) || 0)));
  return out;
}

/** identifies one debt (loan / advance / guarantee) across the periods of a month */
export const debtKey = (source: string, sourceId: number | null | undefined) => `${source}:${Number(sourceId)}`;

/**
 * Income a previous employer paid counts toward this year's tax only in the calendar year the employee joined.
 * (employee_private.prev_employer_* has no year of its own; adding it every year over-withheld from year two on.)
 */
export function prevEmployerApplies(hireDate: string | null | undefined, payYear: number): boolean {
  return !!hireDate && Number(hireDate.slice(0, 4)) === payYear;
}

/** fingerprint of a manual adjustment row as the calculation saw it */
export function adjustmentKey(a: { id: number; pay_item_id: number; amount: number; qty: number | null }): string {
  return `${a.id}:${a.pay_item_id}:${r2(Number(a.amount) || 0)}:${a.qty == null ? "" : r2(Number(a.qty))}`;
}

/** fingerprint of a commission row as the calculation saw it */
export function commissionKey(c: { id: number; plan_id: number | null; commission: number }): string {
  return `${c.id}:${c.plan_id ?? ""}:${r2(Number(c.commission) || 0)}`;
}

/** true when the rows used by a calculation (`stored`) differ from the rows that exist now — added, removed or edited */
export function inputsChanged(stored: string[], current: string[]): boolean {
  if (stored.length !== current.length) return true;
  const a = [...stored].sort();
  const b = [...current].sort();
  return a.some((v, i) => v !== b[i]);
}
