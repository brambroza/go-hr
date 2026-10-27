import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTree, planMove, subtreeIds, type OrgRow } from "../lib/org/tree";

const row = (id: number, parent_id: number | null, headcount = 0): OrgRow => ({
  id, code: `U${id}`, name: `Unit ${id}`, unit_type: null, parent_id, level: 1, headcount, manager: null,
});

// 1 ─┬─ 2 ── 4 ── 5
//    └─ 3
const ROWS = [row(1, null, 1), row(2, 1, 2), row(3, 1, 3), row(4, 2, 4), row(5, 4, 5)];

test("buildTree: nests children in row order and sums headcount", () => {
  const [root] = buildTree(ROWS);
  assert.deepEqual(root.children.map((c) => c.id), [2, 3]);
  assert.equal(root.total, 15);
  assert.equal(root.children[0].total, 11);
});

test("buildTree: no depth limit", () => {
  const deep = Array.from({ length: 50 }, (_, i) => row(i + 1, i === 0 ? null : i, 1));
  let n = buildTree(deep)[0];
  let depth = 1;
  while (n.children.length) { n = n.children[0]; depth++; }
  assert.equal(depth, 50);
});

test("subtreeIds: unit and all descendants", () => {
  assert.deepEqual([...subtreeIds(ROWS, 2)].sort(), [2, 4, 5]);
  assert.deepEqual([...subtreeIds(ROWS, 3)], [3]);
});

test("planMove: inside another unit appends last", () => {
  assert.deepEqual(planMove(ROWS, 3, 2, "inside"), { parentId: 2, order: [4, 3] });
});

test("planMove: before / after a sibling reorders", () => {
  assert.deepEqual(planMove(ROWS, 3, 2, "before"), { parentId: 1, order: [3, 2] });
  assert.deepEqual(planMove(ROWS, 2, 3, "after"), { parentId: 1, order: [3, 2] });
});

test("planMove: before / after a unit in another branch re-parents", () => {
  assert.deepEqual(planMove(ROWS, 3, 4, "after"), { parentId: 2, order: [4, 3] });
});

test("planMove: top-level zone", () => {
  assert.deepEqual(planMove(ROWS, 4, null, "inside"), { parentId: null, order: [1, 4] });
});

test("planMove: rejects self, own descendants and no-ops", () => {
  assert.equal(planMove(ROWS, 2, 2, "inside"), null);
  assert.equal(planMove(ROWS, 2, 5, "inside"), null);
  assert.equal(planMove(ROWS, 2, 4, "before"), null);
  assert.equal(planMove(ROWS, 2, 3, "before"), null); // already first
  assert.equal(planMove(ROWS, 4, 2, "inside"), null); // already the only child
  assert.equal(planMove(ROWS, 99, 2, "inside"), null);
});
