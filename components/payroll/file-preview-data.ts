"use client";
// Load real data of one payroll period as template variables (for the file-format editor preview).
// Same mapping as the export pages (bank modal / สปส.1-10 / ภ.ง.ด.1) so the preview equals the real file.

import { supabaseBrowser } from "@/lib/supabase/client";
import { fetchRows, fetchRowsIn } from "@/lib/payroll/fetch";
import { DEFAULT_SSO_CONFIG, ssoLimits, type SsoConfig } from "@/lib/payroll/tax";
import { bankFileData, rdFileData, ssoFileData, type BankRow, type FileKind, type FileLayout, type Issue, type Vars } from "@/lib/payroll/files";

type Entry = { employee_id: number; emp_code: string; emp_name: string; branch_id: number | null; bank_code: string | null; bank_account: string | null; pay_method: string | null; net_pay: number; taxable_income: number; tax: number; sso_wage: number; sso_employee: number; sso_employer: number; pvd_employee: number };
type Emp = { id: number; code: string; prefix: string | null; first_name: string; last_name: string; email: string | null; phone: string | null };
type Priv = { employee_id: number; national_id: string | null; tax_id: string | null; sso_no: string | null; bank_account_name: string | null; bank_branch: string | null; tax_paid_by_employer: boolean };
type Addr = { employee_id: number; address_type: string; house_no: string | null; moo: string | null; village: string | null; soi: string | null; road: string | null; subdistrict: string | null; district: string | null; province: string | null; postcode: string | null };

export type PeriodLite = { id: number; code: string; name: string; pay_year: number; pay_month: number; pay_date: string };

export async function loadPeriods(): Promise<PeriodLite[]> {
  const { data } = await supabaseBrowser().from("payroll_periods").select("id, code, name, pay_year, pay_month, pay_date").order("pay_date", { ascending: false }).limit(24);
  return (data ?? []) as PeriodLite[];
}

