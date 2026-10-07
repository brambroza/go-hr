import { test } from "node:test";
import assert from "node:assert/strict";
import { computeLeavePay, expandLeaveRequest, type LeaveTypeRule } from "../lib/payroll/leave";
import { computeCommission, loanSchedule, loanTotals } from "../lib/payroll/commission";

const types: Record<number, LeaveTypeRule> = {
  1: { is_paid: true, paid_days_limit: 30, pay_rate_percent: 100, name: "ลาป่วย" },
  2: { is_paid: true, paid_days_limit: 3, pay_rate_percent: 100, name: "ลากิจ" },
  3: { is_paid: false, paid_days_limit: 0, pay_rate_percent: 0, name: "ไม่รับค่าจ้าง" },
  4: { is_paid: true, paid_days_limit: 15, pay_rate_percent: 50, name: "ดูแลบุตร" },
  5: { is_paid: true, paid_days_limit: null, pay_rate_percent: 100, name: "พักร้อน" },
};

test("leave: unpaid type is fully unpaid", () => {
  const r = computeLeavePay([{ date: "2026-09-10", days: 1, leave_type_id: 3 }, { date: "2026-09-11", days: 0.5, leave_type_id: 3 }], types, "2026-09-01", "2026-09-30");
  assert.equal(r.unpaid_leave_days, 1.5);
  assert.equal(r.paid_leave_days, 0);
});

test("leave: days beyond paid_days_limit in the year become unpaid (earlier months use the cap)", () => {
  const days = [
    { date: "2026-03-02", days: 1, leave_type_id: 2 },
    { date: "2026-05-02", days: 1, leave_type_id: 2 },
    { date: "2026-09-10", days: 1, leave_type_id: 2 }, // 3rd → paid
    { date: "2026-09-11", days: 1, leave_type_id: 2 }, // 4th → unpaid
    { date: "2026-09-14", days: 0.5, leave_type_id: 2 }, // unpaid
  ];
  const r = computeLeavePay(days, types, "2026-09-01", "2026-09-30");
  assert.equal(r.paid_leave_days, 1);
  assert.equal(r.unpaid_leave_days, 1.5);
});

test("leave: partial pay rate splits days", () => {
  const r = computeLeavePay([{ date: "2026-09-01", days: 4, leave_type_id: 4 }], types, "2026-09-01", "2026-09-30");
  assert.equal(r.paid_leave_days, 2);
  assert.equal(r.unpaid_leave_days, 2);
});

test("leave: cap crossing in the middle of a fractional day, unlimited types and other years", () => {
  const r = computeLeavePay(
    [
      { date: "2025-12-01", days: 3, leave_type_id: 2 }, // previous year doesn't count
      { date: "2026-09-01", days: 2.5, leave_type_id: 2 },
      { date: "2026-09-02", days: 1, leave_type_id: 2 },
      { date: "2026-09-03", days: 10, leave_type_id: 5 },
    ],
    types, "2026-09-01", "2026-09-30");
  assert.equal(r.paid_leave_days, 13); // 2.5 + 0.5 + 10
  assert.equal(r.unpaid_leave_days, 0.5);
});

test("expandLeaveRequest spreads full days over countable days only", () => {
  const isWork = (d: string) => ![0, 6].includes(new Date(d + "T00:00:00Z").getUTCDay());
  const r = expandLeaveRequest({ start_date: "2026-09-04", end_date: "2026-09-08", days: 3, unit: "full", leave_type_id: 1 }, isWork); // Fri..Tue
  assert.deepEqual(r.map((x) => x.date), ["2026-09-04", "2026-09-07", "2026-09-08"]);
  assert.equal(r[0].days, 1);
  const h = expandLeaveRequest({ start_date: "2026-09-04", end_date: "2026-09-04", days: 0.5, unit: "half_am", leave_type_id: 1 }, isWork);
  assert.deepEqual(h, [{ date: "2026-09-04", days: 0.5, leave_type_id: 1 }]);
});

test("commission: step vs flat tiers", () => {
  const tiers = [{ from: 0, to: 100000, rate: 2 }, { from: 100000, to: 300000, rate: 3 }, { from: 300000, rate: 5 }];
  assert.equal(computeCommission(250000, tiers, "step"), 2000 + 4500);
  assert.equal(computeCommission(250000, tiers, "flat"), 7500);
  assert.equal(computeCommission(400000, tiers, "step"), 2000 + 6000 + 5000);
  assert.equal(computeCommission(50000, tiers, "flat"), 1000);
  assert.equal(computeCommission(0, tiers, "step"), 0);
  assert.equal(computeCommission(1000, [], "step"), 0);
});

test("loan: flat interest totals and schedule", () => {
  const t = loanTotals({ principal: 12000, interest_rate: 6, installments: 12 });
  assert.equal(t.interest, 720);
  assert.equal(t.total, 12720);
  assert.equal(t.installment, 1060);
  const s = loanSchedule(10000, 3000, "2026-11-01", 3000);
  assert.equal(s.length, 4);
  assert.equal(s[3].amount, 1000);
  assert.equal(s[3].month, "2027-02-01");
  assert.equal(s[0].paid, true);
  assert.equal(s[1].paid, false);
});

// export file builders (bank / SSO / RD) are tested in tests/payroll-files.test.ts
