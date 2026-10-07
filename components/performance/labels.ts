export const FORM_TYPE: Record<string, string> = { probation: "ทดลองงาน", annual: "ประจำปี", supervisor: "ประเมินหัวหน้า (Upward)", "360": "360 องศา", custom: "อื่น ๆ" };
export const RELATION: Record<string, string> = { self: "ประเมินตนเอง", supervisor: "หัวหน้าประเมิน", upward: "ประเมินหัวหน้า", peer: "เพื่อนร่วมงาน" };
export const ASSIGN_STATUS: Record<string, string> = { pending: "ยังไม่เริ่ม", draft: "บันทึกร่าง", submitted: "ส่งแล้ว" };
export const ASSIGN_STATUS_COLOR: Record<string, string> = { pending: "amber", draft: "blue", submitted: "green" };
export const CYCLE_STATUS: Record<string, string> = { draft: "ร่าง", open: "เปิดประเมิน", calibration: "ปรับเทียบผล", closed: "ปิดรอบ / ประกาศผล" };
export const CYCLE_STATUS_COLOR: Record<string, string> = { draft: "gray", open: "blue", calibration: "amber", closed: "green" };
export const PROB_STATUS: Record<string, string> = { pending: "รอหัวหน้าประเมิน", submitted: "รอ HR อนุมัติ", approved: "อนุมัติแล้ว", cancelled: "ยกเลิก" };
export const PROB_STATUS_COLOR: Record<string, string> = { pending: "amber", submitted: "blue", approved: "green", cancelled: "gray" };
export const PROB_RESULT: Record<string, string> = { pass: "ผ่านทดลองงาน", extend: "ขยายเวลาทดลองงาน", fail: "ไม่ผ่านทดลองงาน" };
export const PROB_RESULT_COLOR: Record<string, string> = { pass: "green", extend: "amber", fail: "red" };
export const KPI_DIRECTION: Record<string, string> = { higher: "ยิ่งมากยิ่งดี", lower: "ยิ่งน้อยยิ่งดี", exact: "ตรงเป้าดีที่สุด" };
export const KPI_SOURCE: Record<string, string> = { manual: "กรอกเอง", external: "นำเข้าจากระบบภายนอก", attendance: "ดึงจากระบบเวลาทำงาน" };
export const ATT_METRIC: Record<string, string> = { late_count: "จำนวนครั้งที่มาสาย", late_minutes: "นาทีที่มาสายรวม", absent_days: "จำนวนวันขาดงาน", leave_days: "จำนวนวันลา" };
export const WARNING_LEVEL: Record<string, string> = {
  verbal: "ตักเตือนด้วยวาจา",
  written_1: "หนังสือเตือนครั้งที่ 1",
  written_2: "หนังสือเตือนครั้งที่ 2",
  final: "หนังสือเตือนครั้งสุดท้าย",
  suspension: "พักงาน",
  termination: "เลิกจ้าง",
};
export const WARNING_COLOR: Record<string, string> = { verbal: "gray", written_1: "amber", written_2: "amber", final: "red", suspension: "red", termination: "red" };
export const opts = (m: Record<string, string>) => Object.entries(m).map(([value, label]) => ({ value, label }));
