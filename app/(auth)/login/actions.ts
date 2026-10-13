"use server";

import { headers } from "next/headers";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { allowAttempt } from "@/lib/login-rate";

export type LoginResult = { ok: true } | { ok: false; error: string };

const WRONG = "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง";

/**
 * Sign in with username / employee code / e-mail + password.
 *
 * Runs on the server so the browser never learns the auth e-mail behind a username, cannot count failures for
 * other people, and the lockout (settings.password_policy max_failed / lock_minutes) is enforced before GoTrue
 * is asked at all. The auth cookie is written by the server client; "remember me" is honoured through the
 * session-only marker cookie the form sets before calling this action.
 */
export async function loginAction(login: string, password: string): Promise<LoginResult> {
  const typed = String(login ?? "").trim().slice(0, 200);
  const pw = String(password ?? "");
  if (!typed || !pw) return { ok: false, error: WRONG };

  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? h.get("x-real-ip") ?? "").split(",")[0].trim() || null;
  if (!allowAttempt(ip ?? "unknown")) return { ok: false, error: "พยายามเข้าสู่ระบบบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่" };

  const admin = supabaseAdmin();
  const pre = await admin.rpc("login_precheck", { p_login: typed });
  if (pre.error) return { ok: false, error: "เข้าสู่ระบบไม่ได้ชั่วคราว กรุณาลองใหม่อีกครั้ง" };
  const info = (pre.data ?? {}) as { email?: string | null; locked_minutes?: number };
  if (info.locked_minutes && info.locked_minutes > 0) {
    return { ok: false, error: `บัญชีถูกล็อกชั่วคราวเนื่องจากใส่รหัสผ่านผิดหลายครั้ง ลองใหม่ในอีก ${info.locked_minutes} นาที` };
  }
  // unknown login still goes through GoTrue with an impossible address so timing looks the same
  const email = info.email ?? (typed.includes("@") ? typed : `${typed}@invalid.local`);

  const sb = await supabaseServer();
  const { error } = await sb.auth.signInWithPassword({ email, password: pw });
  if (error) {
    const wrongPassword = /invalid login|invalid credentials/i.test(error.message);
    // only a real wrong password counts toward the lockout (not a banned user, network or server error)
    if (wrongPassword) await admin.rpc("login_failed", { p_login: typed, p_ip: ip }).then(() => undefined, () => undefined);
    if (wrongPassword || /banned/i.test(error.message)) return { ok: false, error: WRONG };
    return { ok: false, error: "เข้าสู่ระบบไม่ได้ชั่วคราว กรุณาลองใหม่อีกครั้ง" };
  }
  await sb.rpc("record_login");
  return { ok: true };
}
