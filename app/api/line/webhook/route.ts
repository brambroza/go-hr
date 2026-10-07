// LINE OA webhook. Set "Webhook URL" in LINE Developers console to  https://<your-host>/api/line/webhook
// - follow            → reply with linking instructions
// - "link 123456" / "123456" → link the LINE user to the GO HR account that generated the code (valid 15 min)
// - "unlink" / "ยกเลิก" → unlink
import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { loadNotifyConfig, appUrl } from "@/lib/notify/config";
import { lineReply, verifyLineSignature } from "@/lib/notify/line";

export const dynamic = "force-dynamic";

type LineEvent = {
  type: string;
  replyToken?: string;
  source?: { userId?: string; type?: string };
  message?: { type: string; text?: string };
};

const HELP = (company: string) =>
  `ยินดีต้อนรับสู่ GO HR ของ ${company}\n\nเชื่อมบัญชีเพื่อรับแจ้งเตือน:\n1) เปิดแอป GO HR > โปรไฟล์\n2) กด "สร้างรหัสเชื่อมต่อ LINE"\n3) พิมพ์รหัส 6 หลักส่งมาที่แชทนี้\n\nพิมพ์ "unlink" เพื่อยกเลิกการเชื่อม`;

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const cfg = await loadNotifyConfig();
  const secret = cfg.line.channel_secret ?? "";
  if (!secret) return NextResponse.json({ error: "LINE channel secret is not configured" }, { status: 503 });
  if (!verifyLineSignature(raw, req.headers.get("x-line-signature"), secret)) return NextResponse.json({ error: "invalid signature" }, { status: 401 });

  let body: { events?: LineEvent[] };
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const token = cfg.line.channel_access_token ?? "";
  const sb = supabaseAdmin();
  const reply = (ev: LineEvent, text: string) => lineReply(token, ev.replyToken ?? "", [{ type: "text", text }]).catch(() => undefined);

  for (const ev of body.events ?? []) {
    const lineUserId = ev.source?.userId;
    if (!lineUserId) continue;
    if (ev.type === "follow") {
      await reply(ev, HELP(cfg.companyName));
      continue;
    }
    if (ev.type === "unfollow") {
      await sb.from("profiles").update({ line_user_id: null }).eq("line_user_id", lineUserId);
      continue;
    }
    if (ev.type !== "message" || ev.message?.type !== "text") continue;
    const text = (ev.message.text ?? "").trim().toLowerCase();

    if (/^(unlink|ยกเลิก|ยกเลิกการเชื่อม)$/.test(text)) {
      const { data } = await sb.from("profiles").update({ line_user_id: null }).eq("line_user_id", lineUserId).select("id");
      await reply(ev, data?.length ? "ยกเลิกการเชื่อมบัญชี GO HR แล้ว คุณจะไม่ได้รับแจ้งเตือนทาง LINE อีก" : "LINE นี้ยังไม่ได้เชื่อมกับบัญชี GO HR");
      continue;
    }
    const m = /^(?:link\s*)?(\d{6})$/.exec(text.replace(/\s+/g, " "));
    if (!m) {
      await reply(ev, HELP(cfg.companyName));
      continue;
    }
    const { data: prof } = await sb
      .from("profiles")
      .select("id, display_name, username, employee_id")
      .eq("line_link_code", m[1])
      .gt("line_link_expires_at", new Date().toISOString())
      .maybeSingle();
    if (!prof) {
      await reply(ev, "รหัสไม่ถูกต้องหรือหมดอายุแล้ว (รหัสใช้ได้ 15 นาที) กรุณาสร้างรหัสใหม่ในแอป GO HR");
      continue;
    }
    // one LINE account ↔ one GO HR account
    await sb.from("profiles").update({ line_user_id: null }).eq("line_user_id", lineUserId).neq("id", prof.id);
    const { error } = await sb.from("profiles").update({ line_user_id: lineUserId, line_link_code: null, line_link_expires_at: null }).eq("id", prof.id);
    if (error) {
      await reply(ev, "เชื่อมบัญชีไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
      continue;
    }
    let name = prof.display_name || prof.username || "";
    if (prof.employee_id) {
      const { data: e } = await sb.from("employees").select("first_name, last_name").eq("id", prof.employee_id).maybeSingle();
      if (e) name = `${e.first_name} ${e.last_name}`;
    }
    await reply(ev, `เชื่อมบัญชีสำเร็จ\nสวัสดีคุณ${name} ต่อไปนี้คุณจะได้รับแจ้งเตือนจาก GO HR ทาง LINE\n${appUrl()}/m`);
  }
  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ ok: true, hint: "LINE webhook endpoint — use POST" });
}
