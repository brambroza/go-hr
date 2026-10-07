// Tiny 5-field cron evaluator (minute hour day-of-month month day-of-week), evaluated in Asia/Bangkok (UTC+7, no DST).
// Supports: *, n, a-b, lists (a,b), steps (*/n, a-b/n, n/s), month/day names (jan, mon), 7 = Sunday.
// Day matching follows Vixie cron: when both day-of-month and day-of-week are restricted, either may match.

const BKK_OFFSET_MS = 7 * 60 * 60 * 1000;
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export interface CronSpec {
  minute: Set<number>;
  hour: Set<number>;
  dom: Set<number>;
  month: Set<number>;
  dow: Set<number>;
  domStar: boolean;
  dowStar: boolean;
}

function parseField(src: string, min: number, max: number, names?: string[]): { set: Set<number>; star: boolean } {
  const set = new Set<number>();
  const val = (s: string) => {
    const n = names ? names.indexOf(s.toLowerCase()) : -1;
    const v = n >= 0 ? n + (min === 1 ? 1 : 0) : Number(s);
    if (!/^\d+$/.test(s) && n < 0) throw new Error(`ค่า "${s}" ไม่ถูกต้อง`);
    return v;
  };
  for (const part of src.split(",")) {
    if (!part) throw new Error("รูปแบบ cron ไม่ถูกต้อง");
    const [range, stepStr] = part.split("/");
    const step = stepStr === undefined ? 1 : Number(stepStr);
    if (!Number.isInteger(step) || step < 1) throw new Error(`ค่า step "${stepStr}" ไม่ถูกต้อง`);
    let lo: number, hi: number;
    if (range === "*") [lo, hi] = [min, max];
    else if (range.includes("-")) {
      const [a, b] = range.split("-");
      [lo, hi] = [val(a), val(b)];
    } else {
      lo = val(range);
      hi = stepStr !== undefined ? max : lo;
    }
    if (max === 7 && hi === 7 && lo <= 7) hi = 7; // allow 7 = Sunday
    if (lo < min || hi > max || lo > hi) throw new Error(`ค่า ${range} อยู่นอกช่วง ${min}-${max}`);
    for (let v = lo; v <= hi; v += step) set.add(max === 7 && v === 7 ? 0 : v);
  }
  return { set, star: src === "*" || src.startsWith("*/") };
}

export function parseCron(expr: string): CronSpec {
  const f = expr.trim().split(/\s+/);
  if (f.length !== 5) throw new Error("cron ต้องมี 5 ช่อง: นาที ชั่วโมง วันที่ เดือน วันในสัปดาห์");
  const minute = parseField(f[0], 0, 59);
  const hour = parseField(f[1], 0, 23);
  const dom = parseField(f[2], 1, 31);
  const month = parseField(f[3], 1, 12, MONTHS);
  const dow = parseField(f[4], 0, 7, DAYS);
  return { minute: minute.set, hour: hour.set, dom: dom.set, month: month.set, dow: dow.set, domStar: dom.star, dowStar: dow.star };
}

export function isValidCron(expr: string): boolean {
  try {
    parseCron(expr);
    return true;
  } catch {
    return false;
  }
}

/** Bangkok wall-clock parts of an instant */
export function bkkParts(d: Date) {
  const x = new Date(d.getTime() + BKK_OFFSET_MS);
  return { y: x.getUTCFullYear(), mo: x.getUTCMonth() + 1, d: x.getUTCDate(), h: x.getUTCHours(), mi: x.getUTCMinutes(), dow: x.getUTCDay() };
}

export function cronMatches(spec: CronSpec, at: Date): boolean {
  const p = bkkParts(at);
  if (!spec.minute.has(p.mi) || !spec.hour.has(p.h) || !spec.month.has(p.mo)) return false;
  const domOk = spec.dom.has(p.d);
  const dowOk = spec.dow.has(p.dow);
  if (spec.domStar && spec.dowStar) return true;
  if (spec.domStar) return dowOk;
  if (spec.dowStar) return domOk;
  return domOk || dowOk;
}

/** First matching minute strictly after `after` (searches up to ~2 years). */
export function nextRun(expr: string | CronSpec, after: Date): Date | null {
  const spec = typeof expr === "string" ? parseCron(expr) : expr;
  let t = Math.floor(after.getTime() / 60000) * 60000 + 60000;
  const limit = t + 2 * 366 * 24 * 60 * 60000;
  while (t < limit) {
    const d = new Date(t);
    const p = bkkParts(d);
    // skip quickly over non-matching days / hours
    const dayOk = spec.month.has(p.mo) && (spec.domStar && spec.dowStar ? true : spec.domStar ? spec.dow.has(p.dow) : spec.dowStar ? spec.dom.has(p.d) : spec.dom.has(p.d) || spec.dow.has(p.dow));
    if (!dayOk) {
      t += ((24 - p.h) * 60 - p.mi) * 60000;
      continue;
    }
    if (!spec.hour.has(p.h)) {
      t += (60 - p.mi) * 60000;
      continue;
    }
    if (spec.minute.has(p.mi)) return d;
    t += 60000;
  }
  return null;
}

