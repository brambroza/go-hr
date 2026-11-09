import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { allowAttempt } from "@/lib/login-rate";
import { clientIp } from "@/lib/client-ip";
import { isTruthyEnv } from "@/lib/security-headers";
import { verifyTurnstile } from "@/lib/turnstile";
import { TrialSignupSchema, firstIssue, leadSummary, parseDemoAccounts } from "@/lib/trial";
import { linePush } from "@/lib/notify/line";
import { appUrl, loadNotifyConfig } from "@/lib/notify/config";

// Public trial sign-up (no login) for GoAlong's demo server. Off unless TRIAL_SIGNUP=1.
// Order of checks: feature flag → per-IP rate limit → honeypot → zod → Cloudflare Turnstile → duplicate phone.
// The lead is stored with the service role (anon has no access to trial_leads), then the sales team is told
// through in-app notifications (delivered to LINE for linked users) and, when set, a LINE group push.

const RATE = { limit: 5, windowMs: 10 * 60_000 };
const hits = new Map<string, number[]>();

/**
 * JSON error helper.
 * @param message - Thai message shown to the visitor
 * @param status - HTTP status
 * @param field - form field to highlight
 */
function bad(message: string, status = 400, field?: string) {
  return NextResponse.json({ ok: false, error: message, field }, { status });
}

/** POST /api/public/trial — multipart or urlencoded form from app/trial */
export async function POST(req: NextRequest) {
  if (!isTruthyEnv(process.env.TRIAL_SIGNUP)) return bad("ไม่พบหน้านี้", 404);

  const ip = clientIp(req.headers, isTruthyEnv(process.env.TRUST_CLOUDFLARE));
  if (!allowAttempt(`trial:${ip}`, Date.now(), RATE, hits)) return bad("ส่งแบบฟอร์มบ่อยเกินไป กรุณารอ 10 นาทีแล้วลองใหม่", 429);

  let fd: FormData;
  try {
    fd = await req.formData();
  } catch {
    return bad("ข้อมูลที่ส่งมาไม่ถูกต้อง");
  }
  // honeypot: hidden from people, bots fill it — answer "ok" so they do not retry
  if (String(fd.get("website") ?? "").trim()) return NextResponse.json({ ok: true, ref_no: "TR-OK", accounts: [] });

  const raw: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string") raw[k] = v;
  const parsed = TrialSignupSchema.safeParse(raw);
  if (!parsed.success) {
    const { field, message } = firstIssue(parsed.error);
    return bad(message, 400, field);
  }
  const d = parsed.data;

  // Cloudflare Turnstile — fails closed when the secret is missing
  let expectedHost: string | null = null;
  try {
    expectedHost = new URL(appUrl()).hostname;
  } catch {
    expectedHost = null;
  }
  const bot = await verifyTurnstile(raw["cf-turnstile-response"], process.env.TURNSTILE_SECRET_KEY, ip === "local" ? null : ip, process.env.NODE_ENV === "production" ? expectedHost : null);
  if (!bot.ok) {
    if (bot.codes.includes("missing-input-secret")) {
      console.error("[trial] TURNSTILE_SECRET_KEY is not set — sign-up refused");
      return bad("ระบบยังไม่พร้อมรับสมัคร กรุณาติดต่อทาง LINE", 503);
    }
    console.warn("[trial] turnstile refused:", bot.codes.join(","));
    return bad("ยืนยันว่าไม่ใช่บอทไม่สำเร็จ กรุณากดยืนยันอีกครั้ง", 400, "turnstile");
  }

  const sb = supabaseAdmin();
  const accounts = parseDemoAccounts(process.env.TRIAL_DEMO_ACCOUNTS);

  // same phone within 24h: do not store twice, still hand out the demo logins
  const { data: recent } = await sb
    .from("trial_leads")
    .select("ref_no")
    .eq("phone", d.phone)
    .gte("created_at", new Date(Date.now() - 86_400_000).toISOString())
    .order("created_at", { ascending: false })
    .limit(1);
  if (recent?.[0]) return NextResponse.json({ ok: true, ref_no: recent[0].ref_no, accounts, duplicate: true });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { consent: _c, ...fields } = d;
  const { data: row, error } = await sb
    .from("trial_leads")
    .insert({ ...fields, consent_pdpa: true, consent_at: new Date().toISOString(), ip, user_agent: (req.headers.get("user-agent") ?? "").slice(0, 300) })
    .select("id, ref_no")
    .single();
  if (error || !row) {
    console.error("[trial] insert failed", error?.message);
    return bad("บันทึกข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง", 500);
  }

  const text = leadSummary(d, row.ref_no);
  await notifySales(sb, row.ref_no, d.company_name, d.headcount_range, text).catch((e) => console.error("[trial] notify failed", e instanceof Error ? e.message : e));

  return NextResponse.json({ ok: true, ref_no: row.ref_no, accounts });
}

/**
 * Tell the sales team: in-app notification for users who can see settings (LINE delivery follows the
 * normal notification pipeline), plus a direct LINE push to TRIAL_NOTIFY_LINE_TO (a group / user id) when set.
 */
async function notifySales(sb: ReturnType<typeof supabaseAdmin>, refNo: string, company: string, headcount: string, text: string) {
  const { data: users } = await sb.from("profiles").select("id, is_admin, role_groups(permissions)").eq("is_active", true);
  type U = { id: string; is_admin: boolean; role_groups: { permissions: Record<string, string[]> } | { permissions: Record<string, string[]> }[] | null };
  const targets = ((users ?? []) as U[]).filter((u) => {
    const g = Array.isArray(u.role_groups) ? u.role_groups[0] : u.role_groups;
    return u.is_admin || (g?.permissions?.settings ?? []).includes("view");
  });
  if (targets.length) {
    await sb.from("notifications").insert(
      targets.map((u) => ({ user_id: u.id, title: `ขอทดลองใช้: ${company}`, body: `${refNo} · พนักงาน ${headcount} คน`, link: "/settings/trial-leads", category: "system" })),
    );
  }
  const to = process.env.TRIAL_NOTIFY_LINE_TO?.trim();
  if (to) {
    const cfg = await loadNotifyConfig();
    if (cfg.line.channel_access_token) await linePush(cfg.line.channel_access_token, to, [{ type: "text", text: `${text}\n${appUrl()}/settings/trial-leads` }]);
  }
}