/** build {file, rows} for a layout from one period's data */
export async function loadPreviewData(layout: FileLayout, period: PeriodLite): Promise<{ data: { file: Vars; rows: Vars[] }; issues: Issue[] }> {
  const sb = supabaseBrowser();
  const entries = await fetchRows<Entry>(() =>
    sb.from("payroll_entries").select("employee_id, emp_code, emp_name, branch_id, bank_code, bank_account, pay_method, net_pay, taxable_income, tax, sso_wage, sso_employee, sso_employer, pvd_employee").eq("period_id", period.id).order("emp_code").order("id"),
  );
  const ids = entries.map((e) => e.employee_id);
  const [emps, privs, addrs, settings, branches] = await Promise.all([
    fetchRowsIn<Emp>(ids, (p) => sb.from("employees").select("id, code, prefix, first_name, last_name, email, phone").in("id", p).order("id")),
    fetchRowsIn<Priv>(ids, (p) => sb.from("employee_private").select("employee_id, national_id, tax_id, sso_no, bank_account_name, bank_branch, tax_paid_by_employer").in("employee_id", p).order("employee_id")).catch(() => [] as Priv[]),
    fetchRowsIn<Addr>(ids, (p) => sb.from("employee_addresses").select("employee_id, address_type, house_no, moo, village, soi, road, subdistrict, district, province, postcode").in("employee_id", p).order("id")).catch(() => [] as Addr[]),
    sb.from("settings").select("key, value").in("key", ["company", "payroll", "sso_config"]),
    sb.from("branches").select("id, name, tax_branch_no, sso_account_no, sso_branch_no, is_head_office").order("code"),
  ]);
  const st = new Map(((settings.data ?? []) as { key: string; value: Record<string, unknown> }[]).map((s) => [s.key, s.value]));
  const company = (st.get("company") ?? {}) as { name?: string; name_en?: string; tax_id?: string; branch_no?: string };
  const pay = (st.get("payroll") ?? {}) as { company_bank?: { bank_code?: string; account?: string; branch?: string; company_id?: string; sender_name?: string } };
  const cfg = { ...DEFAULT_SSO_CONFIG, ...((st.get("sso_config") ?? {}) as Partial<SsoConfig>) };
  const emp = new Map(emps.map((e) => [e.id, e]));
  const priv = new Map(privs.map((p) => [p.employee_id, p]));
  const addr = new Map<number, Addr>();
  for (const a of addrs) if (!addr.has(a.employee_id) || a.address_type === "registered") addr.set(a.employee_id, a);
  const comp = { name: company.name ?? "", name_en: company.name_en, tax_id: company.tax_id ?? "" };
  const kind: FileKind = layout.kind;

  if (kind === "bank") {
    const b = pay.company_bank ?? {};
    const rows: BankRow[] = entries.map((e) => {
      const m = emp.get(e.employee_id);
      const p = priv.get(e.employee_id);
      return { employee_id: e.employee_id, emp_code: e.emp_code, prefix: m?.prefix, first_name: m?.first_name ?? e.emp_name, last_name: m?.last_name ?? "", national_id: p?.national_id, email: m?.email, phone: m?.phone, account_name: p?.bank_account_name, bank_code: e.bank_code, branch_code: p?.bank_branch, account: e.bank_account, amount: Number(e.net_pay), pay_method: e.pay_method ?? "bank" };
    });
    return bankFileData(layout, { company: comp, company_bank_code: b.bank_code ?? "", company_bank_branch: b.branch, company_account: b.account ?? "", company_bank_id: b.company_id, sender_name: b.sender_name, effective_date: period.pay_date, batch_ref: period.code, period_code: period.code, pay_date: period.pay_date }, rows);
  }
  const brs = (branches.data ?? []) as { id: number; name: string; tax_branch_no: string | null; sso_account_no: string | null; sso_branch_no: string | null; is_head_office: boolean }[];
  const hq = brs.find((b) => b.is_head_office) ?? brs[0];
  if (kind === "sso") {
    const inBranch = entries.filter((e) => (!hq || e.branch_id === hq.id) && (Number(e.sso_employee) > 0 || Number(e.sso_employer) > 0));
    const lim = ssoLimits(period.pay_date, cfg);
    return ssoFileData(
      { company: comp, branch_name: hq?.name, account_no: hq?.sso_account_no ?? "", branch_no: hq?.sso_branch_no ?? "000000", pay_date: period.pay_date, year: period.pay_year, month: period.pay_month, rate: cfg.rate_employee, employer_rate: cfg.rate_employer, ceiling: lim.ceiling, floor: lim.floor },
      inBranch.map((e) => {
        const m = emp.get(e.employee_id);
        const p = priv.get(e.employee_id);
        return { employee_id: e.employee_id, emp_code: e.emp_code, sso_no: p?.sso_no, national_id: p?.national_id, prefix: m?.prefix ?? null, first_name: m?.first_name ?? "", last_name: m?.last_name ?? "", wage: Number(e.sso_wage), employee: Number(e.sso_employee), employer: Number(e.sso_employer) };
      }),
    );
  }
  const rk = kind === "pnd1" ? "pnd1" : "pnd1a";
  return rdFileData(
    { company: comp, kind: rk, year: period.pay_year, month: period.pay_month, branch_no: company.branch_no ?? "00000", requireAddress: layout.key.includes("_v2_") },
    entries
      .filter((e) => Number(e.taxable_income) > 0 || Number(e.tax) > 0)
      .map((e) => {
        const m = emp.get(e.employee_id);
        const p = priv.get(e.employee_id);
        return { employee_id: e.employee_id, emp_code: e.emp_code, pin: p?.tax_id || p?.national_id || "", prefix: m?.prefix ?? null, first_name: m?.first_name ?? "", last_name: m?.last_name ?? "", pay_date: period.pay_date, income: Number(e.taxable_income), tax: Number(e.tax), condition: p?.tax_paid_by_employer ? 2 : 1, address: addr.get(e.employee_id), sso: Number(e.sso_employee), pvd: Number(e.pvd_employee) };
      }),
  );
}
