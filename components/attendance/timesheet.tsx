"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight, Printer, RotateCcw } from "lucide-react";
import { useCan } from "@/components/app/me-context";
import { EmployeePicker } from "@/components/crud/employee-picker";
import { Button, Empty, Input, PageHeader, Panel, Spinner, clsx, toast } from "@/components/ui";
import { TH_DAYS_SHORT, minutesToHM, thDate, thMonthYear, thTime } from "@/lib/format";
import { summarize } from "@/lib/attendance/engine";
import { recalcAction } from "@/lib/attendance/actions";
import { eachDate, monthRange, weekday } from "@/lib/attendance/schedule";
import { DayBadges, FilterBar, MiniField, OtRates, ShiftChip } from "./bits";
import { DayDetailDrawer } from "./day-detail";
import { empName, useAttLookups, useEmployees } from "./lookups";
import { useAttendanceDays, useHolidayNames, useLeaveTypes } from "./use-days";

export function Timesheet({ employeeId, month, companyName }: { employeeId: number; month: string; companyName: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const can = useCan();
  const canEdit = can("attendance", "edit");
  const lk = useAttLookups();
  const { list: emps, loaded } = useEmployees();
  const { from, to } = monthRange(month);
  const { days, reload } = useAttendanceDays(from, to, employeeId);
  const holidays = useHolidayNames(from, to);
  const leaveTypes = useLeaveTypes();
  const [openDate, setOpenDate] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const emp = emps.find((e) => e.id === employeeId);
  const byDate = useMemo(() => new Map((days ?? []).map((d) => [d.work_date, d])), [days]);
  const shiftById = useMemo(() => new Map(lk.shifts.map((s) => [s.id, s])), [lk.shifts]);
  const sum = useMemo(() => summarize((days ?? []).map((d) => ({ ...d, break_over_minutes: d.break_over_minutes ?? 0, ot_approved_minutes: d.ot_approved_minutes ?? {} }))), [days]);
  const leaveMin = (days ?? []).reduce((a, d) => a + d.leave_minutes, 0);
  const open = openDate ? byDate.get(openDate) ?? null : null;

  const go = (emp: number, m: string) => router.push(`${pathname}?employee=${emp}&month=${m}`);
  const moveMonth = (n: number) => {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    go(employeeId, d.toISOString().slice(0, 7));
  };

  async function recalc() {
    setBusy(true);
    const r = await recalcAction({ from, to, employeeIds: [employeeId] });
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    toast.ok("คำนวณใหม่แล้ว");
    reload();
  }

  const [y, m] = month.split("-").map(Number);
  return (
    <div>
      <div className="no-print">
        <PageHeader
          back={
            <Link href="/attendance" className="mb-1 inline-flex items-center gap-1 text-sm text-jade-700 hover:underline">
              <ArrowLeft className="size-4" /> สรุปเวลารายวัน
            </Link>
          }
          title="ใบลงเวลารายเดือน"
          description={`${empName(emp)} · ${thMonthYear(y, m)}`}
          actions={
            <>
              {canEdit && <Button variant="secondary" icon={<RotateCcw className="size-4" />} loading={busy} onClick={recalc}>คำนวณใหม่</Button>}
              <Button icon={<Printer className="size-4" />} onClick={() => window.print()}>พิมพ์</Button>
            </>
          }
        />
        <FilterBar>
          <MiniField label="พนักงาน" className="w-72">
            <EmployeePicker
              value={employeeId}
              onChange={(v) => v && go(v, month)}
              options={emps.map((e) => ({ value: e.id, label: empName(e), raw: e }))}
            />
          </MiniField>
          <div className="flex items-end gap-1">
            <Button variant="secondary" size="sm" className="h-9" onClick={() => moveMonth(-1)} aria-label="เดือนก่อนหน้า"><ChevronLeft className="size-4" /></Button>
            <MiniField label="เดือน">
              <Input type="month" className="h-9 w-40 text-sm" value={month} onChange={(e) => e.target.value && go(employeeId, e.target.value)} />
            </MiniField>
            <Button variant="secondary" size="sm" className="h-9" onClick={() => moveMonth(1)} aria-label="เดือนถัดไป"><ChevronRight className="size-4" /></Button>
          </div>
        </FilterBar>
      </div>

      {loaded && !emp ? (
        <Panel><Empty title="ไม่พบพนักงาน หรือคุณไม่มีสิทธิ์ดูข้อมูลของพนักงานคนนี้" /></Panel>
      ) : (
        <Panel className="print-page" bodyClass="p-0">
          <div className="border-b border-line-soft px-4 py-3">
            <div className="hidden text-sm text-ink-soft print:block">{companyName}</div>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold">ใบลงเวลา {thMonthYear(y, m)}</h2>
              <div className="text-sm text-ink-soft">
                {emp?.code} · {empName(emp)} · {emp?.position_name ?? "-"} · {emp?.org_unit_name ?? "-"}
              </div>
            </div>
          </div>
          <div className="thin-scroll overflow-x-auto">
            <table className="w-full text-[13px] print:text-[11px]">
              <thead>
                <tr className="border-b border-line bg-paper/60 text-left text-ink-soft">
                  <th className="px-2 py-1.5 font-medium">วันที่</th>
                  <th className="px-2 py-1.5 font-medium">กะ</th>
                  <th className="px-2 py-1.5 font-medium">เข้า</th>
                  <th className="px-2 py-1.5 font-medium">ออก</th>
                  <th className="px-2 py-1.5 text-right font-medium">ชม.ทำงาน</th>
                  <th className="px-2 py-1.5 text-right font-medium">สาย</th>
                  <th className="px-2 py-1.5 text-right font-medium">กลับก่อน</th>
                  <th className="px-2 py-1.5 font-medium">OT อนุมัติ</th>
                  <th className="px-2 py-1.5 font-medium">หมายเหตุ</th>
                </tr>
              </thead>
              <tbody>
                {days === null ? (
                  <tr><td colSpan={9} className="py-10"><Spinner className="mx-auto" /></td></tr>
                ) : (
                  eachDate(from, to).map((date) => {
                    const d = byDate.get(date);
                    const s = d?.shift_id ? shiftById.get(d.shift_id) : undefined;
                    const wd = weekday(date);
                    const nonWork = d?.day_type === "off" || d?.day_type === "holiday";
                    return (
                      <tr
                        key={date}
                        className={clsx("border-b border-line-soft last:border-0", nonWork && "bg-paper/60", d && "cursor-pointer hover:bg-jade-50/40")}
                        onClick={() => d && setOpenDate(date)}
                      >
                        <td className="num whitespace-nowrap px-2 py-1.5">
                          <span className={clsx("inline-block w-7", (wd === 0 || wd === 6) && "text-rust")}>{TH_DAYS_SHORT[wd]}</span> {thDate(date)}
                        </td>
                        <td className="px-2 py-1.5">{s ? <ShiftChip code={s.code} color={nonWork ? "#e5e7eb" : s.color} /> : "-"}</td>
                        <td className={clsx("num px-2 py-1.5", (d?.late_minutes ?? 0) > 0 && "font-medium text-amber-ink")}>{thTime(d?.actual_in)}</td>
                        <td className={clsx("num px-2 py-1.5", (d?.early_minutes ?? 0) > 0 && "font-medium text-amber-ink")}>{thTime(d?.actual_out)}</td>
                        <td className="num px-2 py-1.5 text-right">{minutesToHM(d?.work_minutes)}</td>
                        <td className="num px-2 py-1.5 text-right">{minutesToHM(d?.late_minutes)}</td>
                        <td className="num px-2 py-1.5 text-right">{minutesToHM(d?.early_minutes)}</td>
                        <td className="px-2 py-1.5"><OtRates o={d?.ot_approved_minutes} /></td>
                        <td className="px-2 py-1.5">{d ? <DayBadges d={d} holidayName={holidays[date]} /> : <span className="text-ink-mute">ยังไม่คำนวณ</span>}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 border-t border-line px-4 py-3 text-sm sm:grid-cols-4">
            <SumItem label="วันทำงาน" value={`${sum.work_days} วัน`} />
            <SumItem label="ขาดงาน" value={`${sum.absent_days} วัน`} />
            <SumItem label="มาสาย" value={`${sum.late_count} ครั้ง · ${minutesToHM(sum.late_minutes)} ชม.`} />
            <SumItem label="กลับก่อน" value={`${minutesToHM(sum.early_minutes)} ชม.`} />
            <SumItem label="ลืมสแกน" value={`${sum.missing_scan_days} วัน`} />
            <SumItem label="ลา" value={`${minutesToHM(leaveMin)} ชม.`} />
            <SumItem label="วันหยุดนักขัตฤกษ์" value={`${sum.holiday_days_paid} วัน`} />
            <SumItem label="OT อนุมัติ" value={<OtRates o={sum.ot_minutes} />} />
          </div>
          <div className="hidden grid-cols-2 gap-10 px-8 pb-6 pt-12 text-center text-sm print:grid">
            <div>ลงชื่อ ........................................ พนักงาน</div>
            <div>ลงชื่อ ........................................ ผู้บังคับบัญชา</div>
          </div>
          {days && days.length === 0 && <p className="no-print px-4 pb-4 text-sm text-ink-soft">ยังไม่มีผลการคำนวณในเดือนนี้{canEdit ? " — กด “คำนวณใหม่”" : ""}</p>}
        </Panel>
      )}

      <DayDetailDrawer
        open={!!open}
        onClose={() => setOpenDate(null)}
        day={open}
        emp={emp}
        shift={open?.shift_id ? shiftById.get(open.shift_id) : undefined}
        canEdit={canEdit}
        locations={lk.locations}
        leaveTypes={leaveTypes}
        holidayName={openDate ? holidays[openDate] : undefined}
        onChanged={reload}
      />
    </div>
  );
}

function SumItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-2 border-b border-dotted border-line py-1">
      <span className="text-ink-soft">{label}</span>
      <span className="num font-medium">{value}</span>
    </div>
  );
}
