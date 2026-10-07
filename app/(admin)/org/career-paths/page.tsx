"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, Route } from "lucide-react";
import { CrudPage } from "@/components/crud/crud-page";
import { Empty, PageHeader, Panel, Spinner, Tabs } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";

type Pos = { id: number; code: string; name: string; job_level: number };
type Edge = { id: number; from_position_id: number; to_position_id: number; min_years: number | null; requirements: string | null };
type Tab = "map" | "list";

export default function CareerPathsPage() {
  const [tab, setTab] = useState<Tab>("map");
  return (
    <div>
      <PageHeader title="เส้นทางการเติบโต (Career path)" description="กำหนดว่าแต่ละตำแหน่งเติบโตไปสู่ตำแหน่งใดได้ ใช้อายุงานขั้นต่ำเท่าไร และต้องผ่านเงื่อนไขอะไร" />
      <Tabs<Tab> className="mb-4" value={tab} onChange={setTab} tabs={[{ value: "map", label: "แผนภาพเส้นทาง" }, { value: "list", label: "รายการเส้นทาง" }]} />
      {tab === "map" ? <PathMap /> : <PathList />}
    </div>
  );
}

function PathList() {
  const posLabel = (r: Record<string, unknown>) => `${r.name} (${r.code}) · ระดับ ${r.job_level}`;
  return (
    <CrudPage
      config={{
        table: "career_paths",
        title: "รายการเส้นทาง",
        menu: "org",
        embedded: true,
        orderBy: { column: "sort_order", ascending: true },
        exportName: "career_paths",
        filters: [{ name: "from_position_id", label: "จากตำแหน่ง", refField: "from_position_id" }],
        columns: [
          { key: "from_position_id", label: "จากตำแหน่ง" },
          { key: "to_position_id", label: "ไปสู่ตำแหน่ง" },
          { key: "min_years", label: "อายุงานขั้นต่ำ (ปี)", render: (r) => (r.min_years == null ? <span className="text-ink-mute">-</span> : <span className="num">{String(r.min_years)}</span>) },
          { key: "requirements", label: "เงื่อนไข", render: (r) => <span className="line-clamp-2 max-w-md">{String(r.requirements ?? "-")}</span> },
        ],
        fields: [
          { name: "from_position_id", label: "จากตำแหน่ง", type: "ref", required: true, ref: { table: "positions", select: "id, code, name, job_level", order: "job_level", label: posLabel } },
          {
            name: "to_position_id",
            label: "ไปสู่ตำแหน่ง",
            type: "ref",
            required: true,
            ref: { table: "positions", select: "id, code, name, job_level", order: "job_level", label: posLabel },
            validate: (v, all) => (v && String(v) === String(all.from_position_id) ? "ต้องเป็นคนละตำแหน่งกับตำแหน่งต้นทาง" : null),
          },
          { name: "min_years", label: "อายุงานขั้นต่ำในตำแหน่งเดิม (ปี)", type: "number", step: "0.5", min: 0 },
          { name: "sort_order", label: "ลำดับ", type: "number", default: 0 },
          { name: "requirements", label: "ทักษะ / หลักสูตร / KPI ที่ต้องผ่าน", type: "textarea" },
        ],
      }}
    />
  );
}

function PathMap() {
  const [data, setData] = useState<{ pos: Pos[]; edges: Edge[] } | null>(null);
  const load = useCallback(async () => {
    const sb = supabaseBrowser();
    const [p, e] = await Promise.all([
      sb.from("positions").select("id, code, name, job_level"),
      sb.from("career_paths").select("id, from_position_id, to_position_id, min_years, requirements").order("sort_order"),
    ]);
    setData({ pos: (p.data as Pos[]) ?? [], edges: (e.data as Edge[]) ?? [] });
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount / reset form when opened
    load();
  }, [load]);

  // enumerate every path from a source (no incoming edge) to a sink, cycle-safe, capped
  const chains = useMemo(() => {
    if (!data) return [];
    const byId = new Map(data.pos.map((p) => [p.id, p]));
    const out = new Map<number, Edge[]>();
    const hasIn = new Set<number>();
    for (const e of data.edges) {
      out.set(e.from_position_id, [...(out.get(e.from_position_id) ?? []), e]);
      hasIn.add(e.to_position_id);
    }
    let sources = [...out.keys()].filter((id) => !hasIn.has(id));
    if (!sources.length) sources = [...out.keys()]; // pure cycles
    const res: { nodes: Pos[]; edges: Edge[] }[] = [];
    const walk = (id: number, nodes: number[], edges: Edge[]) => {
      if (res.length >= 60) return;
      const next = (out.get(id) ?? []).filter((e) => !nodes.includes(e.to_position_id));
      if (!next.length) {
        res.push({ nodes: nodes.map((n) => byId.get(n)!).filter(Boolean), edges });
        return;
      }
      for (const e of next) walk(e.to_position_id, [...nodes, e.to_position_id], [...edges, e]);
    };
    sources.sort((a, b) => (byId.get(a)?.job_level ?? 0) - (byId.get(b)?.job_level ?? 0)).forEach((s) => walk(s, [s], []));
    return res;
  }, [data]);

  if (!data) return <Panel><div className="py-16"><Spinner className="mx-auto" /></div></Panel>;
  if (!chains.length)
    return (
      <Panel>
        <Empty icon={<Route className="size-8" />} title="ยังไม่มีเส้นทางการเติบโต" description="เพิ่มเส้นทางที่แท็บ “รายการเส้นทาง” เช่น พนักงานฝ่ายผลิต → หัวหน้าไลน์ผลิต → ผู้จัดการฝ่ายผลิต" />
      </Panel>
    );

  return (
    <Panel title={`เส้นทางทั้งหมด ${chains.length} เส้นทาง`} bodyClass="p-0">
      <ul className="divide-y divide-line-soft">
        {chains.map((c, i) => (
          <li key={i} className="thin-scroll overflow-x-auto px-4 py-4">
            <div className="flex w-max items-stretch gap-1">
              {c.nodes.map((p, j) => (
                <div key={p.id} className="flex items-center gap-1">
                  {j > 0 && (
                    <div className="flex w-28 flex-col items-center px-1 text-center" title={c.edges[j - 1]?.requirements ?? undefined}>
                      <span className="num text-xs text-ink-soft">{c.edges[j - 1]?.min_years != null ? `${c.edges[j - 1].min_years} ปี` : " "}</span>
                      <ArrowRight className="size-5 text-jade-500" aria-hidden />
                      {c.edges[j - 1]?.requirements && <span className="line-clamp-2 text-[11px] leading-tight text-ink-mute">{c.edges[j - 1].requirements}</span>}
                    </div>
                  )}
                  <div className="w-44 rounded-[var(--radius-ctl)] border border-line bg-white px-3 py-2" style={{ borderLeft: `4px solid hsl(${150 - Math.min(20, p.job_level) * 5} 45% 40%)` }}>
                    <div className="truncate text-[14px] font-medium" title={p.name}>{p.name}</div>
                    <div className="text-xs text-ink-mute">{p.code} · ระดับ <span className="num">{p.job_level}</span></div>
                  </div>
                </div>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
