// Labels & small helpers shared by payroll pages (client + server safe)

export const PERIOD_TYPES: { value: string; label: string; hint: string }[] = [
  { value: "monthly", label: "รายเดือน", hint: "เงินเดือน/ค่าจ้าง เวลาทำงาน รายการประจำ ภาษี ประกันสังคม และกองทุน" },
  { value: "semi_monthly", label: "ครึ่งเดือน", hint: "จ่ายเดือนละ 2 ครั้ง ประกันสังคมคำนวณรวมทั้งเดือนไม่ให้หักซ้ำ" },
  { value: "ot", label: "เฉพาะค่าล่วงเวลา", hint: "จ่ายค่าล่วงเวลาแยกจากเงินเดือน" },
  { value: "split", label: "แยกจ่าย", hint: "แยกจ่ายบางส่วน เลือกเองว่าจะรวมรายการใด" },
  { value: "special", label: "งวดพิเศษ", hint: "เช่น ค่าชดเชย เงินช่วยเหลือ จ่ายนอกรอบ" },
  { value: "bonus", label: "โบนัส", hint: "เฉพาะรายการที่บันทึกในงวด คิดภาษีแบบเงินได้ไม่ประจำ" },
];
export const PERIOD_TYPE_LABEL: Record<string, string> = Object.fromEntries(PERIOD_TYPES.map((t) => [t.value, t.label]));

export const INCLUDE_DEFAULTS: Record<string, Record<string, boolean>> = {
  monthly: { include_salary: true, include_attendance: true, include_constants: true, include_tax: true, include_sso: true, include_pvd: true },
  semi_monthly: { include_salary: true, include_attendance: true, include_constants: true, include_tax: true, include_sso: true, include_pvd: true },
  ot: { include_salary: false, include_attendance: true, include_constants: false, include_tax: true, include_sso: false, include_pvd: false },
  split: { include_salary: true, include_attendance: false, include_constants: false, include_tax: true, include_sso: true, include_pvd: false },
  special: { include_salary: false, include_attendance: false, include_constants: false, include_tax: true, include_sso: false, include_pvd: false },
  bonus: { include_salary: false, include_attendance: false, include_constants: false, include_tax: true, include_sso: false, include_pvd: false },
};

export const INCLUDE_LABELS: [string, string][] = [
  ["include_salary", "เงินเดือน/ค่าจ้าง"],
  ["include_attendance", "เวลาทำงาน (ขาด สาย OT)"],
  ["include_constants", "รายรับรายจ่ายประจำ"],
  ["include_tax", "ภาษีหัก ณ ที่จ่าย"],
  ["include_sso", "ประกันสังคม"],
  ["include_pvd", "กองทุนสำรองเลี้ยงชีพ"],
];

export const STATUS_STEPS = [
  { value: "open", label: "เปิดงวด" },
  { value: "calculated", label: "คำนวณแล้ว" },
  { value: "approved", label: "อนุมัติ" },
  { value: "paid", label: "จ่ายแล้ว" },
  { value: "closed", label: "ปิดงวด" },
] as const;
export const STATUS_COLOR: Record<string, string> = { open: "gray", calculated: "amber", approved: "blue", paid: "green", closed: "violet" };
export const STATUS_TEXT: Record<string, string> = { open: "เปิดงวด", calculated: "คำนวณแล้ว", approved: "อนุมัติแล้ว", paid: "จ่ายแล้ว", closed: "ปิดงวด" };

export const EMP_TYPES: { value: string; label: string }[] = [
  { value: "monthly", label: "รายเดือน" },
  { value: "daily", label: "รายวัน" },
  { value: "hourly", label: "รายชั่วโมง" },
  { value: "contract", label: "สัญญาจ้าง" },
  { value: "intern", label: "นักศึกษาฝึกงาน" },
  { value: "parttime", label: "พาร์ทไทม์" },
];
export const EMP_TYPE_LABEL: Record<string, string> = Object.fromEntries(EMP_TYPES.map((t) => [t.value, t.label]));

export const ITEM_CATEGORIES: { value: string; label: string }[] = [
  { value: "auto", label: "ระบบคำนวณ" },
  { value: "income", label: "รายรับครั้งคราว" },
  { value: "expense", label: "รายการหัก" },
  { value: "constant", label: "รายรับประจำ" },
  { value: "loan", label: "หนี้สิน/เงินกู้" },
  { value: "fund", label: "กองทุน" },
  { value: "welfare", label: "สวัสดิการ" },
];
export const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(ITEM_CATEGORIES.map((t) => [t.value, t.label]));

export const UNIT_LABEL: Record<string, string> = { month: "เดือน", day: "วัน", hour: "ชม." };

const TH_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
export function periodName(type: string, year: number, month: number): string {
  const m = `${TH_SHORT[month - 1]} ${year + 543}`;
  if (type === "bonus") return `โบนัส ${m}`;
  if (type === "ot") return `ค่าล่วงเวลา ${m}`;
  if (type === "special") return `งวดพิเศษ ${m}`;
  if (type === "semi_monthly") return `เงินเดือนครึ่งเดือน ${m}`;
  return `เงินเดือน ${m}`;
}

export const pad2 = (n: number) => String(n).padStart(2, "0");
export const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
export const monthStart = (y: number, m: number) => `${y}-${pad2(m)}-01`;
export const monthEnd = (y: number, m: number) => `${y}-${pad2(m)}-${pad2(lastDay(y, m))}`;

/** attendance cut-off for "day N of previous month → day N-1 of this month"; cutoff 1 = calendar month */
export function cutoffRange(y: number, m: number, startDay: number): [string, string] {
  if (startDay <= 1) return [monthStart(y, m), monthEnd(y, m)];
  const py = m === 1 ? y - 1 : y;
  const pm = m === 1 ? 12 : m - 1;
  return [`${py}-${pad2(pm)}-${pad2(Math.min(startDay, lastDay(py, pm)))}`, `${y}-${pad2(m)}-${pad2(Math.min(startDay - 1, lastDay(y, m)))}`];
}

export function sumBy<T>(rows: T[], f: (r: T) => number | string | null | undefined): number {
  return Math.round(rows.reduce((s, r) => s + (Number(f(r)) || 0), 0) * 100) / 100;
}
