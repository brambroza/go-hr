// Daily attendance calculation — pure & deterministic (unit tested).
// All clock times are Asia/Bangkok (UTC+7, no DST).

export type DayType = "work" | "off" | "holiday" | "special";

export interface ShiftDef {
  id?: number;
  start_time: string; // HH:MM[:SS]
  end_time: string;
  is_overnight: boolean;
  break_start?: string | null;
  break_end?: string | null;
  break_minutes: number;
  work_minutes: number;
  scan_in_before_min: number;
  scan_out_after_min: number;
  late_grace_min: number;
  early_grace_min: number;
  break_over_grace_min: number;
  ot_before_min: number;
  ot_after_start_min: number;
  ot_min_minutes: number;
  ot_round_minutes: number;
  require_ot_request: boolean;
}

export interface LogIn {
  time: string; // ISO timestamp
  direction?: "in" | "out" | "break_out" | "break_in" | "auto" | string;
}

export interface LeaveIn {
  unit: "full" | "half_am" | "half_pm" | "hours";
  minutes?: number;
  leave_type_id?: number;
}

export interface OtRequestIn {
  start: string; // ISO
  end: string;
}

export interface AttendanceSettings {
  absent_if_no_scan: boolean;
  auto_ot_without_request: boolean;
  employee_type: string; // monthly / daily / hourly ...
  ot_rates: { workday: number; holiday_monthly: number; holiday_daily: number; holiday_ot: number };
}

export interface DayInput {
  date: string; // YYYY-MM-DD
  dayType: DayType;
  shift: ShiftDef | null;
  logs: LogIn[];
  leaves: LeaveIn[];
  otRequests: OtRequestIn[];
  settings: AttendanceSettings;
}

export interface DayResult {
  sched_in: string | null;
  sched_out: string | null;
  actual_in: string | null;
  actual_out: string | null;
  break_out: string | null;
  break_in: string | null;
  work_minutes: number;
  late_minutes: number;
  early_minutes: number;
  break_over_minutes: number;
  early_in_minutes: number;
  late_out_minutes: number;
  ot_before_minutes: number;
  ot_after_minutes: number;
  ot_holiday_minutes: number;
  ot_approved_minutes: Record<string, number>; // multiplier → minutes
  absent: boolean;
  missing_scan: boolean;
  leave_minutes: number;
  leave_type_ids: number[];
}

const MIN = 60_000;

export function at(date: string, hhmm: string, plusDays = 0): Date {
  const d = new Date(`${date}T${hhmm.slice(0, 5)}:00+07:00`);
  if (plusDays) d.setTime(d.getTime() + plusDays * 86_400_000);
  return d;
}

function diffMin(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / MIN);
}

function overlap(a1: Date, a2: Date, b1: Date, b2: Date): number {
  const s = Math.max(a1.getTime(), b1.getTime());
  const e = Math.min(a2.getTime(), b2.getTime());
  return e > s ? Math.round((e - s) / MIN) : 0;
}

function roundDown(min: number, step: number): number {
  if (!step || step <= 1) return Math.max(0, Math.floor(min));
  return Math.max(0, Math.floor(min / step) * step);
}

function addRate(map: Record<string, number>, rate: number, minutes: number) {
  if (minutes <= 0) return;
  const k = String(rate);
  map[k] = (map[k] ?? 0) + minutes;
}

export function shiftWindow(date: string, s: ShiftDef) {
  const schedIn = at(date, s.start_time);
  let schedOut = at(date, s.end_time);
  if (s.is_overnight || schedOut <= schedIn) schedOut = at(date, s.end_time, 1);
  let breakStart: Date | null = null;
  let breakEnd: Date | null = null;
  if (s.break_start && s.break_end) {
    breakStart = at(date, s.break_start);
    if (breakStart < schedIn) breakStart = at(date, s.break_start, 1);
    breakEnd = at(date, s.break_end);
    if (breakEnd < breakStart) breakEnd = at(date, s.break_end, 1);
  }
  return {
    schedIn,
    schedOut,
    breakStart,
    breakEnd,
    windowStart: new Date(schedIn.getTime() - s.scan_in_before_min * MIN),
    windowEnd: new Date(schedOut.getTime() + s.scan_out_after_min * MIN),
  };
}

