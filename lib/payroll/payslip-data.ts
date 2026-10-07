import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchRows, fetchRowsIn } from "./fetch";
import type { PayslipCompany, PayslipData } from "@/components/payroll/payslip";

const COLS =
  "id, period_id, employee_id, emp_code, emp_name, position_name, org_unit_id, bank_code, bank_account, pay_method, base_salary, salary_unit, work_days, paid_days, absent_days, late_minutes, total_income, total_deduction, net_pay, ytd_income, ytd_tax, ytd_sso, ytd_pvd, sso_employer, pvd_employer";

type EntryRow = PayslipData["entry"] & { id: number; period_id: number; employee_id: number; org_unit_id: number | null };

/** Load payslips with the caller's client (RLS decides what is visible). Filter by period and/or entry ids. */
export async function loadPayslips(sb: SupabaseClient, opts: { periodId?: number; entryIds?: number[] }): Promise<(PayslipData & { id: number; employee_id: number })[]> {
  const entries = await fetchRows<EntryRow>(() => {
    let q = sb.from("payroll_entries").select(COLS).order("emp_code").order("id");
    if (opts.periodId) q = q.eq("period_id", opts.periodId);
    if (opts.entryIds) q = q.in("id", opts.entryIds.length ? opts.entryIds : [-1]);
    return q;
  });
  if (!entries.length) return [];
  const periodIds = [...new Set(entries.map((e) => e.period_id))];
  const [periods, items, orgs] = await Promise.all([
    sb.from("payroll_periods").select("id, code, name, start_date, end_date, pay_date").in("id", periodIds),
    fetchRowsIn<{ entry_id: number; name: string; direction: number; amount: number; qty: number | null; rate: number | null; sort_order: number; id: number }>(entries.map((e) => e.id), (part) =>
      sb.from("payroll_entry_items").select("id, entry_id, name, direction, amount, qty, rate, sort_order").in("entry_id", part).order("entry_id").order("sort_order").order("id"),
    ),
    sb.from("org_units").select("id, name"),
  ]);
  const pBy = new Map(((periods.data ?? []) as { id: number; code: string; name: string; start_date: string; end_date: string; pay_date: string }[]).map((p) => [p.id, p]));
  const oBy = new Map(((orgs.data ?? []) as { id: number; name: string }[]).map((o) => [o.id, o.name]));
  const iBy = new Map<number, PayslipData["items"]>();
  for (const i of items) {
    const a = iBy.get(i.entry_id) ?? [];
    a.push(i);
    iBy.set(i.entry_id, a);
  }
  return entries
    .filter((e) => pBy.has(e.period_id))
    .map((e) => ({ id: e.id, employee_id: e.employee_id, period: pBy.get(e.period_id)!, entry: { ...e, org_name: e.org_unit_id ? oBy.get(e.org_unit_id) ?? null : null }, items: iBy.get(e.id) ?? [] }));
}

export async function loadCompany(sb: SupabaseClient): Promise<PayslipCompany> {
  const { data } = await sb.from("settings").select("value").eq("key", "company").maybeSingle();
  const v = (data?.value ?? {}) as PayslipCompany;
  return { ...v, name: v.name || "บริษัท" };
}
