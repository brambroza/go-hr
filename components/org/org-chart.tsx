"use client";

import type { Res } from "@/lib/employees/labels";
import { type DragEvent, type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, GripVertical, Minus, Network, Plus, Rows3, Users } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useCan } from "@/components/app/me-context";
import { buildTree, planMove, subtreeIds, type DropPos, type OrgNode, type OrgRow } from "@/lib/org/tree";
import { Badge, Button, Checkbox, Empty, Modal, Panel, Spinner, clsx, toast } from "@/components/ui";
import { Avatar } from "@/components/employees/avatar";

export type { OrgNode } from "@/lib/org/tree";

/** Drag-and-drop state shared by every node (chart and outline views). */
interface DragApi {
  enabled: boolean;
  dragId: number | null;
  blocked: Set<number>; // the dragged unit and its descendants — not valid drop targets
  over: { id: number; pos: DropPos } | null;
  start: (id: number, e: DragEvent) => void;
  hover: (id: number, e: DragEvent, axis: "x" | "y") => void;
  drop: (id: number | null, e: DragEvent) => void;
  end: () => void;
}

// edge quarter of a card = place before/after as a sibling; the middle = move inside
function dropPos(e: DragEvent, axis: "x" | "y"): DropPos {
  const r = e.currentTarget.getBoundingClientRect();
  const f = axis === "x" ? (e.clientX - r.left) / r.width : (e.clientY - r.top) / r.height;
  return f < 0.25 ? "before" : f > 0.75 ? "after" : "inside";
}

function onActivate(fn: () => void) {
  return (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fn();
    }
  };
}

