import { test } from "node:test";
import assert from "node:assert/strict";
import { bahtText, validNationalId, thDate, minutesToHM } from "../lib/format";

test("bahtText", () => {
  assert.equal(bahtText(0), "ศูนย์บาทถ้วน");
  assert.equal(bahtText(1), "หนึ่งบาทถ้วน");
  assert.equal(bahtText(11), "สิบเอ็ดบาทถ้วน");
  assert.equal(bahtText(21), "ยี่สิบเอ็ดบาทถ้วน");
  assert.equal(bahtText(101), "หนึ่งร้อยเอ็ดบาทถ้วน");
  assert.equal(bahtText(1250.5), "หนึ่งพันสองร้อยห้าสิบบาทห้าสิบสตางค์");
  assert.equal(bahtText(1000001), "หนึ่งล้านเอ็ดบาทถ้วน");
  assert.equal(bahtText(21000000), "ยี่สิบเอ็ดล้านบาทถ้วน");
  assert.equal(bahtText(0.25), "ยี่สิบห้าสตางค์");
  assert.equal(bahtText(35750), "สามหมื่นห้าพันเจ็ดร้อยห้าสิบบาทถ้วน");
});

test("national id checksum", () => {
  assert.equal(validNationalId("1101700230708"), true);
  assert.equal(validNationalId("1101700230705"), false);
});

test("thai date", () => {
  assert.equal(thDate("2026-10-07"), "7 ต.ค. 2569");
  assert.equal(thDate("2026-10-07", "long"), "7 ตุลาคม 2569");
  assert.equal(minutesToHM(125), "2:05");
});
