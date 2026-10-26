import { test } from "node:test";
import assert from "node:assert/strict";
import { priorRetroLines, retroDiff, retroNet, salaryAsOf, type RetroItem, type RetroLine } from "../lib/payroll/retro";

const L = (code: string, id: number, direction: 1 | -1, amount: number, source = "auto"): RetroLine => ({ pay_item_id: id, code, name: code, direction, amount, source });
const items = new Map<number, RetroItem>([
  [1, { direction: 1, system_key: "salary" }], [2, { direction: 1, system_key: "ot_1_5" }], [3, { direction: -1, system_key: "absent" }],
  [4, { direction: -1, system_key: "tax" }], [5, { direction: -1, system_key: "sso" }], [6, { direction: 1, system_key: "welfare" }],
  [7, { direction: -1, system_key: "loan" }], [8, { direction: 1, system_key: null }],
]);

test("retro: OT approved late shows up as more OT; tax / SSO are not compared", () => {
  const before = [L("SALARY", 1, 1, 30000), L("TAX", 4, -1, 500), L("SSO", 5, -1, 875)];
  const after = [L("SALARY", 1, 1, 30000), L("OT15", 2, 1, 375), L("TAX", 4, -1, 560), L("SSO", 5, -1, 875)];
  const d = retroDiff(before, after, items);
  assert.deepEqual(d.map((x) => [x.code, x.amount]), [["OT15", 375]]);
  assert.equal(retroNet(d), 375);
});

test("retro: an absence turned into paid leave refunds the deduction (negative amount on a deduction item)", () => {
  const d = retroDiff([L("SALARY", 1, 1, 30000), L("ABSENT", 3, -1, 1000)], [L("SALARY", 1, 1, 30000)], items);
  assert.deepEqual(d.map((x) => [x.code, x.amount]), [["ABSENT", -1000]]);
  assert.equal(retroNet(d), 1000);
});

test("retro: allowances, loans and inbox money follow today's setup and are never compared", () => {
  const before = [L("SALARY", 1, 1, 30000), L("LOAN", 7, -1, 1000, "loan"), L("WELFARE", 6, 1, 500, "welfare"), L("POSITION", 8, 1, 2000, "constant")];
  const after = [L("SALARY", 1, 1, 30000), L("LOAN", 7, -1, 800, "loan"), L("POSITION", 8, 1, 3000, "constant")];
  assert.deepEqual(retroDiff(before, after, items), []);
});

test("retro: a second late change does not pay the first one again", () => {
  const paid = [L("SALARY", 1, 1, 30000)];
  const run1 = retroDiff(paid, [L("SALARY", 1, 1, 30000), L("OT15", 2, 1, 1000)], items);
  assert.deepEqual(run1.map((x) => x.amount), [1000]);
  const prior = priorRetroLines(run1.map((d) => ({ pay_item_id: d.pay_item_id, amount: d.amount })), items);
  const run2 = retroDiff([...paid, ...prior], [L("SALARY", 1, 1, 30000), L("OT15", 2, 1, 1000), L("ABSENT", 3, -1, 0)], items);
  assert.deepEqual(run2, []);
  // a later absence refund on top
  const run3 = retroDiff([...paid, L("ABSENT", 3, -1, 500), ...prior], [L("SALARY", 1, 1, 30000), L("OT15", 2, 1, 1000)], items);
  assert.deepEqual(run3.map((x) => [x.code, x.amount]), [["ABSENT", -500]]);
});

test("retro: retroactive salary increase", () => {
  const d = retroDiff([L("SALARY", 1, 1, 30000)], [L("SALARY", 1, 1, 32000)], items);
  assert.deepEqual(d.map((x) => [x.code, x.amount, x.before, x.after]), [["SALARY", 2000, 30000, 32000]]);
});

test("retro: salary in force at a date", () => {
  const h = [{ effective_date: "2026-01-01", new_salary: 30000 }, { effective_date: "2026-10-01", new_salary: 32000 }];
  assert.equal(salaryAsOf(h, "2026-09-30"), 30000);
  assert.equal(salaryAsOf(h, "2026-10-31"), 32000);
  assert.equal(salaryAsOf(h, "2025-12-31"), null);
});
