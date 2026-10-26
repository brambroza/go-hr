import { test } from "node:test";
import assert from "node:assert/strict";
import { computeSettlement, exemptionFor, leavePayoutDays, serviceYears, severanceDays, type SettlementInput } from "../lib/payroll/settlement";

const base = (p: Partial<SettlementInput> = {}): SettlementInput => ({
  hire_date: "2016-01-01", last_day: "2026-06-30", resign_type: "เลิกจ้าง", salary: 30000, salary_unit: "month", leave: null, guarantee_held: 0, ...p,
});

test("settlement: completed years count from the anniversary minus one day", () => {
  assert.equal(serviceYears("2020-03-01", "2021-02-28"), 1);
  assert.equal(serviceYears("2020-03-01", "2021-02-27"), 0);
  assert.equal(serviceYears("2020-02-29", "2021-02-27"), 1); // 29 Feb anniversary falls on 28 Feb
  assert.equal(serviceYears("2016-01-01", "2026-06-30"), 10);
});

test("settlement: ม.118 steps (120 days, 1, 3, 6, 10, 20 years)", () => {
  assert.equal(severanceDays("2026-01-01", "2026-04-29"), 0); // 119 days
  assert.equal(severanceDays("2026-01-01", "2026-04-30"), 30); // 120 days
  assert.equal(severanceDays("2025-01-01", "2025-12-31"), 90);
  assert.equal(severanceDays("2023-01-01", "2025-12-31"), 180);
  assert.equal(severanceDays("2020-01-01", "2025-12-31"), 240);
  assert.equal(severanceDays("2016-01-01", "2025-12-31"), 300);
  assert.equal(severanceDays("2006-01-01", "2025-12-31"), 400);
});

test("settlement: severance above the exemption is split into a taxable line", () => {
  const r = computeSettlement(base({ hire_date: "2000-01-01" })); // 26 years → 400 days × 1,000
  assert.equal(r.severance_amount, 400000);
  assert.equal(r.exempt_amount, 300000);
  assert.deepEqual(r.lines.map((l) => [l.key, l.amount]), [["severance_exempt", 300000], ["severance", 100000]]);
});

test("settlement: exemption also capped by the wage of the last N days", () => {
  const r = computeSettlement(base({ hire_date: "2000-01-01", salary: 15000, exemptions: [{ from: "2000-01-01", max_amount: 300000, max_days: 300 }] }));
  // 400 days × 500 = 200,000; cap = min(300,000, 300 × 500 = 150,000)
  assert.equal(r.exempt_amount, 150000);
  assert.equal(r.lines.find((l) => l.key === "severance")?.amount, 50000);
});

test("settlement: the exemption in force on the last working day applies", () => {
  const list = [{ from: "2000-01-01", max_amount: 300000, max_days: 300 }, { from: "2027-01-01", max_amount: 600000, max_days: 400 }];
  assert.equal(exemptionFor("2026-12-31", list).max_amount, 300000);
  assert.equal(exemptionFor("2027-01-01", list).max_amount, 600000);
  assert.equal(exemptionFor("2026-01-01", []).max_amount, 300000);
});

test("settlement: voluntary resignation gets no severance; leave paid pro rata, carried days used first", () => {
  const r = computeSettlement(base({ resign_type: "ลาออกเอง", leave: { quota_days: 6, carried_days: 2, adjust_days: 0, used_days: 3 } }));
  assert.equal(r.severance_eligible, false);
  assert.equal(r.severance_amount, 0);
  // 1 Jan – 30 Jun = 181/365 of 6 days = 2.97, minus 1 day taken beyond the 2 carried → 1.97 → 1.5 (half days)
  assert.equal(r.leave_days, 1.5);
  assert.equal(r.leave_amount, 1500);
});

test("settlement: voluntary resignation with carried_only pays only leave carried over", () => {
  const r = computeSettlement(base({ resign_type: "ลาออกเอง", voluntary_leave_payout: "carried_only", leave: { quota_days: 6, carried_days: 4, adjust_days: 0, used_days: 1 } }));
  assert.equal(r.leave_days, 3);
});

test("settlement: ม.119 dismissal — no severance, no notice pay, carried leave only", () => {
  const r = computeSettlement(base({ resign_type: "เลิกจ้างกรณีความผิดร้ายแรง (ม.119)", leave: { quota_days: 6, carried_days: 2, adjust_days: 0, used_days: 0 }, override: { notice_days: 30 } }));
  assert.equal(r.severance_amount, 0);
  assert.equal(r.notice_amount, 0);
  assert.equal(r.leave_days, 2);
  assert.ok(r.warnings.some((w) => w.includes("ม.119")));
});

test("settlement: someone hired this year — the quota already covers only the rest of the year", () => {
  const d = leavePayoutDays({ quota_days: 3, carried_days: 0, adjust_days: 0, used_days: 0 }, "2026-07-01", "2026-12-31", "prorata");
  assert.equal(d.factor, 1);
  assert.equal(d.days, 3);
});

test("settlement: HR overrides, notice pay and guarantee refund", () => {
  const r = computeSettlement(base({ guarantee_held: 5000, override: { severance_eligible: false, notice_days: 30 } }));
  assert.equal(r.severance_amount, 0);
  assert.equal(r.notice_amount, 30000);
  assert.equal(r.guarantee_refund, 5000);
  assert.equal(r.total, 35000);
  assert.ok(r.warnings.some((w) => w.includes("ต่างจากประเภท")));
});

test("settlement: missing resign type → no severance, warning", () => {
  const r = computeSettlement(base({ resign_type: null }));
  assert.equal(r.severance_amount, 0);
  assert.ok(r.warnings.length > 0);
});

test("settlement: daily-wage worker uses the day rate", () => {
  const r = computeSettlement(base({ salary: 400, salary_unit: "day", hire_date: "2025-01-01", last_day: "2025-12-31" }));
  assert.equal(r.daily_rate, 400);
  assert.equal(r.severance_amount, 36000);
});

test("settlement: last day before hire date is rejected", () => {
  assert.throws(() => computeSettlement(base({ last_day: "2015-12-31" })));
});

test("settlement: daily wage is monthly ÷ 30 by law, incl. fixed allowances that are wages", () => {
  const r = computeSettlement(base({ hire_date: "2025-01-01", last_day: "2025-12-31", monthly_allowance: 3000 }));
  assert.equal(r.daily_rate, 1100); // (30,000 + 3,000) / 30
  assert.equal(r.severance_amount, 99000); // 90 days
});
