"use server";

import { createClient } from "@supabase/supabase-js";
import { getMe } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { publicEnv, serverSupabaseUrl } from "@/lib/public-env";
import { allowAttempt, type RateWindow } from "@/lib/login-rate";
import { normalizePolicy, passwordChangeError } from "@/lib/employees/password";

export type ChangePasswordResult = { ok: true } | { ok: false; error: string };

/** wrong "current password" guesses allowed per signed-in user */
const CHANGE_RATE: RateWindow = { limit: 8, windowMs: 15 * 60_000 };

/**
 * Change the signed-in user's password.
 *
 * Runs on the server so that the rules cannot be skipped from the browser: the current password is verified,
 * the company password policy is enforced, and only then is the password written with the service role.
 * (The browser can no longer call the auth service's password endpoints directly — deploy/Caddyfile blocks them.)
 *
 * @param current the user's current password
 * @param next the new password
 * @returns ok, or a Thai error message for the form
 */
export async function changePasswordAction(current: string, next: string): Promise<ChangePasswordResult> {
  const cur = String(current ?? "");
  const pw = String(next ?? "");
  const me = await getMe();
  if (!me) return { ok: false, error: "กรุณาเข้าสู่ระบบใหม่" };
  if (!me.email) return { ok: false, error: "ไม่พบบัญชีผู้ใช้ กรุณาเข้าสู่ระบบใหม่" };

  const admin = supabaseAdmin();
  const { data: setting, error: policyErr } = await admin.from("settings").select("value").eq("key", "password_policy").maybeSingle();
  if (policyErr) return { ok: false, error: "เปลี่ยนรหัสผ่านไม่ได้ชั่วคราว กรุณาลองใหม่อีกครั้ง" };
  const problem = passwordChangeError(cur, pw, normalizePolicy(setting?.value));
  if (problem) return { ok: false, error: problem };

  if (!allowAttempt(`pw:${me.userId}`, Date.now(), CHANGE_RATE)) {
    return { ok: false, error: "ลองเปลี่ยนรหัสผ่านบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่" };
  }

  // verify the current password with a throw-away client: it keeps no session, so the user's cookie is untouched
  const probe = createClient(serverSupabaseUrl(), publicEnv().anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: authErr } = await probe.auth.signInWithPassword({ email: me.email, password: cur });
  if (authErr) {
    if (/invalid login|invalid credentials/i.test(authErr.message)) return { ok: false, error: "รหัสผ่านปัจจุบันไม่ถูกต้อง" };
    return { ok: false, error: "เปลี่ยนรหัสผ่านไม่ได้ชั่วคราว กรุณาลองใหม่อีกครั้ง" };
  }
  await probe.auth.signOut().catch(() => undefined);

  const { error: upErr } = await admin.auth.admin.updateUserById(me.userId, { password: pw });
  if (upErr) {
    return { ok: false, error: /same|different/i.test(upErr.message) ? "รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านเดิม" : "เปลี่ยนรหัสผ่านไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" };
  }
  const { error: profErr } = await admin.from("profiles").update({ must_change_password: false, password_changed_at: new Date().toISOString() }).eq("id", me.userId);
  if (profErr) return { ok: false, error: "เปลี่ยนรหัสผ่านแล้ว แต่บันทึกสถานะไม่สำเร็จ กรุณาแจ้งฝ่ายบุคคล" };
  await admin.from("audit_logs").insert({ user_id: me.userId, user_name: me.displayName, action: "CHANGE_PASSWORD", table_name: "auth.users", record_id: me.userId, note: null });
  return { ok: true };
}
