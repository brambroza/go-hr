"use server";

import { revalidatePath } from "next/cache";
import { requirePerm, safeAction, type ActionResult } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { checkPassword, normalizePolicy, type PasswordPolicy } from "./password";
import { employeeAllowed } from "@/lib/jobs/access";

type Admin = ReturnType<typeof supabaseAdmin>;

async function policy(sb: Admin): Promise<PasswordPolicy> {
  const { data } = await sb.from("settings").select("value").eq("key", "password_policy").maybeSingle();
  return normalizePolicy(data?.value);
}

function assertPassword(pw: string, p: PasswordPolicy) {
  const miss = checkPassword(pw, p);
  if (miss.length) throw new Error(`รหัสผ่านไม่ตรงตามนโยบาย: ต้อง${miss.join(", ")}`);
}

function authError(e: { message?: string } | null): Error {
  const m = e?.message ?? "";
  if (/already (been )?registered|already exists/i.test(m)) return new Error("อีเมลนี้มีบัญชีผู้ใช้อยู่แล้ว");
  if (/password/i.test(m) && /(short|least|weak)/i.test(m)) return new Error("รหัสผ่านสั้นหรือง่ายเกินไป");
  if (/email/i.test(m) && /invalid/i.test(m)) return new Error("รูปแบบอีเมลไม่ถูกต้อง");
  return new Error(m || "ทำรายการกับระบบยืนยันตัวตนไม่สำเร็จ");
}

const USERNAME_RE = /^[A-Za-z0-9._-]{3,50}$/;

async function assertUsernameFree(sb: Admin, username: string, exceptId?: string) {
  const { data } = await sb.from("profiles").select("id").ilike("username", username.replace(/[%_]/g, "\\$&"));
  if ((data ?? []).some((r) => r.id !== exceptId)) throw new Error(`ชื่อผู้ใช้ "${username}" ถูกใช้แล้ว`);
}

async function assertEmployeeFree(sb: Admin, employeeId: number, exceptId?: string) {
  const { data } = await sb.from("profiles").select("id, username").eq("employee_id", employeeId);
  const other = (data ?? []).find((r) => r.id !== exceptId);
  if (other) throw new Error(`พนักงานคนนี้มีบัญชีผู้ใช้อยู่แล้ว (${other.username ?? "-"})`);
}

export interface CreateUserInput {
  email?: string | null;
  username: string;
  password: string;
  display_name?: string | null;
  role_group_id: number | null;
  is_admin?: boolean;
  employee_id?: number | null;
  must_change_password?: boolean;
}

export async function createUserAction(input: CreateUserInput): Promise<ActionResult<{ id: string; email: string }>> {
  return safeAction(async () => {
    const me = await requirePerm("security", "create");
    const sb = supabaseAdmin();
    const username = input.username.trim();
    if (!USERNAME_RE.test(username)) throw new Error("ชื่อผู้ใช้ต้องยาว 3–50 ตัว ใช้ได้เฉพาะ A-Z a-z 0-9 . _ -");
    if (input.is_admin && !me.isAdmin) throw new Error("เฉพาะผู้ดูแลระบบเท่านั้นที่กำหนดสิทธิ์ผู้ดูแลระบบได้");
    assertPassword(input.password, await policy(sb));
    await assertUsernameFree(sb, username);

    let email = (input.email ?? "").trim().toLowerCase();
    let displayName = input.display_name?.trim() || null;
    if (input.employee_id) {
      await assertEmployeeFree(sb, input.employee_id);
      const { data: emp } = await sb.from("employees").select("code, first_name, last_name").eq("id", input.employee_id).maybeSingle();
      if (!emp) throw new Error("ไม่พบพนักงานที่เลือก");
      if (!email) email = `${emp.code.toLowerCase()}@staff.gohr.local`;
      displayName ??= `${emp.first_name} ${emp.last_name}`;
    }
    if (!email) email = `${username.toLowerCase()}@staff.gohr.local`;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("รูปแบบอีเมลไม่ถูกต้อง");

    const { data: u, error } = await sb.auth.admin.createUser({ email, password: input.password, email_confirm: true });
    if (error || !u.user) throw authError(error);
    const { error: pe } = await sb.from("profiles").upsert({
      id: u.user.id,
      email,
      username,
      display_name: displayName,
      role_group_id: input.role_group_id,
      is_admin: !!input.is_admin,
      employee_id: input.employee_id ?? null,
      must_change_password: input.must_change_password ?? true,
      is_active: true,
    });
    if (pe) {
      await sb.auth.admin.deleteUser(u.user.id);
      throw new Error(pe.message.includes("duplicate") ? "ชื่อผู้ใช้หรือพนักงานนี้มีบัญชีอยู่แล้ว" : pe.message);
    }
    await audit(sb, me.userId, me.displayName, "CREATE_USER", u.user.id, `${username} <${email}>`);
    revalidatePath("/settings/users");
    return { id: u.user.id, email };
  }, "สร้างบัญชีผู้ใช้แล้ว");
}

