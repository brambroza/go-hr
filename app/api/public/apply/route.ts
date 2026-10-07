import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Public job application (no login). Validated with zod, rate limited per IP (in memory), honeypot field,
// files go to the private "resumes" bucket through the service role, HR users with recruit permission are notified.

const MAX_FILE = 5 * 1024 * 1024;
const RESUME_TYPES = ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 5;
const hits = new Map<string, number[]>();

function limited(ip: string) {
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < WINDOW_MS)) hits.delete(k);
  return list.length > MAX_PER_WINDOW;
}

const optStr = (max = 200) => z.string().trim().max(max).optional().transform((v) => (v ? v : null));
const optDate = z
  .string()
  .optional()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), "รูปแบบวันที่ไม่ถูกต้อง");
const optNum = (max: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? null : Number(v.replace(/,/g, ""))))
    .refine((v) => v === null || (Number.isFinite(v) && v >= 0 && v <= max), "ตัวเลขไม่ถูกต้อง");

const Schema = z.object({
  posting_slug: z.string().min(4).max(40),
  prefix: optStr(20),
  first_name: z.string().trim().min(1, "กรุณากรอกชื่อ").max(100),
  last_name: z.string().trim().min(1, "กรุณากรอกนามสกุล").max(100),
  nickname: optStr(50),
  phone: z
    .string()
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => /^0\d{8,9}$/.test(v), "เบอร์โทรศัพท์ไม่ถูกต้อง (เช่น 0812345678)"),
  email: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "อีเมลไม่ถูกต้อง"),
  birth_date: optDate,
  gender: z.enum(["M", "F", "X", ""]).optional().transform((v) => (v ? v : null)),
  address: optStr(500),
  education_level: optStr(50),
  institution: optStr(200),
  major: optStr(200),
  experience_years: optNum(60),
  last_company: optStr(200),
  last_position: optStr(200),
  expected_salary: optNum(10_000_000),
  available_date: optDate,
  cover_letter: optStr(3000),
  answers: z
    .string()
    .optional()
    .transform((v, ctx) => {
      if (!v) return {} as Record<string, unknown>;
      try {
        const o = JSON.parse(v);
        if (typeof o !== "object" || o === null || Array.isArray(o)) throw new Error();
        return o as Record<string, unknown>;
      } catch {
        ctx.addIssue({ code: "custom", message: "คำตอบไม่ถูกต้อง" });
        return z.NEVER;
      }
    }),
  consent: z.literal("1", { message: "กรุณายินยอมให้เก็บข้อมูลส่วนบุคคลก่อนส่งใบสมัคร" }),
});

type Question = { key: string; label: string; type: string; required?: boolean; options?: string[] };

function bad(message: string, status = 400, field?: string) {
  return NextResponse.json({ ok: false, error: message, field }, { status });
}

