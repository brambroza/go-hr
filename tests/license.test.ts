import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { signLicense, verifyLicense, b64url, type LicensePayload } from "../lib/license";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const pubPem = publicKey.export({ type: "spki", format: "pem" }).toString();
const payload: LicensePayload = {
  license_id: "t-1",
  licensee: "บริษัท ทดสอบ จำกัด",
  max_employees: 50,
  modules: ["professional"],
  issued_at: "2026-10-07",
  support_until: "2027-12-31",
};

test("sign → verify round trip", () => {
  const lic = signLicense(payload, privateKey);
  const s = verifyLicense(lic, { pubPem, now: new Date("2026-10-07T00:00:00Z") });
  assert.equal(s.valid, true);
  assert.equal(s.licensee, "บริษัท ทดสอบ จำกัด");
  assert.equal(s.max_employees, 50);
  assert.equal(s.support_expired, false);
});

test("support expiry does not invalidate the license", () => {
  const lic = signLicense(payload, privateKey);
  const s = verifyLicense(lic, { pubPem, now: new Date("2028-01-02T00:00:00Z") });
  assert.equal(s.valid, true);
  assert.equal(s.support_expired, true);
});

test("tampered payload is rejected", () => {
  const lic = signLicense(payload, privateKey);
  const forged = b64url.encode(JSON.stringify({ ...payload, max_employees: 5000 })) + "." + lic.split(".")[1];
  assert.equal(verifyLicense(forged, { pubPem }).valid, false);
});

test("other key / garbage rejected", () => {
  const other = generateKeyPairSync("ed25519");
  const lic = signLicense(payload, other.privateKey);
  assert.equal(verifyLicense(lic, { pubPem }).valid, false);
  assert.equal(verifyLicense("", { pubPem }).valid, false);
  assert.equal(verifyLicense("abc", { pubPem }).valid, false);
  assert.equal(verifyLicense("abc.def", { pubPem }).valid, false);
});

test("whitespace / line breaks pasted around the license are ignored", () => {
  const lic = signLicense(payload, privateKey);
  const wrapped = "\n  " + lic.slice(0, 20) + "\n" + lic.slice(20) + "  \n";
  assert.equal(verifyLicense(wrapped, { pubPem }).valid, true);
});

test("embedded public key is a valid Ed25519 key", () => {
  const s = verifyLicense(signLicense(payload, privateKey));
  assert.equal(s.valid, false); // signed by a random test key, not GO Along's
  assert.match(s.error ?? "", /ลายเซ็น/);
});
