// Thai labels & option lists for the Organization / Employee module (safe for client and server)

export type Opt = { value: string; label: string };
const opts = (m: Record<string, string>): Opt[] => Object.entries(m).map(([value, label]) => ({ value, label }));

export const EMP_STATUS: Record<string, string> = {
  probation: "ทดลองงาน",
  permanent: "พนักงานประจำ",
  contract: "สัญญาจ้าง",
  suspended: "พักงาน",
  resigned: "ลาออก",
};
export const EMP_STATUS_COLOR: Record<string, string> = { probation: "amber", permanent: "green", contract: "blue", suspended: "red", resigned: "gray" };

export const EMP_TYPE: Record<string, string> = {
  monthly: "รายเดือน",
  daily: "รายวัน",
  hourly: "รายชั่วโมง",
  contract: "สัญญาจ้าง",
  intern: "นักศึกษาฝึกงาน",
  parttime: "พาร์ทไทม์",
};

export const GENDER: Record<string, string> = { M: "ชาย", F: "หญิง", X: "ไม่ระบุ" };
export const PREFIXES = ["นาย", "นาง", "นางสาว", "Mr.", "Mrs.", "Ms."];
export const MARITAL: Record<string, string> = { single: "โสด", married: "สมรส", divorced: "หย่า", widowed: "หม้าย" };
export const BLOOD = ["A", "B", "AB", "O"];
export const MILITARY: Record<string, string> = { done: "ผ่านการเกณฑ์ทหารแล้ว", exempt: "ได้รับการยกเว้น", reserve: "ทหารกองหนุน", not_yet: "ยังไม่ผ่าน", na: "ไม่เกี่ยวข้อง" };
export const SALARY_UNIT: Record<string, string> = { month: "ต่อเดือน", day: "ต่อวัน", hour: "ต่อชั่วโมง" };
export const PAY_METHOD: Record<string, string> = { bank: "โอนเข้าบัญชี", cash: "เงินสด", cheque: "เช็ค" };
export const TAX_METHOD: Record<string, string> = { annualized: "คำนวณแบบทั้งปี (มาตรฐาน)", fixed_rate: "หักอัตราคงที่", none: "ไม่หักภาษี" };

export const BANKS: Record<string, string> = {
  "002": "ธนาคารกรุงเทพ (BBL)",
  "004": "ธนาคารกสิกรไทย (KBANK)",
  "006": "ธนาคารกรุงไทย (KTB)",
  "011": "ธนาคารทหารไทยธนชาต (TTB)",
  "014": "ธนาคารไทยพาณิชย์ (SCB)",
  "025": "ธนาคารกรุงศรีอยุธยา (BAY)",
  "030": "ธนาคารออมสิน (GSB)",
  "034": "ธ.ก.ส. (BAAC)",
  "069": "ธนาคารเกียรตินาคินภัทร (KKP)",
  "022": "ธนาคารซีไอเอ็มบี ไทย (CIMBT)",
  "024": "ธนาคารยูโอบี (UOB)",
  "067": "ธนาคารทิสโก้ (TISCO)",
  "073": "ธนาคารแลนด์ แอนด์ เฮ้าส์ (LHB)",
  "033": "ธนาคารอาคารสงเคราะห์ (GHB)",
};

export const MOVEMENT_TYPE: Record<string, string> = {
  transfer: "โอนย้าย",
  promote: "เลื่อนตำแหน่ง",
  demote: "ลดตำแหน่ง",
  appoint: "แต่งตั้ง / ปรับโครงสร้าง",
  salary_adjust: "ปรับเงินเดือน",
  confirm: "ผ่านทดลองงาน",
  status_change: "เปลี่ยนสถานะ",
  resign: "ลาออก / พ้นสภาพ",
  rehire: "รับกลับเข้าทำงาน",
};
export const MOVEMENT_STATUS: Record<string, string> = { draft: "ร่าง", pending: "รอมีผล", approved: "อนุมัติแล้ว", applied: "มีผลแล้ว", cancelled: "ยกเลิก" };
export const MOVEMENT_STATUS_COLOR: Record<string, string> = { draft: "gray", pending: "amber", approved: "blue", applied: "green", cancelled: "gray" };

