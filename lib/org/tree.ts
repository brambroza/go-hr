// Org chart tree helpers: build the tree from org_chart() rows and plan a drag-and-drop move.
// Pure functions (no React / Supabase) so they can be unit tested.

export interface OrgRow {
  id: number;
  code: string;
  name: string;
  unit_type: string | null;
  parent_id: number | null;
  level: number;
  headcount: number;
  manager: { id: number; name: string; photo_url: string | null; position: string | null } | null;
}

export interface OrgNode extends OrgRow {
  children: OrgNode[];
  total: number; // headcount incl. descendants
}

/** Where a dragged unit lands relative to the unit under the pointer. */
export type DropPos = "before" | "after" | "inside";

/** Build the tree; rows arrive in display order (level, sort_order, name), which children keep. */
export function buildTree(rows: OrgRow[]): OrgNode[] {
  const map = new Map<number, OrgNode>();
  rows.forEach((r) => map.set(r.id, { ...r, children: [], total: 0 }));
  const roots: OrgNode[] = [];
  map.forEach((n) => {
    const p = n.parent_id != null ? map.get(n.parent_id) : undefined;
    if (p) p.children.push(n);
    else roots.push(n);
  });
  const sum = (n: OrgNode): number => (n.total = n.headcount + n.children.reduce((a, c) => a + sum(c), 0));
  roots.forEach(sum);
  return roots;
}

/** Ids of a unit and everything below it. */
export function subtreeIds(rows: Pick<OrgRow, "id" | "parent_id">[], id: number): Set<number> {
  const kids = new Map<number, number[]>();
  rows.forEach((r) => {
    if (r.parent_id != null) kids.set(r.parent_id, [...(kids.get(r.parent_id) ?? []), r.id]);
  });
  const out = new Set<number>();
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop()!;
    if (out.has(cur)) continue;
    out.add(cur);
    stack.push(...(kids.get(cur) ?? []));
  }
  return out;
}

export interface MovePlan {
  parentId: number | null;
  order: number[]; // sibling ids under parentId, in their new order (includes the moved unit)
}

/**
 * Plan moving `dragId` relative to `targetId` (null = drop on the top-level zone, appended last).
 * Returns null when the drop is not allowed (onto itself / its own descendant) or changes nothing.
 */
export function planMove(rows: Pick<OrgRow, "id" | "parent_id">[], dragId: number, targetId: number | null, pos: DropPos): MovePlan | null {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const drag = byId.get(dragId);
  if (!drag) return null;
  const target = targetId == null ? null : byId.get(targetId);
  if (targetId != null && !target) return null;

  const parentId = target == null ? null : pos === "inside" ? target.id : target.parent_id;
  if (parentId != null && subtreeIds(rows, dragId).has(parentId)) return null;
  if (target && target.id === dragId) return null;

  const current = rows.filter((r) => r.parent_id === parentId).map((r) => r.id);
  const order = current.filter((id) => id !== dragId);
  if (target == null || pos === "inside") order.push(dragId);
  else order.splice(order.indexOf(target.id) + (pos === "after" ? 1 : 0), 0, dragId);

  if (drag.parent_id === parentId && order.length === current.length && order.every((id, i) => id === current[i])) return null;
  return { parentId, order };
}
