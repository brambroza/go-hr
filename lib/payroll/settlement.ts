// เคลียร์เงินพนักงานพ้นสภาพ (final settlement) — pure functions, unit tested in tests/settlement.test.ts.
//
//   * ค่าชดเชย ม.118 พ.ร.บ.คุ้มครองแรงงาน ตามอายุงาน × ค่าจ้างอัตราสุดท้ายต่อวัน
//   * ยกเว้นภาษีค่าชดเชย ม.42(17) — วงเงินและจำนวนวันเก็บเป็นค่าตั้งค่าที่มีวันมีผล (settings.payroll.severance_exemptions)
//     ส่วนที่เกินคิดภาษีรวมกับเงินได้ปกติ (เงินได้ไม่ประจำ) — ยังไม่รองรับการแยกคำนวณตาม ม.48(5)
//   * ค่าจ้างวันหยุดพักผ่อนประจำปีที่ยังไม่ได้ใช้ ม.67
//   * ค่าจ้างแทนการบอกกล่าวล่วงหน้า ม.17/1 (HR ระบุจำนวนวัน)
//   * คืนเงินประกันการทำงาน ม.10
// The last partial month's salary is not part of this: the normal period prorates it by resign_date.

export type ResignType = "ลาออกเอง" | "เลิกจ้าง" | "เลิกจ้างกรณีความผิดร้ายแรง (ม.119)" | "เกษียณ" | "หมดสัญญา" | "เสียชีวิต" | "อื่น ๆ";

/** ม.118: minimum continuous service (days for the first step, then full years) → days of last wage */
export const SEVERANCE_STEPS: { minDays?: number; minYears?: number; days: number }[] = [
  { minYears: 20, days: 400 },
  { minYears: 10, days: 300 },
  { minYears: 6, days: 240 },
  { minYears: 3, days: 180 },
  { minYears: 1, days: 90 },
  { minDays: 120, days: 30 },
];

/** Resign types that are entitled to severance by default (HR can still override per person) */
export const SEVERANCE_BY_TYPE: Record<string, boolean> = {
  "เลิกจ้าง": true,
  "เกษียณ": true, // ม.118/1 — retirement counts as termination
  "หมดสัญญา": true, // fixed-term exemption (ม.118 วรรคสาม) is narrow → HR turns it off when it applies
  "ลาออกเอง": false,
  "เลิกจ้างกรณีความผิดร้ายแรง (ม.119)": false,
  "เสียชีวิต": false,
  "อื่น ๆ": false,
};

export const MISCONDUCT_TYPE = "เลิกจ้างกรณีความผิดร้ายแรง (ม.119)";

export interface SeveranceExemption {
  from: string; // YYYY-MM-DD, effective from (by last working day)
  max_amount: number;
  max_days: number; // not more than the wage of the last N days
}

export const DEFAULT_SEVERANCE_EXEMPTIONS: SeveranceExemption[] = [{ from: "2000-01-01", max_amount: 300000, max_days: 300 }];

/** ลาออกเอง: current-year annual leave paid pro rata (default) or only leave carried over from earlier years */
export type VoluntaryLeavePayout = "prorata" | "carried_only";

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const DAY = 86_400_000;
const toMs = (d: string) => Date.parse(d + "T00:00:00Z");

/** days from a to b inclusive (0 when b < a) */
export function daysInclusive(a: string, b: string): number {
  return Math.max(0, Math.round((toMs(b) - toMs(a)) / DAY) + 1);
}

function addYears(d: string, n: number): string {
  const [y, m, day] = d.split("-").map(Number);
  // 29 Feb → 28 Feb in non-leap years
  const dt = new Date(Date.UTC(y + n, m - 1, day));
  if (dt.getUTCMonth() !== m - 1) dt.setUTCDate(0);
  return dt.toISOString().slice(0, 10);
}

/** completed years of service: the n-th anniversary minus one day must be on or before the last working day */
export function serviceYears(hire: string, lastDay: string): number {
  let y = 0;
  while (toMs(addYears(hire, y + 1)) - DAY <= toMs(lastDay)) y++;
  return y;
}

export function severanceDays(hire: string, lastDay: string): number {
  const years = serviceYears(hire, lastDay);
  const days = daysInclusive(hire, lastDay);
  for (const s of SEVERANCE_STEPS) {
    if (s.minYears != null && years >= s.minYears) return s.days;
    if (s.minDays != null && days >= s.minDays) return s.days;
  }
  return 0;
}

export function exemptionFor(lastDay: string, list: SeveranceExemption[] | null | undefined): SeveranceExemption {
  const valid = (list?.length ? list : DEFAULT_SEVERANCE_EXEMPTIONS).filter((x) => x.from && x.from <= lastDay);
  return valid.sort((a, b) => a.from.localeCompare(b.from)).pop() ?? DEFAULT_SEVERANCE_EXEMPTIONS[0];
}

