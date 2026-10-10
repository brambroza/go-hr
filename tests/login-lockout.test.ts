import { test } from "node:test";
import assert from "node:assert/strict";
import { lockoutState, nextFailureState } from "../lib/login-lockout";

const now = new Date("2026-10-10T09:00:00.000Z");
const policy = { max_failed: 3, lock_minutes: 15 };

test("nextFailureState: counts up and locks at max_failed", () => {
  const s1 = nextFailureState(null, policy, now)!;
  assert.equal(s1.fails, 1);
  assert.equal(s1.locked_until, null);
  const s2 = nextFailureState(s1, policy, new Date(now.getTime() + 60_000))!;
  const s3 = nextFailureState(s2, policy, new Date(now.getTime() + 120_000))!;
  assert.equal(s3.fails, 3);
  assert.equal(s3.locked_until, new Date(now.getTime() + 120_000 + 15 * 60_000).toISOString());
});

test("nextFailureState: max_failed = 0 switches the lockout off", () => {
  assert.equal(nextFailureState(null, { max_failed: 0, lock_minutes: 15 }, now), null);
});

test("nextFailureState: an expired lock or old failures start the count over", () => {
  const expired = { fails: 3, last_at: "2026-10-10T08:00:00.000Z", locked_until: "2026-10-10T08:15:00.000Z" };
  assert.equal(nextFailureState(expired, policy, now)!.fails, 1);
  const old = { fails: 2, last_at: "2026-10-10T08:00:00.000Z", locked_until: null };
  assert.equal(nextFailureState(old, policy, now)!.fails, 1);
});

test("lockoutState: minutes left are rounded up; expired lock is not locked", () => {
  const s = { fails: 3, last_at: now.toISOString(), locked_until: new Date(now.getTime() + 4.2 * 60_000).toISOString() };
  assert.deepEqual(lockoutState(s, now), { locked: true, minutesLeft: 5 });
  assert.deepEqual(lockoutState(s, new Date(now.getTime() + 10 * 60_000)), { locked: false, minutesLeft: 0 });
  assert.deepEqual(lockoutState(null, now), { locked: false, minutesLeft: 0 });
});
