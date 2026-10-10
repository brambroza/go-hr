import { test } from "node:test";
import assert from "node:assert/strict";
import { markQueueError, MAX_QUEUED_PHOTO_CHARS, normalizeQueue, partitionQueue, photoForQueue, type QueuedCheckin } from "../components/ess/offline-queue-core";

const item = (ref: string, emp: number): QueuedCheckin => ({ client_ref: ref, log_time: "2026-10-10T01:00:00.000Z", latitude: 13.7, longitude: 100.5, accuracy: 10, direction: "auto", employee_id: emp });

test("normalizeQueue: drops garbage and items without an employee", () => {
  const raw = [item("a", 1), { ...item("b", 2), employee_id: null }, "x", null, { client_ref: 5 }];
  assert.deepEqual(normalizeQueue(raw).map((q) => q.client_ref), ["a"]);
  assert.deepEqual(normalizeQueue("not an array"), []);
});

test("partitionQueue: separates the signed-in employee's items from other people's", () => {
  const list = [item("a", 1), item("b", 2), item("c", 1)];
  const r = partitionQueue(list, 1);
  assert.deepEqual(r.mine.map((q) => q.client_ref), ["a", "c"]);
  assert.deepEqual(r.others.map((q) => q.client_ref), ["b"]);
});

test("partitionQueue: no employee signed in → nothing is mine", () => {
  const list = [item("a", 1)];
  assert.deepEqual(partitionQueue(list, null).mine, []);
  assert.equal(partitionQueue(list, null).others.length, 1);
  assert.deepEqual(partitionQueue(list, 9).mine, []);
});

test("markQueueError: records the error on one item and counts tries", () => {
  const list = [item("a", 1), item("b", 1)];
  const r = markQueueError(markQueueError(list, "a", "อยู่นอกพื้นที่"), "a", "อยู่นอกพื้นที่");
  assert.equal(r[0].error, "อยู่นอกพื้นที่");
  assert.equal(r[0].tries, 2);
  assert.equal(r[1].error, undefined);
});

test("photoForQueue: keeps a small image data URL, drops anything else", () => {
  assert.equal(photoForQueue("data:image/jpeg;base64,AAAA"), "data:image/jpeg;base64,AAAA");
  assert.equal(photoForQueue("https://example.com/x.jpg"), null);
  assert.equal(photoForQueue(null), null);
  assert.equal(photoForQueue("data:image/jpeg;base64," + "A".repeat(MAX_QUEUED_PHOTO_CHARS + 1)), null);
});