/**
 * ค่าจ้างอัตราสุดท้ายต่อวัน. Monthly wage ÷ 30 by law (ม.118 / ม.67), never the payroll daily divisor (26 / 22 would
 * overpay). `monthlyAllowance` = fixed recurring allowances that are part of ค่าจ้าง (e.g. ค่าตำแหน่ง), per month.
 */
export function dailyRate(salary: number, unit: "month" | "day" | "hour", hoursPerDay = 8, monthlyAllowance = 0): number {
  const s = Number(salary) || 0;
  const extra = (Number(monthlyAllowance) || 0) / 30;
  if (unit === "day") return s + extra;
  if (unit === "hour") return s * hoursPerDay + extra;
  return (s + (Number(monthlyAllowance) || 0)) / 30;
}

export interface LeaveBalanceInput {
  quota_days: number; // this year's quota
  carried_days: number; // carried over from earlier years
  adjust_days: number;
  used_days: number; // approved leave this year
}

/**
 * Unused annual leave to pay (ม.67).
 *   * current-year quota pro rata to the days worked in the year (from 1 Jan, or from the hire date for someone hired this
 *     year, whose quota already covers only the rest of the year)
 *   * leave carried over from earlier years is always paid, also on resignation and ม.119 dismissal
 *   * leave already taken uses the carried days first
 */
export function leavePayoutDays(b: LeaveBalanceInput, hire: string, lastDay: string, mode: "prorata" | "carried_only"): { days: number; current: number; carried: number; factor: number } {
  const year = lastDay.slice(0, 4);
  const yearStart = `${year}-01-01`;
  const from = hire > yearStart ? hire : yearStart;
  const factor = Math.min(1, daysInclusive(from, lastDay) / daysInclusive(from, `${year}-12-31`));
  const carried = Math.max(0, Number(b.carried_days) || 0);
  const used = Math.max(0, Number(b.used_days) || 0);
  const carriedLeft = Math.max(0, carried - used);
  const usedFromCurrent = Math.max(0, used - carried);
  const current = mode === "prorata" ? Math.max(0, (Number(b.quota_days) || 0) * factor + (Number(b.adjust_days) || 0) - usedFromCurrent) : 0;
  // half days are the smallest unit of annual leave
  const half = (n: number) => Math.floor(n * 2 + 1e-9) / 2;
  return { days: half(current) + half(carriedLeft), current: half(current), carried: half(carriedLeft), factor: r2(factor) };
}

export interface SettlementInput {
  hire_date: string;
  last_day: string; // resign_date = last working day
  resign_type: string | null;
  salary: number;
  salary_unit: "month" | "day" | "hour";
  hours_per_day?: number;
  /** fixed recurring allowances counted as wage (ค่าจ้าง), per month */
  monthly_allowance?: number;
  leave: LeaveBalanceInput | null; // annual leave balance of the last year
  guarantee_held: number; // work guarantee collected and not yet refunded
  exemptions?: SeveranceExemption[] | null;
  voluntary_leave_payout?: VoluntaryLeavePayout;
  /** HR overrides (null / undefined = use the computed value) */
  override?: { severance_eligible?: boolean | null; severance_days?: number | null; leave_days?: number | null; notice_days?: number | null; guarantee_refund?: number | null };
}

export type SettlementLineKey = "severance_exempt" | "severance" | "leave_payout" | "notice_pay" | "guarantee_refund";

export interface SettlementLine {
  key: SettlementLineKey;
  amount: number;
  qty: number | null;
  rate: number | null;
  note: string;
}

export interface SettlementResult {
  service: { days: number; years: number };
  daily_rate: number;
  severance_eligible: boolean;
  severance_days: number;
  severance_amount: number;
  exempt_amount: number;
  exemption: SeveranceExemption;
  leave_days: number;
  leave_detail: { current: number; carried: number; factor: number } | null;
  leave_amount: number;
  notice_days: number;
  notice_amount: number;
  guarantee_refund: number;
  total: number;
  lines: SettlementLine[];
  warnings: string[];
}

