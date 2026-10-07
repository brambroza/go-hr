/**
 * Finish the demo company after seed-demo.ts + seed-talent-demo.sql:
 * calculates attendance for the last 45 days and runs last month's payroll (approved + payslips published).
 *   npx tsx --tsconfig scripts/tsconfig.json scripts/seed-demo-finish.ts
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "./env";

loadEnv();

async function main() {
  const { recalcAttendance } = await import("../lib/attendance/server");
  const { calculatePeriodUnchecked } = await import("../lib/payroll/server");
  const sb = createClient(process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

  const today = new Date();
  const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const from = ymd(new Date(today.getTime() - 46 * 86400000));
  const r = await recalcAttendance({ from, to: ymd(today) });
  console.log(`✓ attendance: ${r.days} employee-days`);

  const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const last = new Date(today.getFullYear(), today.getMonth(), 0);
  const months = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  const y = first.getFullYear();
  const m = first.getMonth() + 1;
  const code = `PR${y}${String(m).padStart(2, "0")}-1`;
  const existing = await sb.from("payroll_periods").select("id").eq("code", code).maybeSingle();
  let periodId = existing.data?.id as number | undefined;
  if (!periodId) {
    const ins = await sb
      .from("payroll_periods")
      .insert({ code, name: `เงินเดือน ${months[m - 1]} ${y + 543}`, period_type: "monthly", pay_year: y, pay_month: m, start_date: ymd(first), end_date: ymd(last), att_start_date: ymd(first), att_end_date: ymd(last), pay_date: ymd(last) })
      .select("id")
      .single();
    if (ins.error) throw ins.error;
    periodId = ins.data.id as number;
  }
  // opening year-to-date balances (Jan → month before the demo period) so withholding tax looks like a real mid-year company
  const { annualTax, ssoContribution } = await import("../lib/payroll/tax");
  const before = m - 1;
  if (before > 0) {
    const { data: privs } = await sb.from("employee_private").select("employee_id, salary, salary_unit, pvd_enabled, pvd_employee_rate, employees!inner(hire_date)");
    for (const p of (privs ?? []) as unknown as { employee_id: number; salary: number; salary_unit: string; pvd_enabled: boolean; pvd_employee_rate: number; employees: { hire_date: string } }[]) {
      if (p.employees.hire_date > `${y}-01-01`) continue;
      const monthly = p.salary_unit === "day" ? Number(p.salary) * 26 : Number(p.salary);
      const sso = ssoContribution(monthly, `${y}-01-31`).employee;
      const pvd = p.pvd_enabled ? Math.round(monthly * Number(p.pvd_employee_rate)) / 100 : 0;
      const yearTax = annualTax({ annualIncome: monthly * 12, annualSso: sso * 12, annualPvd: pvd * 12, deductions: [] }).tax;
      await sb.from("employee_private").update({
        ytd_open_year: y, ytd_open_income: monthly * before, ytd_open_sso: sso * before, ytd_open_pvd: pvd * before,
        ytd_open_tax: Math.round((yearTax / 12) * before * 100) / 100,
      }).eq("employee_id", p.employee_id);
    }
    console.log(`✓ opening YTD balances for ${before} months`);
  }
  await sb.from("payroll_periods").update({ status: "calculated" }).eq("id", periodId).in("status", ["approved", "paid", "closed"]);
  const calc = await calculatePeriodUnchecked(periodId);
  console.log(`✓ payroll ${code}:`, JSON.stringify(calc).slice(0, 200));
  await sb.from("payroll_periods").update({ status: "approved", approved_at: new Date().toISOString(), payslip_published: true }).eq("id", periodId);
  console.log("✓ period approved and payslips published");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
