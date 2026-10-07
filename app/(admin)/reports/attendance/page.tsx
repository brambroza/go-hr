"use client";

import { useEffect, useMemo, useState } from "react";
import { Input, Select, Spinner, toast } from "@/components/ui";
import { FilterField, ReportHead, ReportShell, tbl } from "@/components/reports/report-shell";
import { fetchRows, fetchRowsIn } from "@/components/reports/data";
import { supabaseBrowser } from "@/lib/supabase/client";
import { downloadCsv } from "@/lib/csv";
import { minutesToHM, thDate } from "@/lib/format";

type Day = { employee_id: number; day_type: string; work_minutes: number; late_minutes: number; early_minutes: number; absent: boolean; missing_scan: boolean; leave_minutes: number; ot_approved_minutes: Record<string, number> | null };
type Emp = { id: number; code: string; first_name: string; last_name: string; org_unit_id: number | null; org_unit_name: string | null };
type Agg = { emp: Emp; work: number; late: number; lateCount: number; early: number; absent: number; missing: number; leave: number; ot: Record<string, number> };

const monthStartIso = () => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 8) + "01";
};
const monthEndIso = (s: string) => {
  const [y, m] = s.split("-").map(Number);
  return `${y}-${String(m).padStart(2, "0")}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
};

export default function AttendanceReportPage() {
  const sb = supabaseBrowser();
  const [from, setFrom] = useState(monthStartIso());
  const [to, setTo] = useState(monthEndIso(monthStartIso()));
  const [org, setOrg] = useState("");
  const [orgs, setOrgs] = useState<{ id: number; name: string }[]>([]);
  const [rows, setRows] = useState<Agg[] | null>(null);
  const [onlyIssues, setOnlyIssues] = useState(false);

  useEffect(() => {
    sb.from("org_units").select("id, name").order("name").then(({ data }: { data: unknown }) => setOrgs((data as { id: number; name: string }[]) ?? []));
  }, [sb]);
  useEffect(() => {
    if (!from || !to || to < from) return;
    setRows(null);
    (async () => {
      const emps = await fetchRows<Emp>(() => {
        let q = sb.from("v_directory").select("id, code, first_name, last_name, org_unit_id, org_unit_name").order("code");
        if (org) q = q.eq("org_unit_id", Number(org));
        return q;
      });
      const days = await fetchRowsIn<Day>(emps.map((e) => e.id), (part) =>
        sb.from("attendance_days").select("employee_id, day_type, work_minutes, late_minutes, early_minutes, absent, missing_scan, leave_minutes, ot_approved_minutes, id").in("employee_id", part).gte("work_date", from).lte("work_date", to).order("id"),
      );
      const m = new Map<number, Agg>(emps.map((e) => [e.id, { emp: e, work: 0, late: 0, lateCount: 0, early: 0, absent: 0, missing: 0, leave: 0, ot: {} }]));
      for (const d of days) {
        const a = m.get(d.employee_id);
        if (!a) continue;
        if (["work", "special"].includes(d.day_type) && d.work_minutes > 0) a.work++;
        a.late += d.late_minutes;
        if (d.late_minutes > 0) a.lateCount++;
        a.early += d.early_minutes;
        if (d.absent) a.absent++;
        if (d.missing_scan) a.missing++;
        if (d.leave_minutes > 0) a.leave++;
        for (const [k, v] of Object.entries(d.ot_approved_minutes ?? {})) a.ot[k] = (a.ot[k] ?? 0) + Number(v);
      }
      setRows([...m.values()]);
    })().catch((e) => toast.error(String(e.message ?? e)));
  }, [sb, from, to, org]);

  const otKeys = useMemo(() => [...new Set((rows ?? []).flatMap((r) => Object.keys(r.ot)))].sort((a, b) => Number(a) - Number(b)), [rows]);
  const shown = (rows ?? []).filter((r) => !onlyIssues || r.late || r.absent || r.missing || r.early);
  const csv = () =>
    downloadCsv(`attendance-${from}-${to}.csv`, [
      ["รหัส", "ชื่อ-สกุล", "หน่วยงาน", "วันทำงาน", "สาย (ครั้ง)", "สาย (นาที)", "กลับก่อน (นาที)", "ขาด (วัน)", "ลืมสแกน (วัน)", "ลา (วัน)", ...otKeys.map((k) => `OT ${k} เท่า (ชม.)`)],
      ...shown.map((r) => [r.emp.code, `${r.emp.first_name} ${r.emp.last_name}`, r.emp.org_unit_name, r.work, r.lateCount, r.late, r.early, r.absent, r.missing, r.leave, ...otKeys.map((k) => ((r.ot[k] ?? 0) / 60).toFixed(2))]),
    ]);

  return (
    <ReportShell
      landscape
      title="สรุปเวลาทำงาน"
      description="สรุปจากผลคำนวณเวลารายวัน — มาสาย กลับก่อน ขาดงาน ลืมสแกน ลา และ OT ที่อนุมัติ"
      onCsv={shown.length ? csv : undefined}
      filters={
        <>
          <FilterField label="ตั้งแต่">
            <Input type="date" className="h-9" value={from} onChange={(e) => setFrom(e.target.value)} />
          </FilterField>
          <FilterField label="ถึง">
            <Input type="date" className="h-9" value={to} onChange={(e) => setTo(e.target.value)} />
          </FilterField>
          <FilterField label="หน่วยงาน">
            <Select className="h-9 w-56" value={org} onChange={(e) => setOrg(e.target.value)} placeholder="ทั้งหมด">
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </Select>
          </FilterField>
          <label className="flex items-center gap-2 pb-2 text-sm">
            <input type="checkbox" className="accent-jade-600" checked={onlyIssues} onChange={(e) => setOnlyIssues(e.target.checked)} /> เฉพาะคนที่มีสาย/ขาด/ลืมสแกน
          </label>
        </>
      }
    >
      <ReportHead title="รายงานสรุปเวลาทำงาน" sub={`${thDate(from, "long")} – ${thDate(to, "long")}`} />
      {rows === null ? (
        <Spinner className="mx-auto my-10" />
      ) : (
        <table className={tbl}>
          <thead>
            <tr>
              <th>รหัส</th>
              <th className="text-left">ชื่อ-สกุล</th>
              <th className="text-left">หน่วยงาน</th>
              <th className="text-right">วันทำงาน</th>
              <th className="text-right">สาย (ครั้ง)</th>
              <th className="text-right">สาย (ชม.)</th>
              <th className="text-right">กลับก่อน</th>
              <th className="text-right">ขาด</th>
              <th className="text-right">ลืมสแกน</th>
              <th className="text-right">ลา</th>
              {otKeys.map((k) => (
                <th key={k} className="text-right">
                  OT {k}x
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.emp.id}>
                <td>{r.emp.code}</td>
                <td>
                  {r.emp.first_name} {r.emp.last_name}
                </td>
                <td>{r.emp.org_unit_name}</td>
                <td className="num text-right">{r.work}</td>
                <td className={`num text-right ${r.lateCount ? "text-rust" : ""}`}>{r.lateCount || "-"}</td>
                <td className="num text-right">{minutesToHM(r.late)}</td>
                <td className="num text-right">{minutesToHM(r.early)}</td>
                <td className={`num text-right ${r.absent ? "text-rust" : ""}`}>{r.absent || "-"}</td>
                <td className={`num text-right ${r.missing ? "text-amber-ink" : ""}`}>{r.missing || "-"}</td>
                <td className="num text-right">{r.leave || "-"}</td>
                {otKeys.map((k) => (
                  <td key={k} className="num text-right">
                    {minutesToHM(r.ot[k] ?? 0)}
                  </td>
                ))}
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={10 + otKeys.length} className="py-6 text-center text-neutral-500">
                  ไม่มีข้อมูล
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </ReportShell>
  );
}
