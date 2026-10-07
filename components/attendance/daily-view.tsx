"use client";

import { useMemo, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Download, RotateCcw, Search } from "lucide-react";
import { useCan } from "@/components/app/me-context";
import { Button, Empty, Input, PageHeader, Panel, Select, Spinner, Stat, clsx, toast } from "@/components/ui";
import { minutesToHM, thDate, thTime } from "@/lib/format";
import { downloadCsv } from "@/lib/csv";
import { recalcAction } from "@/lib/attendance/actions";
import { eachDate, plusDays } from "@/lib/attendance/schedule";
import { DAY_TYPE_LABEL, DayBadges, FilterBar, MiniField, OtRates, ShiftChip, otTotal } from "./bits";
import { DayDetailDrawer, type AttDay } from "./day-detail";
import { empName, orgSubtree, useAttLookups, useEmployees } from "./lookups";
import { useAttendanceDays, useHolidayNames, useLeaveTypes } from "./use-days";

const STATUS_OPTS = [
  { value: "late", label: "มาสาย" },
  { value: "early", label: "กลับก่อน" },
  { value: "absent", label: "ขาดงาน" },
  { value: "missing", label: "ลืมสแกน" },
  { value: "leave", label: "ลา" },
  { value: "ot", label: "มี OT" },
  { value: "problem", label: "ทุกปัญหา (สาย/ขาด/ลืมสแกน)" },
  { value: "present", label: "มาทำงาน" },
];
const PAGE = 100;

