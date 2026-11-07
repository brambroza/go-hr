import { test } from "node:test";
import assert from "node:assert/strict";
import { TrialSignupSchema, firstIssue, leadSummary, parseDemoAccounts } from "../lib/trial";
import { verifyTurnstile } from "../lib/turnstile";
import { clientIp } from "../lib/client-ip";
import { buildCsp } from "../lib/security-headers";

const valid = {
  company_name: "บริษัท ทดสอบ จำกัด",
  contact_name: "สมชาย ใจดี",
  phone: "081-234-5678",
  headcount_range: "151-300",
  consent: "1",
};

test("trial: valid form is normalised (phone digits only, empty optionals become null)", () => {
  const r = TrialSignupSchema.safeParse({ ...valid, email: " Sales@Example.CO.TH ", line_id: "", industry: "โรงงาน / การผลิต" });
  assert.ok(r.success);
  assert.equal(r.data.phone, "0812345678");
  assert.equal(r.data.email, "sales@example.co.th");
  assert.equal(r.data.line_id, null);
  assert.equal(r.data.industry, "โรงงาน / การผลิต");
});

test("trial: required fields, bad phone / email / headcount / industry and missing consent are refused", () => {
  const cases: [Record<string, string>, string][] = [
    [{ ...valid, company_name: " " }, "company_name"],
    [{ ...valid, phone: "12345" }, "phone"],
    [{ ...valid, email: "not-an-email" }, "email"],
    [{ ...valid, headcount_range: "9999" }, "headcount_range"],
    [{ ...valid, industry: "<script>" }, "industry"],
    [{ ...valid, consent: "" }, "consent"],
  ];
  for (const [input, field] of cases) {
    const r = TrialSignupSchema.safeParse(input);
    assert.equal(r.success, false, field);
    if (!r.success) assert.equal(firstIssue(r.error).field, field);
  }
  assert.equal(TrialSignupSchema.safeParse({ ...valid, note: "x".repeat(1001) }).success, false);
});

test("trial: demo accounts env — bad JSON / bad items dropped, unsafe paths removed", () => {
  assert.deepEqual(parseDemoAccounts(undefined), []);
  assert.deepEqual(parseDemoAccounts("{oops"), []);
  assert.deepEqual(parseDemoAccounts('{"a":1}'), []);
  const list = parseDemoAccounts(
    JSON.stringify([
      { label: "HR", login: "hr", password: "Hr@12345", path: "/dashboard" },
      { label: "พนักงาน", login: "E0011", password: "x", path: "//evil.example" },
      { label: "no password", login: "x" },
      "junk",
    ]),
  );
  assert.equal(list.length, 2);
  assert.equal(list[0].path, "/dashboard");
  assert.equal(list[1].path, undefined);
});

test("trial: lead summary for LINE contains the contact data and skips empty lines", () => {
  const t = leadSummary({ company_name: "ACME", contact_name: "A", position: null, phone: "0812345678", email: null, line_id: "acme", headcount_range: "51-150", industry: null, note: null }, "TR000001");
  assert.match(t, /TR000001/);
  assert.match(t, /LINE: acme/);
  assert.doesNotMatch(t, /อีเมล/);
  assert.doesNotMatch(t, /\n\n/);
});

test("turnstile: fails closed without secret / token, passes the visitor IP, checks hostname", async () => {
  assert.deepEqual(await verifyTurnstile("t", ""), { ok: false, codes: ["missing-input-secret"] });
  assert.deepEqual(await verifyTurnstile("", "s"), { ok: false, codes: ["missing-input-response"] });

  let sent: URLSearchParams | null = null;
  const okFetch = async (_u: string, init: { body: URLSearchParams }) => {
    sent = init.body;
    return { ok: true, json: async () => ({ success: true, hostname: "demo.gohr.co.th" }) };
  };
  assert.deepEqual(await verifyTurnstile("tok", "sec", "1.2.3.4", "demo.gohr.co.th", okFetch), { ok: true, codes: [] });
  assert.equal(sent!.get("remoteip"), "1.2.3.4");
  assert.equal(sent!.get("response"), "tok");
  assert.deepEqual(await verifyTurnstile("tok", "sec", null, "other.example", okFetch), { ok: false, codes: ["hostname-mismatch"] });

  const failFetch = async () => ({ ok: true, json: async () => ({ success: false, "error-codes": ["timeout-or-duplicate"] }) });
  assert.deepEqual(await verifyTurnstile("tok", "sec", null, null, failFetch), { ok: false, codes: ["timeout-or-duplicate"] });
  const downFetch = async () => {
    throw new Error("down");
  };
  assert.deepEqual(await verifyTurnstile("tok", "sec", null, null, downFetch), { ok: false, codes: ["network-error"] });
});

test("client ip: CF-Connecting-IP only when Cloudflare is trusted; junk values ignored", () => {
  const h = (o: Record<string, string>) => ({ get: (k: string) => o[k.toLowerCase()] ?? null });
  const req = h({ "cf-connecting-ip": "203.0.113.9", "x-forwarded-for": "198.51.100.1, 10.0.0.1" });
  assert.equal(clientIp(req, true), "203.0.113.9");
  assert.equal(clientIp(req, false), "198.51.100.1");
  assert.equal(clientIp(h({ "cf-connecting-ip": "<script>", "x-real-ip": "2001:db8::1" }), true), "2001:db8::1");
  assert.equal(clientIp(h({}), true), "local");
});

test("csp: turnstile adds challenges.cloudflare.com to script / frame / connect only when asked", () => {
  const off = buildCsp({ nonce: "n" });
  assert.doesNotMatch(off, /challenges\.cloudflare\.com/);
  const on = buildCsp({ nonce: "n", turnstile: true });
  for (const d of ["script-src", "frame-src", "connect-src"]) {
    const dir = on.split("; ").find((x) => x.startsWith(d + " "))!;
    assert.match(dir, /https:\/\/challenges\.cloudflare\.com/, d);
  }
});
