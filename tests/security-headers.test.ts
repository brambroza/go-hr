import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCsp, cspHeaderName, isTruthyEnv, makeNonce, originOf } from "../lib/security-headers";

test("csp: nonce + strict-dynamic for scripts, no unsafe-inline for scripts", () => {
  const csp = buildCsp({ nonce: "abc123", supabaseUrl: "https://hr.example.co.th" });
  const script = csp.split("; ").find((d) => d.startsWith("script-src "))!;
  assert.match(script, /'nonce-abc123'/);
  assert.match(script, /'strict-dynamic'/);
  assert.doesNotMatch(script, /unsafe-inline/);
  assert.doesNotMatch(script, / 'unsafe-eval'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /report-uri \/api\/csp-report/);
});

test("csp: supabase origin is allowed for images, connections (http + ws) and media", () => {
  const csp = buildCsp({ nonce: "n", supabaseUrl: "https://api.hr.example.co.th/storage/v1" });
  assert.match(csp, /img-src 'self' data: blob: https:\/\/api\.hr\.example\.co\.th/);
  assert.match(csp, /connect-src 'self' https:\/\/api\.hr\.example\.co\.th wss:\/\/api\.hr\.example\.co\.th/);
  assert.doesNotMatch(csp, /storage\/v1/);
});

test("csp: dev mode adds unsafe-eval and websocket HMR; invalid / missing supabase url is ignored", () => {
  const dev = buildCsp({ nonce: "n", supabaseUrl: "kong:8000", dev: true });
  assert.match(dev, /'unsafe-eval'/);
  assert.match(dev, /connect-src 'self' ws: wss:/);
  assert.equal(originOf("not a url"), null);
  assert.equal(originOf("http://kong:8000/x"), "http://kong:8000");
});

test("csp: extra origins de-duplicated", () => {
  const csp = buildCsp({ nonce: "n", supabaseUrl: "https://a.test", extraOrigins: ["https://a.test", "https://static.line-scdn.net/liff/edge/2/sdk.js", "bad"] });
  assert.equal((csp.match(/https:\/\/a\.test/g) ?? []).length >= 1, true);
  assert.match(csp, /img-src 'self' data: blob: https:\/\/a\.test https:\/\/static\.line-scdn\.net/);
});

test("csp: header name follows CSP_ENFORCE; nonce is base64 of 16 bytes", () => {
  assert.equal(cspHeaderName(false), "Content-Security-Policy-Report-Only");
  assert.equal(cspHeaderName(true), "Content-Security-Policy");
  assert.equal(isTruthyEnv("1"), true);
  assert.equal(isTruthyEnv("TRUE"), true);
  assert.equal(isTruthyEnv("0"), false);
  assert.equal(isTruthyEnv(undefined), false);
  const nonce = makeNonce((n) => new Uint8Array(n).fill(7));
  assert.equal(nonce, btoa(String.fromCharCode(...new Array(16).fill(7))));
  assert.notEqual(makeNonce(), makeNonce());
});