export function computeDay(input: DayInput): DayResult {
  const { date, dayType, shift: s, settings } = input;
  const res: DayResult = {
    sched_in: null, sched_out: null, actual_in: null, actual_out: null, break_out: null, break_in: null,
    work_minutes: 0, late_minutes: 0, early_minutes: 0, break_over_minutes: 0, early_in_minutes: 0, late_out_minutes: 0,
    ot_before_minutes: 0, ot_after_minutes: 0, ot_holiday_minutes: 0, ot_approved_minutes: {},
    absent: false, missing_scan: false, leave_minutes: 0,
    leave_type_ids: [...new Set(input.leaves.map((l) => l.leave_type_id).filter((x): x is number => x != null))],
  };
  if (!s) return res;

  const w = shiftWindow(date, s);
  const isWorkDay = dayType === "work" || dayType === "special";
  res.sched_in = w.schedIn.toISOString();
  res.sched_out = w.schedOut.toISOString();

  // ---- leave coverage -------------------------------------------------
  const fullLeave = input.leaves.some((l) => l.unit === "full");
  const halfAm = input.leaves.some((l) => l.unit === "half_am");
  const halfPm = input.leaves.some((l) => l.unit === "half_pm");
  const hourLeave = input.leaves.filter((l) => l.unit === "hours").reduce((a, l) => a + (l.minutes ?? 0), 0);
  let effIn = w.schedIn;
  let effOut = w.schedOut;
  if (isWorkDay) {
    if (fullLeave || (halfAm && halfPm)) res.leave_minutes = s.work_minutes;
    else {
      if (halfAm) {
        res.leave_minutes += Math.round(s.work_minutes / 2);
        effIn = w.breakEnd ?? new Date(w.schedIn.getTime() + (s.work_minutes / 2 + s.break_minutes) * MIN);
      }
      if (halfPm) {
        res.leave_minutes += Math.round(s.work_minutes / 2);
        effOut = w.breakStart ?? new Date(w.schedIn.getTime() + (s.work_minutes / 2) * MIN);
      }
      res.leave_minutes += hourLeave;
    }
  }

  // ---- pick scans in the window ---------------------------------------
  const logs = input.logs
    .map((l) => ({ t: new Date(l.time), d: l.direction ?? "auto" }))
    .filter((l) => l.t >= w.windowStart && l.t <= w.windowEnd)
    .sort((a, b) => a.t.getTime() - b.t.getTime());

  // collapse duplicate scans within 2 minutes
  const scans: typeof logs = [];
  for (const l of logs) {
    const prev = scans[scans.length - 1];
    if (prev && l.d === prev.d && l.t.getTime() - prev.t.getTime() < 2 * MIN) continue;
    scans.push(l);
  }

  let inT: Date | null = scans.find((l) => l.d === "in")?.t ?? null;
  let outT: Date | null = [...scans].reverse().find((l) => l.d === "out")?.t ?? null;
  let bOut: Date | null = scans.find((l) => l.d === "break_out")?.t ?? null;
  let bIn: Date | null = scans.find((l) => l.d === "break_in")?.t ?? null;
  const autos = scans.filter((l) => l.d === "auto").map((l) => l.t);
  if (!inT && autos.length) inT = autos[0];
  if (!outT && autos.length >= 2) outT = autos[autos.length - 1];
  if (!outT && inT && autos.length === 1 && autos[0] !== inT) outT = autos[0];
  // a single auto scan closer to the end of the shift than the start counts as out
  if (inT && !outT && autos.length === 1 && scans.length === 1) {
    if (Math.abs(diffMin(inT, w.schedOut)) < Math.abs(diffMin(inT, w.schedIn))) {
      outT = inT;
      inT = null;
    }
  }
  if (!bOut && !bIn && autos.length >= 4) {
    bOut = autos[1];
    bIn = autos[2];
  }

  res.actual_in = inT?.toISOString() ?? null;
  res.actual_out = outT?.toISOString() ?? null;
  res.break_out = bOut?.toISOString() ?? null;
  res.break_in = bIn?.toISOString() ?? null;

  const anyScan = !!(inT || outT);
  const bothScans = !!(inT && outT && outT > inT);

  // ---- work day ----------------------------------------------------------
  if (isWorkDay) {
    if (fullLeave || (halfAm && halfPm)) {
      // on leave all day; scans (if any) are ignored for lateness
    } else if (!anyScan) {
      if (settings.absent_if_no_scan) res.absent = true;
    } else {
      if (!bothScans) res.missing_scan = true;
      if (inT) {
        const late = diffMin(inT, effIn);
        if (late > s.late_grace_min) res.late_minutes = late;
        if (late < 0) res.early_in_minutes = -late;
      }
      if (outT && outT > (inT ?? w.windowStart)) {
        const early = diffMin(effOut, outT);
        if (early > s.early_grace_min) res.early_minutes = early;
        if (early < 0) res.late_out_minutes = -early;
      }
      // hourly leave offsets lateness / early-out first
      if (hourLeave > 0) {
        let rem = hourLeave;
        const cutLate = Math.min(rem, res.late_minutes);
        res.late_minutes -= cutLate;
        rem -= cutLate;
        res.early_minutes = Math.max(0, res.early_minutes - rem);
      }
      if (bOut && bIn && bIn > bOut) {
        const over = diffMin(bIn, bOut) - s.break_minutes;
        if (over > s.break_over_grace_min) res.break_over_minutes = over;
      }
      if (bothScans) {
        const start = inT! > effIn ? inT! : effIn;
        const end = outT! < effOut ? outT! : effOut;
        let worked = diffMin(end, start);
        if (w.breakStart && w.breakEnd) worked -= overlap(start, end, w.breakStart, w.breakEnd);
        else if (worked > 5 * 60) worked -= s.break_minutes;
        res.work_minutes = Math.max(0, worked);
      }
    }

    // OT on a work day: outside normal hours only
    if (bothScans) {
      const before = Math.max(0, diffMin(w.schedIn, inT!) - s.ot_before_min);
      const after = Math.max(0, diffMin(outT!, w.schedOut) - s.ot_after_start_min);
      res.ot_before_minutes = roundDown(before, s.ot_round_minutes);
      res.ot_after_minutes = roundDown(after, s.ot_round_minutes);
      let approved = 0;
      if (input.otRequests.length) {
        for (const r of input.otRequests) {
          const rs = new Date(r.start);
          const re = new Date(r.end);
          // part before shift + part after shift (not normal hours)
          approved += overlap(rs, re, inT!, w.schedIn) + overlap(rs, re, w.schedOut, outT!);
        }
      } else if (!s.require_ot_request || settings.auto_ot_without_request) {
        approved = (before > 0 ? before : 0) + (after > 0 ? after : 0);
      }
      approved = roundDown(approved, s.ot_round_minutes);
      if (approved >= s.ot_min_minutes) addRate(res.ot_approved_minutes, settings.ot_rates.workday, approved);
    }
    return res;
  }

  // ---- off day / holiday (no absence, any work is holiday work) ---------------------
  if (bothScans) {
    const normalRate = settings.employee_type === "monthly" ? settings.ot_rates.holiday_monthly : settings.ot_rates.holiday_daily;
    const normalStart = w.schedIn;
    const normalEnd = w.schedOut;
    let normalWorked = overlap(inT!, outT!, normalStart, normalEnd);
    if (w.breakStart && w.breakEnd) normalWorked -= overlap(inT!, outT!, w.breakStart, w.breakEnd);
    normalWorked = Math.max(0, Math.min(normalWorked, s.work_minutes));
    const extra = overlap(inT!, outT!, new Date(normalEnd.getTime() + s.ot_after_start_min * MIN), outT!)
      + overlap(inT!, outT!, inT!, new Date(normalStart.getTime() - s.ot_before_min * MIN));
    res.work_minutes = normalWorked;
    res.ot_holiday_minutes = roundDown(normalWorked, s.ot_round_minutes);

    let normalApproved = 0;
    let extraApproved = 0;
    if (input.otRequests.length) {
      for (const r of input.otRequests) {
        // the part of the request the employee was actually present for
        const rs = new Date(Math.max(new Date(r.start).getTime(), inT!.getTime()));
        const re = new Date(Math.min(new Date(r.end).getTime(), outT!.getTime()));
        if (re <= rs) continue;
        const total = diffMin(re, rs);
        const inNormalGross = overlap(rs, re, normalStart, normalEnd);
        const breakPart = w.breakStart && w.breakEnd ? overlap(rs, re, w.breakStart, w.breakEnd) : 0;
        normalApproved += Math.max(0, inNormalGross - breakPart);
        extraApproved += Math.max(0, total - inNormalGross);
      }
      normalApproved = Math.min(normalApproved, s.work_minutes);
    } else if (!s.require_ot_request || settings.auto_ot_without_request) {
      normalApproved = normalWorked;
      extraApproved = extra;
    }
    normalApproved = roundDown(normalApproved, s.ot_round_minutes);
    extraApproved = roundDown(extraApproved, s.ot_round_minutes);
    if (normalApproved >= s.ot_min_minutes) addRate(res.ot_approved_minutes, normalRate, normalApproved);
    if (extraApproved >= s.ot_min_minutes) addRate(res.ot_approved_minutes, settings.ot_rates.holiday_ot, extraApproved);
  } else if (anyScan) {
    res.missing_scan = true;
  }
  return res;
}

