// Thai formatting helpers (Buddhist calendar, money, baht text, PDPA masking)

export const TH_MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
export const TH_MONTHS_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
export const TH_DAYS = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
export const TH_DAYS_SHORT = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];

export const TZ = "Asia/Bangkok";

/** parse 'YYYY-MM-DD' as a local calendar date (no timezone shift) */
export function parseDate(d: string | Date | null | undefined): Date | null {
  if (!d) return null;
  if (d instanceof Date) return d;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const x = new Date(d);
  return isNaN(x.getTime()) ? null : x;
}

/** 'YYYY-MM-DD' of a Date in Bangkok time */
export function isoDate(d: Date = new Date()): string {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  return p; // en-CA gives YYYY-MM-DD
}

/** local calendar date → 'YYYY-MM-DD' without timezone conversion */
export function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function addDays(date: string, n: number): string {
  const d = parseDate(date)!;
  d.setDate(d.getDate() + n);
  return ymd(d);
}

/** 7 ต.ค. 2569 / 7 ตุลาคม 2569 */
export function thDate(d: string | Date | null | undefined, style: "short" | "long" | "num" = "short"): string {
  const x = typeof d === "string" && d.length > 10 ? new Date(d) : parseDate(d);
  if (!x) return "-";
  const date = typeof d === "string" && d.length > 10 ? bkkParts(x) : { y: x.getFullYear(), m: x.getMonth(), d: x.getDate() };
  if (style === "num") return `${String(date.d).padStart(2, "0")}/${String(date.m + 1).padStart(2, "0")}/${date.y + 543}`;
  const months = style === "long" ? TH_MONTHS : TH_MONTHS_SHORT;
  return `${date.d} ${months[date.m]} ${date.y + 543}`;
}

function bkkParts(x: Date) {
  const s = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(x);
  const [y, m, d] = s.split("-").map(Number);
  return { y, m: m - 1, d };
}

/** 08:05 (Bangkok) */
export function thTime(ts: string | Date | null | undefined): string {
  if (!ts) return "-";
  const d = typeof ts === "string" ? new Date(ts) : ts;
  return new Intl.DateTimeFormat("th-TH", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
}

export function thDateTime(ts: string | Date | null | undefined): string {
  if (!ts) return "-";
  return `${thDate(typeof ts === "string" ? ts : ts.toISOString())} ${thTime(ts)}`;
}

export function thMonthYear(year: number, month: number): string {
  return `${TH_MONTHS[month - 1]} ${year + 543}`;
}

export function money(n: number | string | null | undefined, digits = 2): string {
  const v = Number(n ?? 0);
  return v.toLocaleString("th-TH", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function num(n: number | string | null | undefined, digits = 0): string {
  return Number(n ?? 0).toLocaleString("th-TH", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** 125 → "2:05 ชม." */
export function minutesToHM(min: number | null | undefined): string {
  const m = Math.round(Number(min ?? 0));
  if (!m) return "-";
  const sign = m < 0 ? "-" : "";
  const a = Math.abs(m);
  return `${sign}${Math.floor(a / 60)}:${String(a % 60).padStart(2, "0")}`;
}

export function fullName(e: { prefix?: string | null; first_name?: string | null; last_name?: string | null } | null | undefined, withPrefix = false): string {
  if (!e) return "-";
  return `${withPrefix && e.prefix ? e.prefix : ""}${e.first_name ?? ""} ${e.last_name ?? ""}`.trim();
}

/** 1-2345-67890-12-3 */
export function formatNationalId(id: string | null | undefined): string {
  const s = (id ?? "").replace(/\D/g, "");
  if (s.length !== 13) return id ?? "";
  return `${s[0]}-${s.slice(1, 5)}-${s.slice(5, 10)}-${s.slice(10, 12)}-${s[12]}`;
}

export function maskNationalId(id: string | null | undefined): string {
  const s = (id ?? "").replace(/\D/g, "");
  if (!s) return "-";
  return `${s.slice(0, 1)}-XXXX-XXXX${s.slice(9, 10)}-${s.slice(10, 12)}-${s.slice(12)}`.replace(/-$/, "");
}

export function maskAccount(acc: string | null | undefined): string {
  const s = (acc ?? "").replace(/\D/g, "");
  if (!s) return "-";
  return "XXX-X-X" + s.slice(-4);
}

export function validNationalId(id: string): boolean {
  const s = id.replace(/\D/g, "");
  if (s.length !== 13) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(s[i]) * (13 - i);
  return (11 - (sum % 11)) % 10 === Number(s[12]);
}

// ---------------------------------------------------------------- Baht text
const DIGITS = ["", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];
const UNITS = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน"];

function readGroup(n: string, hasHigher: boolean): string {
  // n: up to 6 digits; hasHigher = a higher-order group (millions) is non-zero
  let out = "";
  const len = n.length;
  const higherInGroup = (i: number) => n.slice(0, i).replace(/0/g, "") !== "";
  for (let i = 0; i < len; i++) {
    const d = Number(n[i]);
    const pos = len - i - 1;
    if (d === 0) continue;
    if (pos === 1 && d === 1) out += "สิบ";
    else if (pos === 1 && d === 2) out += "ยี่สิบ";
    else if (pos === 0 && d === 1 && (higherInGroup(i) || hasHigher)) out += "เอ็ด";
    else out += DIGITS[d] + UNITS[pos];
  }
  return out;
}

function readInteger(s: string): string {
  s = s.replace(/^0+/, "");
  if (!s) return "";
  const groups: string[] = [];
  while (s.length > 6) {
    groups.unshift(s.slice(-6));
    s = s.slice(0, -6);
  }
  groups.unshift(s);
  return groups.map((g, i) => readGroup(g, i > 0) + (i < groups.length - 1 ? "ล้าน" : "")).join("");
}

/** 1250.50 → "หนึ่งพันสองร้อยห้าสิบบาทห้าสิบสตางค์" */
export function bahtText(amount: number): string {
  const neg = amount < 0;
  const [i, f] = Math.abs(amount).toFixed(2).split(".");
  const baht = readInteger(i);
  const satang = readInteger(f);
  let out = (baht || (satang ? "" : "ศูนย์")) + (baht || !satang ? "บาท" : "");
  out += satang ? satang + "สตางค์" : "ถ้วน";
  return (neg ? "ลบ" : "") + out;
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
