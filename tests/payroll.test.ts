import { test } from "node:test";
import assert from "node:assert/strict";
import { computeEntry, roundMoney, type PayItemDef, type EmployeePayInput } from "../lib/payroll/engine";

let id = 1;
const mk = (code: string, system_key: string | null, direction: 1 | -1, o: Partial<PayItemDef> = {}): PayItemDef =>
  ({ id: id++, code, name: code, category: "auto", direction, is_taxable: true, is_sso: false, is_pvd_base: false, is_regular: true, calc_type: "fixed", rate: null, system_key, ...o });
const items: Record<string, PayItemDef> = {
  salary: mk("SALARY", "salary", 1, { is_sso: true, is_pvd_base: true }),
  ot_1_5: mk("OT15", "ot_1_5", 1), ot_1: mk("OT1", "ot_1", 1), ot_2: mk("OT2", "ot_2", 1), ot_3: mk("OT3", "ot_3", 1),
  absent: mk("ABSENT", "absent", -1, { is_sso: true, is_pvd_base: true }), late: mk("LATE", "late", -1, { is_sso: true, is_pvd_base: true }),
  early: mk("EARLY", "early", -1, { is_sso: true }), unpaid_leave: mk("UNPAID", "unpaid_leave", -1, { is_sso: true }),
  sso: mk("SSO", "sso", -1, { is_taxable: false }), pvd: mk("PVD", "pvd", -1, { is_taxable: false }), tax: mk("TAX", "tax", -1, { is_taxable: false }),
  advance: mk("ADVANCE", "advance", -1, { is_taxable: false }),
};
const position = mk("POSITION", null, 1, { category: "constant", is_sso: true });
const bonus = mk("BONUS", "bonus", 1, { category: "income", is_regular: false });
const loan = mk("LOAN", "loan", -1, { category: "loan", is_taxable: false });

const base = (o: Partial<EmployeePayInput> = {}): EmployeePayInput => ({
  employee: { id: 1, employee_type: "monthly", hire_date: "2020-01-01", resign_date: null },
  priv: { salary: 30000, salary_unit: "month", sso_enabled: true, pvd_enabled: false, pvd_employee_rate: 0, pvd_employer_rate: 0, tax_method: "annualized", tax_fixed_rate: null },
  period: { pay_year: 2026, pay_month: 10, start_date: "2026-10-01", end_date: "2026-10-31", pay_date: "2026-10-31", period_type: "monthly",
    include_salary: true, include_attendance: true, include_constants: true, include_tax: true, include_sso: true, include_pvd: true },
  att: { work_days: 21, paid_holiday_days: 0, paid_leave_days: 0, unpaid_leave_days: 0, absent_days: 0, late_minutes: 0, early_minutes: 0, work_minutes: 0, ot_minutes: {}, late_count: 0 },
  items, constants: [], adjustments: [], loans: [], advances: [], guarantee: null,
  ytd: { regular: 270000, irregular: 0, tax: 1481.25, sso: 7875, pvd: 0 },
  monthPrev: { regular: 0, irregular: 0, tax: 0, sso_wage: 0, sso_employee: 0, sso_employer: 0 },
  deductions: [], ...o,
});

test("monthly with absent, late, OT, allowance and loan", () => {
  const r = computeEntry(base({
    att: { work_days: 20, paid_holiday_days: 0, paid_leave_days: 0, unpaid_leave_days: 0, absent_days: 1, late_minutes: 30, early_minutes: 0, work_minutes: 0, ot_minutes: { "1.5": 120 }, late_count: 2 },
    constants: [{ item: position, amount: 2000 }],
    loans: [{ item: loan, amount: 1000, source_id: 9 }],
  }));
  const get = (c: string) => r.lines.find((l) => l.code === c)?.amount ?? 0;
  assert.equal(get("SALARY"), 30000);
  assert.equal(get("ABSENT"), 1000);
  assert.equal(get("LATE"), 62.5);
  assert.equal(get("OT15"), 375);
  assert.equal(get("POSITION"), 2000);
  assert.equal(r.taxable_income, 31312.5);
  assert.equal(r.sso_employee, 875);
  assert.equal(r.sso_employer, 875);
  assert.equal(get("LOAN"), 1000);
  assert.equal(r.net_pay, r.total_income - r.total_deduction);
  assert.ok(r.tax > 0);
});

test("new joiner prorated by calendar days", () => {
  const r = computeEntry(base({ employee: { id: 1, employee_type: "monthly", hire_date: "2026-10-16", resign_date: null }, ytd: { regular: 0, irregular: 0, tax: 0, sso: 0, pvd: 0 } }));
  assert.equal(r.lines.find((l) => l.code === "SALARY")!.amount, 16000); // 30000/30 × 16
});

