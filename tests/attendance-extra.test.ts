import { test } from "node:test";
import assert from "node:assert/strict";
import { ScheduleIndex, expandPattern, monthRange, parsePattern, resolveDay, weekStart, type EmpSchedule } from "../lib/attendance/schedule";
import { normalizeDirection, parseBangkokTime, parseCsvLogs, parseZkAttlog } from "../lib/attendance/parse";
import { computeQuota, type QuotaLeaveType } from "../lib/leave/quota";
import { requiredCount, type PlanRow } from "../lib/attendance/manpower";
import { kioskToken } from "../lib/attendance/qr";

const emp: EmpSchedule = { id: 7, branch_id: 1, org_unit_id: 6, default_shift_id: 1, weekly_off_days: [0] };

test("resolveDay: weekly off, holiday, special workday, personal override precedence", () => {
  const idx = new ScheduleIndex(
    [
      { holiday_date: "2026-10-13", name: "ร.9", branch_id: null, org_unit_id: null, employee_ids: null },
      { holiday_date: "2026-10-14", name: "สาขา 2", branch_id: 2, org_unit_id: null, employee_ids: null },
      { holiday_date: "2026-10-15", name: "เฉพาะคน", branch_id: null, org_unit_id: null, employee_ids: [99] },
      { holiday_date: "2026-10-16", name: "เฉพาะคน", branch_id: null, org_unit_id: null, employee_ids: [7] },
    ],
    [{ work_date: "2026-10-11", name: "ทำงานชดเชย", branch_id: 1, org_unit_id: null, shift_id: 2 }],
    [
      { employee_id: 7, work_date: "2026-10-13", shift_id: 4, is_day_off: false },
      { employee_id: 7, work_date: "2026-10-20", shift_id: null, is_day_off: true },
    ],
  );
  assert.deepEqual(resolveDay(emp, "2026-10-18", idx), { shift_id: 1, day_type: "off" }); // Sunday
  assert.equal(resolveDay(emp, "2026-10-11", idx).day_type, "special"); // Sunday made a workday
  assert.equal(resolveDay(emp, "2026-10-11", idx).shift_id, 2);
  const h = resolveDay(emp, "2026-10-13", idx); // scheduled on a holiday = holiday work
  assert.equal(h.day_type, "holiday");
  assert.equal(h.shift_id, 4);
  assert.equal(resolveDay(emp, "2026-10-14", idx).day_type, "work"); // other branch's holiday
  assert.equal(resolveDay(emp, "2026-10-15", idx).day_type, "work"); // someone else's personal holiday
  assert.equal(resolveDay(emp, "2026-10-16", idx).day_type, "holiday");
  assert.equal(resolveDay(emp, "2026-10-20", idx).day_type, "off");
});

test("date helpers", () => {
  assert.equal(weekStart("2026-10-07"), "2026-10-05"); // Wed → Mon
  assert.equal(weekStart("2026-10-11"), "2026-10-05"); // Sun → Mon
  assert.deepEqual(monthRange("2026-02"), { from: "2026-02-01", to: "2026-02-28" });
});

test("roster patterns", () => {
  assert.deepEqual(parsePattern("D,D,OFF"), ["D", "D", "OFF"]);
  assert.deepEqual(parsePattern("N×6,OFF"), ["N", "N", "N", "N", "N", "N", "OFF"]);
  assert.deepEqual(parsePattern("a x2 หยุด"), ["A", "A", "OFF"]);
  assert.equal(parsePattern("  "), null);
  const days = expandPattern(["D", "OFF"], "2026-10-01", "2026-10-05", 1);
  assert.deepEqual(days.map((d) => d.code), ["OFF", "D", "OFF", "D", "OFF"]);
});

test("time parsing (Bangkok local, ISO, Thai date, Buddhist year)", () => {
  assert.equal(parseBangkokTime("2026-10-07 08:01:30")?.toISOString(), "2026-10-07T01:01:30.000Z");
  assert.equal(parseBangkokTime("2026-10-07T08:01:00Z")?.toISOString(), "2026-10-07T08:01:00.000Z");
  assert.equal(parseBangkokTime("07/10/2569 08:01")?.toISOString(), "2026-10-07T01:01:00.000Z");
  assert.equal(parseBangkokTime("2026-13-01 08:00"), null);
  assert.equal(parseBangkokTime("hello"), null);
  assert.equal(normalizeDirection("1"), "out");
  assert.equal(normalizeDirection("IN"), "in");
  assert.equal(normalizeDirection(undefined), "auto");
});

