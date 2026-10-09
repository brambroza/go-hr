import { test } from "node:test";
import assert from "node:assert/strict";
import { allowedLocations, DEFAULT_POLICY, gpsAllowed, parsePolicy, validateOrgPolicy } from "../lib/attendance/checkin-policy";

const LOCS = [
  { id: 1, name: "สำนักงานใหญ่" },
  { id: 2, name: "โรงงานระยอง" },
  { id: 3, name: "คลังสินค้า" },
];

test("parsePolicy: jsonb from my_checkin_policy()", () => {
  assert.deepEqual(parsePolicy({ mode: "locations", location_ids: [2, 3], source: "org_unit:7" }), { mode: "locations", location_ids: [2, 3], source: "org_unit:7" });
  assert.deepEqual(parsePolicy({ mode: "anywhere", location_ids: [], source: "org_unit:9" }), { mode: "anywhere", location_ids: [], source: "org_unit:9" });
  assert.deepEqual(parsePolicy({ mode: "all", location_ids: [], source: "default" }), { mode: "all", location_ids: [], source: "default" });
});

test("parsePolicy: malformed input falls back to all", () => {
  assert.deepEqual(parsePolicy(null), DEFAULT_POLICY);
  assert.deepEqual(parsePolicy("x"), DEFAULT_POLICY);
  assert.deepEqual(parsePolicy({ mode: "weird" }), { mode: "all", location_ids: [], source: undefined });
  // "locations" with an empty list would lock the employee out — treat as all
  assert.deepEqual(parsePolicy({ mode: "locations", location_ids: [] }), DEFAULT_POLICY);
  assert.deepEqual(parsePolicy({ mode: "locations", location_ids: ["2", "x"] }).location_ids, [2]);
});

test("allowedLocations filters only in locations mode", () => {
  assert.deepEqual(allowedLocations({ mode: "locations", location_ids: [2] }, LOCS).map((l) => l.id), [2]);
  assert.deepEqual(allowedLocations({ mode: "all", location_ids: [] }, LOCS).map((l) => l.id), [1, 2, 3]);
  // anywhere keeps every location so the screen can still show the nearest one for information
  assert.deepEqual(allowedLocations({ mode: "anywhere", location_ids: [] }, LOCS).map((l) => l.id), [1, 2, 3]);
  assert.deepEqual(allowedLocations({ mode: "locations", location_ids: [99] }, LOCS), []);
});

test("gpsAllowed: anywhere ignores the radius, other modes need to be inside", () => {
  assert.equal(gpsAllowed({ mode: "anywhere", location_ids: [] }, false), true);
  assert.equal(gpsAllowed({ mode: "all", location_ids: [] }, false), false);
  assert.equal(gpsAllowed({ mode: "all", location_ids: [] }, true), true);
  assert.equal(gpsAllowed({ mode: "locations", location_ids: [1] }, false), false);
});

test("validateOrgPolicy: locations mode needs at least one location", () => {
  assert.equal(validateOrgPolicy("locations", []), "เลือกพื้นที่ลงเวลาอย่างน้อย 1 จุด");
  assert.equal(validateOrgPolicy("locations", null), "เลือกพื้นที่ลงเวลาอย่างน้อย 1 จุด");
  assert.equal(validateOrgPolicy("locations", [1]), null);
  assert.equal(validateOrgPolicy("inherit", []), null);
  assert.equal(validateOrgPolicy("anywhere", []), null);
});
