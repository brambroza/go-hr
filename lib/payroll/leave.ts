// Leave → pay effect (pure, unit tested in tests/payroll-extra.test.ts)
//
// Rules (Thai Labour Protection Act + leave_types configuration):
//   * is_paid = false                     → every leave day is unpaid
//   * paid_days_limit > 0                 → only the first N days are paid; the rest is unpaid. Counted per calendar year,
//                                           or per episode (paid_limit_scope = 'episode', e.g. ลาคลอด: 60 paid days per
//                                           pregnancy even when the leave runs from December into January)
//   * paid_days_limit null / 0 (is_paid)  → no cap
//   * pay_rate_percent < 100              → the paid days are paid at that rate; the remainder (100 - rate)% is unpaid
// The cap is counted over all approved leave of that type in the calendar year in date order, so a period only
// sees the days that fall inside its attendance range, but the earlier days of the year still use up the cap.

export interface LeaveTypeRule {
  is_paid: boolean;
  paid_days_limit: number | null;
  pay_rate_percent: number;
  name?: string;
  /** 'year' (default) = cap per calendar year · 'episode' = cap per run of leave; a gap over EPISODE_GAP_DAYS starts a new one */
  paid_limit_scope?: "year" | "episode";
}

/** two maternity leaves more than ~9 months apart cannot belong to the same pregnancy */
export const EPISODE_GAP_DAYS = 270;

/** one leave day (or fraction of a day) taken by one employee */
export interface LeaveDay {
  date: string; // YYYY-MM-DD
  days: number; // 1, 0.5, or hours/shift-hours
  leave_type_id: number;
}

export interface LeavePayResult {
  paid_leave_days: number; // full-pay equivalent days inside the range
  unpaid_leave_days: number; // unpaid equivalent days inside the range
  by_type: Record<number, { name?: string; days: number; paid: number; unpaid: number }>;
}

const r4 = (n: number) => Math.round(n * 10000) / 10000;

export function computeLeavePay(days: LeaveDay[], types: Record<number, LeaveTypeRule>, from: string, to: string): LeavePayResult {
  const res: LeavePayResult = { paid_leave_days: 0, unpaid_leave_days: 0, by_type: {} };
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const used: Record<string, number> = {}; // `${year}|${type}` or `ep${n}|${type}` → paid-cap days used
  const episode: Record<number, { n: number; last: string }> = {};
  for (const d of sorted) {
    if (d.date > to) break;
    const t = types[d.leave_type_id];
    const amount = Number(d.days) || 0;
    if (!t || amount <= 0) continue;
    let key = `${d.date.slice(0, 4)}|${d.leave_type_id}`;
    if (t.paid_limit_scope === "episode") {
      const ep = episode[d.leave_type_id];
      const gap = ep ? (Date.parse(d.date) - Date.parse(ep.last)) / 86_400_000 : Infinity;
      const n = !ep ? 1 : gap > EPISODE_GAP_DAYS ? ep.n + 1 : ep.n;
      episode[d.leave_type_id] = { n, last: d.date };
      key = `ep${n}|${d.leave_type_id}`;
    }
    const cap = t.is_paid ? (t.paid_days_limit && t.paid_days_limit > 0 ? Number(t.paid_days_limit) : Infinity) : 0;
    const before = used[key] ?? 0;
    const capped = Math.max(0, Math.min(amount, cap - before)); // days still within the paid cap
    used[key] = before + amount;
    if (d.date < from) continue;
    const rate = Math.min(100, Math.max(0, Number(t.pay_rate_percent ?? 100))) / 100;
    const paid = capped * rate;
    const unpaid = amount - paid;
    res.paid_leave_days += paid;
    res.unpaid_leave_days += unpaid;
    const bt = (res.by_type[d.leave_type_id] ??= { name: t.name, days: 0, paid: 0, unpaid: 0 });
    bt.days = r4(bt.days + amount);
    bt.paid = r4(bt.paid + paid);
    bt.unpaid = r4(bt.unpaid + unpaid);
  }
  res.paid_leave_days = r4(res.paid_leave_days);
  res.unpaid_leave_days = r4(res.unpaid_leave_days);
  return res;
}

/**
 * Spread an approved leave request over its dates.
 *   unit half_am/half_pm/hours → whole `days` value on start_date
 *   full → `days` split evenly over the dates that count (isCountable decides: work days, or every day when
 *          the leave type counts non-workdays). Falls back to every date when none is countable.
 */
export function expandLeaveRequest(
  req: { start_date: string; end_date: string | null; days: number | null; unit?: string | null; leave_type_id: number },
  isCountable: (date: string) => boolean,
): LeaveDay[] {
  const total = Number(req.days ?? 0);
  if (!(total > 0)) return [];
  if (req.unit && req.unit !== "full") return [{ date: req.start_date, days: total, leave_type_id: req.leave_type_id }];
  const dates: string[] = [];
  for (let d = req.start_date; d <= (req.end_date ?? req.start_date); d = nextDate(d)) dates.push(d);
  let use = dates.filter(isCountable);
  if (!use.length) use = dates;
  const per = total / use.length;
  return use.map((date) => ({ date, days: per, leave_type_id: req.leave_type_id }));
}

export function nextDate(d: string): string {
  const t = new Date(d + "T00:00:00Z");
  t.setUTCDate(t.getUTCDate() + 1);
  return t.toISOString().slice(0, 10);
}
