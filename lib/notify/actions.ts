"use server";

import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getMe, requirePerm, safeAction } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { installLicense, removeLicense, getLicense } from "@/lib/license-server";
import { runJob } from "@/lib/jobs/runner";
import { loadNotifyConfig, appUrl } from "./config";
import { linePush } from "./line";
import { sendEmail } from "./email";

// ------------------------------------------------------------------ license
export async function saveLicenseAction(license: string) {
  return safeAction(async () => {
    await requirePerm("settings", "edit");
    const s = await installLicense(license);
    revalidatePath("/settings/license");
    return { licensee: s.licensee, max_employees: s.max_employees };
  }, "ติดตั้ง License แล้ว");
}

export async function removeLicenseAction() {
  return safeAction(async () => {
    await requirePerm("settings", "edit");
    await removeLicense();
    revalidatePath("/settings/license");
  }, "ถอน License แล้ว ระบบกลับเป็นรุ่นทดลอง (สูงสุด 10 คน)");
}

export async function licenseInfoAction() {
  return safeAction(async () => {
    await requirePerm("settings", "view");
    const lic = await getLicense();
    const { count } = await supabaseAdmin().from("employees").select("id", { count: "exact", head: true }).neq("status", "resigned");
    // never send the raw license string back to the browser
    const { license: _omit, ...rest } = lic ?? ({} as Record<string, unknown>);
    void _omit;
    return { license: lic ? rest : null, active: count ?? 0, envFallback: !!process.env.GOHR_LICENSE };
  });
}

// ------------------------------------------------------------------ notification channels (secrets written with the service role)
export interface ChannelInput {
  line_enabled: boolean;
  line_oa_id: string;
  line_liff_id: string;
  line_add_friend_url: string;
  line_channel_access_token?: string; // empty / undefined = keep current
  line_channel_secret?: string;
  email_enabled: boolean;
  from_email: string;
  smtp_url?: string;
}

export async function loadChannelsAction() {
  return safeAction(async () => {
    await requirePerm("settings", "edit");
    const cfg = await loadNotifyConfig();
    const mask = (s?: string) => (s ? `••••${s.slice(-4)}` : "");
    const smtpMask = cfg.smtp.url ? cfg.smtp.url.replace(/\/\/([^:@/]+):([^@]+)@/, "//$1:••••@") : "";
    return {
      notify: cfg.notify,
      has_token: !!cfg.line.channel_access_token,
      token_hint: mask(cfg.line.channel_access_token),
      has_secret: !!cfg.line.channel_secret,
      has_smtp: !!cfg.smtp.url,
      smtp_hint: smtpMask,
      webhook_url: `${appUrl()}/api/line/webhook`,
    };
  });
}

export async function saveChannelsAction(input: ChannelInput) {
  return safeAction(async () => {
    const me = await requirePerm("settings", "edit");
    if (input.email_enabled && input.from_email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$|^.+<[^@\s]+@[^@\s]+>$/.test(input.from_email)) throw new Error("อีเมลผู้ส่งไม่ถูกต้อง เช่น hr@company.co.th หรือ GO HR <hr@company.co.th>");
    if (input.smtp_url && !/^smtps?:\/\//.test(input.smtp_url)) throw new Error("SMTP URL ต้องขึ้นต้นด้วย smtp:// หรือ smtps://");
    const sb = supabaseAdmin();
    const cfg = await loadNotifyConfig();
    const now = new Date().toISOString();
    const notify = {
      ...cfg.notify,
      line_enabled: input.line_enabled,
      line_oa_id: input.line_oa_id.trim(),
      line_liff_id: input.line_liff_id.trim(),
      line_add_friend_url: input.line_add_friend_url.trim(),
      email_enabled: input.email_enabled,
      from_email: input.from_email.trim(),
    };
    const line = {
      channel_access_token: input.line_channel_access_token?.trim() || cfg.line.channel_access_token || "",
      channel_secret: input.line_channel_secret?.trim() || cfg.line.channel_secret || "",
    };
    if (input.line_enabled && !line.channel_access_token) throw new Error("เปิดใช้ LINE ต้องกรอก Channel access token");
    const smtp = { url: input.smtp_url?.trim() || cfg.smtp.url || "" };
    if (input.email_enabled && (!smtp.url || !notify.from_email)) throw new Error("เปิดใช้อีเมลต้องกรอก SMTP URL และอีเมลผู้ส่ง");
    const { error } = await sb.from("settings").upsert(
      [
        { key: "notify", value: notify, is_public: false, updated_at: now, updated_by: me.userId },
        { key: "secret.line", value: line, is_public: false, updated_at: now, updated_by: me.userId },
        { key: "secret.smtp", value: smtp, is_public: false, updated_at: now, updated_by: me.userId },
      ],
    );
    if (error) throw new Error(error.message);
  }, "บันทึกช่องทางแจ้งเตือนแล้ว");
}

export async function testLineAction() {
  return safeAction(async () => {
    const me = await requirePerm("settings", "edit");
    const cfg = await loadNotifyConfig();
    if (!cfg.line.channel_access_token) throw new Error("ยังไม่ได้บันทึก Channel access token");
    const { data } = await supabaseAdmin().from("profiles").select("line_user_id").eq("id", me.userId).maybeSingle();
    if (!data?.line_user_id) throw new Error("บัญชีของคุณยังไม่ได้เชื่อม LINE — เชื่อมที่หน้าพนักงาน > โปรไฟล์ ก่อนทดสอบ");
    await linePush(cfg.line.channel_access_token, data.line_user_id, [{ type: "text", text: `ข้อความทดสอบจาก GO HR (${cfg.companyName})\nการแจ้งเตือนทาง LINE ใช้งานได้แล้ว` }]);
  }, "ส่งข้อความทดสอบทาง LINE แล้ว");
}

export async function testEmailAction(to: string) {
  return safeAction(async () => {
    await requirePerm("settings", "edit");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) throw new Error("กรอกอีเมลผู้รับให้ถูกต้อง");
    const cfg = await loadNotifyConfig();
    await sendEmail(cfg.smtp.url ?? "", cfg.notify.from_email, { to, subject: "ทดสอบการส่งอีเมลจาก GO HR", text: "ถ้าคุณได้รับอีเมลนี้ แสดงว่าการตั้งค่า SMTP ถูกต้องแล้ว", companyName: cfg.companyName });
  }, "ส่งอีเมลทดสอบแล้ว");
}