test("daily worker paid for days worked + holidays", () => {
  const r = computeEntry(base({ priv: { salary: 400, salary_unit: "day", sso_enabled: true, pvd_enabled: false, pvd_employee_rate: 0, pvd_employer_rate: 0, tax_method: "annualized", tax_fixed_rate: null },
    att: { work_days: 24, paid_holiday_days: 1, paid_leave_days: 0, unpaid_leave_days: 0, absent_days: 1, late_minutes: 0, early_minutes: 0, work_minutes: 0, ot_minutes: { "2": 480 }, late_count: 0 },
    ytd: { regular: 0, irregular: 0, tax: 0, sso: 0, pvd: 0 } }));
  assert.equal(r.lines.find((l) => l.code === "SALARY")!.amount, 10000);
  assert.equal(r.lines.find((l) => l.code === "OT2")!.amount, 800); // 8h × 50 × 2
  assert.equal(r.lines.find((l) => l.code === "ABSENT"), undefined); // daily: absence just not paid
  assert.equal(r.sso_employee, 500);
  assert.equal(r.tax, 0);
});

test("bonus taxed in the month paid; PVD 5%", () => {
  const r = computeEntry(base({ priv: { salary: 50000, salary_unit: "month", sso_enabled: true, pvd_enabled: true, pvd_employee_rate: 5, pvd_employer_rate: 5, tax_method: "annualized", tax_fixed_rate: null },
    adjustments: [{ item: bonus, amount: 100000 }], ytd: { regular: 0, irregular: 0, tax: 0, sso: 0, pvd: 0 },
    period: { pay_year: 2026, pay_month: 1, start_date: "2026-01-01", end_date: "2026-01-31", pay_date: "2026-01-31", period_type: "monthly",
      include_salary: true, include_attendance: true, include_constants: true, include_tax: true, include_sso: true, include_pvd: true } }));
  assert.equal(r.pvd_employee, 2500);
  assert.equal(r.pvd_employer, 2500);
  const noBonus = computeEntry(base({ priv: { salary: 50000, salary_unit: "month", sso_enabled: true, pvd_enabled: true, pvd_employee_rate: 5, pvd_employer_rate: 5, tax_method: "annualized", tax_fixed_rate: null },
    ytd: { regular: 0, irregular: 0, tax: 0, sso: 0, pvd: 0 },
    period: { pay_year: 2026, pay_month: 1, start_date: "2026-01-01", end_date: "2026-01-31", pay_date: "2026-01-31", period_type: "monthly",
      include_salary: true, include_attendance: true, include_constants: true, include_tax: true, include_sso: true, include_pvd: true } }));
  assert.ok(r.tax - noBonus.tax > 9000 && r.tax - noBonus.tax < 20001, `bonus tax ${r.tax - noBonus.tax}`);
});

test("second period in same month does not double SSO", () => {
  const r = computeEntry(base({ period: { pay_year: 2026, pay_month: 10, start_date: "2026-10-16", end_date: "2026-10-31", pay_date: "2026-10-31", period_type: "semi_monthly",
      include_salary: true, include_attendance: true, include_constants: true, include_tax: true, include_sso: true, include_pvd: true },
    monthPrev: { regular: 15000, irregular: 0, tax: 100, sso_wage: 15000, sso_employee: 750, sso_employer: 750 } }));
  assert.equal(r.sso_employee, 125);
});

test("round_mode baht: every line and the net pay are whole baht", () => {
  const r = computeEntry(base({
    priv: { salary: 30001, salary_unit: "month", sso_enabled: true, pvd_enabled: false, pvd_employee_rate: 0, pvd_employer_rate: 0, tax_method: "annualized", tax_fixed_rate: null },
    att: { work_days: 20, paid_holiday_days: 0, paid_leave_days: 0, unpaid_leave_days: 0, absent_days: 0, late_minutes: 7, early_minutes: 0, work_minutes: 0, ot_minutes: {}, late_count: 1 },
    cfg: { round_mode: "baht" },
  }));
  for (const l of r.lines) assert.equal(l.amount, Math.round(l.amount), `${l.code} = ${l.amount}`);
  assert.equal(r.net_pay, Math.round(r.net_pay));
  // entry fields that feed ภ.ง.ด.1 / PVD files must equal the printed lines
  const lineOf = (c: string) => r.lines.find((l) => l.code === c)?.amount ?? 0;
  assert.equal(r.tax, lineOf("TAX"));
  assert.equal(r.pvd_employee, lineOf("PVD"));
  assert.equal(r.sso_employee, lineOf("SSO"));
  const satang = computeEntry(base({
    priv: { salary: 30001, salary_unit: "month", sso_enabled: true, pvd_enabled: false, pvd_employee_rate: 0, pvd_employer_rate: 0, tax_method: "annualized", tax_fixed_rate: null },
    att: { work_days: 20, paid_holiday_days: 0, paid_leave_days: 0, unpaid_leave_days: 0, absent_days: 0, late_minutes: 7, early_minutes: 0, work_minutes: 0, ot_minutes: {}, late_count: 1 },
  }));
  assert.notEqual(satang.lines.find((l) => l.code === "LATE")?.amount, Math.round(satang.lines.find((l) => l.code === "LATE")?.amount ?? 0), "satang keeps 2 decimals");
});

test("roundMoney: satang keeps 2 decimals, baht rounds half up", () => {
  assert.equal(roundMoney(12.345, "satang"), 12.35);
  assert.equal(roundMoney(12.5, "baht"), 13);
  assert.equal(roundMoney(12.49, undefined), 12.49);
});
