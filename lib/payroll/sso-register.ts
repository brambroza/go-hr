// แจ้งเข้า (สปส.1-03) / แจ้งออก (สปส.6-09) — pure helpers, unit tested in tests/sso-register.test.ts.
//
//   * แจ้งเข้า: ภายใน 30 วันนับจากวันที่ลูกจ้างเข้าทำงาน (ม.34)
//   * แจ้งออก: ภายในวันที่ 15 ของเดือนถัดจากเดือนที่ลูกจ้างสิ้นสภาพ; "วันที่สิ้นสภาพ" ในแบบ = วันถัดจากวันทำงานวันสุดท้าย
// The e-Service bulk-upload text format for these forms is not published in a form we can verify, so the app gives a
// checked list + CSV for keying in e-Service and the printable forms (docs/GOV-BANK-FILES.md).

import { validNationalId } from "@/lib/format";

const DAY = 86_400_000;
const add = (d: string, n: number) => new Date(Date.parse(d + "T00:00:00Z") + n * DAY).toISOString().slice(0, 10);

export function ssoJoinDeadline(hireDate: string): string {
  return add(hireDate, 30);
}

/** day after the last working day */
export function ssoLeaveDate(lastDay: string): string {
  return add(lastDay, 1);
}

export function ssoLeaveDeadline(lastDay: string): string {
  const leave = ssoLeaveDate(lastDay);
  const y = Number(leave.slice(0, 4));
  const m = Number(leave.slice(5, 7));
  return m === 12 ? `${y + 1}-01-15` : `${y}-${String(m + 1).padStart(2, "0")}-15`;
}

/** สาเหตุการสิ้นสุดความเป็นลูกจ้าง ตามแบบ สปส.6-09 */
export const SSO_LEAVE_REASONS: Record<string, { code: string; label: string }> = {
  "ลาออกเอง": { code: "1", label: "ลาออก" },
  "หมดสัญญา": { code: "2", label: "สิ้นสุดระยะเวลาการจ้าง" },
  "เลิกจ้าง": { code: "3", label: "เลิกจ้าง" },
  "เกษียณ": { code: "4", label: "เกษียณอายุ" },
  "เลิกจ้างกรณีความผิดร้ายแรง (ม.119)": { code: "5", label: "ถูกเลิกจ้างเนื่องจากกระทำความผิด" },
  "เสียชีวิต": { code: "6", label: "ตาย" },
};

export interface SsoPerson {
  national_id: string | null;
  prefix: string | null;
  first_name: string;
  last_name: string;
  gender: string | null;
  birth_date: string | null;
  nationality: string | null;
  hire_date: string;
  resign_date: string | null;
  resign_type: string | null;
  sso_enabled: boolean;
}

/** what is missing or wrong before the form can be filed */
export function ssoIssues(p: SsoPerson, kind: "join" | "leave", branch: { sso_account_no: string | null } | null): string[] {
  const out: string[] = [];
  const nid = (p.national_id ?? "").replace(/\D/g, "");
  if (!nid) out.push("ไม่มีเลขประจำตัวประชาชน");
  else if (nid.length === 13 && !validNationalId(nid)) out.push("เลขประจำตัวประชาชนไม่ถูกต้อง");
  else if (nid.length !== 13) out.push("เลขประจำตัวต้องมี 13 หลัก");
  if (!branch?.sso_account_no) out.push("สาขายังไม่มีเลขที่บัญชีนายจ้าง (ตั้งค่าที่ สาขา)");
  if (kind === "join") {
    if (!p.birth_date) out.push("ไม่มีวันเกิด");
    if (!p.gender || p.gender === "X") out.push("ไม่ได้ระบุเพศ");
    if (!p.nationality) out.push("ไม่ได้ระบุสัญชาติ");
  } else {
    if (!p.resign_date) out.push("ไม่มีวันทำงานวันสุดท้าย");
    if (!p.resign_type || !SSO_LEAVE_REASONS[p.resign_type]) out.push("ประเภทการพ้นสภาพไม่ตรงกับสาเหตุในแบบ สปส.6-09 — เลือกสาเหตุเองตอนกรอก");
  }
  return out;
}

/** status of the filing against its deadline on `today` */
export function deadlineState(deadline: string, today: string): "overdue" | "due_soon" | "ok" {
  if (today > deadline) return "overdue";
  return add(today, 7) >= deadline ? "due_soon" : "ok";
}

/** month window [first, last] of YYYY-MM */
export function monthRange(year: number, month: number): [string, string] {
  const first = `${year}-${String(month).padStart(2, "0")}-01`;
  const last = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  return [first, last];
}
