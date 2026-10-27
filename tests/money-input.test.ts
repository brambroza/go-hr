import { test } from "node:test";
import assert from "node:assert/strict";
import { caretAfter, cleanMoney, groupMoney, moneyFromValue, moneyValue, sameMoney, significantBefore } from "../components/ui/money-input-core";

test("cleanMoney strips separators and junk, keeps one dot and up to 2 decimals", () => {
  assert.equal(cleanMoney("25,000"), "25000");
  assert.equal(cleanMoney("1,234,567.891"), "1234567.89");
  assert.equal(cleanMoney("12.3.4"), "12.34");
  assert.equal(cleanMoney("฿ 1 500 บาท"), "1500");
  assert.equal(cleanMoney("007"), "7");
  assert.equal(cleanMoney("0"), "0");
  assert.equal(cleanMoney(".5"), "0.5");
  assert.equal(cleanMoney("100."), "100.");
  assert.equal(cleanMoney(""), "");
  assert.equal(cleanMoney("25000.00"), "25000.00");
});

test("cleanMoney sign and decimals options", () => {
  assert.equal(cleanMoney("-1,500"), "-1500");
  assert.equal(cleanMoney("-"), "-");
  assert.equal(cleanMoney("-1,500", { negative: false }), "1500");
  assert.equal(cleanMoney("1500.75", { decimals: 0 }), "1500");
  assert.equal(cleanMoney("12-3"), "123");
});

test("moneyFromValue rounds values set from outside", () => {
  assert.equal(moneyFromValue("2083.3366"), "2083.34");
  assert.equal(moneyFromValue("2083.33"), "2083.33");
  assert.equal(moneyFromValue("30000.00"), "30000.00");
  assert.equal(moneyFromValue("1500.6", { decimals: 0 }), "1501");
  assert.equal(moneyFromValue(""), "");
});

test("groupMoney adds thousands separators and keeps what is being typed", () => {
  assert.equal(groupMoney("1234567.5"), "1,234,567.5");
  assert.equal(groupMoney("-1500"), "-1,500");
  assert.equal(groupMoney("999"), "999");
  assert.equal(groupMoney("1000."), "1,000.");
  assert.equal(groupMoney(""), "");
  assert.equal(groupMoney("-"), "-");
});

test("moneyValue / sameMoney", () => {
  assert.equal(moneyValue("1000."), "1000");
  assert.equal(moneyValue("-"), "");
  assert.equal(moneyValue("1500.50"), "1500.50");
  assert.equal(sameMoney("25000", "25000.00"), true);
  assert.equal(sameMoney("", ""), true);
  assert.equal(sameMoney("", "0"), false);
  assert.equal(sameMoney("100.", "100"), true);
  assert.equal(sameMoney("100", "101"), false);
});

test("caret stays after the same digit when separators move", () => {
  // typed "5" at the end of "1,234" → "12,345", caret at end
  assert.equal(caretAfter("12,345", significantBefore("1,2345", 6)), 6);
  // typed "9" after the "1" in "1,234" → "19234" → "19,234", caret right after the 9
  assert.equal(caretAfter("19,234", significantBefore("19,234", 2)), 2);
  // deleted the "2" of "1,234" (caret before "34") → "134", caret after the 1
  assert.equal(caretAfter("134", significantBefore("1,34", 2)), 1);
  assert.equal(caretAfter("1,000", 0), 0);
});
