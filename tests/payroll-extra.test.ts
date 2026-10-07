import { test } from "node:test";
import assert from "node:assert/strict";
import { computeLeavePay, expandLeaveRequest, type LeaveTypeRule } from "../lib/payroll/leave";
import { computeCommission, loanSchedule, loanTotals } from "../lib/payroll/commission";
import { buildBankFile, buildRdPrepFile, buildSsoFile, encodeTis620, padNum, padText, BANK_FORMATS, SSO_DETAIL, SSO_HEADER } from "../lib/payroll/files";

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

test("fixed width helpers + TIS-620", () => {
  assert.equal(padNum("12-34", 6), "001234");
  assert.equal(padText("ab", 4), "ab  ");
  assert.equal(padText("abcdef", 3), "abc");
  const b = encodeTis620("ก A");
  assert.deepEqual([...b], [0xa1, 0x20, 0x41]);
});

const ctx = { company_name: "บริษัท ทดสอบ จำกัด", company_bank_code: "014", company_account: "123-4-56789-0", company_id: "C001", effective_date: "2026-09-30", batch_ref: "PR2609" };
const rows = [
  { emp_code: "E0001", name: "สมชาย ใจดี", bank_code: "014", account: "111-2-33333-4", amount: 15234.5 },
  { emp_code: "E0002", name: "สมหญิง รักงาน", bank_code: "004", account: "2223334445", amount: 9000 },
  { emp_code: "E0003", name: "zero", bank_code: "004", account: "1", amount: 0 },
];

test("bank files: every fixed format has constant line widths and correct totals", () => {
  for (const f of BANK_FORMATS) {
    const out = buildBankFile(f.key, ctx, rows);
    assert.equal(out.count, 2, f.key);
    assert.equal(out.total, 24234.5, f.key);
    const lines = out.text.trimEnd().split("\r\n");
    if (f.kind === "fixed") {
      assert.equal(lines.length, 4, f.key);
      const dw = f.detail!.reduce((s, x) => s + x.len, 0);
      assert.equal(lines[1].length, dw, `${f.key} detail width`);
      assert.equal(lines[2].length, dw);
      assert.ok(lines[1].includes("1523450"), `${f.key} satang`);
      assert.equal(out.bytes.length, out.text.length, "TIS-620 is 1 byte per char");
    } else {
      assert.equal(lines.length, 3, f.key);
    }
  }
  const scb = buildBankFile("scb", ctx, rows).text.split("\r\n");
  assert.equal(scb[0].slice(0, 9), "H30092026");
  assert.equal(scb[1].slice(0, 7), "D000001");
  assert.equal(scb[1].slice(7, 10), "014");
  assert.equal(scb[1].slice(10, 21), "01112333334");
  assert.equal(scb[3], "T000002000000002423450");
});

test("SSO file layout", () => {
  const f = buildSsoFile({ account_no: "1000123456", branch_no: "000000", pay_date: "2026-10-07", year: 2026, month: 9, company_name: "บริษัท ทดสอบ", rate: 5 }, [
    { sso_no: "1-1037-00123-45-1", prefix: "นาย", first_name: "สมชาย", last_name: "ใจดี", wage: 17500, employee: 875, employer: 875 },
    { sso_no: "3101700234567", prefix: "นางสาว", first_name: "สมหญิง", last_name: "รักงาน", wage: 9360, employee: 468, employer: 468 },
  ]);
  const lines = f.text.trimEnd().split("\r\n");
  assert.equal(lines.length, 3);
  assert.equal(lines[0].length, SSO_HEADER.reduce((s, x) => s + x.len, 0));
  assert.equal(lines[1].length, SSO_DETAIL.reduce((s, x) => s + x.len, 0));
  assert.equal(lines[0].slice(0, 17), "11000123456000000");
  assert.equal(lines[0].slice(17, 23), "071069");
  assert.equal(lines[0].slice(23, 27), "0969");
  assert.equal(lines[1].slice(1, 14), "1103700123451");
  assert.equal(lines[1].slice(14, 17), "003");
  assert.equal(lines[2].slice(14, 17), "004");
  assert.equal(f.total, 2686);
});

test("RD Prep pipe file", () => {
  const f = buildRdPrepFile("pnd1.txt", [{ tax_id: "1-1037-00123-45-1", prefix: "นาย", first_name: "สมชาย", last_name: "ใจดี", pay_date: "2026-09-30", income: 30000, tax: 312.5 }]);
  assert.equal(f.text.trimEnd(), "1|1103700123451|00000|นาย|สมชาย|ใจดี|1|30/09/2569|30000.00|312.50|1");
});
