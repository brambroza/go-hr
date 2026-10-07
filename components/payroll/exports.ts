"use client";
// Export helpers for a payroll period (client side; data already loaded under RLS)

import { downloadCsv } from "@/lib/csv";
import { BANK_NAMES, buildBankFile, downloadBuilt } from "@/lib/payroll/files";
import { fetchRowsIn } from "@/lib/payroll/fetch";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Entry, EntryItem, PeriodFull } from "./types";

export async function exportBankFile(format: string, period: PeriodFull, entries: Entry[]) {
  const sb = supabaseBrowser();
  const [{ data: pay }, { data: comp }] = await Promise.all([
    sb.from("settings").select("value").eq("key", "payroll").maybeSingle(),
    sb.from("settings").select("value").eq("key", "company").maybeSingle(),
  ]);
  const bank = ((pay?.value as Record<string, unknown>)?.company_bank ?? {}) as { bank_code?: string; account?: string; company_id?: string };
  const bankRows = entries.filter((e) => e.pay_method === "bank" && Number(e.net_pay) > 0);
  // account names come from employee_private (requires employee_private view); fall back to the payslip name
  const names = new Map<number, string>();
  try {
    const priv = await fetchRowsIn<{ employee_id: number; bank_account_name: string | null }>(bankRows.map((e) => e.employee_id), (part) =>
      sb.from("employee_private").select("employee_id, bank_account_name").in("employee_id", part).order("employee_id"),
    );
    for (const p of priv) if (p.bank_account_name) names.set(p.employee_id, p.bank_account_name);
  } catch {
    /* no permission → snapshot names */
  }
  const missing = bankRows.filter((e) => !e.bank_account);
  const f = buildBankFile(
    format,
    { company_name: String((comp?.value as Record<string, unknown>)?.name ?? ""), company_bank_code: bank.bank_code ?? "", company_account: bank.account ?? "", company_id: bank.company_id, effective_date: period.pay_date, batch_ref: period.code },
    bankRows.filter((e) => e.bank_account).map((e) => ({ emp_code: e.emp_code, name: names.get(e.employee_id) ?? e.emp_name.replace(/^(นาย|นางสาว|นาง)/, ""), bank_code: e.bank_code ?? "", account: e.bank_account ?? "", amount: Number(e.net_pay) })),
  );
  downloadBuilt(f);
  return { count: f.count, total: f.total, missing: missing.length };
}

export async function exportRegister(period: PeriodFull, entries: Entry[], orgName: (id: number | null) => string) {
  const sb = supabaseBrowser();
  const items = await fetchRowsIn<EntryItem>(entries.map((e) => e.id), (part) => sb.from("payroll_entry_items").select("entry_id, code, name, direction, amount, sort_order, id").in("entry_id", part).order("id"));
  // one column per pay item code (income first, then deductions)
  const cols = new Map<string, { name: string; dir: number }>();
  for (const i of items) if (i.code && !cols.has(i.code)) cols.set(i.code, { name: i.name.replace(/ — .*$/, "").replace(/ \(.*\)$/, ""), dir: i.direction });
  const order = [...cols.entries()].sort((a, b) => b[1].dir - a[1].dir);
  const byEntry = new Map<number, Map<string, number>>();
  for (const i of items) {
    const m = byEntry.get(i.entry_id) ?? new Map<string, number>();
    m.set(i.code ?? "", (m.get(i.code ?? "") ?? 0) + Number(i.amount));
    byEntry.set(i.entry_id, m);
  }
  const header = ["รหัส", "ชื่อ-สกุล", "หน่วยงาน", "ตำแหน่ง", "ฐานเงินเดือน", "วันทำงาน", "ขาด", "ลาไม่รับค่าจ้าง", ...order.map(([c, v]) => `${v.dir === 1 ? "+" : "-"}${v.name} (${c})`), "รวมรายได้", "รวมรายการหัก", "เงินได้สุทธิ", "สปส.นายจ้าง", "PVD นายจ้าง", "ช่องทางจ่าย"];
  const body = entries.map((e) => {
    const m = byEntry.get(e.id) ?? new Map();
    return [e.emp_code, e.emp_name, orgName(e.org_unit_id), e.position_name ?? "", e.base_salary, e.work_days, e.absent_days, e.unpaid_leave_days, ...order.map(([c]) => (m.get(c) ? Number(m.get(c)).toFixed(2) : "")), e.total_income, e.total_deduction, e.net_pay, e.sso_employer, e.pvd_employer, e.pay_method === "bank" ? `โอน ${BANK_NAMES[e.bank_code ?? ""] ?? e.bank_code ?? ""}` : e.pay_method === "cash" ? "เงินสด" : "เช็ค"];
  });
  const sum = (f: (e: Entry) => number) => entries.reduce((s, e) => s + Number(f(e)), 0).toFixed(2);
  const totals = ["", "รวม", "", "", "", "", "", "", ...order.map(([c]) => entries.reduce((s, e) => s + (byEntry.get(e.id)?.get(c) ?? 0), 0).toFixed(2)), sum((e) => e.total_income), sum((e) => e.total_deduction), sum((e) => e.net_pay), sum((e) => e.sso_employer), sum((e) => e.pvd_employer), ""];
  downloadCsv(`payroll-register-${period.code}.csv`, [[`ทะเบียนเงินเดือน ${period.name}`], header, ...body, totals]);
}

/** cash payout list incl. banknote breakdown */
export function exportCashList(period: PeriodFull, entries: Entry[]) {
  const notes = [1000, 500, 100, 50, 20, 10, 5, 2, 1];
  const cash = entries.filter((e) => e.pay_method !== "bank" || !e.bank_account);
  const rows = cash.map((e) => {
    let left = Math.floor(Number(e.net_pay));
    const counts = notes.map((n) => {
      const c = Math.floor(left / n);
      left -= c * n;
      return c || "";
    });
    const satang = Math.round((Number(e.net_pay) % 1) * 100);
    return [e.emp_code, e.emp_name, e.pay_method === "cheque" ? "เช็ค" : "เงินสด", Number(e.net_pay).toFixed(2), ...counts, satang || "", ""];
  });
  downloadCsv(`cash-payout-${period.code}.csv`, [
    [`รายชื่อรับเงินสด ${period.name}`],
    ["รหัส", "ชื่อ-สกุล", "วิธีจ่าย", "จำนวนเงิน", ...notes.map((n) => `${n}`), "สตางค์", "ลายมือชื่อผู้รับเงิน"],
    ...rows,
    ["", "รวม", "", cash.reduce((s, e) => s + Number(e.net_pay), 0).toFixed(2)],
  ]);
  return cash.length;
}
