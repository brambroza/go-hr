"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Copy, Eraser, Repeat, Search } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useCan } from "@/components/app/me-context";
import { humanError } from "@/components/crud/crud-page";
import { Badge, Button, Checkbox, Empty, Field, Input, Modal, PageHeader, Panel, Select, Spinner, Tabs, clsx, toast, useConfirm } from "@/components/ui";
import { TH_DAYS_SHORT, TH_MONTHS_SHORT, isoDate, thDate } from "@/lib/format";
import { ScheduleIndex, eachDate, expandPattern, monthRange, parsePattern, plusDays, resolveDay, weekStart, weekday, type ResolvedDay } from "@/lib/attendance/schedule";
import { requiredCount } from "@/lib/attendance/manpower";
import { FilterBar, MiniField, ShiftChip } from "@/components/attendance/bits";
import { empName, orgSubtree, textOn, useAttLookups } from "@/components/attendance/lookups";
import { useRosterData, type RosterEmp } from "@/components/attendance/use-roster";

type Cell = { emp: RosterEmp; date: string; day: ResolvedDay };

export default function RosterPage() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const can = useCan();
  const canEdit = can("attendance", "edit");
  const lk = useAttLookups();
  const today = isoDate();
  const view = (sp.get("view") === "month" ? "month" : "week") as "week" | "month";
  const anchor = sp.get("date") && /^\d{4}-\d{2}-\d{2}$/.test(sp.get("date")!) ? sp.get("date")! : today;
  const { from, to } = view === "week" ? { from: weekStart(anchor), to: plusDays(weekStart(anchor), 6) } : monthRange(anchor.slice(0, 7));
  const dates = useMemo(() => eachDate(from, to), [from, to]);
  const { data, error, reload } = useRosterData(from, to);
  const [f, setF] = useState({ org: "", branch: "", q: "" });
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [cell, setCell] = useState<Cell | null>(null);
  const [bulk, setBulk] = useState(false);
  const [busy, setBusy] = useState(false);
  const { confirm, dialog } = useConfirm();

  const nav = (patch: Record<string, string>) => {
    const p = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) p.set(k, v);
    router.push(`${pathname}?${p}`);
  };
  const move = (n: number) => {
    if (view === "week") nav({ date: plusDays(from, 7 * n) });
    else {
      const [y, m] = from.split("-").map(Number);
      nav({ date: new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 10) });
    }
  };

  const shiftById = useMemo(() => new Map(lk.shifts.map((s) => [s.id, s])), [lk.shifts]);
  const shiftByCode = useMemo(() => new Map(lk.shifts.map((s) => [s.code.toUpperCase(), s])), [lk.shifts]);
  const idx = useMemo(() => (data ? new ScheduleIndex(data.holidays, data.specials, data.schedules) : null), [data]);
  const orgSet = useMemo(() => (f.org ? orgSubtree(lk.orgs, Number(f.org)) : null), [f.org, lk.orgs]);
  const orgName = useMemo(() => new Map(lk.orgs.map((o) => [o.id, o.name])), [lk.orgs]);

  const emps = useMemo(() => {
    const q = f.q.trim().toLowerCase();
    return (data?.emps ?? []).filter(
      (e) =>
        (!orgSet || (e.org_unit_id != null && orgSet.has(e.org_unit_id))) &&
        (!f.branch || String(e.branch_id) === f.branch) &&
        (!q || `${e.code} ${e.first_name} ${e.last_name} ${e.nickname ?? ""}`.toLowerCase().includes(q)),
    );
  }, [data, orgSet, f.branch, f.q]);

  const grid = useMemo(() => {
    if (!idx) return new Map<number, ResolvedDay[]>();
    return new Map(emps.map((e) => [e.id, dates.map((d) => resolveDay(e, d, idx))]));
  }, [emps, dates, idx]);

  // headcount per shift per day vs manpower plan
  const usedShifts = useMemo(() => {
    const ids = new Set<number>();
    for (const days of grid.values()) for (const d of days) if (d.shift_id && d.day_type !== "off") ids.add(d.shift_id);
    for (const p of data?.plans ?? []) ids.add(Number(p.shift_id));
    return lk.shifts.filter((s) => ids.has(s.id));
  }, [grid, data, lk.shifts]);
  const headcount = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of emps) {
      const days = grid.get(e.id) ?? [];
      days.forEach((d, i) => {
        const working = d.day_type === "work" || d.day_type === "special" || (d.day_type === "holiday" && d.override && !d.override.is_day_off);
        if (!working || !d.shift_id || inactive(e, dates[i])) return;
        const k = `${d.shift_id}|${dates[i]}`;
        m.set(k, (m.get(k) ?? 0) + 1);
      });
    }
    return m;
  }, [grid, emps, dates]);
  const planFilter = (p: { org_unit_id: number | null; branch_id: number | null }) =>
    (!orgSet || (p.org_unit_id != null && orgSet.has(p.org_unit_id))) && (!f.branch || p.branch_id == null || String(p.branch_id) === f.branch);

  async function upsert(rows: { employee_id: number; work_date: string; shift_id: number | null; is_day_off: boolean }[]) {
    const sb = supabaseBrowser();
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await sb.from("work_schedules").upsert(rows.slice(i, i + 500).map((r) => ({ ...r, source: "hr", note: null })), { onConflict: "employee_id,work_date" });
      if (error) throw error;
    }
  }

  async function setCellTo(kind: "shift" | "off" | "clear", shiftId?: number) {
    if (!cell) return;
    setBusy(true);
    try {
      const sb = supabaseBrowser();
      if (kind === "clear") {
        const { error } = await sb.from("work_schedules").delete().eq("employee_id", cell.emp.id).eq("work_date", cell.date);
        if (error) throw error;
      } else {
        await upsert([{ employee_id: cell.emp.id, work_date: cell.date, shift_id: kind === "shift" ? shiftId! : null, is_day_off: kind === "off" }]);
      }
      setCell(null);
      await reload();
    } catch (e) {
      toast.error(humanError(e));
    } finally {
      setBusy(false);
    }
  }

  async function copyLastWeek() {
    const targets = selected.size ? emps.filter((e) => selected.has(e.id)) : emps;
    if (!targets.length) return;
    if (!(await confirm(<>คัดลอกตารางกะสัปดาห์ก่อน ({thDate(plusDays(from, -7))} – {thDate(plusDays(from, -1))}) มาใช้กับสัปดาห์นี้ของพนักงาน <b>{targets.length}</b> คน? ตารางที่ตั้งไว้แล้วในสัปดาห์นี้จะถูกแทนที่</>, { confirmText: "คัดลอก" }))) return;
    setBusy(true);
    try {
      const sb = supabaseBrowser();
      const pFrom = plusDays(from, -7);
      const pTo = plusDays(from, -1);
      const [{ data: ws, error }, { data: hol }, { data: spw }] = await Promise.all([
        sb.from("work_schedules").select("employee_id, work_date, shift_id, is_day_off").gte("work_date", pFrom).lte("work_date", pTo).in("employee_id", targets.map((e) => e.id)),
        sb.from("holidays").select("holiday_date, name, branch_id, org_unit_id, employee_ids").gte("holiday_date", pFrom).lte("holiday_date", pTo),
        sb.from("special_workdays").select("work_date, name, branch_id, org_unit_id, shift_id").gte("work_date", pFrom).lte("work_date", pTo),
      ]);
      if (error) throw error;
      const prevIdx = new ScheduleIndex(hol ?? [], spw ?? [], ws ?? []);
      const rows = targets.flatMap((e) =>
        eachDate(pFrom, pTo).map((d, i) => {
          const r = resolveDay(e, d, prevIdx);
          // a public holiday last week is not a reason to be off this week: use the normal pattern instead
          const off = r.day_type === "off";
          const shift = r.day_type === "holiday" && !r.override ? e.default_shift_id : r.shift_id;
          return { employee_id: e.id, work_date: plusDays(from, i), shift_id: off ? null : shift, is_day_off: off };
        }),
      ).filter((r) => r.work_date <= to);
      await upsert(rows);
      toast.ok(`คัดลอกแล้ว ${targets.length} คน`);
      await reload();
    } catch (e) {
      toast.error(humanError(e));
    } finally {
      setBusy(false);
    }
  }

  async function clearRange() {
    const targets = selected.size ? emps.filter((e) => selected.has(e.id)) : emps;
    if (!(await confirm(<>ล้างตารางกะที่ตั้งไว้ ({thDate(from)} – {thDate(to)}) ของพนักงาน <b>{targets.length}</b> คน กลับไปใช้กะประจำและวันหยุดประจำสัปดาห์?</>, { danger: true, confirmText: "ล้างตาราง" }))) return;
    setBusy(true);
    const sb = supabaseBrowser();
    const ids = targets.map((e) => e.id);
    let failed: unknown = null;
    for (let i = 0; i < ids.length; i += 200) {
      const { error } = await sb.from("work_schedules").delete().gte("work_date", from).lte("work_date", to).in("employee_id", ids.slice(i, i + 200));
      if (error) failed = error;
    }
    setBusy(false);
    if (failed) return toast.error(humanError(failed));
    toast.ok("ล้างตารางแล้ว");
    reload();
  }

  const allChecked = emps.length > 0 && emps.every((e) => selected.has(e.id));
  const loading = !data || !lk.loaded;

  return (
    <div>
      <PageHeader
        title="ตารางกะ / วันหยุด"
        description="วางกะและวันหยุดรายบุคคล คลิกช่องเพื่อเปลี่ยน — ช่องที่มีจุดคือกำหนดเองต่างจากกะประจำ"
        actions={
          canEdit ? (
            <>
              <Button variant="secondary" icon={<Eraser className="size-4" />} onClick={clearRange} disabled={loading || busy}>ล้างตาราง</Button>
              {view === "week" && <Button variant="secondary" icon={<Copy className="size-4" />} onClick={copyLastWeek} loading={busy} disabled={loading}>คัดลอกสัปดาห์ก่อน</Button>}
              <Button icon={<Repeat className="size-4" />} onClick={() => setBulk(true)} disabled={loading}>จัดกะแบบหมุนเวียน</Button>
            </>
          ) : null
        }
      />

      <FilterBar>
        <div className="flex items-end gap-1">
          <Button variant="secondary" size="sm" className="h-9" onClick={() => move(-1)} aria-label="ก่อนหน้า"><ChevronLeft className="size-4" /></Button>
          <MiniField label={view === "week" ? "สัปดาห์ของวันที่" : "เดือน"}>
            {view === "week" ? (
              <Input type="date" className="h-9 w-40 text-sm" value={anchor} onChange={(e) => e.target.value && nav({ date: e.target.value })} />
            ) : (
              <Input type="month" className="h-9 w-40 text-sm" value={from.slice(0, 7)} onChange={(e) => e.target.value && nav({ date: `${e.target.value}-01` })} />
            )}
          </MiniField>
          <Button variant="secondary" size="sm" className="h-9" onClick={() => move(1)} aria-label="ถัดไป"><ChevronRight className="size-4" /></Button>
        </div>
        <Tabs className="border-0" value={view} onChange={(v) => nav({ view: v })} tabs={[{ value: "week", label: "รายสัปดาห์" }, { value: "month", label: "รายเดือน" }]} />
        <MiniField label="หน่วยงาน">
          <Select className="h-9 w-48 text-sm" value={f.org} onChange={(e) => setF({ ...f, org: e.target.value })} placeholder="ทั้งหมด">
            {lk.orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </Select>
        </MiniField>
        <MiniField label="สาขา">
          <Select className="h-9 w-36 text-sm" value={f.branch} onChange={(e) => setF({ ...f, branch: e.target.value })} placeholder="ทั้งหมด">
            {lk.branches.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </Select>
        </MiniField>
        <MiniField label="ค้นหาพนักงาน" className="min-w-40 flex-1">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-mute" />
            <Input className="h-9 pl-8 text-sm" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder="รหัส ชื่อ ชื่อเล่น" />
          </div>
        </MiniField>
      </FilterBar>

      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-ink-soft">
        {lk.shifts.filter((s) => s.is_active).map((s) => (
          <span key={s.id} className="inline-flex items-center gap-1"><ShiftChip code={s.code} color={s.color} /> {s.name}</span>
        ))}
        <span className="inline-flex items-center gap-1"><span className="inline-flex h-6 items-center rounded bg-paper px-1.5 text-xs text-ink-soft ring-1 ring-line">หยุด</span> วันหยุด</span>
        <span className="inline-flex items-center gap-1"><span className="inline-flex h-6 items-center rounded bg-violet-50 px-1.5 text-xs text-violet-800 ring-1 ring-violet-200">นักขัตฯ</span> วันหยุดนักขัตฤกษ์</span>
        {selected.size > 0 && <Badge color="blue">เลือก {selected.size} คน</Badge>}
      </div>

      <Panel bodyClass="p-0">
        {loading ? (
          <Spinner className="mx-auto my-16" />
        ) : error ? (
          <Empty title="โหลดข้อมูลไม่สำเร็จ" description={error} />
        ) : emps.length === 0 ? (
          <Empty title="ไม่พบพนักงานตามเงื่อนไข" />
        ) : (
          <div className="thin-scroll max-h-[calc(100dvh-20rem)] min-h-80 overflow-auto">
            <table className="border-separate border-spacing-0 text-[13px]">
              <thead className="sticky top-0 z-20">
                <tr className="bg-white">
                  <th className="sticky left-0 z-30 min-w-40 border-b sm:min-w-56 border-r border-line bg-white px-3 py-2 text-left font-medium text-ink-soft">
                    <div className="flex items-center gap-2">
                      {canEdit && <input type="checkbox" className="size-4 accent-jade-600" checked={allChecked} aria-label="เลือกทั้งหมด" onChange={(e) => setSelected(e.target.checked ? new Set(emps.map((x) => x.id)) : new Set())} />}
                      พนักงาน ({emps.length})
                    </div>
                  </th>
                  {dates.map((d) => {
                    const wd = weekday(d);
                    return (
                      <th key={d} className={clsx("min-w-11 border-b border-line px-0.5 py-1 text-center font-normal", d === today ? "bg-jade-50" : "bg-white", (wd === 0 || wd === 6) && "text-rust")}>
                        <div className="text-[11px]">{TH_DAYS_SHORT[wd]}</div>
                        <div className="num font-semibold">{Number(d.slice(8))}</div>
                        {view === "week" && <div className="text-[10px] text-ink-mute">{TH_MONTHS_SHORT[Number(d.slice(5, 7)) - 1]}</div>}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {emps.map((e) => (
                  <tr key={e.id} className="group">
                    <td className="sticky left-0 z-10 border-b border-r border-line-soft bg-white px-3 py-1 group-hover:bg-jade-50">
                      <div className="flex items-center gap-2">
                        {canEdit && (
                          <input type="checkbox" className="size-4 accent-jade-600" aria-label={`เลือก ${empName(e)}`} checked={selected.has(e.id)}
                            onChange={(ev) => setSelected((s) => { const n = new Set(s); if (ev.target.checked) n.add(e.id); else n.delete(e.id); return n; })} />
                        )}
                        <div className="min-w-0">
                          <div className="truncate font-medium text-ink">{e.first_name} {e.last_name}{e.nickname ? ` (${e.nickname})` : ""}</div>
                          <div className="truncate text-[11px] text-ink-mute">{e.code} · {orgName.get(e.org_unit_id ?? -1) ?? "-"}{e.attendance_exempt ? " · ไม่ต้องลงเวลา" : ""}</div>
                        </div>
                      </div>
                    </td>
                    {(grid.get(e.id) ?? []).map((d, i) => {
                      const date = dates[i];
                      const off = inactive(e, date);
                      const s = d.shift_id ? shiftById.get(d.shift_id) : undefined;
                      return (
                        <td key={date} className={clsx("border-b border-line-soft p-0.5 text-center", date === today && "bg-jade-50/50")}>
                          {off ? (
                            <span className="text-ink-mute">·</span>
                          ) : (
                            <button
                              type="button"
                              disabled={!canEdit}
                              onClick={() => setCell({ emp: e, date, day: d })}
                              title={`${thDate(date)} · ${d.holiday ?? d.special ?? (d.day_type === "off" ? "วันหยุด" : s?.name ?? "")}${d.override ? " (กำหนดเอง)" : ""}`}
                              className={clsx("relative inline-flex h-7 w-10 items-center justify-center rounded text-xs font-semibold", canEdit ? "cursor-pointer hover:ring-2 hover:ring-jade-400" : "cursor-default")}
                              style={cellStyle(d, s?.color)}
                            >
                              {d.day_type === "off" ? "หยุด" : d.day_type === "holiday" && !d.override ? "นักขัตฯ" : s?.code ?? "?"}
                              {d.override && <span className="absolute right-0.5 top-0.5 size-1.5 rounded-full bg-current opacity-70" />}
                            </button>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
              <tfoot className="sticky bottom-0 z-20">
                {usedShifts.map((s, si) => (
                  <tr key={s.id} className="bg-white">
                    <td className={clsx("sticky left-0 z-30 border-r border-line bg-paper px-3 py-1 text-xs", si === 0 && "border-t-2 border-t-line")}>
                      <span className="inline-flex items-center gap-1.5"><ShiftChip code={s.code} color={s.color} /> คน / แผน</span>
                    </td>
                    {dates.map((d) => {
                      const have = headcount.get(`${s.id}|${d}`) ?? 0;
                      const need = requiredCount(data!.plans, d, s.id, planFilter);
                      const short = need > 0 && have < need;
                      return (
                        <td key={d} className={clsx("num bg-paper px-0.5 py-1 text-center text-xs", si === 0 && "border-t-2 border-t-line", short && "bg-rust-soft font-semibold text-rust")} title={need ? `ต้องการ ${need} คน มี ${have} คน` : `มี ${have} คน (ไม่มีแผนกำลังพล)`}>
                          {have}{need > 0 && <span className={clsx(short ? "" : "text-ink-mute")}>/{need}</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tfoot>
            </table>
          </div>
        )}
      </Panel>

      <Modal open={!!cell} onClose={() => setCell(null)} size="sm" title={cell ? `${empName(cell.emp)} · ${thDate(cell.date)}` : ""}>
        {cell && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-ink-soft">
              ตอนนี้: {cell.day.holiday ? `วันหยุดนักขัตฤกษ์ (${cell.day.holiday}) · ` : ""}{cell.day.special ? `${cell.day.special} · ` : ""}
              {cell.day.day_type === "off" ? "วันหยุด" : shiftById.get(cell.day.shift_id ?? -1)?.name ?? "-"}
              {cell.day.override ? ` (กำหนดเองโดย ${cell.day.override.source === "request" ? "ใบคำขอ" : cell.day.override.source === "self" ? "พนักงาน" : "HR"})` : " (ตามกะประจำ)"}
            </p>
            <div>
              <div className="mb-2 text-sm font-medium text-ink-soft">เปลี่ยนเป็นกะ</div>
              <div className="grid grid-cols-2 gap-2">
                {lk.shifts.filter((s) => s.is_active).map((s) => (
                  <button key={s.id} type="button" disabled={busy} onClick={() => setCellTo("shift", s.id)}
                    className={clsx("flex items-center gap-2 rounded-md border px-2 py-2 text-left text-sm hover:border-jade-400 hover:bg-jade-50", cell.day.shift_id === s.id && cell.day.day_type !== "off" ? "border-jade-600 ring-1 ring-jade-600" : "border-line")}>
                    <ShiftChip code={s.code} color={s.color} />
                    <span className="min-w-0"><span className="block truncate">{s.name}</span><span className="num text-xs text-ink-mute">{s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}</span></span>
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" disabled={busy} onClick={() => setCellTo("off")}>ตั้งเป็นวันหยุด</Button>
              {cell.day.override && <Button variant="ghost" icon={<Eraser className="size-4" />} disabled={busy} onClick={() => setCellTo("clear")}>ใช้ตามกะประจำ</Button>}
            </div>
            <p className="text-xs text-ink-mute">เปลี่ยนตารางย้อนหลังแล้ว ให้กด “คำนวณใหม่” ในหน้าสรุปเวลา (หรือรอรอบคำนวณอัตโนมัติ)</p>
          </div>
        )}
      </Modal>

      {bulk && (
        <BulkPattern
          onClose={() => setBulk(false)}
          emps={emps}
          selected={selected}
          defaultFrom={from}
          defaultTo={to}
          shiftByCode={shiftByCode}
          onApply={async (rows) => {
            await upsert(rows);
            await reload();
          }}
        />
      )}
      {dialog}
    </div>
  );
}

function inactive(e: RosterEmp, d: string) {
  return d < e.hire_date || (!!e.resign_date && d > e.resign_date);
}

function cellStyle(d: ResolvedDay, color: string | null | undefined): React.CSSProperties {
  if (d.day_type === "off") return { background: "var(--color-paper)", color: "var(--color-ink-soft)", boxShadow: "inset 0 0 0 1px var(--color-line)" };
  if (d.day_type === "holiday" && !d.override) return { background: "#f5f3ff", color: "#5b21b6", boxShadow: "inset 0 0 0 1px #ddd6fe", fontSize: 10 };
  const bg = color ?? "#10b981";
  return { background: bg, color: textOn(bg), ...(d.day_type === "special" || d.day_type === "holiday" ? { boxShadow: "inset 0 0 0 2px #5b21b6" } : {}) };
}

const PRESETS = [
  { label: "จ–ศ กะ D หยุด ส–อา", pattern: "D×5,OFF×2", align: true },
  { label: "จ–ส กะ D หยุด อา", pattern: "D×6,OFF", align: true },
  { label: "กะดึก 6 วัน หยุด 1", pattern: "N×6,OFF" },
  { label: "4 ทำ 2 หยุด (D)", pattern: "D×4,OFF×2" },
  { label: "หมุน D/A/N ทุก 5 วัน", pattern: "D×5,OFF×2,A×5,OFF×2,N×5,OFF×2" },
];

function BulkPattern({
  onClose, emps, selected, defaultFrom, defaultTo, shiftByCode, onApply,
}: {
  onClose: () => void;
  emps: RosterEmp[];
  selected: Set<number>;
  defaultFrom: string;
  defaultTo: string;
  shiftByCode: Map<string, { id: number; code: string; color: string | null; name: string }>;
  onApply: (rows: { employee_id: number; work_date: string; shift_id: number | null; is_day_off: boolean }[]) => Promise<void>;
}) {
  const [pattern, setPattern] = useState("D×5,OFF×2");
  const [range, setRange] = useState({ from: defaultFrom, to: defaultTo });
  const [offset, setOffset] = useState(0);
  const [stagger, setStagger] = useState(false);
  const [busy, setBusy] = useState(false);
  const targets = emps.filter((e) => selected.has(e.id));
  const parsed = parsePattern(pattern);
  const unknown = (parsed ?? []).filter((c) => c !== "OFF" && !shiftByCode.has(c));
  const days = range.from && range.to && range.from <= range.to ? eachDate(range.from, range.to).length : 0;
  const preview = parsed ? expandPattern(parsed, range.from, range.to <= plusDays(range.from, 13) ? range.to : plusDays(range.from, 13), offset) : [];

  async function apply() {
    if (!parsed) return toast.error("รูปแบบไม่ถูกต้อง เช่น D,D,D,D,D,OFF,OFF หรือ N×6,OFF");
    if (unknown.length) return toast.error(`ไม่พบรหัสกะ: ${[...new Set(unknown)].join(", ")}`);
    if (!targets.length) return toast.error("เลือกพนักงานในตารางก่อน (ติ๊กช่องหน้าชื่อ)");
    if (!days || days > 370) return toast.error("ช่วงวันที่ไม่ถูกต้อง (ไม่เกิน 370 วัน)");
    setBusy(true);
    try {
      const rows = targets.flatMap((e, ti) =>
        expandPattern(parsed, range.from, range.to, offset + (stagger ? ti : 0)).map(({ date, code }) => ({
          employee_id: e.id,
          work_date: date,
          shift_id: code === "OFF" ? null : shiftByCode.get(code)!.id,
          is_day_off: code === "OFF",
        })),
      );
      await onApply(rows);
      toast.ok(`จัดกะแล้ว ${targets.length} คน × ${days} วัน`);
      onClose();
    } catch (e) {
      toast.error(humanError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} size="lg" title="จัดกะแบบหมุนเวียน"
      footer={<><Button variant="secondary" onClick={onClose}>ยกเลิก</Button><Button loading={busy} onClick={apply} disabled={!targets.length}>จัดกะให้ {targets.length} คน</Button></>}>
      <div className="flex flex-col gap-4">
        {!targets.length && <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-ink">ยังไม่ได้เลือกพนักงาน — ปิดหน้าต่างนี้แล้วติ๊กช่องหน้าชื่อพนักงานในตาราง</p>}
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button key={p.label} type="button" onClick={() => { setPattern(p.pattern); if (p.align) setOffset((7 + weekday(range.from) - 1) % 7); }}
              className={clsx("rounded-full border px-3 py-1 text-sm hover:bg-jade-50", pattern === p.pattern ? "border-jade-600 bg-jade-50 text-jade-800" : "border-line")}>
              {p.label}
            </button>
          ))}
        </div>
        <Field label="รูปแบบ" hint="คั่นด้วย , ใช้รหัสกะ และ OFF = วันหยุด · ใช้ ×n หรือ *n เพื่อซ้ำ เช่น D×5,OFF×2 หรือ N×6,OFF" error={!parsed && pattern ? "รูปแบบไม่ถูกต้อง" : unknown.length ? `ไม่พบรหัสกะ: ${[...new Set(unknown)].join(", ")}` : null}>
          <Input value={pattern} onChange={(e) => setPattern(e.target.value)} className="font-mono" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="ตั้งแต่วันที่"><Input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} /></Field>
          <Field label="ถึงวันที่"><Input type="date" value={range.to} min={range.from} onChange={(e) => setRange({ ...range, to: e.target.value })} /></Field>
          <Field label="เริ่มที่ลำดับที่" hint={parsed ? `1–${parsed.length}` : undefined}>
            <Input type="number" min={1} max={parsed?.length ?? 1} value={offset + 1} onChange={(e) => setOffset(Math.max(0, (Number(e.target.value) || 1) - 1))} />
          </Field>
          <div className="pt-7"><Checkbox label="เหลื่อมวันกันทีละคน" checked={stagger} onChange={setStagger} /></div>
        </div>
        {parsed && (
          <div>
            <div className="mb-1 text-sm text-ink-soft">ตัวอย่าง 14 วันแรก{stagger && targets.length > 1 ? " (คนแรก)" : ""}</div>
            <div className="flex flex-wrap gap-1">
              {preview.map(({ date, code }) => {
                const s = shiftByCode.get(code);
                return (
                  <div key={date} className="flex flex-col items-center text-[11px] text-ink-mute">
                    <span>{TH_DAYS_SHORT[weekday(date)]} {Number(date.slice(8))}</span>
                    {code === "OFF" ? <span className="inline-flex h-6 min-w-9 items-center justify-center rounded bg-paper text-xs text-ink-soft ring-1 ring-line">หยุด</span> : <ShiftChip code={code} color={s?.color ?? "#b4441c"} className="min-w-9" />}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <p className="text-sm text-ink-soft">
          ผลลัพธ์: <b className="num">{targets.length}</b> คน × <b className="num">{days}</b> วัน = <b className="num">{(targets.length * days).toLocaleString()}</b> ช่อง — แทนที่ตารางที่กำหนดไว้เดิมในช่วงนี้
          {targets.length > 0 && targets.length <= 6 && <> ({targets.map((t) => t.first_name).join(", ")})</>}
        </p>
      </div>
    </Modal>
  );
}

