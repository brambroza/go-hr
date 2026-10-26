import { test } from "node:test";
import assert from "node:assert/strict";
import { deadlineState, monthRange, ssoIssues, ssoJoinDeadline, ssoLeaveDate, ssoLeaveDeadline, type SsoPerson } from "../lib/payroll/sso-register";

const person = (p: Partial<SsoPerson> = {}): SsoPerson => ({
  national_id: "1101700203450", prefix: "นาย", first_name: "ทดสอบ", last_name: "ระบบ", gender: "M", birth_date: "1995-05-01", nationality: "ไทย",
  hire_date: "2026-10-01", resign_date: null, resign_type: null, sso_enabled: true, ...p,
});
const branch = { sso_account_no: "1000000000" };

test("sso register: join within 30 days of the hire date", () => {
  assert.equal(ssoJoinDeadline("2026-10-01"), "2026-10-31");
  assert.equal(ssoJoinDeadline("2026-12-15"), "2027-01-14");
});

test("sso register: leave date is the day after the last working day; due the 15th of the next month", () => {
  assert.equal(ssoLeaveDate("2026-10-31"), "2026-11-01");
  assert.equal(ssoLeaveDeadline("2026-10-31"), "2026-12-15"); // left on 1 Nov → due 15 Dec
  assert.equal(ssoLeaveDeadline("2026-10-30"), "2026-11-15");
  assert.equal(ssoLeaveDeadline("2026-12-30"), "2027-01-15");
});

test("sso register: issues for joiners", () => {
  assert.deepEqual(ssoIssues(person(), "join", branch), []);
  const bad = ssoIssues(person({ national_id: "1101700203451", birth_date: null, gender: "X" }), "join", null);
  assert.ok(bad.includes("เลขประจำตัวประชาชนไม่ถูกต้อง"));
  assert.ok(bad.includes("ไม่มีวันเกิด"));
  assert.ok(bad.includes("ไม่ได้ระบุเพศ"));
  assert.ok(bad.some((x) => x.includes("เลขที่บัญชีนายจ้าง")));
});

test("sso register: issues for leavers need a mappable resign type", () => {
  assert.deepEqual(ssoIssues(person({ resign_date: "2026-10-31", resign_type: "ลาออกเอง" }), "leave", branch), []);
  assert.ok(ssoIssues(person({ resign_date: "2026-10-31", resign_type: "อื่น ๆ" }), "leave", branch).some((x) => x.includes("สาเหตุ")));
});

test("sso register: deadline state and month range", () => {
  assert.equal(deadlineState("2026-10-31", "2026-11-01"), "overdue");
  assert.equal(deadlineState("2026-10-31", "2026-10-25"), "due_soon");
  assert.equal(deadlineState("2026-10-31", "2026-10-01"), "ok");
  assert.deepEqual(monthRange(2028, 2), ["2028-02-01", "2028-02-29"]);
});