export interface UpdateUserInput {
  username?: string;
  display_name?: string | null;
  role_group_id?: number | null;
  is_admin?: boolean;
  employee_id?: number | null;
  email?: string;
}

export async function updateUserAction(userId: string, input: UpdateUserInput): Promise<ActionResult> {
  return safeAction(async () => {
    const me = await requirePerm("security", "edit");
    const sb = supabaseAdmin();
    const { data: cur } = await sb.from("profiles").select("*").eq("id", userId).maybeSingle();
    if (!cur) throw new Error("ไม่พบผู้ใช้");
    const patch: Record<string, unknown> = {};
    if (input.username !== undefined && input.username.trim() !== cur.username) {
      const u = input.username.trim();
      if (!USERNAME_RE.test(u)) throw new Error("ชื่อผู้ใช้ต้องยาว 3–50 ตัว ใช้ได้เฉพาะ A-Z a-z 0-9 . _ -");
      await assertUsernameFree(sb, u, userId);
      patch.username = u;
    }
    if (input.display_name !== undefined) patch.display_name = input.display_name?.trim() || null;
    if (input.role_group_id !== undefined) patch.role_group_id = input.role_group_id;
    if (input.is_admin !== undefined && input.is_admin !== cur.is_admin) {
      if (!me.isAdmin) throw new Error("เฉพาะผู้ดูแลระบบเท่านั้นที่เปลี่ยนสิทธิ์ผู้ดูแลระบบได้");
      if (userId === me.userId && !input.is_admin) throw new Error("ไม่สามารถถอดสิทธิ์ผู้ดูแลระบบของตัวเองได้");
      patch.is_admin = input.is_admin;
    }
    if (input.employee_id !== undefined && input.employee_id !== cur.employee_id) {
      if (input.employee_id) await assertEmployeeFree(sb, input.employee_id, userId);
      patch.employee_id = input.employee_id;
    }
    if (input.email !== undefined && input.email.trim().toLowerCase() !== cur.email) {
      const email = input.email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("รูปแบบอีเมลไม่ถูกต้อง");
      const { error } = await sb.auth.admin.updateUserById(userId, { email, email_confirm: true });
      if (error) throw authError(error);
      patch.email = email;
    }
    if (!Object.keys(patch).length) return;
    const { error } = await sb.from("profiles").update(patch).eq("id", userId);
    if (error) throw new Error(error.message);
    await audit(sb, me.userId, me.displayName, "UPDATE_USER", userId, JSON.stringify(patch));
    revalidatePath("/settings/users");
  }, "บันทึกแล้ว");
}

export async function resetPasswordAction(userId: string, password: string, mustChange = true): Promise<ActionResult> {
  return safeAction(async () => {
    const me = await requirePerm("security", "edit");
    const sb = supabaseAdmin();
    assertPassword(password, await policy(sb));
    const { error } = await sb.auth.admin.updateUserById(userId, { password });
    if (error) throw authError(error);
    await sb.from("profiles").update({ must_change_password: mustChange, password_changed_at: mustChange ? null : new Date().toISOString() }).eq("id", userId);
    await audit(sb, me.userId, me.displayName, "RESET_PASSWORD", userId, null);
  }, "ตั้งรหัสผ่านใหม่แล้ว");
}

export async function setActiveAction(userId: string, active: boolean): Promise<ActionResult> {
  return safeAction(async () => {
    const me = await requirePerm("security", "edit");
    if (userId === me.userId && !active) throw new Error("ไม่สามารถปิดการใช้งานบัญชีของตัวเองได้");
    const sb = supabaseAdmin();
    if (active) {
      // an employee who has left cannot be re-enabled here — the resign sync would lock the account again tonight
      const { data: prof } = await sb.from("profiles").select("employee_id, is_admin").eq("id", userId).maybeSingle();
      if (prof?.employee_id && !prof.is_admin) {
        const { data: emp } = await sb.from("employees").select("status, resign_date").eq("id", prof.employee_id).maybeSingle();
        const todayBkk = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
        if (emp && !employeeAllowed(emp.status as string, emp.resign_date as string | null, todayBkk)) {
          throw new Error("พนักงานคนนี้พ้นสภาพแล้ว เปิดบัญชีไม่ได้ — ถ้าต้องการให้กลับมาใช้งาน ให้แก้สถานะ / วันที่ลาออกที่ประวัติพนักงานก่อน");
        }
      }
    }
    // a manual change wins over the automatic resign lock (locked_by_resign = false), and auth_banned_at keeps the daily job in step
    const { error } = await sb.from("profiles").update({ is_active: active, locked_by_resign: false, auth_banned_at: active ? null : new Date().toISOString() }).eq("id", userId);
    if (error) throw new Error(error.message);
    // block sign-in at the auth layer too (ban ~100 years) and revoke sessions
    await sb.auth.admin.updateUserById(userId, { ban_duration: active ? "none" : "876000h" });
    await audit(sb, me.userId, me.displayName, active ? "ACTIVATE_USER" : "DEACTIVATE_USER", userId, null);
    revalidatePath("/settings/users");
  }, active ? "เปิดใช้งานบัญชีแล้ว" : "ปิดการใช้งานบัญชีแล้ว");
}

