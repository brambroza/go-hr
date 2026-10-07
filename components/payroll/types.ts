export type PeriodFull = {
  id: number; code: string; name: string; period_type: string; pay_year: number; pay_month: number; start_date: string; end_date: string;
  att_start_date: string | null; att_end_date: string | null; pay_date: string; status: "open" | "calculated" | "approved" | "paid" | "closed";
  payslip_published: boolean; calculated_at: string | null; approved_at: string | null; filter: Record<string, unknown> | null;
  include_salary: boolean; include_attendance: boolean; include_constants: boolean; include_tax: boolean; include_sso: boolean; include_pvd: boolean; note: string | null;
};

export type Entry = {
  id: number; period_id: number; employee_id: number; emp_code: string; emp_name: string; branch_id: number | null; org_unit_id: number | null; position_name: string | null;
  bank_code: string | null; bank_account: string | null; pay_method: string | null; base_salary: number; salary_unit: string;
  work_days: number; paid_days: number; absent_days: number; unpaid_leave_days: number; late_minutes: number; early_minutes: number; ot_minutes: Record<string, number>;
  total_income: number; total_deduction: number; taxable_income: number; sso_wage: number; sso_employee: number; sso_employer: number; pvd_employee: number; pvd_employer: number;
  tax: number; net_pay: number; ytd_income: number; ytd_tax: number; ytd_sso: number; ytd_pvd: number;
  calc_detail: {
    warnings?: string[];
    rates?: { daily: number; hourly: number };
    tax?: { projected_income: number; annual_tax: number; allowances: { code: string; name: string; amount: number }[]; net_income: number } | null;
    attendance?: { summary?: { missing_scan_days?: number; late_count?: number } | null; leave?: { by_type: Record<string, { name?: string; days: number; paid: number; unpaid: number }> } | null; range?: [string, string]; paid_holiday_days?: number; paid_leave_days?: number; work_minutes?: number };
    diligence_step?: number | null;
    regular_taxable?: number; irregular_taxable?: number;
  } | null;
};

export type EntryItem = {
  id: number; entry_id: number; pay_item_id: number | null; code: string | null; name: string; category: string | null; direction: number; qty: number | null; rate: number | null; amount: number; source: string | null; sort_order: number;
};

export const ENTRY_COLS =
  "id, period_id, employee_id, emp_code, emp_name, branch_id, org_unit_id, position_name, bank_code, bank_account, pay_method, base_salary, salary_unit, work_days, paid_days, absent_days, unpaid_leave_days, late_minutes, early_minutes, ot_minutes, total_income, total_deduction, taxable_income, sso_wage, sso_employee, sso_employer, pvd_employee, pvd_employer, tax, net_pay, ytd_income, ytd_tax, ytd_sso, ytd_pvd, calc_detail";
