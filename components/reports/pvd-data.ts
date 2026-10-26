"use client";
// PVD contributions of one or more payroll periods, one row per member (several periods of a month are summed).
// Shared by the PVD report and the file-format editor preview, so the preview equals the real file.

import { supabaseBrowser } from "@/lib/supabase/client";
import { fetchRowsIn } from "@/lib/payroll/fetch";
import type { PvdRow } from "@/lib/payroll/files";

type Entry = { employee_id: number; emp_code: string; branch_id: number | null; pvd_employee: number; pvd_employer: number; calc_detail: { pvd_base?: number } | null };
type Emp = { id: number; prefix: string | null; first_name: string; last_name: string };
type Priv = { employee_id: number; national_id: string | null; pvd_no: string | null; pvd_employee_rate: number | null; pvd_employer_rate: number | null };

export async function loadPvdRows(periodIds: number[], branchId?: string): Promise<(PvdRow & { branch_id: number | null })[]> {
  if (!periodIds.length) return [];
  const sb = supabaseBrowser();
  const entries = (
    await fetchRowsIn<Entry>(periodIds, (part) => sb.from("payroll_entries").select("id, employee_id, emp_code, branch_id, pvd_employee, pvd_employer, calc_detail").in("period_id", part).order("id"))
  ).filter((e) => (Number(e.pvd_employee) || 0) + (Number(e.pvd_employer) || 0) > 0 && (!branchId || String(e.branch_id) === branchId));
  const ids = [...new Set(entries.map((e) => Number(e.employee_id)))];
  const [emps, privs] = await Promise.all([
    fetchRowsIn<Emp>(ids, (p) => sb.from("employees").select("id, prefix, first_name, last_name").in("id", p).order("id")),
    fetchRowsIn<Priv>(ids, (p) => sb.from("employee_private").select("employee_id, national_id, pvd_no, pvd_employee_rate, pvd_employer_rate").in("employee_id", p).order("employee_id")).catch(() => [] as Priv[]),
  ]);
  const emp = new Map(emps.map((e) => [e.id, e]));
  const priv = new Map(privs.map((p) => [Number(p.employee_id), p]));
  const by = new Map<number, PvdRow & { branch_id: number | null }>();
  for (const e of entries) {
    const id = Number(e.employee_id);
    const m = emp.get(id);
    const p = priv.get(id);
    const r = by.get(id) ?? {
      employee_id: id, emp_code: e.emp_code, branch_id: e.branch_id, member_no: p?.pvd_no ?? null, national_id: p?.national_id ?? null, prefix: m?.prefix ?? null,
      first_name: m?.first_name ?? "", last_name: m?.last_name ?? "", wage: 0, employee_rate: Number(p?.pvd_employee_rate) || 0, employer_rate: Number(p?.pvd_employer_rate) || 0, employee: 0, employer: 0,
    };
    r.wage += Number(e.calc_detail?.pvd_base) || 0;
    r.employee += Number(e.pvd_employee) || 0;
    r.employer += Number(e.pvd_employer) || 0;
    by.set(id, r);
  }
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return [...by.values()].map((r) => ({ ...r, wage: r2(r.wage), employee: r2(r.employee), employer: r2(r.employer) })).sort((a, b) => a.emp_code.localeCompare(b.emp_code));
}
