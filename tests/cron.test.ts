import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCron, cronMatches, nextRun, isDue, describeCron, isValidCron } from "../lib/jobs/cron";

// Bangkok = UTC+7 → 08:00 BKK = 01:00Z
const bkk = (s: string) => new Date(s + "+07:00");

test("parse fields", () => {
  const s = parseCron("*/15 8-10 1,15 * 1-5");
  assert.deepEqual([...s.minute], [0, 15, 30, 45]);
  assert.deepEqual([...s.hour], [8, 9, 10]);
  assert.deepEqual([...s.dom].sort((a, b) => a - b), [1, 15]);
  assert.equal(s.month.size, 12);
  assert.deepEqual([...s.dow], [1, 2, 3, 4, 5]);
  assert.deepEqual([...parseCron("0 0 * * 7").dow], [0]);
  assert.deepEqual([...parseCron("0 0 * jan,dec sun").month], [1, 12]);
  assert.deepEqual([...parseCron("5/20 * * * *").minute], [5, 25, 45]);
});

test("invalid expressions", () => {
  for (const e of ["", "* * * *", "60 * * * *", "* 24 * * *", "* * 0 * *", "*/0 * * * *", "a * * * *", "5-1 * * * *"]) {
    assert.equal(isValidCron(e), false, e);
  }
  assert.equal(isValidCron("*/2 * * * *"), true);
});

test("matches in Bangkok time", () => {
  const s = parseCron("0 8 * * 1"); // Monday 08:00
  assert.equal(cronMatches(s, bkk("2026-10-05T08:00:00")), true); // Mon
  assert.equal(cronMatches(s, bkk("2026-10-06T08:00:00")), false); // Tue
  assert.equal(cronMatches(s, new Date("2026-10-05T01:00:00Z")), true);
});

test("dom/dow OR semantics", () => {
  const s = parseCron("0 0 13 * 5"); // 13th OR Friday
  assert.equal(cronMatches(s, bkk("2026-10-13T00:00:00")), true); // Tue 13th
  assert.equal(cronMatches(s, bkk("2026-10-09T00:00:00")), true); // Fri
  assert.equal(cronMatches(s, bkk("2026-10-08T00:00:00")), false);
});

test("nextRun", () => {
  assert.equal(nextRun("*/2 * * * *", bkk("2026-10-07T10:01:30"))!.toISOString(), bkk("2026-10-07T10:02:00").toISOString());
  assert.equal(nextRun("0 8 * * *", bkk("2026-10-07T08:00:00"))!.toISOString(), bkk("2026-10-08T08:00:00").toISOString());
  assert.equal(nextRun("30 0 1 1 *", bkk("2026-10-07T08:00:00"))!.toISOString(), bkk("2027-01-01T00:30:00").toISOString());
  assert.equal(nextRun("0 8 * * 1", bkk("2026-10-07T09:00:00"))!.toISOString(), bkk("2026-10-12T08:00:00").toISOString());
  assert.equal(nextRun("0 0 29 2 *", bkk("2026-10-07T09:00:00"))!.toISOString(), bkk("2028-02-29T00:00:00").toISOString());
});

test("isDue", () => {
  const now = bkk("2026-10-07T08:00:20");
  assert.equal(isDue("0 8 * * *", bkk("2026-10-06T08:00:05"), now), true);
  assert.equal(isDue("0 8 * * *", bkk("2026-10-07T08:00:01"), now), false); // already ran this minute
  assert.equal(isDue("*/2 * * * *", bkk("2026-10-07T07:58:00"), now), true);
  assert.equal(isDue("*/2 * * * *", bkk("2026-10-07T07:59:00"), bkk("2026-10-07T07:59:50")), false);
  assert.equal(isDue("0 7 * * *", null, now), true); // never run, scheduled time passed today
  assert.equal(isDue("30 0 1 1 *", null, now), false); // yearly job, not within grace
  // missed run (server was down) runs once on next check
  assert.equal(isDue("0 8 * * *", bkk("2026-10-05T08:00:00"), bkk("2026-10-07T07:00:00")), true);
});

test("describe in Thai", () => {
  assert.equal(describeCron("*/2 * * * *"), "ทุก 2 นาที");
  assert.equal(describeCron("0 8 * * *"), "ทุกวัน เวลา 08:00 น.");
  assert.equal(describeCron("0 8 * * 1"), "ทุกวันจันทร์ เวลา 08:00 น.");
  assert.equal(describeCron("0 8 * * 1-5"), "วันจันทร์-ศุกร์ เวลา 08:00 น.");
  assert.equal(describeCron("30 0 1 1 *"), "วันที่ 1 เดือนมกราคม เวลา 00:30 น.");
  assert.equal(describeCron("5 * * * *"), "ทุกชั่วโมง นาทีที่ 5");
  assert.match(describeCron("bad"), /ไม่ถูกต้อง/);
});
