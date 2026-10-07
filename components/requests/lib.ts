// Shared, client-safe helpers for the requests (เอกสารและอนุมัติ) module.
import { minutesToHM, money, thDate, thTime } from "@/lib/format";

export const REQUEST_STATUS: Record<string, { label: string; color: string }> = {
  draft: { label: "ฉบับร่าง", color: "gray" },
  pending: { label: "รออนุมัติ", color: "amber" },
  approved: { label: "อนุมัติแล้ว", color: "green" },
  rejected: { label: "ไม่อนุมัติ", color: "red" },
  cancelled: { label: "ยกเลิกแล้ว", color: "gray" },
};

export const STEP_STATUS: Record<string, { label: string; color: string }> = {
  waiting: { label: "รอขั้นก่อนหน้า", color: "gray" },
  pending: { label: "รออนุมัติ", color: "amber" },
  approved: { label: "อนุมัติ", color: "green" },
  rejected: { label: "ไม่อนุมัติ", color: "red" },
  skipped: { label: "ข้าม", color: "gray" },
  cancelled: { label: "ยกเลิก", color: "gray" },
};

export const CATEGORIES: { value: string; label: string }[] = [
  { value: "time", label: "เวลา" },
  { value: "money", label: "เงิน" },
  { value: "document", label: "เอกสาร" },
  { value: "hr", label: "HR" },
];
export const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(CATEGORIES.map((c) => [c.value, c.label]));

export const LEAVE_UNIT: Record<string, string> = { full: "เต็มวัน", half_am: "ครึ่งวันเช้า", half_pm: "ครึ่งวันบ่าย", hours: "รายชั่วโมง" };
export const DIRECTION: Record<string, string> = { auto: "อัตโนมัติ", in: "เข้างาน", out: "ออกงาน", break_out: "พักเบรค", break_in: "กลับจากพัก" };
export const DOC_LANG: Record<string, string> = { th: "ภาษาไทย", en: "ภาษาอังกฤษ", both: "ไทยและอังกฤษ" };

/** request types that have a printable letter on /requests/[id]/document */
export const PRINTABLE_TYPES = ["salary_cert", "work_cert", "visa_doc", "contract"] as const;
export const isPrintable = (t: string) => (PRINTABLE_TYPES as readonly string[]).includes(t);

export const STEP_TYPES: { value: string; label: string }[] = [
  { value: "supervisor", label: "หัวหน้างาน" },
  { value: "org_manager", label: "ผู้จัดการหน่วยงาน" },
  { value: "user", label: "ผู้ใช้ที่ระบุ" },
  { value: "role", label: "กลุ่มผู้ใช้" },
];

export interface FlowStep {
  type: "supervisor" | "org_manager" | "user" | "role";
  level?: number;
  user_id?: string;
  role_code?: string;
}

/** Thai description of one approval step definition */
export function stepLabel(s: FlowStep | Record<string, unknown> | null | undefined, names?: { users?: Record<string, string>; roles?: Record<string, string> }): string {
  if (!s) return "-";
  const t = String(s.type ?? "");
  if (t === "supervisor") return `หัวหน้างานลำดับที่ ${Number(s.level ?? 1)}`;
  if (t === "org_manager") return "ผู้จัดการหน่วยงาน";
  if (t === "user") return `ผู้ใช้: ${names?.users?.[String(s.user_id)] ?? "ไม่ระบุ"}`;
  if (t === "role") return `กลุ่ม: ${names?.roles?.[String(s.role_code)] ?? String(s.role_code ?? "-")}`;
  return t || "-";
}

