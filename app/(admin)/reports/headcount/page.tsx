"use client";

import { useEffect, useMemo, useState } from "react";
import { Input, Spinner, toast } from "@/components/ui";
import { BarList } from "@/components/charts";
import { FilterField, ReportHead, ReportShell, tbl } from "@/components/reports/report-shell";
import { fetchRows } from "@/components/reports/data";
import { supabaseBrowser } from "@/lib/supabase/client";
import { downloadCsv } from "@/lib/csv";
import { thDate } from "@/lib/format";
import { EMP_TYPE_LABEL } from "@/lib/payroll/labels";

type Emp = {
  id: number; code: string; first_name: string; last_name: string; gender: string | null; status: string; employee_type: string; hire_date: string; resign_date: string | null;
  org_unit_name: string | null; position_name: string | null; branch_name: string | null; resign_reason?: string | null;
};
const GENDER: Record<string, string> = { M: "ชาย", F: "หญิง", X: "ไม่ระบุ" };

export default function HeadcountReportPage() {
  const sb = supabaseBrowser();
  const y = new Date().getFullYear();
  const [from, setFrom] = useState(`${y}-01-01`);
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [emps, setEmps] = useState<Emp[] | null>(null);

  useEffect(() => {
    fetchRows<Emp>(() => sb.from("v_employee_overview").select("id, code, first_name, last_name, gender, status, employee_type, hire_date, resign_date, org_unit_name, position_name, branch_name").order("code"))
      .then(setEmps)
      .catch((e) => toast.error(e.message));
  }, [sb]);

  const s = useMemo(() => {
    const all = emps ?? [];
    const activeAt = (d: string) => all.filter((e) => e.hire_date <= d && (!e.resign_date || e.resign_date > d));
    const active = activeAt(to);
    const startCount = activeAt(from).length;
    const joiners = all.filter((e) => e.hire_date >= from && e.hire_date <= to);
    const leavers = all.filter((e) => e.resign_date && e.resign_date >= from && e.resign_date <= to);
    const avg = (startCount + active.length) / 2 || 1;
    const group = (f: (e: Emp) => string) => {
      const m = new Map<string, number>();
      for (const e of active) m.set(f(e), (m.get(f(e)) ?? 0) + 1);
      return [...m.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    };
    return {
      active, startCount, joiners, leavers, turnover: Math.round((leavers.length / avg) * 1000) / 10,
      byOrg: group((e) => e.org_unit_name ?? "ไม่ระบุ"),
      byPos: group((e) => e.position_name ?? "ไม่ระบุ"),
      byType: group((e) => EMP_TYPE_LABEL[e.employee_type] ?? e.employee_type),
      byGender: group((e) => GENDER[e.gender ?? "X"] ?? "ไม่ระบุ"),
      byBranch: group((e) => e.branch_name ?? "ไม่ระบุ"),
    };
  }, [emps, from, to]);

  const csv = () =>
    downloadCsv(`headcount-${from}-${to}.csv`, [
      ["สรุป", "", ""],
      ["พนักงาน ณ วันเริ่ม", s.startCount],
      ["พนักงาน ณ วันสิ้นสุด", s.active.length],
      ["เข้าใหม่", s.joiners.length],
      ["ลาออก", s.leavers.length],
      ["อัตราการลาออก (%)", s.turnover],
      [],
      ["หน่วยงาน", "จำนวน"],
      ...s.byOrg.map((x) => [x.name, x.value]),
      [],
      ["ตำแหน่ง", "จำนวน"],
      ...s.byPos.map((x) => [x.name, x.value]),
      [],
      ["ประเภท", "จำนวน"],
      ...s.byType.map((x) => [x.name, x.value]),
      [],
      ["เพศ", "จำนวน"],
      ...s.byGender.map((x) => [x.name, x.value]),
      [],
      ["รายการเข้า-ออก", "รหัส", "ชื่อ", "หน่วยงาน", "วันที่"],
      ...s.joiners.map((e) => ["เข้าใหม่", e.code, `${e.first_name} ${e.last_name}`, e.org_unit_name, e.hire_date]),
      ...s.leavers.map((e) => ["ลาออก", e.code, `${e.first_name} ${e.last_name}`, e.org_unit_name, e.resign_date]),
    ]);

  return (
    <ReportShell
      title="อัตรากำลังและการลาออก"
      description="อัตราการลาออก = จำนวนผู้ลาออกในช่วง ÷ ค่าเฉลี่ยพนักงานต้นงวดและปลายงวด × 100"
      onCsv={emps ? csv : undefined}
      filters={
        <>
          <FilterField label="ตั้งแต่">
            <Input type="date" className="h-9" value={from} onChange={(e) => setFrom(e.target.value)} />
          </FilterField>
          <FilterField label="ถึง">
            <Input type="date" className="h-9" value={to} onChange={(e) => setTo(e.target.value)} />
          </FilterField>
        </>
      }
    >
      <ReportHead title="รายงานอัตรากำลัง" sub={`${thDate(from, "long")} – ${thDate(to, "long")}`} />
      {!emps ? (
        <Spinner className="mx-auto my-10" />
      ) : (
        <>
          <table className={`${tbl} mb-5`}>
            <thead>
              <tr>
                <th>ต้นงวด</th>
                <th>เข้าใหม่</th>
                <th>ลาออก</th>
                <th>ปลายงวด</th>
                <th>อัตราการลาออก</th>
              </tr>
            </thead>
            <tbody>
              <tr className="text-center text-[14px]">
                <td className="num">{s.startCount}</td>
                <td className="num">{s.joiners.length}</td>
                <td className="num">{s.leavers.length}</td>
                <td className="num font-semibold">{s.active.length}</td>
                <td className="num">{s.turnover}%</td>
              </tr>
            </tbody>
          </table>
          <div className="mb-5 grid gap-6 sm:grid-cols-2">
            <Block title="ตามหน่วยงาน" data={s.byOrg} />
            <Block title="ตามตำแหน่ง" data={s.byPos.slice(0, 15)} />
            <Block title="ตามประเภทพนักงาน" data={s.byType} />
            <Block title="ตามเพศ" data={s.byGender} />
            {s.byBranch.length > 1 && <Block title="ตามสาขา" data={s.byBranch} />}
          </div>
          <h3 className="mb-1 font-semibold">พนักงานเข้าใหม่และลาออกในช่วง</h3>
          <table className={tbl}>
            <thead>
              <tr>
                <th>รายการ</th>
                <th>รหัส</th>
                <th className="text-left">ชื่อ-สกุล</th>
                <th className="text-left">หน่วยงาน / ตำแหน่ง</th>
                <th>วันที่</th>
              </tr>
            </thead>
            <tbody>
              {[...s.joiners.map((e) => ["เข้าใหม่", e, e.hire_date] as const), ...s.leavers.map((e) => ["ลาออก", e, e.resign_date!] as const)].map(([k, e, dt]) => (
                <tr key={`${k}${e.id}`}>
                  <td className={k === "ลาออก" ? "text-rust" : "text-jade-700"}>{k}</td>
                  <td>{e.code}</td>
                  <td>
                    {e.first_name} {e.last_name}
                  </td>
                  <td>
                    {e.org_unit_name} / {e.position_name}
                  </td>
                  <td className="num">{thDate(dt)}</td>
                </tr>
              ))}
              {!s.joiners.length && !s.leavers.length && (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-neutral-500">
                    ไม่มีพนักงานเข้า-ออกในช่วงนี้
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </>
      )}
    </ReportShell>
  );
}

function Block({ title, data }: { title: string; data: { name: string; value: number }[] }) {
  return (
    <div className="break-inside-avoid">
      <h3 className="mb-2 font-semibold">{title}</h3>
      <BarList data={data} />
    </div>
  );
}
