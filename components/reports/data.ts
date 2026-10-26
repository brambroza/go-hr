"use client";
// Data loaders for payroll-based government reports (browser client → RLS: payroll view + employee_private view)

import { supabaseBrowser } from "@/lib/supabase/client";
import { fetchRows, fetchRowsIn } from "@/lib/payroll/fetch";

export type PayEntryLite = {
  id: number; period_id: number; employee_id: number; emp_code: string; emp_name: string; branch_id: number | null; org_unit_id: number | null;
  taxable_income: number; total_income: number; total_deduction: number; net_pay: number; tax: number; sso_wage: number; sso_employee: number; sso_employer: number; pvd_employee: number; pvd_employer: number;
};
export type EmpLite = { id: number; code: string; prefix: string | null; first_name: string; last_name: string; branch_id: number | null; org_unit_id: number | null; hire_date: string; resign_date: string | null };
export type PrivLite = { employee_id: number; national_id: string | null; tax_id: string | null; sso_no: string | null; tax_paid_by_employer?: boolean; ytd_open_year: number | null; ytd_open_income: number; ytd_open_tax: number; ytd_open_sso: number; ytd_open_pvd: number };
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
    fetchRowsIn<PrivLite>(ids, (part) => sb.from("employee_private").select("employee_id, national_id, tax_id, sso_no, tax_paid_by_employer, ytd_open_year, ytd_open_income, ytd_open_tax, ytd_open_sso, ytd_open_pvd").in("employee_id", part).order("employee_id")).catch(() => [] as PrivLite[]),
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

// ------------------------------------------------------------------------------------- withholding tax rows
export type TaxRow = {
  employee_id: number; emp?: EmpLite; priv?: PrivLite; addr?: AddrLite;
  income: number; tax: number; sso: number; pvd: number; pay_date: string;
  /** latest pay date of the year (or month) for this employee — also kept in year mode, where pay_date is 31 Dec */
  last_pay_date: string;
  /** เงื่อนไขการหักภาษี: 1 หัก ณ ที่จ่าย, 2 ออกให้ตลอดไป (tax_paid_by_employer) */
  condition: 1 | 2 | 3;
  /** ลำดับที่ in the ใบแนบ (1-based, continuous over all sheets) */
  seq: number;
};

/**
 * Rows for ภ.ง.ด.1 (month) / ภ.ง.ด.1ก + 50 ทวิ (year): sum of approved/paid/closed periods per employee,
 * + opening YTD balances for the annual form. Sorted by employee code; `seq` numbers rows with income or tax
 * so ลำดับที่ in ภ.ง.ด.1ก and in the 50 ทวิ certificate are the same.
 */
export async function loadTaxRows(year: number, month: number | undefined, branchId: string, withAddress = false) {
  const { periods, entries } = await loadPaidEntries(year, month);
  const payDate = new Map(periods.map((p) => [p.id, p.pay_date]));
  const by = new Map<number, TaxRow>();
  for (const e of entries) {
    if (branchId && String(e.branch_id) !== branchId) continue;
    const r = by.get(e.employee_id) ?? { employee_id: e.employee_id, income: 0, tax: 0, sso: 0, pvd: 0, pay_date: "", last_pay_date: "", condition: 1 as const, seq: 0 };
    r.income += Number(e.taxable_income);
    r.tax += Number(e.tax);
    r.sso += Number(e.sso_employee);
    r.pvd += Number(e.pvd_employee);
    const pd = payDate.get(e.period_id) ?? "";
    if (pd > r.pay_date) r.pay_date = pd;
    if (pd > r.last_pay_date) r.last_pay_date = pd;
    by.set(e.employee_id, r);
  }
  const people = await loadPeople([...by.keys()], withAddress);
  const addrBy = new Map<number, AddrLite>();
  for (const a of people.addr) if (!addrBy.has(a.employee_id) || a.address_type === "registered") addrBy.set(a.employee_id, a);
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const list = [...by.values()].map((r) => {
    const priv = people.priv.get(r.employee_id);
    if (!month && priv && Number(priv.ytd_open_year) === year) {
      r.income += Number(priv.ytd_open_income);
      r.tax += Number(priv.ytd_open_tax);
      r.sso += Number(priv.ytd_open_sso);
      r.pvd += Number(priv.ytd_open_pvd);
    }
    return {
      ...r, emp: people.emp.get(r.employee_id), priv, addr: addrBy.get(r.employee_id),
      income: r2(r.income), tax: r2(r.tax), sso: r2(r.sso), pvd: r2(r.pvd),
      pay_date: month ? r.pay_date : `${year}-12-31`,
      condition: (priv?.tax_paid_by_employer ? 2 : 1) as 1 | 2 | 3,
    };
  });
  list.sort((a, b) => (a.emp?.code ?? "").localeCompare(b.emp?.code ?? ""));
  let seq = 0;
  for (const r of list) r.seq = r.income > 0 || r.tax > 0 ? ++seq : 0;
  return { rows: list, periodCount: periods.length };
}
