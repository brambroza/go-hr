import { test } from "node:test";
import assert from "node:assert/strict";
import { pendingSourceLabel, pendingToRelease, selectPendingForPeriod, type PendingItem } from "../lib/payroll/pending";

const item = (p: Partial<PendingItem> & { id: number }): PendingItem => ({
  employee_id: 1, pay_item_id: 10, amount: 500, qty: null, note: null, source: "welfare", source_id: p.id, effective_date: "2026-09-15", status: "pending", period_id: null, ...p,
});
const monthly = { id: 7, period_type: "monthly", end_date: "2026-09-30" };
const bonus = { id: 8, period_type: "bonus", end_date: "2026-09-30" };

test("pending: unassigned rows join a monthly period when effective on or before the period end", () => {
  const items = [item({ id: 1, effective_date: "2026-09-30" }), item({ id: 2, effective_date: "2026-10-01" }), item({ id: 3, effective_date: "2026-08-02" })];
  assert.deepEqual(selectPendingForPeriod(items, monthly, [1]).map((i) => i.id), [1, 3]);
});

test("pending: a bonus / special period never picks up unassigned rows, only rows assigned to it", () => {
  const items = [item({ id: 1 }), item({ id: 2, period_id: 8, status: "applied" }), item({ id: 3, period_id: 7, status: "applied" })];
  assert.deepEqual(selectPendingForPeriod(items, bonus, [1]).map((i) => i.id), [2]);
});

test("pending: rows claimed by this period stay; rows claimed by another period, cancelled rows and other employees are skipped", () => {
  const items = [
    item({ id: 1, period_id: 7, status: "applied" }),
    item({ id: 2, period_id: 7, status: "paid" }),
    item({ id: 3, period_id: 9, status: "applied" }),
    item({ id: 4, status: "cancelled" }),
    item({ id: 5, employee_id: 2 }),
    item({ id: 6, period_id: null, status: "applied" }), // period deleted → behaves as pending
  ];
  assert.deepEqual(selectPendingForPeriod(items, monthly, [1]).map((i) => i.id), [1, 2, 6]);
});

test("pending: release = rows applied to this period that are not selected any more (employee left the period)", () => {
  const items = [item({ id: 1, period_id: 7, status: "applied" }), item({ id: 2, period_id: 7, status: "applied", employee_id: 2 }), item({ id: 3, period_id: 7, status: "paid", employee_id: 2 })];
  const sel = selectPendingForPeriod(items, monthly, [1]);
  assert.deepEqual(pendingToRelease(items, 7, sel).map((i) => i.id), [2]);
});

test("pending: source labels incl. revert rows", () => {
  assert.equal(pendingSourceLabel("welfare"), "สวัสดิการ");
  assert.equal(pendingSourceLabel("petty_cash_revert"), "ยกเลิกเงินสดย่อย");
  assert.equal(pendingSourceLabel("something"), "something");
});