/** summary over many days — used for payroll */
export interface AttendanceSummary {
  work_days: number;
  absent_days: number;
  late_minutes: number;
  late_count: number;
  early_minutes: number;
  break_over_minutes: number;
  missing_scan_days: number;
  ot_minutes: Record<string, number>;
  holiday_days_paid: number;
}

export function summarize(days: (Pick<DayResult, "absent" | "late_minutes" | "early_minutes" | "break_over_minutes" | "missing_scan" | "ot_approved_minutes" | "work_minutes"> & { day_type: string })[]): AttendanceSummary {
  const s: AttendanceSummary = { work_days: 0, absent_days: 0, late_minutes: 0, late_count: 0, early_minutes: 0, break_over_minutes: 0, missing_scan_days: 0, ot_minutes: {}, holiday_days_paid: 0 };
  for (const d of days) {
    if ((d.day_type === "work" || d.day_type === "special") && d.work_minutes > 0) s.work_days++;
    if (d.day_type === "holiday") s.holiday_days_paid++;
    if (d.absent) s.absent_days++;
    if (d.late_minutes > 0) s.late_count++;
    s.late_minutes += d.late_minutes;
    s.early_minutes += d.early_minutes;
    s.break_over_minutes += d.break_over_minutes;
    if (d.missing_scan) s.missing_scan_days++;
    for (const [k, v] of Object.entries(d.ot_approved_minutes ?? {})) s.ot_minutes[k] = (s.ot_minutes[k] ?? 0) + Number(v);
  }
  return s;
}
