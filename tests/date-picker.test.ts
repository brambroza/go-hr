import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addDaysYmd, addMonths, daysInMonth, fmtDate, fmtDateTime, fmtMonth, inRange, monthGrid, parseYm, parseYmd, splitDateTime, toYm, toYmd, yearBlock,
} from "../components/ui/date-picker-core";

test("parseYmd / toYmd round-trip and reject impossible dates", () => {
  assert.deepEqual(parseYmd("2026-10-09"), { y: 2026, m: 9, d: 9 });
  assert.deepEqual(parseYmd("2026-10-09T08:30"), { y: 2026, m: 9, d: 9 });
  assert.equal(parseYmd("2026-02-30"), null);
  assert.equal(parseYmd("2026-13-01"), null);
  assert.equal(parseYmd(""), null);
  assert.equal(parseYmd(undefined), null);
  assert.equal(toYmd({ y: 2024, m: 1, d: 29 }), "2024-02-29");
});

test("parseYm / toYm / splitDateTime", () => {
  assert.deepEqual(parseYm("2026-03"), { y: 2026, m: 2 });
  assert.deepEqual(parseYm("2026-03-15"), { y: 2026, m: 2 });
  assert.equal(parseYm("2026-00"), null);
  assert.equal(toYm(2026, 0), "2026-01");
  assert.deepEqual(splitDateTime("2026-10-09T17:45"), { date: "2026-10-09", time: "17:45" });
  assert.deepEqual(splitDateTime("2026-10-09"), { date: "2026-10-09", time: "" });
  assert.deepEqual(splitDateTime("x"), { date: "", time: "" });
});

test("month arithmetic", () => {
  assert.equal(daysInMonth(2024, 1), 29);
  assert.equal(daysInMonth(2025, 1), 28);
  assert.deepEqual(addMonths(2026, 11, 1), { y: 2027, m: 0 });
  assert.deepEqual(addMonths(2026, 0, -1), { y: 2025, m: 11 });
  assert.deepEqual(addMonths(2026, 5, -18), { y: 2024, m: 11 });
  assert.equal(addDaysYmd("2026-12-31", 1), "2027-01-01");
  assert.equal(addDaysYmd("2026-03-01", -1), "2026-02-28");
  assert.equal(addDaysYmd("bad", 3), "bad");
});

test("inRange uses the date part of min/max", () => {
  assert.equal(inRange("2026-10-09", "2026-10-01", "2026-10-31"), true);
  assert.equal(inRange("2026-10-09", "2026-10-10", undefined), false);
  assert.equal(inRange("2026-10-09", undefined, "2026-10-08T23:59"), false);
  assert.equal(inRange("2026-10-09", null, null), true);
});

test("monthGrid: 42 cells, starts on Sunday, marks days outside the month", () => {
  const g = monthGrid(2026, 9); // October 2026 starts on a Thursday
  assert.equal(g.length, 42);
  assert.equal(g[0].ymd, "2026-09-27");
  assert.equal(g[0].inMonth, false);
  assert.equal(g[4].ymd, "2026-10-01");
  assert.equal(g[4].inMonth, true);
  assert.equal(g.filter((c) => c.inMonth).length, 31);
  assert.equal(new Date(g[0].ymd).getDay(), 0);
});

test("yearBlock groups years in blocks of 12", () => {
  assert.deepEqual(yearBlock(2026)[0], 2016);
  assert.equal(yearBlock(2026).length, 12);
  assert.equal(yearBlock(2027)[11], 2027);
  assert.equal(yearBlock(2028)[0], 2028);
});

test("Thai display with พ.ศ. year", () => {
  assert.equal(fmtDate("2026-10-09"), "9 ต.ค. 2569");
  assert.equal(fmtDate(""), "");
  assert.equal(fmtMonth("2026-01"), "มกราคม 2569");
  assert.equal(fmtDateTime("2026-10-09T08:05"), "9 ต.ค. 2569 08:05 น.");
  assert.equal(fmtDateTime("2026-10-09"), "9 ต.ค. 2569");
});