/**
 * Is the job due at `now`? Due when a scheduled minute falls in (lastRun, now].
 * Never-run jobs are due when the schedule matched within the last `graceMinutes` (default 1440 = 1 day)
 * so a fresh install doesn't immediately run every daily job unless its time has passed today.
 */
export function isDue(expr: string, lastRun: Date | null, now: Date, graceMinutes = 1440): boolean {
  const spec = parseCron(expr);
  const floorNow = Math.floor(now.getTime() / 60000) * 60000;
  const from = lastRun ? lastRun : new Date(floorNow - graceMinutes * 60000);
  const next = nextRun(spec, new Date(Math.max(from.getTime(), floorNow - 400 * 24 * 60 * 60000)));
  return !!next && next.getTime() <= floorNow;
}

const DOW_TH = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
const MONTH_TH = ["", "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
const pad = (n: number) => String(n).padStart(2, "0");

/** Human-readable Thai description of common cron patterns */
export function describeCron(expr: string): string {
  let spec: CronSpec;
  try {
    spec = parseCron(expr);
  } catch (e) {
    return `รูปแบบไม่ถูกต้อง: ${(e as Error).message}`;
  }
  const f = expr.trim().split(/\s+/);
  const mins = [...spec.minute].sort((a, b) => a - b);
  const hours = [...spec.hour].sort((a, b) => a - b);
  let time: string;
  const minStep = /^\*\/(\d+)$/.exec(f[0]);
  const hourStep = /^\*\/(\d+)$/.exec(f[1]);
  if (f[0] === "*" && f[1] === "*") time = "ทุกนาที";
  else if (minStep && f[1] === "*") time = `ทุก ${minStep[1]} นาที`;
  else if (f[1] === "*" && mins.length === 1) time = `ทุกชั่วโมง นาทีที่ ${mins[0]}`;
  else if (hourStep && mins.length === 1) time = `ทุก ${hourStep[1]} ชั่วโมง (นาทีที่ ${mins[0]})`;
  else if (mins.length === 1 && hours.length <= 4) time = `เวลา ${hours.map((h) => `${pad(h)}:${pad(mins[0])}`).join(", ")} น.`;
  else time = `นาที ${f[0]} ชั่วโมง ${f[1]}`;

  let day = "ทุกวัน";
  if (!spec.dowStar && spec.domStar) {
    const d = [...spec.dow].sort((a, b) => a - b);
    day = d.length === 5 && d.join() === "1,2,3,4,5" ? "วันจันทร์-ศุกร์" : `ทุกวัน${d.map((x) => DOW_TH[x]).join(", ")}`;
  } else if (!spec.domStar) {
    day = `วันที่ ${[...spec.dom].sort((a, b) => a - b).join(", ")}`;
    if (f[3] === "*") day += " ของทุกเดือน";
  }
  if (f[3] !== "*") day += ` เดือน${[...spec.month].sort((a, b) => a - b).map((m) => MONTH_TH[m]).join(", ")}`;
  if (time.startsWith("ทุก") && day === "ทุกวัน") return time;
  return `${day} ${time}`;
}

export const CRON_PRESETS: { label: string; cron: string }[] = [
  { label: "ทุก 2 นาที", cron: "*/2 * * * *" },
  { label: "ทุก 15 นาที", cron: "*/15 * * * *" },
  { label: "ทุก 30 นาที", cron: "*/30 * * * *" },
  { label: "ทุกชั่วโมง", cron: "5 * * * *" },
  { label: "ทุกวัน 07:00", cron: "0 7 * * *" },
  { label: "ทุกวัน 08:00", cron: "0 8 * * *" },
  { label: "ทุกวันเที่ยงคืน", cron: "10 0 * * *" },
  { label: "จันทร์-ศุกร์ 08:00", cron: "0 8 * * 1-5" },
  { label: "ทุกวันจันทร์ 08:00", cron: "0 8 * * 1" },
  { label: "วันที่ 1 ของเดือน", cron: "0 6 1 * *" },
  { label: "1 มกราคม", cron: "30 0 1 1 *" },
];
