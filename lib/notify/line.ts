import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

const API = process.env.LINE_API_BASE ?? "https://api.line.me";

export type LineMessage = { type: "text"; text: string } | Record<string, unknown>;

async function call(path: string, token: string, body: unknown) {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`LINE API ${res.status}: ${t.slice(0, 200)}`);
  }
}

/** Push messages to one LINE user (max 5 messages per call). */
export async function linePush(token: string, to: string, messages: LineMessage[]) {
  if (!token) throw new Error("ยังไม่ได้ตั้งค่า Channel access token ของ LINE OA");
  await call("/v2/bot/message/push", token, { to, messages: messages.slice(0, 5) });
}

/** Reply to a webhook event */
export async function lineReply(token: string, replyToken: string, messages: LineMessage[]) {
  if (!token || !replyToken) return;
  await call("/v2/bot/message/reply", token, { replyToken, messages: messages.slice(0, 5) });
}

/** Verify x-line-signature (base64 HMAC-SHA256 of the raw body with the channel secret) */
export function verifyLineSignature(rawBody: string, signature: string | null, channelSecret: string): boolean {
  if (!signature || !channelSecret) return false;
  const expected = createHmac("sha256", channelSecret).update(rawBody).digest();
  let got: Buffer;
  try {
    got = Buffer.from(signature, "base64");
  } catch {
    return false;
  }
  return got.length === expected.length && timingSafeEqual(got, expected);
}

/** Notification → LINE text (LINE text messages max 5000 chars) */
export function notificationText(n: { title: string; body?: string | null; link?: string | null }, baseUrl: string): string {
  const parts = [n.title, n.body ?? "", n.link ? `${baseUrl}${n.link.startsWith("/") ? "" : "/"}${n.link}` : ""].filter(Boolean);
  return parts.join("\n").slice(0, 4900);
}
