"use client";
// Data loaders for payroll-based government reports (browser client → RLS: payroll view + employee_private view)

import { supabaseBrowser } from "@/lib/supabase/client";
import { fetchRows, fetchRowsIn } from "@/lib/payroll/fetch";

export type PayEntryLite = {
  id: number; period_id: number; employee_id: number; emp_code: string; emp_name: string; branch_id: number | null; org_unit_id: number | null;
  taxable_income: number; total_income: number; total_deduction: number; net_pay: number; tax: number; sso_wage: number; sso_employee: number; sso_employer: number; pvd_employee: number; pvd_employer: number;
};
export type EmpLite = { id: number; code: string; prefix: string | null; first_name: string; last_name: string; branch_id: number | null; org_unit_id: number | null; hire_date: string; resign_date: string | null };
export type PrivLite = { employee_id: number; national_id: string | null; tax_id: string | null; sso_no: string | null; ytd_open_year: number | null; ytd_open_income: number; ytd_open_tax: number; ytd_open_sso: number; ytd_open_pvd: number };
export type AddrLite = { employee_id: number; address_type: string; house_no: string | null; moo: string | null; village: string | null; soi: string | null; road: string | null; subdistrict: string | null; district: string | null; province: string | null; postcode: string | null };

const PAID_STATUSES = ["approved", "paid", "closed"];

/** entries of approved/paid/closed periods paid in a year (and optionally month) */
export async function loadPaidEntries(year: number, month?: number) {
  const sb = supabaseBrowser();
  let pq = sb.from("payroll_periods").select("id, name, pay_month, pay_date, status").eq("pay_year", year).in("status", PAID_STATUSES).order("pay_date");
  if (month) pq = pq.eq("pay_month", month);
  const { data: periods, error } = await pq;
  if (error) throw new Error(error.message);
  const ids = ((periods ?? []) as { id: number }[]).map((p) => p.id);
  const entries = ids.length
    ? await fetchRowsIn<PayEntryLite>(ids, (part) =>
        sb.from("payroll_entries").select("id, period_id, employee_id, emp_code, emp_name, branch_id, org_unit_id, taxable_income, total_income, total_deduction, net_pay, tax, sso_wage, sso_employee, sso_employer, pvd_employee, pvd_employer").in("period_id", part).order("id"),
      )
    : [];
  return { periods: (periods ?? []) as { id: number; name: string; pay_month: number; pay_date: string; status: string }[], entries };
}

export async function loadPeople(ids: number[], withAddress = false) {
  const sb = supabaseBrowser();
  const [emps, privs, addrs] = await Promise.all([
    fetchRowsIn<EmpLite>(ids, (part) => sb.from("employees").select("id, code, prefix, first_name, last_name, branch_id, org_unit_id, hire_date, resign_date").in("id", part).order("id")),
    fetchRowsIn<PrivLite>(ids, (part) => sb.from("employee_private").select("employee_id, national_id, tax_id, sso_no, ytd_open_year, ytd_open_income, ytd_open_tax, ytd_open_sso, ytd_open_pvd").in("employee_id", part).order("employee_id")).catch(() => [] as PrivLite[]),
    withAddress ? fetchRowsIn<AddrLite>(ids, (part) => sb.from("employee_addresses").select("employee_id, address_type, house_no, moo, village, soi, road, subdistrict, district, province, postcode").in("employee_id", part).order("id")) : Promise.resolve([] as AddrLite[]),
  ]);
  return { emp: new Map(emps.map((e) => [e.id, e])), priv: new Map(privs.map((p) => [p.employee_id, p])), addr: addrs };
}

export async function loadCompanyAndBranches() {
  const sb = supabaseBrowser();
  const [c, b] = await Promise.all([
    sb.from("settings").select("value").eq("key", "company").maybeSingle(),
    sb.from("branches").select("id, code, name, address, tax_branch_no, sso_account_no, sso_branch_no, is_head_office").order("code"),
  ]);
  return {
    company: ((c.data?.value ?? {}) as { name?: string; tax_id?: string; address?: string; branch_no?: string; phone?: string }),
    branches: (b.data ?? []) as { id: number; code: string; name: string; address: string | null; tax_branch_no: string | null; sso_account_no: string | null; sso_branch_no: string | null; is_head_office: boolean }[],
  };
}

export function addressText(a: AddrLite | undefined): string {
  if (!a) return "";
  return [a.house_no, a.moo && `ม.${a.moo}`, a.village, a.soi && `ซ.${a.soi}`, a.road && `ถ.${a.road}`, a.subdistrict && `ต.${a.subdistrict}`, a.district && `อ.${a.district}`, a.province && `จ.${a.province}`, a.postcode].filter(Boolean).join(" ");
}

export { fetchRows, fetchRowsIn };
