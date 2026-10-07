"use client";

import { refColumn, refField } from "@/components/attendance/ref-field";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { CrudPage } from "@/components/crud/crud-page";
import { Empty, Input, PageHeader, Panel, Select, Spinner, Tabs, clsx } from "@/components/ui";
import { TH_DAYS, TH_DAYS_SHORT, isoDate, thDate } from "@/lib/format";
import { ScheduleIndex, eachDate, plusDays, resolveDay, weekday } from "@/lib/attendance/schedule";
import { plansForDate } from "@/lib/attendance/manpower";
import { FilterBar, MiniField, ShiftChip } from "@/components/attendance/bits";
import { orgSubtree, useAttLookups } from "@/components/attendance/lookups";
import { useRosterData } from "@/components/attendance/use-roster";
import { fetchAllRows } from "@/components/attendance/use-days";

const WEEKDAY_OPTS = TH_DAYS.map((d, i) => ({ value: i, label: `วัน${d}` }));

export default function ManpowerPage() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const tab = (sp.get("tab") as "plans" | "actual") || "plans";
  return (
    <div>
      <PageHeader title="ผังกำลังพล" description="จำนวนคนที่ต้องการต่อกะ ต่อหน่วยงาน — ใช้เตือนในตารางกะเมื่อคนไม่พอ และเทียบกับคนที่มาทำงานจริง" />
      <Tabs className="mb-4" value={tab} onChange={(t) => router.push(`${pathname}?tab=${t}`)} tabs={[{ value: "plans", label: "แผนกำลังพล" }, { value: "actual", label: "แผนเทียบกับจริง" }]} />
      {tab === "plans" ? <PlansCrud /> : <PlanVsActual />}
    </div>
  );
}

function PlansCrud() {
  return (
    <CrudPage
      config={{
        embedded: true,
        table: "manpower_plans",
        title: "แผนกำลังพล",
        description: "ไม่ระบุวัน = ทุกวัน · ระบุวันในสัปดาห์หรือวันที่เฉพาะเพื่อแทนที่แผนปกติ",
        menu: "attendance",
        orderBy: { column: "org_unit_id", ascending: true },
        exportName: "manpower_plans",
        defaults: { required_count: 1 },
        filters: [
          { name: "org_unit_id", label: "หน่วยงาน", refField: "org_unit_id" },
          { name: "shift_id", label: "กะ", refField: "shift_id" },
        ],
        columns: [
          refColumn("org_unit_id", "หน่วยงาน", "org_units", "ทุกหน่วยงาน", { sortable: true }),
          refColumn("branch_id", "สาขา", "branches", "ทุกสาขา"),
          refColumn("position_id", "ตำแหน่ง", "positions", "ทุกตำแหน่ง"),
          refColumn("shift_id", "กะ", "shifts"),
          {
            key: "weekday",
            label: "ใช้กับ",
            render: (r) => (r.plan_date ? <span className="num">เฉพาะ {thDate(String(r.plan_date))}</span> : r.weekday != null ? `ทุกวัน${TH_DAYS[Number(r.weekday)]}` : <span className="text-ink-soft">ทุกวัน</span>),
            exportValue: (r) => r.plan_date ?? (r.weekday != null ? TH_DAYS[Number(r.weekday)] : "ทุกวัน"),
          },
          { key: "required_count", label: "จำนวนที่ต้องการ (คน)", className: "text-right", sortable: true },
          { key: "note", label: "หมายเหตุ" },
        ],
        fields: [
          refField("org_unit_id", "หน่วยงาน", { table: "org_units", label: "name", order: "name" }),
          refField("branch_id", "สาขา", { table: "branches", label: "name", order: "code" }),
          refField("position_id", "ตำแหน่ง", { table: "positions", label: "name", order: "name" }),
          refField("shift_id", "กะ", { table: "shifts", label: (r) => `${r.code} · ${r.name}`, order: "code" }, { required: true }),
          { name: "required_count", label: "จำนวนที่ต้องการ (คน)", type: "number", min: 0, step: "1", required: true },
          { name: "weekday", label: "เฉพาะวันในสัปดาห์", type: "select", options: WEEKDAY_OPTS, hint: "ไม่ระบุ = ทุกวัน" },
          { name: "plan_date", label: "เฉพาะวันที่", type: "date", hint: "แทนที่แผนปกติของวันนั้น" },
          { name: "note", label: "หมายเหตุ", type: "textarea" },
        ],
      }}
    />
  );
}

