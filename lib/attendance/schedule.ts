// Schedule resolution (TypeScript port of SQL app.employee_day) + date & roster pattern helpers.
// Pure — safe to import from both client and server code.

import type { DayType } from "./engine";

export interface EmpSchedule {
  id: number;
  branch_id: number | null;
  org_unit_id: number | null;
  default_shift_id: number | null;
  weekly_off_days: number[] | null;
}

export interface HolidayRow {
  id?: number;
  holiday_date: string;
  name?: string;
  branch_id: number | null;
  org_unit_id: number | null;
  employee_ids: number[] | null;
}

export interface SpecialWorkdayRow {
  id?: number;
  work_date: string;
  name?: string;
  branch_id: number | null;
  org_unit_id: number | null;
  shift_id: number | null;
}

export interface ScheduleRow {
  id?: number;
  employee_id: number;
  work_date: string;
  shift_id: number | null;
  is_day_off: boolean;
  source?: string;
  note?: string | null;
}

export interface ResolvedDay {
  shift_id: number | null;
  day_type: DayType;
  holiday?: string;
  special?: string;
  override?: ScheduleRow;
}

/** Indexes holiday / special workday / per-employee schedule rows for O(1) lookups. */
export class ScheduleIndex {
  private hol = new Map<string, HolidayRow[]>();
  private sp = new Map<string, SpecialWorkdayRow[]>();
  private ws = new Map<string, ScheduleRow>();

  constructor(holidays: HolidayRow[] = [], specials: SpecialWorkdayRow[] = [], schedules: ScheduleRow[] = []) {
    for (const h of holidays) push(this.hol, h.holiday_date.slice(0, 10), h);
    for (const s of specials) push(this.sp, s.work_date.slice(0, 10), s);
    for (const s of schedules) this.ws.set(`${s.employee_id}|${s.work_date.slice(0, 10)}`, s);
  }

  schedule(empId: number, date: string) {
    return this.ws.get(`${empId}|${date}`);
  }
  setSchedule(row: ScheduleRow) {
    this.ws.set(`${row.employee_id}|${row.work_date.slice(0, 10)}`, row);
  }
  removeSchedule(empId: number, date: string) {
    this.ws.delete(`${empId}|${date}`);
  }

  holiday(emp: EmpSchedule, date: string): HolidayRow | undefined {
    return this.hol.get(date)?.find(
      (h) =>
        (h.branch_id == null || h.branch_id === emp.branch_id) &&
        (h.org_unit_id == null || h.org_unit_id === emp.org_unit_id) &&
        (!h.employee_ids || h.employee_ids.length === 0 || h.employee_ids.map(Number).includes(emp.id)),
    );
  }

  special(emp: EmpSchedule, date: string): SpecialWorkdayRow | undefined {
    return this.sp.get(date)?.find(
      (w) => (w.branch_id == null || w.branch_id === emp.branch_id) && (w.org_unit_id == null || w.org_unit_id === emp.org_unit_id),
    );
  }
}

function push<K, V>(m: Map<K, V[]>, k: K, v: V) {
  const a = m.get(k);
  if (a) a.push(v);
  else m.set(k, [v]);
}

/** Same precedence as app.employee_day: personal schedule → special workday → holiday → weekly off → work. */
export function resolveDay(emp: EmpSchedule, date: string, idx: ScheduleIndex): ResolvedDay {
  const hol = idx.holiday(emp, date);
  const s = idx.schedule(emp.id, date);
  if (s) {
    const shift_id = s.shift_id ?? emp.default_shift_id;
    if (s.is_day_off) return { shift_id, day_type: "off", override: s, holiday: hol?.name };
    return { shift_id, day_type: hol ? "holiday" : "work", override: s, holiday: hol?.name };
  }
  const sp = idx.special(emp, date);
  if (sp) return { shift_id: sp.shift_id ?? emp.default_shift_id, day_type: "special", special: sp.name ?? "วันทำงานพิเศษ" };
  if (hol) return { shift_id: emp.default_shift_id, day_type: "holiday", holiday: hol.name ?? "วันหยุด" };
  if ((emp.weekly_off_days ?? []).map(Number).includes(weekday(date))) return { shift_id: emp.default_shift_id, day_type: "off" };
  return { shift_id: emp.default_shift_id, day_type: "work" };
}

// ------------------------------------------------------------------ dates (calendar dates, timezone-free)
export function weekday(date: string): number {
  return new Date(`${date.slice(0, 10)}T00:00:00Z`).getUTCDay();
}

export function plusDays(date: string, n: number): string {
  const d = new Date(`${date.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export function eachDate(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = plusDays(d, 1)) out.push(d);
  return out;
}

/** Monday of the week containing date */
export function weekStart(date: string): string {
  const w = weekday(date);
  return plusDays(date, w === 0 ? -6 : 1 - w);
}

export function monthRange(ym: string): { from: string; to: string } {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, "0")}` };
}

export const isIsoDate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));

/** Bangkok midnight of a calendar date as an ISO timestamp */
export function bkkStart(date: string): string {
  return new Date(`${date}T00:00:00+07:00`).toISOString();
}

// ------------------------------------------------------------------ roster patterns
export const OFF_TOKENS = ["OFF", "O/F", "หยุด", "X", "-"];

/**
 * "D,D,D,D,D,OFF,OFF" | "N×6,OFF" | "N*6, OFF" | "A x5 OFF x2" → ["D","D",…,"OFF"]
 * Returns null when the pattern is empty or a repeat count is invalid.
 */
export function parsePattern(input: string): string[] | null {
  const parts = input
    .replace(/\s*[×xX*]\s*(\d+)/g, "*$1")
    .split(/[,\s]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const p of parts) {
    const m = /^([^*]+)\*(\d+)$/.exec(p);
    const code = (m ? m[1] : p).trim().toUpperCase();
    const n = m ? Number(m[2]) : 1;
    if (!code || !Number.isInteger(n) || n < 1 || n > 366) return null;
    for (let i = 0; i < n; i++) out.push(OFF_TOKENS.includes(code) ? "OFF" : code);
  }
  return out.length ? out : null;
}

/** Apply a rotating pattern day by day from `from` to `to` (inclusive), starting at pattern position `offset`. */
export function expandPattern(pattern: string[], from: string, to: string, offset = 0): { date: string; code: string }[] {
  return eachDate(from, to).map((date, i) => ({ date, code: pattern[(i + offset) % pattern.length] }));
}