export function computeSettlement(i: SettlementInput): SettlementResult {
  const warnings: string[] = [];
  const o = i.override ?? {};
  if (i.last_day < i.hire_date) throw new Error("วันทำงานวันสุดท้ายอยู่ก่อนวันเริ่มงาน");
  const daily = r2(dailyRate(i.salary, i.salary_unit, i.hours_per_day, i.monthly_allowance));
  if (!(daily > 0)) warnings.push("ยังไม่ได้กำหนดเงินเดือน/ค่าจ้าง — คำนวณเป็น 0");
  if (i.salary_unit !== "month") warnings.push("ลูกจ้างรายวัน/รายชั่วโมง: ค่าจ้างอัตราสุดท้ายต่อวันคิดจากอัตราค่าจ้าง ถ้ามีค่าจ้างตามผลงานให้ตรวจสอบและแก้จำนวนวันเอง");

  const years = serviceYears(i.hire_date, i.last_day);
  const days = daysInclusive(i.hire_date, i.last_day);
  const type = i.resign_type ?? "";
  if (!type) warnings.push("ยังไม่ได้ระบุประเภทการพ้นสภาพ — ไม่คิดค่าชดเชยจนกว่าจะเลือก");
  const eligible = o.severance_eligible ?? SEVERANCE_BY_TYPE[type] ?? false;
  if (o.severance_eligible != null && o.severance_eligible !== (SEVERANCE_BY_TYPE[type] ?? false)) warnings.push("กำหนดสิทธิ์ค่าชดเชยต่างจากประเภทการพ้นสภาพ — ระบุเหตุผลในหมายเหตุ");
  const sevDays = eligible ? Math.max(0, o.severance_days ?? severanceDays(i.hire_date, i.last_day)) : 0;
  const severance = r2(daily * sevDays);
  const exemption = exemptionFor(i.last_day, i.exemptions);
  const exempt = r2(Math.min(severance, exemption.max_amount, daily * exemption.max_days));

  const misconduct = type === MISCONDUCT_TYPE;
  const mode: "prorata" | "carried_only" = misconduct ? "carried_only" : type === "ลาออกเอง" ? (i.voluntary_leave_payout ?? "prorata") : "prorata";
  const leaveCalc = i.leave ? leavePayoutDays(i.leave, i.hire_date, i.last_day, mode) : null;
  const leaveDays = Math.max(0, o.leave_days ?? leaveCalc?.days ?? 0);
  const leaveAmount = r2(daily * leaveDays);

  const noticeDays = misconduct ? 0 : Math.max(0, o.notice_days ?? 0);
  if (misconduct && (o.notice_days ?? 0) > 0) warnings.push("เลิกจ้างตาม ม.119 ไม่ต้องจ่ายค่าบอกกล่าวล่วงหน้า");
  const noticeAmount = r2(daily * noticeDays);
  const guarantee = r2(Math.max(0, o.guarantee_refund ?? i.guarantee_held));

  const lines: SettlementLine[] = [];
  if (exempt > 0) lines.push({ key: "severance_exempt", amount: exempt, qty: null, rate: null, note: `ค่าชดเชย ม.118 ส่วนที่ได้รับยกเว้นภาษี (ไม่เกิน ${exemption.max_amount.toLocaleString("th-TH")} บาท / ${exemption.max_days} วัน)` });
  if (severance - exempt > 0) lines.push({ key: "severance", amount: r2(severance - exempt), qty: null, rate: null, note: "ค่าชดเชย ม.118 ส่วนที่เกินวงเงินยกเว้น" });
  if (leaveAmount > 0) lines.push({ key: "leave_payout", amount: leaveAmount, qty: leaveDays, rate: daily, note: `ค่าจ้างวันหยุดพักผ่อนที่ยังไม่ได้ใช้ ${leaveDays} วัน` });
  if (noticeAmount > 0) lines.push({ key: "notice_pay", amount: noticeAmount, qty: noticeDays, rate: daily, note: `ค่าจ้างแทนการบอกกล่าวล่วงหน้า ${noticeDays} วัน` });
  if (guarantee > 0) lines.push({ key: "guarantee_refund", amount: guarantee, qty: null, rate: null, note: "คืนเงินประกันการทำงาน" });

  return {
    service: { days, years },
    daily_rate: daily,
    severance_eligible: eligible,
    severance_days: sevDays,
    severance_amount: severance,
    exempt_amount: exempt,
    exemption,
    leave_days: leaveDays,
    leave_detail: leaveCalc ? { current: leaveCalc.current, carried: leaveCalc.carried, factor: leaveCalc.factor } : null,
    leave_amount: leaveAmount,
    notice_days: noticeDays,
    notice_amount: noticeAmount,
    guarantee_refund: guarantee,
    total: r2(lines.reduce((s, l) => s + l.amount, 0)),
    lines,
    warnings,
  };
}

/** pay item system_key of each settlement line (pay items created by migration 20261026010000) */
export const SETTLEMENT_PAY_ITEM: Record<SettlementLineKey, string> = {
  severance_exempt: "severance_exempt",
  severance: "severance",
  leave_payout: "leave_payout",
  notice_pay: "notice_pay",
  guarantee_refund: "guarantee_refund",
};
