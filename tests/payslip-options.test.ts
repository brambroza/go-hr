import { test } from "node:test";
import assert from "node:assert/strict";
import { payslipOptions } from "../lib/payroll/payslip-options";

test("payslipOptions: defaults when settings are missing", () => {
  assert.deepEqual(payslipOptions(null, null), { showYtd: true, note: null, maskBankAccount: true });
  assert.deepEqual(payslipOptions({}, {}), { showYtd: true, note: null, maskBankAccount: true });
});

test("payslipOptions: honours payslip_show_ytd = false and trims the note", () => {
  const o = payslipOptions({ payslip_show_ytd: false, payslip_note: "  เอกสารนี้เป็นความลับ  " }, { mask_bank_account: false });
  assert.deepEqual(o, { showYtd: false, note: "เอกสารนี้เป็นความลับ", maskBankAccount: false });
});

test("payslipOptions: blank note becomes null", () => {
  assert.equal(payslipOptions({ payslip_note: "   " }, null).note, null);
});
