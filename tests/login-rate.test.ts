import { test } from "node:test";
import assert from "node:assert/strict";
import { allowAttempt } from "../lib/login-rate";

test("allowAttempt: allows up to the limit inside the window, then refuses", () => {
  const store = new Map<string, number[]>();
  const rate = { limit: 3, windowMs: 60_000 };
  assert.equal(allowAttempt("1.2.3.4", 1_000, rate, store), true);
  assert.equal(allowAttempt("1.2.3.4", 2_000, rate, store), true);
  assert.equal(allowAttempt("1.2.3.4", 3_000, rate, store), true);
  assert.equal(allowAttempt("1.2.3.4", 4_000, rate, store), false);
  assert.equal(allowAttempt("5.6.7.8", 4_000, rate, store), true, "other sources are independent");
});

test("allowAttempt: old attempts fall out of the window", () => {
  const store = new Map<string, number[]>();
  const rate = { limit: 2, windowMs: 10_000 };
  allowAttempt("a", 0, rate, store);
  allowAttempt("a", 1_000, rate, store);
  assert.equal(allowAttempt("a", 2_000, rate, store), false);
  assert.equal(allowAttempt("a", 12_000, rate, store), true);
});