export function DailyView({ from, to, today }: { from: string; to: string; today: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const can = useCan();
  const canEdit = can("attendance", "edit");
  const lk = useAttLookups();
  const { list: emps } = useEmployees();
  const { days, error, reload } = useAttendanceDays(from, to);
  const holidays = useHolidayNames(from, to);
  const leaveTypes = useLeaveTypes();
  const [f, setF] = useState({ org: "", branch: "", shift: "", status: "", q: "" });
  const [page, setPage] = useState(0);
  const [openId, setOpenId] = useState<number | null>(null);
  const [busy, startBusy] = useTransition();
  const isRange = from !== to;
  const open: AttDay | null = openId != null ? days?.find((d) => d.id === openId) ?? null : null;

  const empById = useMemo(() => new Map(emps.map((e) => [e.id, e])), [emps]);
  const shiftById = useMemo(() => new Map(lk.shifts.map((s) => [s.id, s])), [lk.shifts]);
  const orgSet = useMemo(() => (f.org ? orgSubtree(lk.orgs, Number(f.org)) : null), [f.org, lk.orgs]);

  const rows = useMemo(() => {
    if (!days) return [];
    const q = f.q.trim().toLowerCase();
    return days.filter((d) => {
      const e = empById.get(d.employee_id);
      if (orgSet && !(e?.org_unit_id && orgSet.has(e.org_unit_id))) return false;
      if (f.branch && String(e?.branch_id) !== f.branch) return false;
      if (f.shift && String(d.shift_id) !== f.shift) return false;
      if (q && !(`${e?.code} ${e?.first_name} ${e?.last_name} ${e?.nickname ?? ""}`.toLowerCase().includes(q))) return false;
      switch (f.status) {
        case "late": return d.late_minutes > 0;
        case "early": return d.early_minutes > 0;
        case "absent": return d.absent;
        case "missing": return d.missing_scan;
        case "leave": return d.leave_minutes > 0;
        case "ot": return otTotal(d.ot_approved_minutes) > 0 || d.ot_after_minutes + d.ot_before_minutes > 0;
        case "problem": return d.absent || d.missing_scan || d.late_minutes > 0;
        case "present": return !!(d.actual_in || d.actual_out);
      }
      return true;
    });
  }, [days, f, empById, orgSet]);

  const stats = useMemo(() => {
    const s = { employees: new Set<number>(), work: 0, present: 0, late: 0, lateMin: 0, absent: 0, missing: 0, leave: 0, ot: 0 };
    for (const d of rows) {
      s.employees.add(d.employee_id);
      if (d.day_type === "work" || d.day_type === "special") s.work++;
      if (d.actual_in || d.actual_out) s.present++;
      if (d.late_minutes > 0) s.late++;
      s.lateMin += d.late_minutes;
      if (d.absent) s.absent++;
      if (d.missing_scan) s.missing++;
      if (d.leave_minutes > 0) s.leave++;
      s.ot += otTotal(d.ot_approved_minutes);
    }
    return s;
  }, [rows]);

  const go = (nf: string, nt: string) => {
    const sp = new URLSearchParams();
    sp.set("from", nf);
    if (nt !== nf) sp.set("to", nt);
    router.push(`${pathname}?${sp}`);
  };
  const span = eachDate(from, to).length;
  const shiftBy = (n: number) => go(plusDays(from, n * span), plusDays(to, n * span));

  function recalc() {
    startBusy(async () => {
      const r = await recalcAction({ from, to });
      if (!r.ok) return void toast.error(r.error);
      toast.ok(`คำนวณใหม่แล้ว ${r.data?.days.toLocaleString()} วัน (${r.data?.employees} คน)`);
      await reload();
    });
  }

  function exportCsv() {
    const head = ["วันที่", "รหัส", "ชื่อ", "หน่วยงาน", "กะ", "ประเภทวัน", "เข้างาน (กะ)", "ออกงาน (กะ)", "เข้าจริง", "ออกจริง", "ชม.ทำงาน", "สาย (นาที)", "กลับก่อน (นาที)", "OT อนุมัติ", "ขาดงาน", "ลืมสแกน", "ลา (นาที)"];
    const body = rows.map((d) => {
      const e = empById.get(d.employee_id);
      return [d.work_date, e?.code, empName(e), e?.org_unit_name, shiftById.get(d.shift_id ?? -1)?.code, DAY_TYPE_LABEL[d.day_type], thTime(d.sched_in), thTime(d.sched_out), thTime(d.actual_in), thTime(d.actual_out), minutesToHM(d.work_minutes), d.late_minutes, d.early_minutes,
        Object.entries(d.ot_approved_minutes ?? {}).map(([k, v]) => `${k}x:${v}`).join(" "), d.absent ? "ขาด" : "", d.missing_scan ? "ลืมสแกน" : "", d.leave_minutes];
    });
    downloadCsv(`attendance_${from}${isRange ? "_" + to : ""}.csv`, [head, ...body]);
  }

  const pageRows = rows.slice(page * PAGE, (page + 1) * PAGE);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));

  return (
    <div>
      <PageHeader
        title="สรุปเวลารายวัน"
        description={isRange ? `${thDate(from, "long")} – ${thDate(to, "long")}` : `${thDate(from, "long")}${holidays[from] ? ` · ${holidays[from]}` : ""}`}
        actions={
          <>
            {can("attendance", "export") && (
              <Button variant="secondary" icon={<Download className="size-4" />} onClick={exportCsv} disabled={!rows.length}>ส่งออก</Button>
            )}
            {canEdit && (
              <Button icon={<RotateCcw className="size-4" />} loading={busy} onClick={recalc}>คำนวณใหม่</Button>
            )}
          </>
        }
      />

      <FilterBar>
        <div className="flex w-full items-end gap-1 sm:w-auto">
          <Button variant="secondary" size="sm" className="h-9" onClick={() => shiftBy(-1)} aria-label="ช่วงก่อนหน้า"><ChevronLeft className="size-4" /></Button>
          <MiniField label="ตั้งแต่วันที่" className="min-w-0 flex-1 sm:flex-none">
            <Input type="date" className="h-9 text-sm sm:w-40" value={from} onChange={(e) => e.target.value && go(e.target.value, e.target.value > to ? e.target.value : to)} />
          </MiniField>
          <MiniField label="ถึงวันที่" className="min-w-0 flex-1 sm:flex-none">
            <Input type="date" className="h-9 text-sm sm:w-40" value={to} min={from} onChange={(e) => e.target.value && go(from, e.target.value < from ? from : e.target.value)} />
          </MiniField>
          <Button variant="secondary" size="sm" className="h-9" onClick={() => shiftBy(1)} aria-label="ช่วงถัดไป"><ChevronRight className="size-4" /></Button>
          {(from !== today || isRange) && <Button variant="ghost" size="sm" className="h-9" onClick={() => go(today, today)}>วันนี้</Button>}
        </div>
        <MiniField label="หน่วยงาน">
          <Select className="h-9 w-48 text-sm" value={f.org} onChange={(e) => { setF({ ...f, org: e.target.value }); setPage(0); }} placeholder="ทั้งหมด">
            {lk.orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </Select>
        </MiniField>
        <MiniField label="สาขา">
          <Select className="h-9 w-36 text-sm" value={f.branch} onChange={(e) => { setF({ ...f, branch: e.target.value }); setPage(0); }} placeholder="ทั้งหมด">
            {lk.branches.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </Select>
        </MiniField>
        <MiniField label="กะ">
          <Select className="h-9 w-36 text-sm" value={f.shift} onChange={(e) => { setF({ ...f, shift: e.target.value }); setPage(0); }} placeholder="ทั้งหมด">
            {lk.shifts.map((o) => <option key={o.id} value={o.id}>{o.code} · {o.name}</option>)}
          </Select>
        </MiniField>
        <MiniField label="สถานะ">
          <Select className="h-9 w-44 text-sm" value={f.status} onChange={(e) => { setF({ ...f, status: e.target.value }); setPage(0); }} placeholder="ทั้งหมด">
            {STATUS_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </MiniField>
        <MiniField label="ค้นหาพนักงาน" className="min-w-40 flex-1">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-mute" />
            <Input className="h-9 pl-8 text-sm" value={f.q} onChange={(e) => { setF({ ...f, q: e.target.value }); setPage(0); }} placeholder="รหัส ชื่อ ชื่อเล่น" />
          </div>
        </MiniField>
      </FilterBar>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <Stat label="พนักงาน" value={stats.employees.size.toLocaleString()} sub={isRange ? `${rows.length.toLocaleString()} วันทำงาน/วันหยุด` : `วันทำงาน ${stats.work} คน`} />
        <Stat label="มาทำงาน" value={stats.present.toLocaleString()} sub={stats.work ? `${Math.round((stats.present / Math.max(1, stats.work)) * 100)}% ของวันทำงาน` : undefined} />
        <Stat label="มาสาย" value={stats.late.toLocaleString()} sub={stats.lateMin ? `รวม ${minutesToHM(stats.lateMin)} ชม.` : undefined} tone={stats.late ? "amber" : undefined} />
        <Stat label="ขาดงาน" value={stats.absent.toLocaleString()} tone={stats.absent ? "rust" : undefined} />
        <Stat label="ลืมสแกน" value={stats.missing.toLocaleString()} tone={stats.missing ? "amber" : undefined} />
        <Stat label="ลา / OT อนุมัติ" value={`${stats.leave} / ${minutesToHM(stats.ot)}`} sub="วันลา / ชั่วโมง OT" />
      </div>

      <Panel
        bodyClass="p-0"
        footer={
          rows.length > PAGE ? (
            <div className="flex items-center justify-between text-sm text-ink-soft">
              <span className="num">{page * PAGE + 1}–{Math.min(rows.length, (page + 1) * PAGE)} จาก {rows.length.toLocaleString()} รายการ</span>
              <div className="flex gap-1">
                <Button size="sm" variant="secondary" disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="หน้าก่อนหน้า"><ChevronLeft className="size-4" /></Button>
                <Button size="sm" variant="secondary" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)} aria-label="หน้าถัดไป"><ChevronRight className="size-4" /></Button>
              </div>
            </div>
          ) : null
        }
      >
        <div className="thin-scroll overflow-x-auto">
          <table className="w-full text-[14px]">
            <thead>
              <tr className="border-b border-line bg-paper/60 text-left text-[13px] text-ink-soft">
                {isRange && <th className="px-3 py-2 font-medium">วันที่</th>}
                <th className="px-3 py-2 font-medium">พนักงาน</th>
                <th className="px-3 py-2 font-medium">กะ</th>
                <th className="px-3 py-2 font-medium">เวลากะ</th>
                <th className="px-3 py-2 font-medium">เข้า</th>
                <th className="px-3 py-2 font-medium">ออก</th>
                <th className="px-3 py-2 text-right font-medium">สาย</th>
                <th className="px-3 py-2 text-right font-medium">กลับก่อน</th>
                <th className="px-3 py-2 font-medium">OT อนุมัติ</th>
                <th className="px-3 py-2 font-medium">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {days === null ? (
                <tr><td colSpan={10} className="py-12"><Spinner className="mx-auto" /></td></tr>
              ) : error ? (
                <tr><td colSpan={10}><Empty title="โหลดข้อมูลไม่สำเร็จ" description={error} /></td></tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={10}>
                    <Empty
                      title={days.length ? "ไม่พบข้อมูลที่ตรงกับเงื่อนไข" : "ยังไม่มีผลการคำนวณเวลาในช่วงนี้"}
                      description={days.length ? undefined : canEdit ? "กด “คำนวณใหม่” เพื่อคำนวณจากเวลาที่สแกน ตารางกะ และใบลา/OT ที่อนุมัติแล้ว" : "ระบบจะคำนวณอัตโนมัติตามรอบเวลาที่ตั้งไว้"}
                      action={!days.length && canEdit ? <Button loading={busy} onClick={recalc} icon={<RotateCcw className="size-4" />}>คำนวณใหม่</Button> : undefined}
                    />
                  </td>
                </tr>
              ) : (
                pageRows.map((d) => {
                  const e = empById.get(d.employee_id);
                  const s = d.shift_id ? shiftById.get(d.shift_id) : undefined;
                  const nonWork = d.day_type === "off" || d.day_type === "holiday";
                  return (
                    <tr key={d.id} className="cursor-pointer border-b border-line-soft last:border-0 hover:bg-jade-50/40" onClick={() => setOpenId(d.id)} tabIndex={0} onKeyDown={(ev) => ev.key === "Enter" && setOpenId(d.id)}>
                      {isRange && <td className="num whitespace-nowrap px-3 py-2">{thDate(d.work_date)}</td>}
                      <td className="px-3 py-2">
                        <div className="font-medium">{empName(e)}</div>
                        <div className="text-xs text-ink-mute">{e?.code} · {e?.org_unit_name ?? "-"}</div>
                      </td>
                      <td className="px-3 py-2">{s ? <ShiftChip code={s.code} color={nonWork ? "#dbe3df" : s.color} title={s.name} /> : <span className="text-ink-mute">-</span>}</td>
                      <td className={clsx("num whitespace-nowrap px-3 py-2", nonWork ? "text-ink-mute" : "text-ink-soft")}>{d.sched_in ? `${thTime(d.sched_in)}–${thTime(d.sched_out)}` : "-"}</td>
                      <td className={clsx("num px-3 py-2", d.late_minutes > 0 && "font-medium text-amber-ink")}>{thTime(d.actual_in)}</td>
                      <td className={clsx("num px-3 py-2", d.early_minutes > 0 && "font-medium text-amber-ink")}>{thTime(d.actual_out)}</td>
                      <td className="num px-3 py-2 text-right">{minutesToHM(d.late_minutes)}</td>
                      <td className="num px-3 py-2 text-right">{minutesToHM(d.early_minutes)}</td>
                      <td className="px-3 py-2"><OtRates o={d.ot_approved_minutes} /></td>
                      <td className="px-3 py-2"><DayBadges d={d} holidayName={holidays[d.work_date]} /></td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <DayDetailDrawer
        open={!!open}
        onClose={() => setOpenId(null)}
        day={open}
        emp={open ? empById.get(open.employee_id) : undefined}
        shift={open?.shift_id ? shiftById.get(open.shift_id) : undefined}
        canEdit={canEdit}
        locations={lk.locations}
        leaveTypes={leaveTypes}
        holidayName={open ? holidays[open.work_date] : undefined}
        onChanged={reload}
      />
    </div>
  );
}
