// Manpower plan resolution — pure.
import { weekday } from "./schedule";

export interface PlanRow {
  id?: number;
  org_unit_id: number | null;
  branch_id: number | null;
  position_id: number | null;
  shift_id: number;
  weekday: number | null;
  plan_date: string | null;
  required_count: number;
}

const keyOf = (p: PlanRow) => `${p.org_unit_id ?? ""}|${p.branch_id ?? ""}|${p.position_id ?? ""}|${p.shift_id}`;

/**
 * Plans in effect on a date: for each (org unit, branch, position, shift) the most specific row wins —
 * plan_date = date  >  weekday = dow  >  every day (weekday null).
 */
export function plansForDate(plans: PlanRow[], date: string): PlanRow[] {
  const dow = weekday(date);
  const best = new Map<string, { p: PlanRow; rank: number }>();
  for (const p of plans) {
    let rank = -1;
    if (p.plan_date) rank = p.plan_date.slice(0, 10) === date ? 3 : -1;
    else if (p.weekday != null) rank = Number(p.weekday) === dow ? 2 : -1;
    else rank = 1;
    if (rank < 0) continue;
    const k = keyOf(p);
    const cur = best.get(k);
    if (!cur || rank > cur.rank) best.set(k, { p, rank });
  }
  return [...best.values()].map((x) => x.p);
}

export function requiredCount(plans: PlanRow[], date: string, shiftId: number, filter?: (p: PlanRow) => boolean): number {
  return plansForDate(plans, date)
    .filter((p) => Number(p.shift_id) === Number(shiftId) && (!filter || filter(p)))
    .reduce((a, p) => a + Number(p.required_count || 0), 0);
}
