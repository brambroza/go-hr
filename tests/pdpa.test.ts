import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PDPA, isMasked } from "../lib/pdpa";

test("isMasked: defaults mask every sensitive field", () => {
  assert.equal(isMasked("national_id", null, false), true);
  assert.equal(isMasked("bank_account", undefined, false), true);
  assert.equal(isMasked("salary", {}, false), true);
});

test("isMasked: a toggle switched off shows the field without revealing", () => {
  const pdpa = { ...DEFAULT_PDPA, mask_salary: false };
  assert.equal(isMasked("salary", pdpa, false), false);
  assert.equal(isMasked("bank_account", pdpa, false), true);
});

test("isMasked: pressing แสดง reveals everything regardless of toggles", () => {
  assert.equal(isMasked("national_id", DEFAULT_PDPA, true), false);
  assert.equal(isMasked("salary", DEFAULT_PDPA, true), false);
});