export async function POST(req: NextRequest) {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
  if (limited(ip)) return bad("ส่งใบสมัครบ่อยเกินไป กรุณารอ 10 นาทีแล้วลองใหม่", 429);

  let fd: FormData;
  try {
    fd = await req.formData();
  } catch {
    return bad("ข้อมูลที่ส่งมาไม่ถูกต้อง");
  }
  // honeypot: real people never see / fill this field
  if (String(fd.get("website") ?? "").trim()) return NextResponse.json({ ok: true, ref_no: "AP-OK" });

  const raw: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string") raw[k] = v;
  const parsed = Schema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return bad(issue?.message ?? "ข้อมูลไม่ครบถ้วน", 400, String(issue?.path?.[0] ?? ""));
  }
  const d = parsed.data;

  const sb = supabaseAdmin();
  const { data: job } = await sb.from("job_postings").select("id, title, status, close_date, questions").eq("slug", d.posting_slug).maybeSingle();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
  if (!job || job.status !== "open" || (job.close_date && job.close_date < today)) return bad("ประกาศนี้ปิดรับสมัครแล้ว", 410);

  // custom questions: keep only known keys, enforce required
  const questions = (job.questions ?? []) as Question[];
  const answers: Record<string, unknown> = {};
  for (const q of questions) {
    let v = d.answers[q.key];
    if (q.type === "yesno") v = v === true || v === "yes" ? true : v === false || v === "no" ? false : null;
    else v = typeof v === "string" ? v.trim().slice(0, 2000) : null;
    if (q.type === "select" && v && q.options?.length && !q.options.includes(String(v))) v = null;
    if (q.required && (v === null || v === "")) return bad(`กรุณาตอบคำถาม “${q.label}”`, 400, `q_${q.key}`);
    if (v !== null && v !== "") answers[q.key] = v;
  }

  // duplicate guard: same phone for the same posting within 24h
  const { count: dup } = await sb
    .from("applicants")
    .select("id", { count: "exact", head: true })
    .eq("posting_id", job.id)
    .eq("phone", d.phone)
    .gte("created_at", new Date(Date.now() - 86400000).toISOString());
  if ((dup ?? 0) > 0) return bad("เบอร์โทรนี้ส่งใบสมัครตำแหน่งนี้แล้วภายใน 24 ชั่วโมง ฝ่ายบุคคลได้รับข้อมูลของคุณแล้ว", 409);

  async function store(key: "resume" | "photo", types: string[], exts: RegExp, label: string): Promise<string | null> {
    const f = fd.get(key);
    if (!(f instanceof File) || f.size === 0) return null;
    if (f.size > MAX_FILE) throw new Error(`${label}ใหญ่เกิน 5 MB`);
    if (!types.includes(f.type) && !exts.test(f.name)) throw new Error(`${label}ต้องเป็นไฟล์ ${key === "resume" ? "PDF หรือ Word" : "JPG / PNG"}`);
    const ext = (f.name.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "bin";
    const path = `careers/${today.slice(0, 7)}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
    const { error } = await sb.storage.from("resumes").upload(path, Buffer.from(await f.arrayBuffer()), { contentType: f.type || "application/octet-stream" });
    if (error) throw new Error("อัปโหลดไฟล์ไม่สำเร็จ กรุณาลองใหม่");
    return `resumes/${path}`;
  }

  let resume_url: string | null = null;
  let photo_url: string | null = null;
  try {
    resume_url = await store("resume", RESUME_TYPES, /\.(pdf|docx?)$/i, "ไฟล์ใบสมัคร ");
    photo_url = await store("photo", PHOTO_TYPES, /\.(jpe?g|png|webp)$/i, "รูปถ่าย ");
  } catch (e) {
    return bad(e instanceof Error ? e.message : "อัปโหลดไฟล์ไม่สำเร็จ");
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { answers: _a, consent: _c, posting_slug: _s, ...rest } = d;
  const { data: row, error } = await sb
    .from("applicants")
    .insert({ ...rest, posting_id: job.id, answers, resume_url, photo_url, source: "careers", stage: "applied", consent_pdpa: true, consent_at: new Date().toISOString() })
    .select("id, ref_no")
    .single();
  if (error || !row) return bad("บันทึกใบสมัครไม่สำเร็จ กรุณาลองใหม่อีกครั้ง", 500);

  await sb.from("applicant_activities").insert({ applicant_id: row.id, activity_type: "note", note: "ยื่นใบสมัครผ่านเว็บไซต์รับสมัครงาน" });

  // notify HR users who can see recruitment
  const { data: users } = await sb.from("profiles").select("id, is_admin, is_active, role_groups(permissions)").eq("is_active", true);
  const targets = ((users ?? []) as { id: string; is_admin: boolean; role_groups: { permissions: Record<string, string[]> } | { permissions: Record<string, string[]> }[] | null }[]).filter((u) => {
    const g = Array.isArray(u.role_groups) ? u.role_groups[0] : u.role_groups;
    return u.is_admin || (g?.permissions?.recruit ?? []).includes("view");
  });
  if (targets.length) {
    await sb.from("notifications").insert(
      targets.map((u) => ({
        user_id: u.id,
        title: `ใบสมัครใหม่: ${job.title}`,
        body: `${d.first_name} ${d.last_name} (${row.ref_no})`,
        link: `/recruit/applicants/${row.id}`,
        category: "recruit",
      })),
    );
  }

  return NextResponse.json({ ok: true, ref_no: row.ref_no });
}
