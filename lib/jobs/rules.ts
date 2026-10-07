// Shared definitions for automation rules (used by the builder UI and the server engine — no server imports here)

export type TriggerKey =
  | "request.submitted" | "request.approved" | "request.rejected" | "employee.created" | "probation.due" | "contract.expiring"
  | "document.expiring" | "late.threshold" | "absent.threshold" | "missing_scan" | "birthday" | "payslip.published";

export interface TriggerDef {
  key: TriggerKey;
  label: string;
  kind: "event" | "time";
  help: string;
  /** which condition inputs apply */
  conditions: ("request_types" | "threshold" | "days_before")[];
  placeholders: string[];
}

const EMP = ["employee_name", "employee_code", "nickname", "supervisor_name", "company"];

export const TRIGGERS: TriggerDef[] = [
  { key: "request.submitted", label: "มีการส่งเอกสาร/คำขอ", kind: "event", help: "เมื่อพนักงานส่งใบลา ขอโอที หรือเอกสารอื่น", conditions: ["request_types"], placeholders: [...EMP, "doc_no", "request_type", "date"] },
  { key: "request.approved", label: "เอกสารได้รับอนุมัติ", kind: "event", help: "เมื่อเอกสารผ่านการอนุมัติขั้นสุดท้าย", conditions: ["request_types"], placeholders: [...EMP, "doc_no", "request_type", "date"] },
  { key: "request.rejected", label: "เอกสารไม่ได้รับอนุมัติ", kind: "event", help: "เมื่อผู้อนุมัติปฏิเสธเอกสาร", conditions: ["request_types"], placeholders: [...EMP, "doc_no", "request_type", "date", "note"] },
  { key: "employee.created", label: "เพิ่มพนักงานใหม่", kind: "event", help: "เมื่อมีการเพิ่มพนักงานเข้าระบบ", conditions: [], placeholders: [...EMP, "date"] },
  { key: "payslip.published", label: "เผยแพร่สลิปเงินเดือน", kind: "event", help: "เมื่อฝ่ายเงินเดือนเผยแพร่สลิปของงวด", conditions: [], placeholders: [...EMP, "period"] },
  { key: "probation.due", label: "ใกล้ครบทดลองงาน", kind: "time", help: "ก่อนวันครบทดลองงานตามจำนวนวันที่กำหนด", conditions: ["days_before"], placeholders: [...EMP, "date", "days"] },
  { key: "contract.expiring", label: "สัญญาจ้างใกล้หมดอายุ", kind: "time", help: "ก่อนวันสิ้นสุดสัญญาจ้าง", conditions: ["days_before"], placeholders: [...EMP, "date", "days"] },
  { key: "document.expiring", label: "เอกสารใกล้หมดอายุ", kind: "time", help: "พาสปอร์ต วีซ่า ใบอนุญาตทำงาน และเอกสารพนักงานที่มีวันหมดอายุ", conditions: ["days_before"], placeholders: [...EMP, "document", "date", "days"] },
  { key: "late.threshold", label: "มาสายเกินจำนวนครั้ง (ต่อเดือน)", kind: "time", help: "นับจากผลคำนวณเวลาทำงานเดือนปัจจุบัน แจ้งครั้งเดียวต่อเดือน", conditions: ["threshold"], placeholders: [...EMP, "count", "month"] },
  { key: "absent.threshold", label: "ขาดงานเกินจำนวนครั้ง (ต่อเดือน)", kind: "time", help: "นับจากผลคำนวณเวลาทำงานเดือนปัจจุบัน แจ้งครั้งเดียวต่อเดือน", conditions: ["threshold"], placeholders: [...EMP, "count", "month"] },
  { key: "missing_scan", label: "ลืมสแกนเวลา", kind: "time", help: "วันที่มีการสแกนไม่ครบ (ตรวจย้อนหลัง 3 วัน)", conditions: [], placeholders: [...EMP, "date"] },
  { key: "birthday", label: "วันเกิดพนักงาน", kind: "time", help: "ในวันเกิดของพนักงาน", conditions: [], placeholders: [...EMP, "date"] },
];

export const TRIGGER_BY = Object.fromEntries(TRIGGERS.map((t) => [t.key, t])) as Record<TriggerKey, TriggerDef>;

export type Recipient = "employee" | "supervisor" | "hr" | `role:${string}` | `user:${string}`;
export type Channel = "app" | "line" | "email";

export type RuleAction =
  | { type: "notify"; to: Recipient[]; channels: Channel[]; title: string; body?: string }
  | { type: "todo"; assign_to: "hr" | "supervisor" | "employee"; title: string; description?: string; due_days?: number; priority?: "low" | "normal" | "high" | "urgent" }
  | { type: "feed"; content: string };

export interface RuleConditions {
  request_types?: string[];
  threshold?: number;
  days_before?: number[];
}

export const PLACEHOLDER_LABELS: Record<string, string> = {
  employee_name: "ชื่อ-นามสกุลพนักงาน",
  employee_code: "รหัสพนักงาน",
  nickname: "ชื่อเล่น",
  supervisor_name: "ชื่อหัวหน้า",
  company: "ชื่อบริษัท",
  doc_no: "เลขที่เอกสาร",
  request_type: "ประเภทเอกสาร",
  date: "วันที่",
  days: "จำนวนวันที่เหลือ",
  count: "จำนวนครั้ง",
  month: "เดือน",
  document: "ชื่อเอกสาร",
  note: "หมายเหตุ",
  period: "งวดเงินเดือน",
};

export const RECIPIENT_LABELS: Record<string, string> = { employee: "พนักงาน", supervisor: "หัวหน้า", hr: "ฝ่ายบุคคล (HR)" };
export const CHANNEL_LABELS: Record<Channel, string> = { app: "แจ้งเตือนในระบบ", line: "LINE", email: "อีเมล" };
