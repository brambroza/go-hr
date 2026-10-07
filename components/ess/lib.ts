// Small client-safe helpers for the employee self-service app (/m)

export const REQ_STATUS: Record<string, { label: string; color: string }> = {
  draft: { label: "ฉบับร่าง", color: "gray" },
  pending: { label: "รออนุมัติ", color: "amber" },
  approved: { label: "อนุมัติแล้ว", color: "green" },
  rejected: { label: "ไม่อนุมัติ", color: "red" },
  cancelled: { label: "ยกเลิกแล้ว", color: "gray" },
};

export const STEP_STATUS: Record<string, { label: string; color: string }> = {
  waiting: { label: "รอขั้นก่อนหน้า", color: "gray" },
  pending: { label: "กำลังรออนุมัติ", color: "amber" },
  approved: { label: "อนุมัติ", color: "green" },
  rejected: { label: "ไม่อนุมัติ", color: "red" },
  skipped: { label: "ข้าม", color: "gray" },
  cancelled: { label: "ยกเลิก", color: "gray" },
};

export const DIRECTIONS: { value: string; label: string }[] = [
  { value: "auto", label: "อัตโนมัติ" },
  { value: "in", label: "เข้างาน" },
  { value: "out", label: "ออกงาน" },
  { value: "break_out", label: "พักเบรค" },
  { value: "break_in", label: "กลับจากพัก" },
];
export const DIRECTION_LABEL: Record<string, string> = Object.fromEntries(DIRECTIONS.map((d) => [d.value, d.label]));
DIRECTION_LABEL.auto = "ลงเวลา";

export const SOURCE_LABEL: Record<string, string> = {
  gps: "GPS",
  qr: "QR Code",
  wifi: "Wi-Fi",
  beacon: "Beacon",
  face: "ใบหน้า",
  offline: "ออฟไลน์",
  fingerprint: "เครื่องสแกนนิ้ว",
  kiosk: "Kiosk",
  import: "นำเข้า",
  manual: "เพิ่มเวลา",
  team: "หัวหน้าลงให้",
  line: "LINE",
};

export const DAY_TYPE_LABEL: Record<string, string> = { work: "วันทำงาน", off: "วันหยุดประจำสัปดาห์", holiday: "วันหยุดนักขัตฤกษ์", special: "วันทำงานพิเศษ" };

export const LEAVE_UNIT_LABEL: Record<string, string> = { full: "เต็มวัน", half_am: "ครึ่งเช้า", half_pm: "ครึ่งบ่าย", hours: "รายชั่วโมง" };

/** Haversine distance in metres (same formula as SQL app.distance_m) */
export function distanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = (x: number) => (x * Math.PI) / 180;
  const a = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lon2 - lon1) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(a));
}

export function fmtDistance(m: number): string {
  if (m < 1000) return `${Math.round(m)} ม.`;
  return `${(m / 1000).toLocaleString("th-TH", { maximumFractionDigits: 1 })} กม.`;
}

export function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Turn a Supabase/PostgREST error (or anything thrown) into the Thai message the RPC raised */
export function errText(e: unknown): string {
  if (!e) return "เกิดข้อผิดพลาด";
  if (typeof e === "string") return e;
  if (typeof e === "object" && e && "message" in e) return String((e as { message: unknown }).message);
  return String(e);
}

/** true when the error looks like a network failure (not a business error from the DB) */
export function isNetworkError(e: unknown): boolean {
  const m = errText(e).toLowerCase();
  return m.includes("failed to fetch") || m.includes("networkerror") || m.includes("network request failed") || m.includes("load failed") || m.includes("fetch failed");
}

/** "YYYY-MM-DD" + "HH:MM" (Bangkok) → ISO with +07:00 */
export function bkkIso(date: string, time: string): string {
  return `${date}T${time.length === 5 ? time + ":00" : time}+07:00`;
}

export function hm(t: string | null | undefined): string {
  return t ? t.slice(0, 5) : "-";
}

export function yearsBetween(from: string | null | undefined, to: Date = new Date()): number {
  if (!from) return 0;
  const d = new Date(from + "T00:00:00+07:00");
  return Math.max(0, (to.getTime() - d.getTime()) / (365.2425 * 86400000));
}

export function serviceText(from: string | null | undefined): string {
  if (!from) return "-";
  const d = new Date(from + "T00:00:00+07:00");
  const now = new Date();
  let months = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
  if (now.getDate() < d.getDate()) months -= 1;
  if (months < 0) return "-";
  const y = Math.floor(months / 12);
  const m = months % 12;
  return [y ? `${y} ปี` : "", m ? `${m} เดือน` : "", !y && !m ? "ไม่ถึง 1 เดือน" : ""].filter(Boolean).join(" ");
}
