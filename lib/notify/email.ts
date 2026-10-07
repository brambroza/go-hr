import "server-only";
import nodemailer, { type Transporter } from "nodemailer";

const cache = new Map<string, Transporter>();

function transport(url: string) {
  let t = cache.get(url);
  if (!t) {
    t = nodemailer.createTransport(url);
    cache.set(url, t);
  }
  return t;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Send one e-mail through the configured SMTP URL (smtp://user:pass@host:587 or smtps://...:465). */
export async function sendEmail(smtpUrl: string, from: string, msg: { to: string; subject: string; text: string; link?: string | null; companyName?: string }) {
  if (!smtpUrl) throw new Error("ยังไม่ได้ตั้งค่า SMTP");
  if (!from) throw new Error("ยังไม่ได้ตั้งค่าอีเมลผู้ส่ง");
  const html = `<div style="font-family:Tahoma,sans-serif;font-size:15px;color:#13231d">
<p style="font-size:17px;font-weight:600">${esc(msg.subject)}</p>
${msg.text ? `<p>${esc(msg.text).replace(/\n/g, "<br>")}</p>` : ""}
${msg.link ? `<p><a href="${esc(msg.link)}" style="color:#1b6f53">เปิดในระบบ</a></p>` : ""}
<p style="color:#7a8a84;font-size:12px">${esc(msg.companyName ?? "GO HR")} · ข้อความนี้ส่งจากระบบ GO HR โดยอัตโนมัติ</p></div>`;
  await transport(smtpUrl).sendMail({ from, to: msg.to, subject: msg.subject, text: [msg.text, msg.link].filter(Boolean).join("\n\n"), html });
}
