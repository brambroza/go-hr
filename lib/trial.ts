// Free-trial sign-up for GoAlong's own demo server (not for customer installs).
// Everything here is pure so it can be unit tested (tests/trial.test.ts); the route lives in
// app/api/public/trial/route.ts and the page in app/trial/page.tsx.
//
// Turned on with TRIAL_SIGNUP=1. A customer's own GO HR install leaves it off: /trial and the API answer 404.

import { z } from "zod";

/** Head-count bands shown on the form (value stored in trial_leads.headcount_range) */
export const HEADCOUNT_RANGES = ["1-50", "51-150", "151-300", "301-500", "500+"] as const;

/** Industries shown on the form (value stored in trial_leads.industry) */
export const INDUSTRIES = ["โรงงาน / การผลิต", "คลังสินค้า / โลจิสติกส์", "ค้าปลีก / หลายสาขา", "ร้านอาหาร / โรงแรม", "บริการ / สำนักงาน", "โรงพยาบาล / คลินิก", "อื่น ๆ"] as const;

/** One demo login shown after a successful sign-up (from TRIAL_DEMO_ACCOUNTS) */
export interface DemoAccount {
  /** role name shown to the visitor, e.g. "ฝ่ายบุคคล (HR)" */
  label: string;
  login: string;
  password: string;
  /** where to land after signing in, e.g. "/dashboard" or "/m" */
  path?: string;
}

const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `ยาวเกิน ${max} ตัวอักษร`)
    .optional()
    .transform((v) => (v ? v : null));

/** Validation for the public sign-up form. Field names match the form inputs and trial_leads columns. */
export const TrialSignupSchema = z.object({
  company_name: z.string().trim().min(2, "กรุณากรอกชื่อบริษัท").max(200, "ชื่อบริษัทยาวเกินไป"),
  contact_name: z.string().trim().min(2, "กรุณากรอกชื่อผู้ติดต่อ").max(150, "ชื่อยาวเกินไป"),
  position: optText(100),
  phone: z
    .string()
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => /^0\d{8,9}$/.test(v), "เบอร์โทรศัพท์ไม่ถูกต้อง (เช่น 0812345678)"),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || (v.length <= 200 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)), "อีเมลไม่ถูกต้อง"),
  line_id: optText(60),
  headcount_range: z.enum(HEADCOUNT_RANGES, { message: "กรุณาเลือกจำนวนพนักงาน" }),
  industry: z
    .string()
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || (INDUSTRIES as readonly string[]).includes(v), "ประเภทธุรกิจไม่ถูกต้อง"),
  note: optText(1000),
  consent: z.literal("1", { message: "กรุณายินยอมให้เก็บข้อมูลเพื่อติดต่อกลับก่อนส่งแบบฟอร์ม" }),
});

export type TrialSignup = z.infer<typeof TrialSignupSchema>;

/** Field name → first error message, or null when valid */
export function firstIssue(err: z.ZodError): { field: string; message: string } {
  const issue = err.issues[0];
  return { field: String(issue?.path?.[0] ?? ""), message: issue?.message ?? "ข้อมูลไม่ครบถ้วน" };
}

/**
 * Parse TRIAL_DEMO_ACCOUNTS (JSON array of {label, login, password, path?}).
 * Invalid JSON or invalid items are dropped so a typo in the env never breaks the page.
 */
export function parseDemoAccounts(raw: string | undefined | null): DemoAccount[] {
  if (!raw?.trim()) return [];
  let list: unknown;
  try {
    list = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(list)) return [];
  const out: DemoAccount[] = [];
  for (const item of list.slice(0, 10)) {
    if (typeof item !== "object" || item === null) continue;
    const o = item as Record<string, unknown>;
    const label = typeof o.label === "string" ? o.label.trim().slice(0, 60) : "";
    const login = typeof o.login === "string" ? o.login.trim().slice(0, 100) : "";
    const password = typeof o.password === "string" ? o.password.slice(0, 100) : "";
    // only same-site paths: never let the env turn the "sign in" link into an open redirect
    const path = typeof o.path === "string" && /^\/(?!\/)[\w\-/]*$/.test(o.path) ? o.path : undefined;
    if (label && login && password) out.push({ label, login, password, path });
  }
  return out;
}

/** Text for the LINE / in-app notification sent to the sales team */
export function leadSummary(d: Pick<TrialSignup, "company_name" | "contact_name" | "position" | "phone" | "email" | "line_id" | "headcount_range" | "industry" | "note">, refNo: string): string {
  const lines = [
    `🆕 ขอทดลองใช้ GO HR (${refNo})`,
    `บริษัท: ${d.company_name}`,
    `ผู้ติดต่อ: ${d.contact_name}${d.position ? ` (${d.position})` : ""}`,
    `โทร: ${d.phone}`,
    d.line_id ? `LINE: ${d.line_id}` : "",
    d.email ? `อีเมล: ${d.email}` : "",
    `พนักงาน: ${d.headcount_range} คน${d.industry ? ` · ${d.industry}` : ""}`,
    d.note ? `หมายเหตุ: ${d.note}` : "",
  ];
  return lines.filter(Boolean).join("\n").slice(0, 4900);
}
