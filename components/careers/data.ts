import "server-only";
import { cache } from "react";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Public careers site data — read with the service role but only public, explicitly selected columns.

export interface PublicCompany { name: string; name_en?: string; address?: string; phone?: string; email?: string; logo_url?: string | null }
export interface PublicJob {
  id: number; slug: string; title: string; headcount: number; employment_type: string; salary_min: number | null; salary_max: number | null; show_salary: boolean;
  location_text: string | null; description: string | null; qualifications: string | null; benefits: string | null; questions: { key: string; label: string; type: "text" | "textarea" | "select" | "yesno"; required?: boolean; options?: string[] }[];
  open_date: string | null; close_date: string | null; updated_at: string; org_unit: string | null; branch: string | null; position: string | null;
}

const COLS = "id, slug, title, headcount, employment_type, salary_min, salary_max, show_salary, location_text, description, qualifications, benefits, questions, open_date, close_date, updated_at, org_units(name), branches(name), positions(name)";

function today() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
}

type Raw = Omit<PublicJob, "org_unit" | "branch" | "position"> & { org_units: { name: string } | null; branches: { name: string } | null; positions: { name: string } | null };
const map = (r: Raw): PublicJob => {
  const { org_units, branches, positions, ...rest } = r;
  return { ...rest, salary_min: rest.show_salary ? rest.salary_min : null, salary_max: rest.show_salary ? rest.salary_max : null, org_unit: org_units?.name ?? null, branch: branches?.name ?? null, position: positions?.name ?? null };
};

export const getPublicCompany = cache(async (): Promise<PublicCompany> => {
  const { data } = await supabaseAdmin().from("settings").select("value").eq("key", "company").eq("is_public", true).maybeSingle();
  const v = (data?.value ?? {}) as PublicCompany;
  return { name: v.name || "GO HR", name_en: v.name_en, address: v.address, phone: v.phone, email: v.email, logo_url: v.logo_url ?? null };
});

export async function getConsentText(): Promise<string> {
  const { data } = await supabaseAdmin().from("settings").select("value").eq("key", "pdpa").maybeSingle();
  const t = (data?.value as { consent_text?: string } | null)?.consent_text;
  return t || "ข้าพเจ้ายินยอมให้บริษัทเก็บรวบรวม ใช้ และเปิดเผยข้อมูลส่วนบุคคลในใบสมัครนี้ เพื่อวัตถุประสงค์ในการพิจารณารับเข้าทำงาน";
}

export async function getOpenJobs(): Promise<PublicJob[]> {
  const { data } = await supabaseAdmin().from("job_postings").select(COLS).eq("status", "open").order("updated_at", { ascending: false }).limit(200);
  const t = today();
  return ((data ?? []) as unknown as Raw[]).filter((j) => (!j.close_date || j.close_date >= t) && (!j.open_date || j.open_date <= t)).map(map);
}

export async function getJob(slug: string): Promise<PublicJob | null> {
  if (!/^[\w-]{4,40}$/.test(slug)) return null;
  const { data } = await supabaseAdmin().from("job_postings").select(COLS).eq("slug", slug).eq("status", "open").maybeSingle();
  if (!data) return null;
  const j = data as unknown as Raw;
  if (j.close_date && j.close_date < today()) return null;
  return map(j);
}
