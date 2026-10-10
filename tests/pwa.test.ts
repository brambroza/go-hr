import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NO_CACHE_PATTERNS, shouldCachePage } from "../lib/pwa";

test("shouldCachePage: shell pages of the employee app may be cached", () => {
  assert.equal(shouldCachePage("/m"), true);
  assert.equal(shouldCachePage("/m/checkin"), true);
  assert.equal(shouldCachePage("/m/offline"), true);
  assert.equal(shouldCachePage("/m/requests"), true, "list without ids");
});

test("shouldCachePage: pages with personal or salary data are never cached", () => {
  for (const p of ["/m/payslips", "/m/payslips/12", "/m/profile", "/m/evaluations", "/m/evaluations/warnings/3", "/m/approvals/7", "/m/team", "/m/requests/42"]) {
    assert.equal(shouldCachePage(p), false, p);
  }
});

test("shouldCachePage: back-office pages are not cached by the employee-app worker", () => {
  assert.equal(shouldCachePage("/payroll/3/payslips"), false);
  assert.equal(shouldCachePage("/employees/1"), false);
});

test("public/sw.js carries the same no-cache list as lib/pwa.ts", () => {
  const sw = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
  assert.match(sw, /const VERSION = "gohr-v3"/);
  for (const r of NO_CACHE_PATTERNS) assert.ok(sw.includes(r.source), `sw.js is missing ${r.source}`);
  assert.match(sw, /clearPages/);
});
