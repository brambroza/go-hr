import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { computeEntry, type PayItemDef, type EmployeePayInput } from "../lib/payroll/engine";
import { adjustmentKey, commissionKey, debtKey, inputsChanged, leaveUnitsByDate, prevEmployerApplies, regularWorkMinutes, workedDayUnits } from "../lib/payroll/period-rules";

let id = 1;
const mk = (code: string, system_key: string | null, direction: 1 | -1, o: Partial<PayItemDef> = {}): PayItemDef =>
  ({ id: id++, code, name: code, category: "auto", direction, is_taxable: true, is_sso: false, is_pvd_base: false, is_regular: true, calc_type: "fixed", rate: null, system_key, ...o });
const items: Record<string, PayItemDef> = {
  salary: mk("SALARY", "salary", 1, { is_sso: true }), ot_2: mk("OT2", "ot_2", 1), ot_1_5: mk("OT15", "ot_1_5", 1),
  absent: mk("ABSENT", "absent", -1), late: mk("LATE", "late", -1), early: mk("EARLY", "early", -1), unpaid_leave: mk("UNPAID", "unpaid_leave", -1),
  sso: mk("SSO", "sso", -1, { is_taxable: false }), tax: mk("TAX", "tax", -1, { is_taxable: false }),
};
const period = { pay_year: 2026, pay_month: 10, start_date: "2026-10-01", end_date: "2026-10-31", pay_date: "2026-10-31", period_type: "monthly",
  include_salary: true, include_attendance: true, include_constants: true, include_tax: false, include_sso: false, include_pvd: false };
const noAtt = { work_days: 0, paid_holiday_days: 0, paid_leave_days: 0, unpaid_leave_days: 0, absent_days: 0, late_minutes: 0, early_minutes: 0, work_minutes: 0, ot_minutes: {}, late_count: 0 };
const priv = (salary: number, salary_unit: "month" | "day" | "hour") =>
  ({ salary, salary_unit, sso_enabled: false, pvd_enabled: false, pvd_employee_rate: 0, pvd_employer_rate: 0, tax_method: "none" as const, tax_fixed_rate: null });
const input = (o: Partial<EmployeePayInput>): EmployeePayInput => ({
  employee: { id: 1, employee_type: "daily", hire_date: "2020-01-01", resign_date: null }, priv: priv(400, "day"), period, att: noAtt, items,
  constants: [], adjustments: [], loans: [], advances: [], guarantee: null,
  ytd: { regular: 0, irregular: 0, tax: 0, sso: 0, pvd: 0 }, monthPrev: { regular: 0, irregular: 0, tax: 0, sso_wage: 0, sso_employee: 0, sso_employer: 0 }, deductions: [], ...o,
});
const amount = (r: ReturnType<typeof computeEntry>, code: string) => r.lines.find((l) => l.code === code)?.amount ?? 0;
const day = (work_date: string, day_type: string, work_minutes: number) => ({ work_date, day_type, work_minutes });

// ---- daily ---------------------------------------------------------------------------------------------
test("daily: a half-day paid leave is one day of pay, not one and a half", () => {
  const days = [day("2026-10-01", "work", 480), day("2026-10-02", "work", 240)];
  const leave = leaveUnitsByDate([{ date: "2026-10-02", days: 0.5 }]);
  const worked = workedDayUnits(days, leave);
  assert.equal(worked, 1.5);
  const r = computeEntry(input({ att: { ...noAtt, work_days: worked, paid_leave_days: 0.5 } }));
  assert.equal(amount(r, "SALARY"), 800); // 2 days × 400 (was 1,000)
});

test("daily: a half-day unpaid leave pays only the half worked", () => {
  const worked = workedDayUnits([day("2026-10-02", "work", 240)], leaveUnitsByDate([{ date: "2026-10-02", days: 0.5 }]));
  const r = computeEntry(input({ att: { ...noAtt, work_days: worked, unpaid_leave_days: 0.5 } }));
  assert.equal(amount(r, "SALARY"), 200);
  assert.equal(amount(r, "UNPAID"), 0); // daily: unpaid leave is simply not paid, no extra deduction
});

