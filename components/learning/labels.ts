export const ITEM_TYPE: Record<string, string> = { youtube: "YouTube", video: "วิดีโอ (ลิงก์ไฟล์)", pdf: "เอกสาร PDF", slide: "สไลด์", link: "ลิงก์เว็บไซต์", article: "บทความ" };
export const ENROLL_STATUS: Record<string, string> = { enrolled: "ยังไม่เริ่ม", in_progress: "กำลังเรียน", completed: "เรียนจบ", failed: "ไม่ผ่าน" };
export const ENROLL_COLOR: Record<string, string> = { enrolled: "gray", in_progress: "blue", completed: "green", failed: "red" };
export const TRAINING_TYPE: Record<string, string> = { internal: "อบรมภายใน", external: "อบรมภายนอก", online: "ออนไลน์" };
export const TRAINING_STATUS: Record<string, string> = { planned: "วางแผน", open: "เปิดรับลงทะเบียน", done: "อบรมแล้ว", cancelled: "ยกเลิก" };
export const TRAINING_STATUS_COLOR: Record<string, string> = { planned: "gray", open: "blue", done: "green", cancelled: "gray" };
export const ATTENDEE_STATUS: Record<string, string> = { registered: "ลงทะเบียน", attended: "เข้าอบรม", absent: "ไม่มา", cancelled: "ยกเลิก" };
export const ATTENDEE_COLOR: Record<string, string> = { registered: "blue", attended: "green", absent: "red", cancelled: "gray" };

export interface QuizQuestion { q: string; choices: string[]; answer: number }

export function youtubeId(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/))([\w-]{11})/.exec(url);
  return m ? m[1] : /^[\w-]{11}$/.test(url) ? url : null;
}