// ------------------------------------------------------------------ jobs
export async function runJobNowAction(code: string) {
  return safeAction(async () => {
    await requirePerm("settings", "edit");
    const r = await runJob(code, { trigger: "manual" });
    revalidatePath("/settings/jobs");
    if (r.status === "error") throw new Error(r.message);
    return r;
  });
}

// ------------------------------------------------------------------ LINE account linking (any signed-in user)
export async function createLineLinkCodeAction() {
  return safeAction(async () => {
    const me = await getMe();
    if (!me) throw new Error("กรุณาเข้าสู่ระบบ");
    const sb = supabaseAdmin();
    let code = "";
    for (let i = 0; i < 5; i++) {
      code = String(randomInt(0, 1_000_000)).padStart(6, "0");
      const { data } = await sb.from("profiles").select("id").eq("line_link_code", code).gt("line_link_expires_at", new Date().toISOString()).limit(1);
      if (!data?.length) break;
    }
    const expires = new Date(Date.now() + 15 * 60_000).toISOString();
    const { error } = await sb.from("profiles").update({ line_link_code: code, line_link_expires_at: expires }).eq("id", me.userId);
    if (error) throw new Error(error.message);
    return { code, expires };
  });
}

export async function unlinkLineAction() {
  return safeAction(async () => {
    const me = await getMe();
    if (!me) throw new Error("กรุณาเข้าสู่ระบบ");
    const { error } = await supabaseAdmin().from("profiles").update({ line_user_id: null, line_link_code: null, line_link_expires_at: null }).eq("id", me.userId);
    if (error) throw new Error(error.message);
  }, "ยกเลิกการเชื่อม LINE แล้ว");
}

export async function lineLinkStateAction() {
  return safeAction(async () => {
    const me = await getMe();
    if (!me) throw new Error("กรุณาเข้าสู่ระบบ");
    const sb = supabaseAdmin();
    const [{ data: p }, cfg] = await Promise.all([sb.from("profiles").select("line_user_id, line_link_code, line_link_expires_at").eq("id", me.userId).maybeSingle(), loadNotifyConfig()]);
    const pending = p?.line_link_code && p.line_link_expires_at && p.line_link_expires_at > new Date().toISOString() ? { code: p.line_link_code as string, expires: p.line_link_expires_at as string } : null;
    return {
      linked: !!p?.line_user_id,
      pending,
      enabled: cfg.notify.line_enabled,
      oa_id: cfg.notify.line_oa_id || "",
      add_friend_url: cfg.notify.line_add_friend_url || (cfg.notify.line_oa_id ? `https://line.me/R/ti/p/${encodeURIComponent(cfg.notify.line_oa_id)}` : ""),
    };
  });
}