test("daily: days without a scan, days off and full-day leave earn no worked day; two requests on one date add up", () => {
  const days = [day("2026-10-01", "work", 0), day("2026-10-04", "off", 480), day("2026-10-05", "holiday", 480), day("2026-10-06", "work", 10), day("2026-10-07", "special", 480)];
  const leave = leaveUnitsByDate([{ date: "2026-10-06", days: 0.5 }, { date: "2026-10-06", days: 0.5 }]);
  assert.equal(leave.get("2026-10-06"), 1);
  assert.equal(workedDayUnits(days, leave), 1); // only the "special" work day
});

test("daily: late minutes are deducted at the hourly rate of the daily wage", () => {
  const r = computeEntry(input({ att: { ...noAtt, work_days: 1, late_minutes: 60, late_count: 1 } }));
  assert.equal(amount(r, "SALARY"), 400);
  assert.equal(amount(r, "LATE"), 50);
});

// ---- hourly --------------------------------------------------------------------------------------------
test("hourly: lateness is not deducted again — the minutes were never counted as worked", () => {
  const r = computeEntry(input({ priv: priv(60, "hour"), att: { ...noAtt, work_days: 1, work_minutes: 450, late_minutes: 30, early_minutes: 15, late_count: 1 } }));
  assert.equal(amount(r, "SALARY"), 450); // 7.5 h × 60
  assert.equal(amount(r, "LATE"), 0);
  assert.equal(amount(r, "EARLY"), 0);
  assert.equal(r.net_pay, 450);
});

test("hourly: day-off work is paid by the multiplier only (2x, not 3x)", () => {
  const days = [day("2026-10-01", "work", 480), day("2026-10-04", "off", 480), day("2026-10-05", "holiday", 240)];
  const regular = regularWorkMinutes(days);
  assert.equal(regular, 480);
  const r = computeEntry(input({ priv: priv(60, "hour"), att: { ...noAtt, work_days: 1, work_minutes: regular, ot_minutes: { "2": 480 } } }));
  assert.equal(amount(r, "SALARY"), 480); // 8 h × 60
  assert.equal(amount(r, "OT2"), 960); // 8 h × 60 × 2
  assert.equal(r.total_income, 1440);
});

test("hourly: paid leave adds hours_per_day per leave day", () => {
  const r = computeEntry(input({ priv: priv(60, "hour"), att: { ...noAtt, work_minutes: 480, paid_leave_days: 0.5 }, cfg: { hours_per_day: 8 } }));
  assert.equal(amount(r, "SALARY"), 720); // 8 h + 4 h
});

// ---- monthly edge cases ----------------------------------------------------------------------------------
test("monthly: leaver is paid by calendar days up to the resign date", () => {
  const r = computeEntry(input({ priv: priv(30000, "month"), employee: { id: 1, employee_type: "monthly", hire_date: "2020-01-01", resign_date: "2026-10-10" } }));
  assert.equal(amount(r, "SALARY"), 10000); // 30000 / 30 × 10
  assert.ok(r.warnings.some((w) => w.includes("10 วัน")));
});

test("monthly: daily_divisor 26 changes the day rate for absence, unpaid leave and OT", () => {
  const r = computeEntry(input({ priv: priv(26000, "month"), cfg: { daily_divisor: 26 }, att: { ...noAtt, work_days: 20, absent_days: 1, unpaid_leave_days: 0.5, ot_minutes: { "1.5": 60 } } }));
  assert.equal(r.rates.daily, 1000);
  assert.equal(r.rates.hourly, 125);
  assert.equal(amount(r, "ABSENT"), 1000);
  assert.equal(amount(r, "UNPAID"), 500);
  assert.equal(amount(r, "OT15"), 187.5);
});