function PlanVsActual() {
  const lk = useAttLookups();
  const today = isoDate();
  const [range, setRange] = useState({ from: plusDays(today, -6), to: today });
  const [org, setOrg] = useState("");
  const { data, error } = useRosterData(range.from, range.to);
  const rangeKey = `${range.from}|${range.to}`;
  const [presentState, setPresent] = useState<{ key: string; map: Map<string, true> } | null>(null);
  const present = presentState?.key === rangeKey ? presentState.map : null;

  useEffect(() => {
    const sb = supabaseBrowser();
    fetchAllRows<{ employee_id: number; work_date: string; shift_id: number | null }>(() =>
      sb.from("attendance_days").select("employee_id, work_date, shift_id").gte("work_date", range.from).lte("work_date", range.to).not("actual_in", "is", null).order("id"),
    ).then(({ rows }) => setPresent({ key: `${range.from}|${range.to}`, map: new Map(rows.map((r) => [`${r.employee_id}|${r.work_date}`, true] as const)) }));
  }, [range]);

  const dates = useMemo(() => (range.from <= range.to ? eachDate(range.from, range.to).slice(0, 62) : []), [range]);
  const orgName = useMemo(() => new Map(lk.orgs.map((o) => [o.id, o.name])), [lk.orgs]);
  const shiftById = useMemo(() => new Map(lk.shifts.map((s) => [s.id, s])), [lk.shifts]);
  const orgSet = useMemo(() => (org ? orgSubtree(lk.orgs, Number(org)) : null), [org, lk.orgs]);

  // rows: (org unit, shift) → per date { required, scheduled, actual }
  const table = useMemo(() => {
    if (!data || !present) return null;
    const idx = new ScheduleIndex(data.holidays, data.specials, data.schedules);
    const m = new Map<string, { org: number | null; shift: number; cells: Map<string, { req: number; sch: number; act: number }> }>();
    const cell = (o: number | null, s: number, d: string) => {
      const k = `${o ?? ""}|${s}`;
      let r = m.get(k);
      if (!r) m.set(k, (r = { org: o, shift: s, cells: new Map() }));
      let c = r.cells.get(d);
      if (!c) r.cells.set(d, (c = { req: 0, sch: 0, act: 0 }));
      return c;
    };
    for (const d of dates) {
      for (const p of plansForDate(data.plans, d)) {
        if (orgSet && !(p.org_unit_id != null && orgSet.has(p.org_unit_id))) continue;
        cell(p.org_unit_id, Number(p.shift_id), d).req += Number(p.required_count);
      }
      for (const e of data.emps) {
        if (d < e.hire_date || (e.resign_date && d > e.resign_date)) continue;
        if (orgSet && !(e.org_unit_id != null && orgSet.has(e.org_unit_id))) continue;
        const r = resolveDay(e, d, idx);
        const working = r.day_type === "work" || r.day_type === "special" || (r.day_type === "holiday" && r.override && !r.override.is_day_off);
        if (!working || !r.shift_id) continue;
        const c = cell(e.org_unit_id, r.shift_id, d);
        c.sch++;
        if (present.has(`${e.id}|${d}`)) c.act++;
      }
    }
    return [...m.values()].sort((a, b) => (orgName.get(a.org ?? -1) ?? "").localeCompare(orgName.get(b.org ?? -1) ?? "", "th") || a.shift - b.shift);
  }, [data, present, dates, orgSet, orgName]);

  return (
    <div>
      <FilterBar>
        <MiniField label="ตั้งแต่วันที่"><Input type="date" className="h-9 w-40 text-sm" value={range.from} onChange={(e) => e.target.value && setRange({ ...range, from: e.target.value })} /></MiniField>
        <MiniField label="ถึงวันที่"><Input type="date" className="h-9 w-40 text-sm" value={range.to} min={range.from} onChange={(e) => e.target.value && setRange({ ...range, to: e.target.value })} /></MiniField>
        <MiniField label="หน่วยงาน">
          <Select className="h-9 w-52 text-sm" value={org} onChange={(e) => setOrg(e.target.value)} placeholder="ทั้งหมด">
            {lk.orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </Select>
        </MiniField>
        <p className="pb-2 text-xs text-ink-soft">แต่ละช่อง: <b>ตามแผน</b> / ตามตารางกะ / มาจริง — สีแดงเมื่อน้อยกว่าแผน (แสดงสูงสุด 62 วัน)</p>
      </FilterBar>
      <Panel bodyClass="p-0">
        {!table ? (
          error ? <Empty title="โหลดข้อมูลไม่สำเร็จ" description={error} /> : <Spinner className="mx-auto my-16" />
        ) : table.length === 0 ? (
          <Empty title="ไม่มีข้อมูลในช่วงนี้" description="เพิ่มแผนกำลังพลในแท็บ “แผนกำลังพล” หรือเลือกช่วงวันที่อื่น" />
        ) : (
          <div className="thin-scroll overflow-auto">
            <table className="border-separate border-spacing-0 text-[13px]">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 min-w-60 border-b border-r border-line bg-white px-3 py-2 text-left font-medium text-ink-soft">หน่วยงาน / กะ</th>
                  {dates.map((d) => (
                    <th key={d} className={clsx("min-w-20 border-b border-line bg-white px-1 py-1 text-center font-normal", (weekday(d) === 0 || weekday(d) === 6) && "text-rust")}>
                      <div className="text-[11px]">{TH_DAYS_SHORT[weekday(d)]}</div>
                      <div className="num font-semibold">{thDate(d).replace(/ \d{4}$/, "")}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.map((r) => {
                  const s = shiftById.get(r.shift);
                  return (
                    <tr key={`${r.org}|${r.shift}`}>
                      <td className="sticky left-0 z-10 border-b border-r border-line-soft bg-white px-3 py-1.5">
                        <div className="flex items-center gap-2">
                          {s && <ShiftChip code={s.code} color={s.color} />}
                          <span className="truncate">{r.org ? orgName.get(r.org) ?? `#${r.org}` : "ทุกหน่วยงาน"}</span>
                        </div>
                      </td>
                      {dates.map((d) => {
                        const c = r.cells.get(d) ?? { req: 0, sch: 0, act: 0 };
                        const shortSch = c.req > 0 && c.sch < c.req;
                        const shortAct = c.req > 0 && d < today && c.act < c.req;
                        return (
                          <td key={d} className={clsx("num border-b border-line-soft px-1 py-1.5 text-center", (shortSch || shortAct) && "bg-rust-soft")}
                            title={`แผน ${c.req} · ตารางกะ ${c.sch} · มาจริง ${d <= today ? c.act : "-"}`}>
                            <b className={clsx(!c.req && "font-normal text-ink-mute")}>{c.req || "-"}</b>
                            <span className="text-ink-mute"> / </span>
                            <span className={clsx(shortSch && "font-semibold text-rust")}>{c.sch}</span>
                            <span className="text-ink-mute"> / </span>
                            <span className={clsx(shortAct && "font-semibold text-rust")}>{d <= today ? c.act : "-"}</span>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