export const UNIT_TYPES = ["บริษัท", "สำนัก", "ฝ่าย", "แผนก", "ส่วน", "หน่วย", "ไลน์ผลิต", "ทีม"];
export const RELATIONS: Record<string, string> = { spouse: "คู่สมรส", child: "บุตร", father: "บิดา", mother: "มารดา", sibling: "พี่น้อง", other: "อื่น ๆ" };
export const ADDRESS_TYPE: Record<string, string> = { registered: "ตามทะเบียนบ้าน", current: "ที่อยู่ปัจจุบัน", contact: "ที่อยู่ติดต่อได้" };
export const EDU_LEVELS = ["ประถมศึกษา", "ม.3", "ม.6", "ปวช.", "ปวส.", "ปริญญาตรี", "ปริญญาโท", "ปริญญาเอก", "อื่น ๆ"];
export const SKILL_CAT: Record<string, string> = { language: "ภาษา", computer: "คอมพิวเตอร์", driving: "ขับขี่", certificate: "ใบอนุญาต / ใบรับรอง", other: "อื่น ๆ" };
export const DOC_TYPES = ["สัญญาจ้าง", "สำเนาบัตรประชาชน", "สำเนาทะเบียนบ้าน", "วุฒิการศึกษา", "ใบรับรองแพทย์", "หนังสือเดินทาง", "วีซ่า", "ใบอนุญาตทำงาน", "ใบขับขี่", "อื่น ๆ"];

export const DATA_SCOPE: Record<string, { label: string; hint: string }> = {
  all: { label: "ทั้งองค์กร", hint: "เห็นข้อมูลพนักงานทุกคนในบริษัท" },
  branch: { label: "สาขาเดียวกัน", hint: "เห็นเฉพาะพนักงานที่อยู่สาขาเดียวกับตนเอง" },
  org: { label: "หน่วยงานของตนและหน่วยงานย่อย", hint: "เห็นพนักงานในหน่วยงานของตนเองรวมถึงหน่วยงานที่อยู่ภายใต้" },
  team: { label: "ทีมเดียวกัน", hint: "เห็นเฉพาะพนักงานที่อยู่ในทีมเดียวกัน (เมนูทีมงาน)" },
  self: { label: "เฉพาะตนเอง", hint: "เห็นเฉพาะข้อมูลของตนเอง (และลูกทีมถ้าเป็นหัวหน้า)" },
};

export const statusOptions = opts(EMP_STATUS);
export const typeOptions = opts(EMP_TYPE);
export const genderOptions = opts(GENDER);
export const maritalOptions = opts(MARITAL);
export const movementTypeOptions = opts(MOVEMENT_TYPE);
export const salaryUnitOptions = opts(SALARY_UNIT);
export const payMethodOptions = opts(PAY_METHOD);
export const taxMethodOptions = opts(TAX_METHOD);
export const bankOptions = Object.entries(BANKS).map(([value, label]) => ({ value, label: `${value} ${label}` }));
export const relationOptions = opts(RELATIONS);
export const addressTypeOptions = opts(ADDRESS_TYPE);
export const skillCatOptions = opts(SKILL_CAT);
export const militaryOptions = opts(MILITARY);
export const listOptions = (a: string[]): Opt[] => a.map((x) => ({ value: x, label: x }));

/** years + months of service, e.g. "3 ปี 2 เดือน" */
export function serviceText(from: string | null | undefined, to?: string | null): string {
  if (!from) return "-";
  const a = new Date(from + "T00:00:00");
  const b = to ? new Date(to + "T00:00:00") : new Date();
  let months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  if (b.getDate() < a.getDate()) months--;
  if (months < 0) return "ยังไม่เริ่มงาน";
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (!y && !m) return "น้อยกว่า 1 เดือน";
  return [y ? `${y} ปี` : "", m ? `${m} เดือน` : ""].filter(Boolean).join(" ");
}

/** shape of a PostgREST result when chained with .then() (the untyped browser client infers `any` there) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Res = { data: any; error: { message: string } | null; count?: number | null };
