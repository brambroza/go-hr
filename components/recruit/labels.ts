export const STAGES = ["applied", "screening", "interview", "assessment", "offer", "hired"] as const;
export const STAGE: Record<string, string> = {
  applied: "สมัครใหม่",
  screening: "คัดกรอง",
  interview: "สัมภาษณ์",
  assessment: "ทดสอบ / ประเมิน",
  offer: "เสนอจ้าง",
  hired: "รับเข้าทำงาน",
  rejected: "ไม่ผ่าน",
  withdrawn: "ถอนใบสมัคร",
  talent_pool: "เก็บไว้ในคลังผู้สมัคร",
};
export const STAGE_COLOR: Record<string, string> = { applied: "blue", screening: "violet", interview: "amber", assessment: "amber", offer: "green", hired: "green", rejected: "red", withdrawn: "gray", talent_pool: "gray" };
export const JOB_STATUS: Record<string, string> = { draft: "ร่าง", open: "เปิดรับสมัคร", paused: "พักชั่วคราว", closed: "ปิดรับ" };
export const JOB_STATUS_COLOR: Record<string, string> = { draft: "gray", open: "green", paused: "amber", closed: "gray" };
export const SOURCE: Record<string, string> = { careers: "เว็บไซต์รับสมัครงาน", "walk-in": "Walk-in", referral: "พนักงานแนะนำ", jobsdb: "JobsDB", jobthai: "JobThai", facebook: "Facebook", line: "LINE", other: "อื่น ๆ" };
export const INTERVIEW_MODE: Record<string, string> = { onsite: "ที่บริษัท", online: "ออนไลน์", phone: "โทรศัพท์" };
export const INTERVIEW_RESULT: Record<string, string> = { pass: "ผ่าน", fail: "ไม่ผ่าน", hold: "รอพิจารณา" };
export const EDU_LEVELS = ["ต่ำกว่า ม.3", "ม.3", "ม.6", "ปวช.", "ปวส.", "ปริญญาตรี", "ปริญญาโท", "ปริญญาเอก"];
export const QUESTION_TYPE: Record<string, string> = { text: "ข้อความสั้น", textarea: "ข้อความยาว", select: "ตัวเลือก", yesno: "ใช่ / ไม่ใช่" };

export interface JobQuestion { key: string; label: string; type: "text" | "textarea" | "select" | "yesno"; required?: boolean; options?: string[] }

export const EMP_TYPE_LABEL: Record<string, string> = { monthly: "พนักงานรายเดือน", daily: "พนักงานรายวัน", hourly: "รายชั่วโมง", contract: "สัญญาจ้าง", intern: "นักศึกษาฝึกงาน", parttime: "พาร์ทไทม์" };

export function salaryText(min: number | null, max: number | null, type?: string | null): string {
  const unit = type === "daily" ? "บาท/วัน" : type === "hourly" ? "บาท/ชม." : "บาท";
  const f = (n: number) => Number(n).toLocaleString("th-TH");
  if (min && max) return `${f(min)} – ${f(max)} ${unit}`;
  if (min) return `ตั้งแต่ ${f(min)} ${unit}`;
  if (max) return `ไม่เกิน ${f(max)} ${unit}`;
  return "ตามตกลง";
}
