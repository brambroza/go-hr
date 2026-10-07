"use client";

import type { Res } from "@/lib/employees/labels";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, Minus, Network, Plus, Rows3, Users } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Badge, Button, Checkbox, Empty, Modal, Panel, Spinner, clsx, toast } from "@/components/ui";
import { Avatar } from "@/components/employees/avatar";

export interface OrgNode {
  id: number;
  code: string;
  name: string;
  unit_type: string | null;
  parent_id: number | null;
  level: number;
  headcount: number;
  manager: { id: number; name: string; photo_url: string | null; position: string | null } | null;
  children: OrgNode[];
  total: number; // headcount incl. descendants
}

function buildTree(rows: Omit<OrgNode, "children" | "total">[]): OrgNode[] {
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

export function OrgChart() {
  const [rows, setRows] = useState<Omit<OrgNode, "children" | "total">[] | null>(null);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [view, setView] = useState<"chart" | "outline">(() => (typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches ? "outline" : "chart"));
  const [zoom, setZoom] = useState(1);
  const [selected, setSelected] = useState<OrgNode | null>(null);

  useEffect(() => {
    supabaseBrowser()
      .rpc("org_chart")
      .then(({ data, error }: Res) => {
        if (error) toast.error(error.message);
        setRows((data as Omit<OrgNode, "children" | "total">[]) ?? []);
      });
  }, []);

  const tree = useMemo(() => (rows ? buildTree(rows) : []), [rows]);
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // center the root horizontally on first render of the chart
    const el = scroller.current;
    if (el && view === "chart") el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
  }, [tree, view]);
  const toggle = (id: number) =>
    setCollapsed((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  if (!rows) return <Panel><div className="py-16"><Spinner className="mx-auto" /></div></Panel>;
  if (!rows.length)
    return (
      <Panel>
        <Empty icon={<Network className="size-8" />} title="ยังไม่มีหน่วยงาน" description="เพิ่มหน่วยงานแรก (เช่น ชื่อบริษัท) ที่แท็บ “รายการหน่วยงาน” แล้วเพิ่มฝ่าย/แผนกภายใต้" />
      </Panel>
    );

  const total = tree.reduce((a, n) => a + n.total, 0);

  return (
    <Panel
      bodyClass="p-0"
      title={<span>ผังองค์กร <span className="num ml-1 text-sm font-normal text-ink-soft">{rows.length} หน่วยงาน · {total.toLocaleString()} คน</span></span>}
      actions={
        <>
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
      {view === "chart" ? (
        <div ref={scroller} className="thin-scroll overflow-auto bg-paper/50 p-6">
          <style>{TREE_CSS}</style>
          <div style={{ zoom }} className="w-max min-w-full">
            <ul className={"gohr-orgtree"}>
              {tree.map((n) => (
                <ChartNode key={n.id} n={n} collapsed={collapsed} toggle={toggle} onOpen={setSelected} />
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <ul className="py-2" role="tree">
          {tree.map((n) => (
            <OutlineNode key={n.id} n={n} depth={0} collapsed={collapsed} toggle={toggle} onOpen={setSelected} />
          ))}
        </ul>
      )}
      <UnitMembers unit={selected} onClose={() => setSelected(null)} />
    </Panel>
  );
}

function ChartNode({ n, collapsed, toggle, onOpen }: { n: OrgNode; collapsed: Set<number>; toggle: (id: number) => void; onOpen: (n: OrgNode) => void }) {
  const isCollapsed = collapsed.has(n.id);
  return (
    <li>
      <div className={"gohr-orgnode w-52"}>
        <button
          type="button"
          onClick={() => onOpen(n)}
          className={clsx(
            "block w-full rounded-[var(--radius-panel)] border bg-white p-3 text-left shadow-sm transition hover:border-jade-400 hover:shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-jade-400",
            n.level === 1 ? "border-jade-600 border-t-4" : "border-line",
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
        </button>
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
            <ChartNode key={c.id} n={c} collapsed={collapsed} toggle={toggle} onOpen={onOpen} />
          ))}
        </ul>
      )}
    </li>
  );
}

function OutlineNode({ n, depth, collapsed, toggle, onOpen }: { n: OrgNode; depth: number; collapsed: Set<number>; toggle: (id: number) => void; onOpen: (n: OrgNode) => void }) {
  const isCollapsed = collapsed.has(n.id);
  return (
    <li role="treeitem" aria-selected={false} aria-expanded={n.children.length ? !isCollapsed : undefined}>
      <div className="flex items-center gap-2 border-b border-line-soft py-2 pr-4 hover:bg-jade-50/40" style={{ paddingLeft: 12 + depth * 22 }}>
        {n.children.length ? (
          <button type="button" onClick={() => toggle(n.id)} className="rounded p-0.5 text-ink-mute hover:bg-jade-100" aria-label={isCollapsed ? "แสดงหน่วยงานย่อย" : "ซ่อนหน่วยงานย่อย"}>
            {isCollapsed ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}
          </button>
        ) : (
          <span className="w-5" />
        )}
        <button type="button" onClick={() => onOpen(n)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <Avatar src={n.manager?.photo_url} name={n.manager?.name ?? n.name} size={30} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14px] font-medium">{n.name}</span>
            <span className="block truncate text-xs text-ink-mute">{[n.unit_type, n.manager ? `หัวหน้า: ${n.manager.name}` : "ยังไม่กำหนดหัวหน้า"].filter(Boolean).join(" · ")}</span>
          </span>
          <Badge color="green"><Users className="size-3" /><span className="num">{n.total}</span></Badge>
        </button>
      </div>
      {n.children.length > 0 && !isCollapsed && (
        <ul role="group">
          {n.children.map((c) => (
            <OutlineNode key={c.id} n={c} depth={depth + 1} collapsed={collapsed} toggle={toggle} onOpen={onOpen} />
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