export async function deleteUserAction(userId: string): Promise<ActionResult> {
  return safeAction(async () => {
    const me = await requirePerm("security", "delete");
    if (userId === me.userId) throw new Error("ไม่สามารถลบบัญชีของตัวเองได้");
    const sb = supabaseAdmin();
    const { error } = await sb.auth.admin.deleteUser(userId);
    if (error) throw authError(error);
    await audit(sb, me.userId, me.displayName, "DELETE_USER", userId, null);
    revalidatePath("/settings/users");
  }, "ลบบัญชีผู้ใช้แล้ว");
}

export interface BulkInput {
  mode: "birthdate" | "fixed";
  password?: string; // fixed password, or fallback when birth date is missing
  role_group_id: number | null;
  employee_ids?: number[]; // limit to these (default: all active employees without an account)
}
export interface BulkResult {
  created: { code: string; name: string; username: string; password: string }[];
  skipped: { code: string; name: string; reason: string }[];
}

/** ddmmyyyy (พ.ศ.) from ISO date */
function birthPassword(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}${m}${Number(y) + 543}`;
}

export async function bulkCreateAccountsAction(input: BulkInput): Promise<ActionResult<BulkResult>> {
  return safeAction(async () => {
    const me = await requirePerm("security", "create");
    const sb = supabaseAdmin();
    const fallback = (input.password ?? "").trim();
    if (input.mode === "fixed" && fallback.length < 6) throw new Error("รหัสผ่านเริ่มต้นต้องยาวอย่างน้อย 6 ตัวอักษร");
    if (fallback && fallback.length < 6) throw new Error("รหัสผ่านสำรองต้องยาวอย่างน้อย 6 ตัวอักษร");

    const [{ data: emps, error }, { data: profs }] = await Promise.all([
      sb.from("employees").select("id, code, first_name, last_name, birth_date, status").neq("status", "resigned").order("code"),
      sb.from("profiles").select("employee_id, username"),
    ]);
    if (error) throw new Error(error.message);
    const linked = new Set((profs ?? []).map((p) => p.employee_id).filter(Boolean));
    const usernames = new Set((profs ?? []).map((p) => String(p.username ?? "").toLowerCase()));
    const want = input.employee_ids?.length ? new Set(input.employee_ids) : null;
    const res: BulkResult = { created: [], skipped: [] };

    for (const e of emps ?? []) {
      if (linked.has(e.id) || (want && !want.has(e.id))) continue;
      const name = `${e.first_name} ${e.last_name}`;
      const username = e.code;
      if (usernames.has(username.toLowerCase())) {
        res.skipped.push({ code: e.code, name, reason: "ชื่อผู้ใช้ซ้ำกับบัญชีอื่น" });
        continue;
      }
      const pw = input.mode === "birthdate" && e.birth_date ? birthPassword(e.birth_date) : fallback;
      if (!pw) {
        res.skipped.push({ code: e.code, name, reason: "ไม่มีวันเกิด และไม่ได้กำหนดรหัสผ่านสำรอง" });
        continue;
      }
      const email = `${e.code.toLowerCase()}@staff.gohr.local`;
      const { data: u, error: ue } = await sb.auth.admin.createUser({ email, password: pw, email_confirm: true });
      if (ue || !u.user) {
        res.skipped.push({ code: e.code, name, reason: authError(ue).message });
        continue;
      }
      const { error: pe } = await sb.from("profiles").upsert({
        id: u.user.id, email, username, display_name: name, role_group_id: input.role_group_id, employee_id: e.id, must_change_password: true, is_active: true,
      });
      if (pe) {
        await sb.auth.admin.deleteUser(u.user.id);
        res.skipped.push({ code: e.code, name, reason: pe.message });
        continue;
      }
      usernames.add(username.toLowerCase());
      res.created.push({ code: e.code, name, username, password: pw });
    }
    await audit(sb, me.userId, me.displayName, "BULK_CREATE_USERS", null, `created ${res.created.length}, skipped ${res.skipped.length}`);
    revalidatePath("/settings/users");
    return res;
  });
}

async function audit(sb: Admin, uid: string, name: string, action: string, record: string | null, note: string | null) {
  await sb.from("audit_logs").insert({ user_id: uid, user_name: name, action, table_name: "auth.users", record_id: record, note });
}
