// ตกเบิก (retro pay) — pure helpers, unit tested in tests/retro.test.ts.
//
// A closed / paid period is never changed. When a request (OT, leave, time edit, shift change) is approved or cancelled
// after the period was approved, or a salary change takes effect inside it, the period is recalculated for that person
// in memory and the difference per pay item goes to payroll_pending_items (source "retro") for the next period.
// Only salary- and attendance-driven items are compared (RETRO_KEYS): recurring allowances, pay-item settings,
// loans, advances, the guarantee and pending-inbox money follow today's configuration in a recalculation and would
// show up as phantom differences. Tax, SSO and PVD are computed in the period that pays the retro lines, where the
// retro lines count as irregular income.
// Earlier retro runs of the same period and person are added to "before" (unless their pending rows were cancelled),
// so a second late change does not pay the first one again.

export interface RetroLine {
  pay_item_id: number | null;
  code: string;
  name: string;
  direction: 1 | -1;
  amount: number;
  source: string;
}

export interface RetroDiff {
  pay_item_id: number;
  code: string;
  name: string;
  /** amount for a pending row of this pay item: positive = more of the item, negative = take back (see engine push) */
  amount: number;
  before: number; // signed (income +, deduction −)
  after: number;
}

/** pay items (by system_key) whose amount comes from the salary and attendance — the only ones retro pays */
export const RETRO_KEYS = new Set(["salary", "absent", "unpaid_leave", "late", "early", "ot_1", "ot_1_5", "ot_2", "ot_3", "diligence"]);
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface RetroItem {
  direction: 1 | -1;
  system_key: string | null;
}

/** lines of the engine itself ("auto"); earlier retro runs are passed in with source "retro_prior" */
const counts = (l: RetroLine, items: Map<number, RetroItem>) =>
  l.pay_item_id != null && (l.source === "auto" || l.source === "retro_prior") && RETRO_KEYS.has(items.get(l.pay_item_id)?.system_key ?? "");

/**
 * Difference per pay item between what was paid (`before`, incl. earlier retro runs) and a recalculation with today's
 * data (`after`). The pay item's direction turns the signed difference into a pending amount.
 */
export function retroDiff(before: RetroLine[], after: RetroLine[], items: Map<number, RetroItem>): RetroDiff[] {
  const sum = new Map<number, { code: string; name: string; before: number; after: number }>();
  const add = (l: RetroLine, key: "before" | "after") => {
    if (!counts(l, items)) return;
    const id = l.pay_item_id as number;
    const cur = sum.get(id) ?? { code: l.code, name: l.name, before: 0, after: 0 };
    if (!cur.code && l.code) Object.assign(cur, { code: l.code, name: l.name }); // prior-run lines carry no label
    cur[key] += l.direction * l.amount;
    sum.set(id, cur);
  };
  before.forEach((l) => add(l, "before"));
  after.forEach((l) => add(l, "after"));
  const out: RetroDiff[] = [];
  for (const [id, s] of sum) {
    const signed = r2(s.after - s.before);
    if (Math.abs(signed) < 0.005) continue;
    const dir = items.get(id)?.direction ?? 1;
    out.push({ pay_item_id: id, code: s.code, name: s.name, amount: r2(signed * dir), before: r2(s.before), after: r2(s.after) });
  }
  return out.sort((a, b) => a.code.localeCompare(b.code));
}

/** pending rows of earlier retro runs (not cancelled) as "before" lines: amount × direction = what was added */
export function priorRetroLines(rows: { pay_item_id: number; amount: number }[], items: Map<number, RetroItem>): RetroLine[] {
  return rows.map((r) => ({ pay_item_id: r.pay_item_id, code: "", name: "", direction: items.get(r.pay_item_id)?.direction ?? 1, amount: Number(r.amount), source: "retro_prior" }));
}

/** net effect on pay before tax / SSO of a set of retro lines (income +, deduction −) */
export function retroNet(diff: RetroDiff[]): number {
  return r2(diff.reduce((s, d) => s + (d.after - d.before), 0));
}

/** salary in force at a date from salary_history (latest effective_date on or before it); null = no history */
export function salaryAsOf(history: { effective_date: string; new_salary: number }[], date: string): number | null {
  const h = history.filter((x) => x.effective_date <= date).sort((a, b) => a.effective_date.localeCompare(b.effective_date)).pop();
  return h ? Number(h.new_salary) : null;
}
