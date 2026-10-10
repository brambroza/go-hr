import { test } from "node:test";
import assert from "node:assert/strict";
import { employeeAllowed, planAuthBans } from "../lib/jobs/access";

test("employeeAllowed: active statuses are always allowed", () => {
  assert.equal(employeeAllowed("probation", null, "2026-10-10"), true);
  assert.equal(employeeAllowed("permanent", "2026-01-01", "2026-10-10"), true);
  assert.equal(employeeAllowed("suspended", null, "2026-10-10"), true);
});

test("employeeAllowed: resigned keeps access through the last working day only", () => {
  assert.equal(employeeAllowed("resigned", "2026-10-10", "2026-10-10"), true, "last working day itself");
  assert.equal(employeeAllowed("resigned", "2026-10-11", "2026-10-10"), true, "notice period");
  assert.equal(employeeAllowed("resigned", "2026-10-09", "2026-10-10"), false, "day after");
});

test("employeeAllowed: resigned without a date is blocked", () => {
  assert.equal(employeeAllowed("resigned", null, "2026-10-10"), false);
  assert.equal(employeeAllowed("resigned", "", "2026-10-10"), false);
});

test("planAuthBans: bans inactive profiles that are not banned yet", () => {
  const r = planAuthBans([{ id: "a", is_active: false, auth_banned_at: null }]);
  assert.deepEqual(r, { ban: ["a"], unban: [] });
});

test("planAuthBans: unbans re-activated profiles", () => {
  const r = planAuthBans([{ id: "b", is_active: true, auth_banned_at: "2026-10-01T00:00:00Z" }]);
  assert.deepEqual(r, { ban: [], unban: ["b"] });
});

test("planAuthBans: consistent rows are untouched", () => {
  const r = planAuthBans([
    { id: "c", is_active: true, auth_banned_at: null },
    { id: "d", is_active: false, auth_banned_at: "2026-10-01T00:00:00Z" },
  ]);
  assert.deepEqual(r, { ban: [], unban: [] });
});
