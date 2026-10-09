import { test } from "node:test";
import assert from "node:assert/strict";
import { hasSessionOnlyMarker, persistCookieOptions, SESSION_ONLY_COOKIE } from "../lib/supabase/cookie";

test("persistCookieOptions keeps max-age when remembering", () => {
  const o = { path: "/", maxAge: 400 * 86400, sameSite: "lax" as const };
  assert.deepEqual(persistCookieOptions(o, false), o);
});

test("persistCookieOptions strips max-age and expires for a session-only login", () => {
  const o = { path: "/", maxAge: 400 * 86400, expires: new Date("2030-01-01"), sameSite: "lax" as const, secure: true };
  assert.deepEqual(persistCookieOptions(o, true), { path: "/", sameSite: "lax", secure: true });
});

test("hasSessionOnlyMarker reads the marker cookie", () => {
  assert.equal(hasSessionOnlyMarker([{ name: "gohr-auth", value: "x" }]), false);
  assert.equal(hasSessionOnlyMarker([{ name: SESSION_ONLY_COOKIE, value: "1" }]), true);
  assert.equal(hasSessionOnlyMarker([{ name: SESSION_ONLY_COOKIE, value: "" }]), false);
});
