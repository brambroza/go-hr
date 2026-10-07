import { test } from "node:test";
import assert from "node:assert/strict";
import { computeDay, type ShiftDef, type AttendanceSettings } from "../lib/attendance/engine";

const shift: ShiftDef = { start_time: "08:00:00", end_time: "17:00:00", is_overnight: false, break_start: "12:00", break_end: "13:00",
  break_minutes: 60, work_minutes: 480, scan_in_before_min: 180, scan_out_after_min: 480, late_grace_min: 0, early_grace_min: 0,
  break_over_grace_min: 0, ot_before_min: 0, ot_after_start_min: 30, ot_min_minutes: 30, ot_round_minutes: 15, require_ot_request: true };
const night: ShiftDef = { ...shift, start_time: "20:00", end_time: "05:00", is_overnight: true, break_start: "00:00", break_end: "01:00" };
const settings: AttendanceSettings = { absent_if_no_scan: true, auto_ot_without_request: false, employee_type: "monthly",
  ot_rates: { workday: 1.5, holiday_monthly: 1, holiday_daily: 2, holiday_ot: 3 } };
const t = (s: string) => new Date(s + "+07:00").toISOString();

test("on time, normal day", () => {
  const r = computeDay({ date: "2026-10-07", dayType: "work", shift, settings, leaves: [], otRequests: [],
    logs: [{ time: t("2026-10-07T07:52:00") }, { time: t("2026-10-07T17:03:00") }] });
  assert.equal(r.late_minutes, 0);
  assert.equal(r.early_minutes, 0);
  assert.equal(r.work_minutes, 480);
  assert.equal(r.absent, false);
});

test("late 12 min and early out 20 min", () => {
  const r = computeDay({ date: "2026-10-07", dayType: "work", shift, settings, leaves: [], otRequests: [],
    logs: [{ time: t("2026-10-07T08:12:00") }, { time: t("2026-10-07T16:40:00") }] });
  assert.equal(r.late_minutes, 12);
  assert.equal(r.early_minutes, 20);
  assert.equal(r.work_minutes, 480 - 32);
});

test("no scan on work day = absent; on leave = not absent", () => {
  assert.equal(computeDay({ date: "2026-10-07", dayType: "work", shift, settings, leaves: [], otRequests: [], logs: [] }).absent, true);
  const r = computeDay({ date: "2026-10-07", dayType: "work", shift, settings, leaves: [{ unit: "full", leave_type_id: 1 }], otRequests: [], logs: [] });
  assert.equal(r.absent, false);
  assert.equal(r.leave_minutes, 480);
});

test("half day morning leave: due at 13:00", () => {
  const r = computeDay({ date: "2026-10-07", dayType: "work", shift, settings, leaves: [{ unit: "half_am" }], otRequests: [],
    logs: [{ time: t("2026-10-07T12:55:00") }, { time: t("2026-10-07T17:00:00") }] });
  assert.equal(r.late_minutes, 0);
  assert.equal(r.work_minutes, 240);
});

test("single scan = missing scan", () => {
  const r = computeDay({ date: "2026-10-07", dayType: "work", shift, settings, leaves: [], otRequests: [], logs: [{ time: t("2026-10-07T07:58:00") }] });
  assert.equal(r.missing_scan, true);
  assert.equal(r.absent, false);
});

test("approved OT after shift counted at 1.5x, rounded to 15 min", () => {
  const r = computeDay({ date: "2026-10-07", dayType: "work", shift, settings, leaves: [],
    otRequests: [{ start: t("2026-10-07T17:30:00"), end: t("2026-10-07T20:30:00") }],
    logs: [{ time: t("2026-10-07T07:55:00") }, { time: t("2026-10-07T20:10:00") }] });
  assert.deepEqual(r.ot_approved_minutes, { "1.5": 150 });
});

test("OT without request is not paid when request required", () => {
  const r = computeDay({ date: "2026-10-07", dayType: "work", shift, settings, leaves: [], otRequests: [],
    logs: [{ time: t("2026-10-07T07:55:00") }, { time: t("2026-10-07T20:10:00") }] });
  assert.deepEqual(r.ot_approved_minutes, {});
  assert.equal(r.ot_after_minutes, 150);
});

test("holiday work monthly: 1x for normal hours + 3x after", () => {
  const r = computeDay({ date: "2026-10-13", dayType: "holiday", shift, settings, leaves: [],
    otRequests: [{ start: t("2026-10-13T08:00:00"), end: t("2026-10-13T19:30:00") }],
    logs: [{ time: t("2026-10-13T07:58:00") }, { time: t("2026-10-13T19:31:00") }] });
  assert.deepEqual(r.ot_approved_minutes, { "1": 480, "3": 150 });
  assert.equal(r.absent, false);
});

test("holiday work daily employee gets 2x for normal hours", () => {
  const r = computeDay({ date: "2026-10-13", dayType: "off", shift, settings: { ...settings, employee_type: "daily" }, leaves: [],
    otRequests: [{ start: t("2026-10-13T08:00:00"), end: t("2026-10-13T17:00:00") }],
    logs: [{ time: t("2026-10-13T07:58:00") }, { time: t("2026-10-13T17:05:00") }] });
  assert.deepEqual(r.ot_approved_minutes, { "2": 480 });
});

test("night shift across midnight", () => {
  const r = computeDay({ date: "2026-10-07", dayType: "work", shift: night, settings, leaves: [], otRequests: [],
    logs: [{ time: t("2026-10-07T20:05:00") }, { time: t("2026-10-08T05:01:00") }] });
  assert.equal(r.late_minutes, 5);
  assert.equal(r.early_minutes, 0);
  assert.equal(r.work_minutes, 475);
});

test("off day with no scans is fine", () => {
  const r = computeDay({ date: "2026-10-11", dayType: "off", shift, settings, leaves: [], otRequests: [], logs: [] });
  assert.equal(r.absent, false);
});

test("hourly leave offsets lateness", () => {
  const r = computeDay({ date: "2026-10-07", dayType: "work", shift, settings, leaves: [{ unit: "hours", minutes: 120 }], otRequests: [],
    logs: [{ time: t("2026-10-07T10:00:00") }, { time: t("2026-10-07T17:00:00") }] });
  assert.equal(r.late_minutes, 0);
});