test("CSV and ZKTeco attlog parsing", () => {
  const csv = parseCsvLogs([["employee_code", "datetime", "direction"], ["E0007", "2026-10-07 07:55:00", "in"], ["E0008", "bad"]]);
  assert.equal(csv.length, 2);
  assert.equal(csv[0].user, "E0007");
  assert.equal(csv[0].direction, "in");
  assert.ok(csv[1].error);
  const zk = parseZkAttlog("      7\t2026-10-07 07:55:12\t1\t0\t1\t0\n     12\t2026-10-07 17:01:02\t1\t1\t1\t0\n\n");
  assert.equal(zk.length, 2);
  assert.equal(zk[0].user, "7");
  assert.equal(zk[0].time, "2026-10-07T00:55:12.000Z");
  assert.equal(zk[1].direction, "out");
});

const VAC: QuotaLeaveType = { id: 3, code: "VACATION", default_quota_days: 6, is_unlimited: false, carry_over_max_days: 6, min_service_months: 12, prorate_first_year: false, gender: null };

test("leave quota: vacation needs 1 year of service; carry over capped", () => {
  assert.equal(computeQuota(VAC, { id: 1, gender: "M", hire_date: "2026-03-01" }, 2026), null);
  assert.deepEqual(computeQuota(VAC, { id: 1, gender: "M", hire_date: "2026-03-01" }, 2027), { quota_days: 6, carried_days: 0 });
  assert.deepEqual(computeQuota({ ...VAC, prorate_first_year: true }, { id: 1, gender: "M", hire_date: "2026-03-01" }, 2027), { quota_days: 5, carried_days: 0 });
  assert.deepEqual(computeQuota(VAC, { id: 1, gender: "M", hire_date: "2015-01-01" }, 2027, 9), { quota_days: 6, carried_days: 6 });
  assert.deepEqual(computeQuota(VAC, { id: 1, gender: "M", hire_date: "2015-01-01" }, 2027, -2), { quota_days: 6, carried_days: 0 });
});

test("leave quota: gender restricted, unlimited and resigned employees are skipped", () => {
  const mat = { ...VAC, code: "MATERNITY", default_quota_days: 120, carry_over_max_days: 0, min_service_months: 0, gender: "F" };
  assert.equal(computeQuota(mat, { id: 1, gender: "M", hire_date: "2020-01-01" }, 2027), null);
  assert.deepEqual(computeQuota(mat, { id: 1, gender: "F", hire_date: "2020-01-01" }, 2027), { quota_days: 120, carried_days: 0 });
  assert.equal(computeQuota({ ...VAC, is_unlimited: true }, { id: 1, gender: "M", hire_date: "2020-01-01" }, 2027), null);
  assert.equal(computeQuota(VAC, { id: 1, gender: "M", hire_date: "2020-01-01", resign_date: "2026-05-01" }, 2027), null);
});

test("manpower: date-specific plan overrides weekday plan of the same key", () => {
  const plans: PlanRow[] = [
    { org_unit_id: 6, branch_id: null, position_id: null, shift_id: 1, weekday: null, plan_date: null, required_count: 10 },
    { org_unit_id: 6, branch_id: null, position_id: null, shift_id: 1, weekday: 6, plan_date: null, required_count: 4 },
    { org_unit_id: 6, branch_id: null, position_id: null, shift_id: 1, weekday: null, plan_date: "2026-10-08", required_count: 15 },
    { org_unit_id: 7, branch_id: null, position_id: null, shift_id: 1, weekday: null, plan_date: null, required_count: 5 },
  ];
  assert.equal(requiredCount(plans, "2026-10-07", 1), 15); // Wed: 10 (unit 6) + 5 (unit 7)
  assert.equal(requiredCount(plans, "2026-10-10", 1), 9); // Sat: 4 + 5
  assert.equal(requiredCount(plans, "2026-10-08", 1), 20); // date plan 15 + 5
  assert.equal(requiredCount(plans, "2026-10-07", 1, (p) => p.org_unit_id === 7), 5);
});

test("kiosk QR token matches the SQL format", () => {
  // select encode(hmac('1.29000000', 'secret', 'sha256'), 'hex')
  assert.equal(kioskToken(1, "secret", 29000000), "1.29000000.417ba58247a8b0e88cae7e7d198081d8ed46e17c78469098ae63abfee0e6b0f8");
});