export function OrgChart() {
  const [rows, setRows] = useState<OrgRow[] | null>(null);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [view, setView] = useState<"chart" | "outline">(() => (typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches ? "outline" : "chart"));
  const [zoom, setZoom] = useState(1);
  const [selected, setSelected] = useState<OrgNode | null>(null);
  const can = useCan();
  const canMove = can("org", "edit");
  const [dragId, setDragId] = useState<number | null>(null);
  const [over, setOver] = useState<{ id: number; pos: DropPos } | null>(null);
  const [overRoot, setOverRoot] = useState(false);
  const [moving, setMoving] = useState(false);

  const load = useCallback(
    () =>
      supabaseBrowser()
        .rpc("org_chart")
        .then(({ data, error }: Res) => {
          if (error) toast.error(error.message);
          setRows((data as OrgRow[]) ?? []);
        }),
    [],
  );
  useEffect(() => {
    load();
  }, [load]);

  const tree = useMemo(() => (rows ? buildTree(rows) : []), [rows]);
  const blocked = useMemo(() => (rows && dragId != null ? subtreeIds(rows, dragId) : new Set<number>()), [rows, dragId]);
  const scroller = useRef<HTMLDivElement>(null);
  const centered = useRef(false);
  useEffect(() => {
    // center the root horizontally on first render of the chart (not after every move)
    const el = scroller.current;
    if (el && view === "chart" && !centered.current && tree.length) {
      el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
      centered.current = true;
    }
  }, [tree, view]);
  const toggle = (id: number) =>
    setCollapsed((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const endDrag = () => {
    setDragId(null);
    setOver(null);
    setOverRoot(false);
  };

  const move = async (id: number, targetId: number | null, pos: DropPos) => {
    if (!rows) return;
    const plan = planMove(rows, id, targetId, pos);
    if (!plan) return;
    setMoving(true);
    const { error } = await supabaseBrowser().rpc("move_org_unit", { p_id: id, p_parent_id: plan.parentId, p_order: plan.order });
    setMoving(false);
    if (error) return toast.error(error.message);
    if (plan.parentId != null) setCollapsed((s) => (s.has(plan.parentId!) ? new Set([...s].filter((x) => x !== plan.parentId)) : s));
    const name = rows.find((r) => r.id === id)?.name;
    const parent = plan.parentId == null ? "ระดับบนสุด" : rows.find((r) => r.id === plan.parentId)?.name;
    toast.ok(`ย้าย ${name} ไปอยู่ใต้ ${parent} แล้ว`);
    await load();
  };

  const drag: DragApi = {
    enabled: canMove && !moving,
    dragId,
    blocked,
    over,
    start: (id, e) => {
      e.stopPropagation();
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", String(id)); // Firefox needs data to start a drag
      setDragId(id);
    },
    hover: (id, e, axis) => {
      if (dragId == null || blocked.has(id)) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move";
      const pos = dropPos(e, axis);
      if (over?.id !== id || over.pos !== pos) setOver({ id, pos });
      if (overRoot) setOverRoot(false);
    },
    drop: (id, e) => {
      e.preventDefault();
      e.stopPropagation();
      const src = dragId;
      const pos = id == null ? "inside" : over?.id === id ? over.pos : dropPos(e, view === "chart" ? "x" : "y");
      endDrag();
      if (src != null && (id == null || !blocked.has(id))) void move(src, id, pos);
    },
    end: endDrag,
  };

  // scroll the chart while dragging near its edges
  const edgeScroll = (e: DragEvent<HTMLDivElement>) => {
    if (dragId == null) return;
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    const edge = 48;
    const dx = e.clientX < r.left + edge ? -16 : e.clientX > r.right - edge ? 16 : 0;
    const dy = e.clientY < r.top + edge ? -16 : e.clientY > r.bottom - edge ? 16 : 0;
    if (dx || dy) el.scrollBy(dx, dy);
  };

  if (!rows) return <Panel><div className="py-16"><Spinner className="mx-auto" /></div></Panel>;
  if (!rows.length)
    return (
      <Panel>
        <Empty icon={<Network className="size-8" />} title="ยังไม่มีหน่วยงาน" description="เพิ่มหน่วยงานแรก (เช่น ชื่อบริษัท) ที่แท็บ “รายการหน่วยงาน” แล้วเพิ่มฝ่าย/แผนกภายใต้" />
      </Panel>
    );

  const total = tree.reduce((a, n) => a + n.total, 0);
  const dragged = dragId != null ? rows.find((r) => r.id === dragId) : undefined;
  const rootZone = dragged && dragged.parent_id != null && (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (!overRoot) setOverRoot(true);
        if (over) setOver(null);
      }}
      onDragLeave={() => setOverRoot(false)}
      onDrop={(e) => drag.drop(null, e)}
      className={clsx(
        "mx-4 mt-3 rounded-[var(--radius-panel)] border-2 border-dashed px-4 py-3 text-center text-sm",
        overRoot ? "border-jade-500 bg-jade-50 text-jade-800" : "border-line text-ink-mute",
      )}
    >
      วางที่นี่เพื่อให้ “{dragged.name}” เป็นหน่วยงานระดับบนสุด
    </div>
  );

  return (
    <Panel
      bodyClass="p-0"
      title={<span>ผังองค์กร <span className="num ml-1 text-sm font-normal text-ink-soft">{rows.length} หน่วยงาน · {total.toLocaleString()} คน</span></span>}
      actions={
        <>
          {moving && <Spinner className="size-4" />}
          <div className="flex rounded-[var(--radius-ctl)] border border-line p-0.5" role="group" aria-label="รูปแบบการแสดงผล">
            <button type="button" aria-pressed={view === "chart"} onClick={() => setView("chart")} className={clsx("inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm", view === "chart" ? "bg-jade-600 text-white" : "text-ink-soft hover:bg-jade-50")}>
              <Network className="size-4" /> แผนผัง
            </button>
            <button type="button" aria-pressed={view === "outline"} onClick={() => setView("outline")} className={clsx("inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm", view === "outline" ? "bg-jade-600 text-white" : "text-ink-soft hover:bg-jade-50")}>
              <Rows3 className="size-4" /> รายการ
            </button>
          </div>
          {view === "chart" && (
            <div className="hidden items-center gap-1 sm:flex">
              <Button size="sm" variant="secondary" aria-label="ย่อ" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(1)))}><Minus className="size-4" /></Button>
              <span className="num w-11 text-center text-sm text-ink-soft">{Math.round(zoom * 100)}%</span>
              <Button size="sm" variant="secondary" aria-label="ขยาย" onClick={() => setZoom((z) => Math.min(1.5, +(z + 0.1).toFixed(1)))}><Plus className="size-4" /></Button>
            </div>
          )}
          <Button size="sm" variant="ghost" onClick={() => setCollapsed(new Set())}>ขยายทั้งหมด</Button>
        </>
      }
    >
      {canMove && (
        <p className="hidden border-b border-line-soft px-4 py-2 text-xs text-ink-mute sm:block">
          <GripVertical className="mr-1 inline size-3.5 align-[-2px]" />
          ลากหน่วยงานไปวางกลางการ์ดของหน่วยงานอื่นเพื่อย้ายไปอยู่ใต้ หรือวางที่ขอบ{view === "chart" ? "ซ้าย/ขวา" : "บน/ล่าง"}ของการ์ดเพื่อเรียงลำดับในชั้นเดียวกัน
        </p>
      )}
      {rootZone}
      {view === "chart" ? (
        <div ref={scroller} onDragOver={edgeScroll} className="thin-scroll overflow-auto bg-paper/50 p-6">
          <style>{TREE_CSS}</style>
          <div style={{ zoom }} className="w-max min-w-full">
            <ul className={"gohr-orgtree"}>
              {tree.map((n) => (
                <ChartNode key={n.id} n={n} collapsed={collapsed} toggle={toggle} onOpen={setSelected} drag={drag} />
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <ul className="py-2" role="tree">
          {tree.map((n) => (
            <OutlineNode key={n.id} n={n} depth={0} collapsed={collapsed} toggle={toggle} onOpen={setSelected} drag={drag} />
          ))}
        </ul>
      )}
      <UnitMembers unit={selected} onClose={() => setSelected(null)} />
    </Panel>
  );
}

/** Drag handlers + drop indicator state for one node. */
function useNodeDrag(n: OrgNode, drag: DragApi, axis: "x" | "y") {
  const pos = drag.over?.id === n.id ? drag.over.pos : null;
  const props = drag.enabled
    ? {
        draggable: true,
        onDragStart: (e: DragEvent) => drag.start(n.id, e),
        onDragOver: (e: DragEvent) => drag.hover(n.id, e, axis),
        onDrop: (e: DragEvent) => drag.drop(n.id, e),
        onDragEnd: drag.end,
      }
    : {};
  return { props, pos, isDragging: drag.dragId === n.id, isBlocked: drag.dragId != null && drag.blocked.has(n.id) };
}

function DropBar({ pos, axis }: { pos: DropPos | null; axis: "x" | "y" }) {
  if (pos !== "before" && pos !== "after") return null;
  const cls =
    axis === "x"
      ? pos === "before" ? "-left-1.5 top-0 bottom-0 w-1" : "-right-1.5 top-0 bottom-0 w-1"
      : pos === "before" ? "-top-px left-2 right-2 h-0.5" : "-bottom-px left-2 right-2 h-0.5";
  return <span aria-hidden className={clsx("pointer-events-none absolute z-20 rounded-full bg-jade-500", cls)} />;
}

function ChartNode({ n, collapsed, toggle, onOpen, drag }: { n: OrgNode; collapsed: Set<number>; toggle: (id: number) => void; onOpen: (n: OrgNode) => void; drag: DragApi }) {
  const isCollapsed = collapsed.has(n.id);
  const d = useNodeDrag(n, drag, "x");
  return (
    <li>
      <div className={clsx("gohr-orgnode w-52", d.isDragging && "opacity-40", d.isBlocked && !d.isDragging && "opacity-60")} {...d.props}>
        <DropBar pos={d.pos} axis="x" />
        <div
          role="button"
          tabIndex={0}
          onClick={() => onOpen(n)}
          onKeyDown={onActivate(() => onOpen(n))}
          className={clsx(
            "block w-full rounded-[var(--radius-panel)] border bg-white p-3 text-left shadow-sm transition hover:border-jade-400 hover:shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-jade-400",
            n.level === 1 ? "border-jade-600 border-t-4" : "border-line",
            drag.enabled && "cursor-grab active:cursor-grabbing",
            d.pos === "inside" && "border-jade-500 bg-jade-50 ring-2 ring-jade-400",
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-[14px] font-semibold text-ink" title={n.name}>{n.name}</div>
              <div className="text-xs text-ink-mute">{[n.unit_type, n.code].filter(Boolean).join(" · ")}</div>
            </div>
            <span className="num inline-flex shrink-0 items-center gap-0.5 rounded-full bg-jade-50 px-1.5 py-0.5 text-xs text-jade-800" title={`ในหน่วยงานนี้ ${n.headcount} คน · รวมหน่วยงานย่อย ${n.total} คน`}>
              <Users className="size-3" />
              {n.total}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-2 border-t border-line-soft pt-2">
            <Avatar src={n.manager?.photo_url} name={n.manager?.name} size={28} />
            <div className="min-w-0 text-xs">
              {n.manager ? (
                <>
                  <div className="truncate font-medium text-ink">{n.manager.name}</div>
                  <div className="truncate text-ink-mute">{n.manager.position ?? "หัวหน้าหน่วยงาน"}</div>
                </>
              ) : (
                <span className="text-ink-mute">ยังไม่กำหนดหัวหน้า</span>
              )}
            </div>
          </div>
        </div>
        {n.children.length > 0 && (
          <button
            type="button"
            onClick={() => toggle(n.id)}
            aria-label={isCollapsed ? `แสดงหน่วยงานย่อยของ ${n.name}` : `ซ่อนหน่วยงานย่อยของ ${n.name}`}
            aria-expanded={!isCollapsed}
            className="absolute -bottom-2.5 left-1/2 z-10 grid size-5 -translate-x-1/2 place-items-center rounded-full border border-jade-300 bg-white text-[11px] text-jade-700 hover:bg-jade-50"
          >
            {isCollapsed ? <span className="num">{n.children.length}</span> : <Minus className="size-3" />}
          </button>
        )}
      </div>
      {n.children.length > 0 && !isCollapsed && (
        <ul>
          {n.children.map((c) => (
            <ChartNode key={c.id} n={c} collapsed={collapsed} toggle={toggle} onOpen={onOpen} drag={drag} />
          ))}
        </ul>
      )}
    </li>
  );
}

function OutlineNode({ n, depth, collapsed, toggle, onOpen, drag }: { n: OrgNode; depth: number; collapsed: Set<number>; toggle: (id: number) => void; onOpen: (n: OrgNode) => void; drag: DragApi }) {
  const isCollapsed = collapsed.has(n.id);
  const d = useNodeDrag(n, drag, "y");
  return (
    <li role="treeitem" aria-selected={false} aria-expanded={n.children.length ? !isCollapsed : undefined}>
      <div
        className={clsx(
          "relative flex items-center gap-2 border-b border-line-soft py-2 pr-4 hover:bg-jade-50/40",
          drag.enabled && "cursor-grab active:cursor-grabbing",
          d.pos === "inside" && "bg-jade-50 ring-2 ring-inset ring-jade-400",
          d.isDragging && "opacity-40",
          d.isBlocked && !d.isDragging && "opacity-60",
        )}
        style={{ paddingLeft: 12 + depth * 22 }}
        {...d.props}
      >
        <DropBar pos={d.pos} axis="y" />
        {n.children.length ? (
          <button type="button" onClick={() => toggle(n.id)} className="rounded p-0.5 text-ink-mute hover:bg-jade-100" aria-label={isCollapsed ? "แสดงหน่วยงานย่อย" : "ซ่อนหน่วยงานย่อย"}>
            {isCollapsed ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}
          </button>
        ) : (
          <span className="w-5" />
        )}
        <div role="button" tabIndex={0} onClick={() => onOpen(n)} onKeyDown={onActivate(() => onOpen(n))} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <Avatar src={n.manager?.photo_url} name={n.manager?.name ?? n.name} size={30} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14px] font-medium">{n.name}</span>
            <span className="block truncate text-xs text-ink-mute">{[n.unit_type, n.manager ? `หัวหน้า: ${n.manager.name}` : "ยังไม่กำหนดหัวหน้า"].filter(Boolean).join(" · ")}</span>
          </span>
          <Badge color="green"><Users className="size-3" /><span className="num">{n.total}</span></Badge>
        </div>
      </div>
      {n.children.length > 0 && !isCollapsed && (
        <ul role="group">
          {n.children.map((c) => (
            <OutlineNode key={c.id} n={c} depth={depth + 1} collapsed={collapsed} toggle={toggle} onOpen={onOpen} drag={drag} />
          ))}
        </ul>
      )}
    </li>
  );
}

type DirRow = { id: number; code: string; prefix: string | null; first_name: string; last_name: string; nickname: string | null; photo_url: string | null; position_name: string | null; org_unit_name: string | null; phone: string | null; org_unit_id: number };

function collectIds(n: OrgNode): number[] {
  return [n.id, ...n.children.flatMap(collectIds)];
}

function UnitMembers({ unit, onClose }: { unit: OrgNode | null; onClose: () => void }) {
  const [rows, setRows] = useState<DirRow[] | null>(null);
  const [withSub, setWithSub] = useState(false);
  useEffect(() => {
    if (!unit) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount / reset form when opened
    setRows(null);
    const ids = withSub ? collectIds(unit) : [unit.id];
    supabaseBrowser()
      .from("v_directory")
      .select("id, code, prefix, first_name, last_name, nickname, photo_url, position_name, org_unit_name, phone, org_unit_id")
      .in("org_unit_id", ids)
      .order("code")
      .then(({ data, error }: Res) => {
        if (error) toast.error(error.message);
        setRows((data as DirRow[]) ?? []);
      });
  }, [unit, withSub]);

  return (
    <Modal open={!!unit} onClose={onClose} size="lg" title={unit ? `พนักงานใน ${unit.name}` : ""}>
      {unit && (
        <div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-ink-soft">
              {unit.manager ? <>หัวหน้า: <b className="font-medium text-ink">{unit.manager.name}</b></> : "ยังไม่กำหนดหัวหน้าหน่วยงาน"}
            </p>
            {unit.children.length > 0 && <Checkbox label="รวมหน่วยงานย่อย" checked={withSub} onChange={setWithSub} />}
          </div>
          {!rows ? (
            <div className="py-10"><Spinner className="mx-auto" /></div>
          ) : rows.length === 0 ? (
            <Empty title="ไม่มีพนักงานในหน่วยงานนี้" description={unit.children.length ? "ลองเลือก “รวมหน่วยงานย่อย”" : undefined} />
          ) : (
            <ul className="divide-y divide-line-soft">
              {rows.map((r) => (
                <li key={r.id}>
                  <Link href={`/employees/${r.id}`} className="flex items-center gap-3 rounded px-1 py-2 hover:bg-jade-50/50">
                    <Avatar src={r.photo_url} name={`${r.first_name} ${r.last_name}`} size={36} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[14px] font-medium">
                        {r.first_name} {r.last_name} {r.nickname && <span className="font-normal text-ink-mute">({r.nickname})</span>}
                      </div>
                      <div className="truncate text-xs text-ink-mute">{[r.code, r.position_name, withSub ? r.org_unit_name : null].filter(Boolean).join(" · ")}</div>
                    </div>
                    {r.phone && <span className="hidden text-sm text-ink-soft sm:block">{r.phone}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Modal>
  );
}

const TREE_CSS = `/* Top-down org tree with hairline connectors */
.gohr-orgtree,
.gohr-orgtree ul {
  display: flex;
  justify-content: center;
  padding-top: 20px;
  position: relative;
  margin: 0;
  list-style: none;
}
.gohr-orgtree {
  padding-top: 0;
}
.gohr-orgtree li {
  position: relative;
  padding: 20px 6px 0;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.gohr-orgtree > li {
  padding-top: 0;
}
/* horizontal connector halves */
.gohr-orgtree li::before,
.gohr-orgtree li::after {
  content: "";
  position: absolute;
  top: 0;
  right: 50%;
  width: 50%;
  height: 20px;
  border-top: 1px solid #a7f3d0;
}
.gohr-orgtree li::after {
  right: auto;
  left: 50%;
  border-left: 1px solid #a7f3d0;
}
.gohr-orgtree li:only-child::before,
.gohr-orgtree li:only-child::after {
  display: none;
}
.gohr-orgtree li:only-child {
  padding-top: 20px;
}
.gohr-orgtree > li:only-child {
  padding-top: 0;
}
.gohr-orgtree li:first-child::before,
.gohr-orgtree li:last-child::after {
  border: 0 none;
}
.gohr-orgtree li:last-child::before {
  border-right: 1px solid #a7f3d0;
  border-radius: 0 6px 0 0;
}
.gohr-orgtree li:first-child::after {
  border-radius: 6px 0 0 0;
}
/* vertical stem from parent down to children bar */
.gohr-orgtree ul::before {
  content: "";
  position: absolute;
  top: 0;
  left: 50%;
  height: 20px;
  border-left: 1px solid #a7f3d0;
}
/* stem for the only child */
.gohr-orgtree li:only-child > .gohr-orgnode::before {
  content: "";
  position: absolute;
  top: -20px;
  left: 50%;
  height: 20px;
  border-left: 1px solid #a7f3d0;
}
.gohr-orgtree > li:only-child > .gohr-orgnode::before {
  display: none;
}
.gohr-orgnode {
  position: relative;
}
`;
