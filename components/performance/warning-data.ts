import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getCompany } from "@/lib/settings";
import type { WarningCompany, WarningEmployee, WarningLetterData } from "./warning-letter";

/** Load a warning letter the signed-in user may see (RLS on warning_letters decides), plus header data */
export async function loadWarning(id: number): Promise<{ w: WarningLetterData & { id: number; employee_id: number }; emp: WarningEmployee; company: WarningCompany; issuer: string | null } | null> {
  const sb = await supabaseServer();
  const { data: w } = await sb.from("warning_letters").select("*").eq("id", id).maybeSingle();
  if (!w) return null;
  // the letter is visible to this user → read the header fields with the service role (employees cannot read other profiles)
  const admin = supabaseAdmin();
  const [{ data: e }, { data: p }, company] = await Promise.all([
    admin.from("v_directory").select("code, prefix, first_name, last_name, position_name, org_unit_name").eq("id", w.employee_id).maybeSingle(),
    w.issued_by ? admin.from("profiles").select("display_name, employee_id").eq("id", w.issued_by).maybeSingle() : Promise.resolve({ data: null }),
    getCompany(),
  ]);
  const prof = p as { display_name: string | null; employee_id: number | null } | null;
  let issuer = prof?.display_name || null;
  if (!issuer && prof?.employee_id) {
    const { data: ie } = await admin.from("v_directory").select("prefix, first_name, last_name, position_name").eq("id", prof.employee_id).maybeSingle();
    if (ie) issuer = `${ie.prefix ?? ""}${ie.first_name} ${ie.last_name}${ie.position_name ? ` (${ie.position_name})` : ""}`;
  }
  return {
    w,
    emp: (e as WarningEmployee) ?? { code: "-", prefix: null, first_name: "-", last_name: "", position_name: null, org_unit_name: null },
    company: { name: company.name, address: company.address, phone: company.phone, tax_id: company.tax_id, logo_url: company.logo_url },
    issuer,
  };
}
