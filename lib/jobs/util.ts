import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";

export type Admin = SupabaseClient;

export const BKK_MS = 7 * 3600 * 1000;
/** 'YYYY-MM-DD' in Bangkok for an instant */
export const bkkDate = (d: Date = new Date()) => new Date(d.getTime() + BKK_MS).toISOString().slice(0, 10);
export const plusDays = (iso: string, n: number) => {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const daysBetween = (from: string, to: string) => Math.round((Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / 86400000);
export const thShort = (iso: string | null | undefined) => {
  if (!iso) return "-";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d} ${["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."][m - 1]} ${y + 543}`;
};

export function must<T>(r: { data: T; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data;
}

/**
 * Claim a dedupe key in automation_logs. Returns false when the key was already used
 * (unique indexes: (rule_id, ref_key) for rules, (job_code, ref_key) for jobs).
 */
export async function claim(sb: Admin, key: { ruleId?: number | null; jobCode?: string | null; refKey: string; message?: string }): Promise<boolean> {
  let q = sb.from("automation_logs").select("id").eq("ref_key", key.refKey).limit(1);
  q = key.ruleId ? q.eq("rule_id", key.ruleId) : q.is("rule_id", null).eq("job_code", key.jobCode ?? "");
  const { data } = await q;
  if (data?.length) return false;
  const { error } = await sb.from("automation_logs").insert({ rule_id: key.ruleId ?? null, job_code: key.jobCode ?? null, ref_key: key.refKey, status: "ok", message: key.message ?? null });
  if (error) {
    if (error.code === "23505") return false;
    throw new Error(error.message);
  }
  return true;
}

export interface NotifyInput {
  title: string;
  body?: string | null;
  link?: string | null;
  category?: string | null;
  /** channels beyond the in-app inbox; default both (dispatcher decides by settings) */
  line?: boolean;
  email?: boolean;
}

/** Insert in-app notifications (LINE / e-mail are sent later by notify_dispatch). */
export async function notifyUsers(sb: Admin, userIds: (string | null | undefined)[], n: NotifyInput): Promise<number> {
  const ids = [...new Set(userIds.filter(Boolean) as string[])];
  if (!ids.length) return 0;
  const rows = ids.map((user_id) => ({
    user_id,
    title: n.title.slice(0, 300),
    body: n.body ?? null,
    link: n.link ?? null,
    category: n.category ?? null,
    sent_line: n.line === false,
    sent_email: n.email === false,
  }));
  must(await sb.from("notifications").insert(rows, { defaultToNull: false }));
  return ids.length;
}

/** auth user id of each employee (first active profile) */
export async function usersOfEmployees(sb: Admin, empIds: (number | null | undefined)[]): Promise<Map<number, string>> {
  const ids = [...new Set(empIds.filter((x): x is number => x != null).map(Number))];
  const out = new Map<number, string>();
  if (!ids.length) return out;
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await sb.from("profiles").select("id, employee_id, created_at").in("employee_id", ids.slice(i, i + 200)).eq("is_active", true).order("created_at");
    for (const p of data ?? []) if (!out.has(Number(p.employee_id))) out.set(Number(p.employee_id), p.id as string);
  }
  return out;
}

type ProfileWithGroup = { id: string; employee_id: number | null; is_admin: boolean; role_groups: { code: string; permissions: Record<string, string[]> } | null };

/** HR recipients: active users whose group can edit employees (HR); falls back to admins. Optional role code filter. */
export async function hrUsers(sb: Admin, roleCode?: string): Promise<{ id: string; employee_id: number | null }[]> {
  const { data } = await sb.from("profiles").select("id, employee_id, is_admin, role_groups(code, permissions)").eq("is_active", true);
  const list = ((data ?? []) as unknown as ProfileWithGroup[]).map((p) => ({ ...p, role_groups: Array.isArray(p.role_groups) ? p.role_groups[0] : p.role_groups }));
  if (roleCode) return list.filter((p) => p.role_groups?.code === roleCode);
  const hr = list.filter((p) => p.role_groups?.code === "HR" || p.role_groups?.permissions?.employee?.includes("edit"));
  return hr.length ? hr : list.filter((p) => p.is_admin);
}

/** The user that authors automatic feed posts: first active admin (or any HR) */
export async function systemAuthor(sb: Admin): Promise<string | null> {
  const { data } = await sb.from("profiles").select("id").eq("is_active", true).eq("is_admin", true).order("created_at").limit(1);
  if (data?.[0]) return data[0].id as string;
  return (await hrUsers(sb))[0]?.id ?? null;
}

export async function getSettingAdmin<T>(sb: Admin, key: string, fallback: T): Promise<T> {
  const { data } = await sb.from("settings").select("value").eq("key", key).maybeSingle();
  return { ...fallback, ...((data?.value as T) ?? {}) };
}

export function admin() {
  return supabaseAdmin();
}

/** {{placeholder}} replacement */
export function fillTemplate(tpl: string | null | undefined, ctx: Record<string, unknown>): string {
  return String(tpl ?? "").replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, k: string) => {
    const v = ctx[k];
    return v === undefined || v === null ? "" : String(v);
  });
}