test("monthly: a new joiner with daily_divisor 26 never gets more than the full salary", () => {
  const r = computeEntry(input({ priv: priv(26000, "month"), cfg: { daily_divisor: 26 }, employee: { id: 1, employee_type: "monthly", hire_date: "2026-10-02", resign_date: null } }));
  assert.equal(amount(r, "SALARY"), 26000); // 30 days × 1000 capped at the salary
});

// ---- period rules ------------------------------------------------------------------------------------
test("previous-employer income counts only in the year the employee joined", () => {
  assert.equal(prevEmployerApplies("2026-03-15", 2026), true);
  assert.equal(prevEmployerApplies("2026-03-15", 2027), false);
  assert.equal(prevEmployerApplies("2025-12-31", 2026), false);
  assert.equal(prevEmployerApplies(null, 2026), false);
});

test("debt keys: the same loan in another period of the month is recognised; other sources do not collide", () => {
  const taken = new Set([debtKey("loan", 7), debtKey("guarantee", 3)]);
  assert.ok(taken.has(debtKey("loan", 7)));
  assert.ok(!taken.has(debtKey("advance", 7)));
  assert.ok(!taken.has(debtKey("loan", 8)));
});

test("calculation inputs: an added, removed or edited adjustment / commission makes the calculation stale", () => {
  const a1 = { id: 1, pay_item_id: 5, amount: 1000, qty: null };
  const a2 = { id: 2, pay_item_id: 6, amount: 250.5, qty: 2 };
  const stored = [a1, a2].map(adjustmentKey);
  assert.equal(inputsChanged(stored, [a2, a1].map(adjustmentKey)), false); // order does not matter
  assert.equal(inputsChanged(stored, [a1].map(adjustmentKey)), true); // removed
  assert.equal(inputsChanged(stored, [a1, a2, { ...a2, id: 3 }].map(adjustmentKey)), true); // added
  assert.equal(inputsChanged(stored, [a1, { ...a2, amount: 300 }].map(adjustmentKey)), true); // amount edited
  assert.equal(inputsChanged(stored, [a1, { ...a2, qty: 3 }].map(adjustmentKey)), true); // qty edited
  assert.equal(inputsChanged(stored, [{ ...a1, pay_item_id: 9 }, a2].map(adjustmentKey)), true); // pay item changed
  assert.equal(inputsChanged([], []), false);
  assert.notEqual(commissionKey({ id: 1, plan_id: 2, commission: 100 }), commissionKey({ id: 1, plan_id: 2, commission: 100.01 }));
});

// ---- wiring: the period workflow must stay atomic ---------------------------------------------------------
test("server: calculate / mark paid / reopen go through the transactional database functions", () => {
  const root = join(__dirname, "..");
  const server = readFileSync(join(root, "lib", "payroll", "server.ts"), "utf8");
  for (const fn of ["payroll_save_calculation", "payroll_mark_paid", "payroll_reopen"]) assert.match(server, new RegExp(`rpc\\("${fn}"`), `${fn} must be called`);
  assert.doesNotMatch(server, /from\("payroll_entries"\)\.delete\(\)/, "entries are replaced inside payroll_save_calculation only");
  assert.doesNotMatch(server, /from\("loan_payments"\)/, "loan payments are written inside the database functions only");
  const sql = readFileSync(join(root, "supabase", "migrations", "20261123030000_payroll_atomic.sql"), "utf8");
  for (const fn of ["payroll_save_calculation", "payroll_mark_paid", "payroll_reopen"]) {
    const body = sql.slice(sql.indexOf(`function public.${fn}(`));
    assert.match(body.slice(0, body.indexOf("end $$;")), /auth\.role\(\), ''\) <> 'service_role'/, `${fn} must refuse callers other than the service role`);
    assert.match(body.slice(0, body.indexOf("end $$;")), /from payroll_periods where id = p_period_id for update/, `${fn} must lock the period row`);
  }
});
