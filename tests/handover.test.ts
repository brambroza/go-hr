import { test } from "node:test";
import assert from "node:assert/strict";
import { leaveTemplate, parseLeave, parseYtd, toCeYear, ytdTemplate } from "../lib/migration/import";
import { buildMonthlyFlow, nextMonthDay, type FlowInput, type FlowPeriod } from "../lib/payroll/monthly-flow";

test("toCeYear accepts Buddhist and Christian years", () => {
  assert.equal(toCeYear("2569", 2000), 2026);
  assert.equal(toCeYear("2026", 2000), 2026);
  assert.equal(toCeYear("", 2026), 2026);
  assert.equal(toCeYear("69", 2026), null);
});

test("parseYtd maps Thai headers, numbers with commas, and flags problems", () => {
  const t = [
    ["รหัสพนักงาน", "ปีภาษี", "เงินได้สะสม", "ภาษีสะสม", "ประกันสังคมสะสม", "กองทุนสำรองเลี้ยงชีพสะสม"],
    ["E0001", "2569", "270,000.00", "8,250", "7875", ""],
    ["E0002", "2569", "1000", "5000", "0", "0"],
    ["X999", "2569", "1", "0", "0", "0"],
    ["E0001", "2569", "1", "0", "0", "0"],
    ["", "", "", "", "", ""],
  ];
  const r = parseYtd(t, { defaultYear: 2026, knownCodes: new Set(["e0001", "e0002"]) });
  assert.deepEqual(r.missing, []);
  assert.equal(r.rows.length, 4); // blank line dropped
  assert.deepEqual({ ...r.rows[0], errors: r.rows[0].errors }, { line: 2, code: "E0001", year: 2026, income: 270000, tax: 8250, sso: 7875, pvd: 0, errors: [] });
  assert.match(r.rows[1].errors.join(), /ภาษีสะสมมากกว่าเงินได้/);
  assert.match(r.rows[2].errors.join(), /ไม่พบรหัสพนักงาน/);
  assert.match(r.rows[3].errors.join(), /ซ้ำ/);
  // the downloadable template parses cleanly
  assert.deepEqual(parseYtd(ytdTemplate(2026), { defaultYear: 2026 }).rows[0].errors, []);
});

test("parseYtd reports missing required columns", () => {
  const r = parseYtd([["รหัสพนักงาน", "เงินได้สะสม"], ["E1", "10"]], { defaultYear: 2026 });
  assert.deepEqual(r.missing, ["ภาษีสะสม"]);
});

test("parseLeave computes remaining days and checks leave types", () => {
  const t = leaveTemplate(2026);
  const r = parseLeave(t, { defaultYear: 2026, knownCodes: new Set(["e0001"]), leaveTypes: new Set(["sick", "personal", "vacation"]) });
  assert.deepEqual(r.rows.map((x) => [x.type, x.remaining, x.errors.length]), [["SICK", 28, 0], ["PERSONAL", 3, 0], ["VACATION", 4.5, 0]]);
  const bad = parseLeave([["รหัสพนักงาน", "รหัสประเภทลา", "สิทธิ์ทั้งปี", "ใช้ไปแล้ว"], ["E0001", "NOPE", "6", "8"]], { defaultYear: 2026, leaveTypes: new Set(["sick"]) });
  assert.match(bad.rows[0].errors.join(), /ไม่พบประเภทลา/);
  assert.match(bad.rows[0].errors.join(), /คงเหลือติดลบ/);
});

const period = (over: Partial<FlowPeriod> = {}): FlowPeriod => ({
  id: 1, code: "PR202609-1", name: "เงินเดือน ก.ย. 2569", status: "open", pay_date: "2026-09-30",
  att_start_date: "2026-09-01", att_end_date: "2026-09-30", start_date: "2026-09-01", end_date: "2026-09-30",
  payslip_published: false, entries: 45, net_total: 1_000_000, tax_total: 20_000, sso_total: 30_000, ...over,
});
const input = (over: Partial<FlowInput> = {}): FlowInput => ({
  year: 2026, month: 9, today: "2026-09-20", period: period(), readiness: { pendingRequests: 0, missingScans: 0, absentDays: 0 }, filings: [], ...over,
});

test("nextMonthDay rolls over the year and clamps", () => {
  assert.equal(nextMonthDay(2026, 12, 15), "2027-01-15");
  assert.equal(nextMonthDay(2026, 1, 31), "2026-02-28");
});

test("monthly flow: open period → first step current, due dates from pay date and law", () => {
  const s = buildMonthlyFlow(input({ readiness: { pendingRequests: 3, missingScans: 2, absentDays: 0 } }));
  assert.deepEqual(s.map((x) => x.key), ["time", "calc", "approve", "bank", "payslip", "sso", "pnd1", "close"]);
  assert.equal(s[0].state, "current");
  assert.equal(s[0].issues!.length, 2);
  assert.equal(s[0].due, "2026-09-26");
  assert.equal(s.find((x) => x.key === "sso")!.due, "2026-10-15");
  assert.equal(s.filter((x) => x.state === "current").length, 1);
});

test("monthly flow: approved + published, filings recorded, late SSO is flagged", () => {
  const s = buildMonthlyFlow(input({
    today: "2026-10-16",
    period: period({ status: "paid", payslip_published: true }),
    filings: [{ id: 1, kind: "pnd1", submitted_on: "2026-10-07", ref_no: "R1", amount: 20000, note: null }],
  }));
  const st = Object.fromEntries(s.map((x) => [x.key, x.state]));
  assert.deepEqual(st, { time: "done", calc: "done", approve: "done", bank: "done", payslip: "done", sso: "late", pnd1: "done", close: "late" });
});

test("monthly flow: December adds ภ.ง.ด.1ก due end of February", () => {
  const s = buildMonthlyFlow(input({ year: 2027, month: 12, today: "2027-12-01", period: period({ pay_date: "2027-12-28" }) }));
  const a = s.find((x) => x.key === "pnd1a")!;
  assert.equal(a.due, "2028-02-29");
  assert.equal(s.at(-1)!.key, "close");
});
