import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";

export interface NotifySettings {
  line_enabled: boolean;
  email_enabled: boolean;
  from_email: string;
  line_liff_id: string;
  line_oa_id: string; // basic id e.g. @gohr
  line_add_friend_url?: string;
}
export interface LineSecret {
  channel_access_token?: string;
  channel_secret?: string;
}
export interface SmtpSecret {
  url?: string; // smtp(s)://user:pass@host:port
}

export const NOTIFY_DEFAULTS: NotifySettings = { line_enabled: false, email_enabled: false, from_email: "", line_liff_id: "", line_oa_id: "" };

/** Notification settings incl. secrets (service role — server only). */
export async function loadNotifyConfig() {
  const { data } = await supabaseAdmin().from("settings").select("key, value").in("key", ["notify", "secret.line", "secret.smtp", "company"]);
  const by = new Map((data ?? []).map((r) => [r.key as string, r.value as Record<string, unknown>]));
  return {
    notify: { ...NOTIFY_DEFAULTS, ...((by.get("notify") as Partial<NotifySettings>) ?? {}) } as NotifySettings,
    line: (by.get("secret.line") ?? {}) as LineSecret,
    smtp: (by.get("secret.smtp") ?? {}) as SmtpSecret,
    companyName: String((by.get("company") as { name?: string } | undefined)?.name ?? "GO HR"),
  };
}

export const appUrl = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