/** One row of public.v_requests */
export interface RequestRow {
  id: number;
  doc_no: string | null;
  request_type: string;
  request_type_name: string;
  category: string;
  employee_id: number;
  emp_code: string;
  first_name: string;
  last_name: string;
  nickname: string | null;
  org_unit_id: number | null;
  branch_id: number | null;
  position_id: number | null;
  requested_by: string | null;
  status: string;
  start_at: string | null;
  end_at: string | null;
  start_date: string | null;
  end_date: string | null;
  days: number | null;
  minutes: number | null;
  amount: number | null;
  payload: Record<string, unknown>;
  reason: string | null;
  attachments: unknown[];
  current_step: number;
  total_steps: number;
  flow_id: number | null;
  result_note: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  leave_type_name: string | null;
  leave_color: string | null;
  approvals: { step: number; status: string; comment: string | null; acted_at: string | null; approver: string | null }[] | null;
}

export interface Attachment {
  name: string;
  ref: string;
  type?: string;
}

/** attachments may be stored as strings or {url|path, name, type} objects */
export function normalizeAttachments(list: unknown): Attachment[] {
  if (!Array.isArray(list)) return [];
  return list
    .map((a, i): Attachment | null => {
      if (typeof a === "string") return { name: a.split("/").pop() || `ไฟล์ ${i + 1}`, ref: a };
      if (a && typeof a === "object") {
        const o = a as Record<string, unknown>;
        const ref = String(o.url ?? o.ref ?? (o.bucket && o.path ? `${o.bucket}/${o.path}` : o.path ?? ""));
        if (!ref) return null;
        return { name: String(o.name ?? ref.split("/").pop() ?? `ไฟล์ ${i + 1}`), ref, type: o.type ? String(o.type) : undefined };
      }
      return null;
    })
    .filter((x): x is Attachment => !!x);
}

export const empName = (r: { first_name?: string | null; last_name?: string | null; nickname?: string | null }) =>
  `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim() + (r.nickname ? ` (${r.nickname})` : "");

/** whole days since an ISO timestamp */
export function daysSince(ts: string | null | undefined): number {
  if (!ts) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(ts).getTime()) / 86400000));
}

export function errMsg(e: unknown): string {
  if (!e) return "เกิดข้อผิดพลาด";
  if (typeof e === "string") return e;
  if (typeof e === "object" && "message" in (e as object)) return String((e as { message: unknown }).message);
  return String(e);
}

/** one-line summary for lists: dates / time window / amount */
export function requestSummary(r: Pick<RequestRow, "request_type" | "start_date" | "end_date" | "start_at" | "end_at" | "days" | "minutes" | "amount" | "payload" | "leave_type_name">): string {
  const d = (a: string | null | undefined, b?: string | null) => (!a ? "" : !b || a === b ? thDate(a) : `${thDate(a)} – ${thDate(b)}`);
  const p = r.payload ?? {};
  switch (r.request_type) {
    case "leave":
      return `${r.leave_type_name ?? "ลา"} · ${d(r.start_date, r.end_date)} · ${Number(r.days ?? 0).toLocaleString("th-TH", { maximumFractionDigits: 2 })} วัน`;
    case "ot":
      return `${d(r.start_date)} ${thTime(r.start_at)}–${thTime(r.end_at)} · ${minutesToHM(r.minutes)} ชม.`;
    case "time_add":
      return `${d(r.start_date)} ${thTime(r.start_at)}${r.end_at ? `–${thTime(r.end_at)}` : ""}`;
    case "dayoff_change":
      return `${p.from_date ? thDate(String(p.from_date)) + " → " : ""}${thDate(String(p.to_date ?? r.start_date))}`;
    case "advance":
    case "petty_cash":
    case "welfare":
      return `${money(r.amount)} บาท`;
    case "salary_cert":
    case "work_cert":
    case "visa_doc":
    case "contract":
      return [p.purpose ? String(p.purpose) : "", p.country ? String(p.country) : ""].filter(Boolean).join(" · ");
    case "complaint":
      return String(p.subject ?? p.topic ?? "");
    case "resign":
      return `วันทำงานวันสุดท้าย ${thDate(String(p.last_working_date ?? p.last_day ?? r.start_date))}`;
    default:
      return d(r.start_date, r.end_date) || (r.amount != null ? `${money(r.amount)} บาท` : "");
  }
}
