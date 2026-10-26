"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FileCog, FileDown } from "lucide-react";
import { Button, Select, Spinner, toast } from "@/components/ui";
import { FilterField, MonthSelect, ReportHead, ReportShell, YearSelect, tbl } from "@/components/reports/report-shell";
import { loadCompanyAndBranches, loadPaidEntries } from "@/components/reports/data";
import { loadPvdRows } from "@/components/reports/pvd-data";
import { thMonthName } from "@/components/reports/gov-forms";
import { ExportReviewModal, IssueList, LayoutPicker, useFileLayouts } from "@/components/payroll/file-export";
import { supabaseBrowser } from "@/lib/supabase/client";
import { downloadCsv } from "@/lib/csv";
import { money } from "@/lib/format";
import { buildExport, pvdFileData, type PvdRow, type RenderedFile } from "@/lib/payroll/files";

/** กองทุนสำรองเลี้ยงชีพ — เงินสะสม / เงินสมทบรายคนของเดือน และไฟล์นำส่งบริษัทจัดการ (ภายใน 3 วันทำการนับจากวันจ่ายค่าจ้าง) */
export default function PvdReportPage() {
  const now = new Date();
  const sp = useSearchParams();
  const qy = Number(sp.get("year")), qm = Number(sp.get("month"));
  const [year, setYear] = useState(qy >= 2000 && qy <= 2100 ? qy : now.getFullYear());
  const [month, setMonth] = useState(qm >= 1 && qm <= 12 ? qm : now.getMonth() + 1);
  const [branch, setBranch] = useState("");
  const [info, setInfo] = useState<Awaited<ReturnType<typeof loadCompanyAndBranches>> | null>(null);
  const [fund, setFund] = useState<{ pvd_fund_name?: string; pvd_employer_code?: string }>({});
  const [rows, setRows] = useState<PvdRow[] | null>(null);
  const [periods, setPeriods] = useState<{ id: number; name: string; pay_date: string }[]>([]);
  const { layouts, defaultKey } = useFileLayouts("pvd");
  const [layoutKey, setLayoutKey] = useState("");
  const [review, setReview] = useState<(RenderedFile & { ok: boolean }) | null>(null);

  useEffect(() => {
    loadCompanyAndBranches().then(setInfo).catch((e) => toast.error(e));
    supabaseBrowser()
      .from("settings")
      .select("value")
      .eq("key", "payroll")
      .maybeSingle()
      .then(({ data }: { data: { value?: typeof fund } | null }) => setFund(data?.value ?? {}));
  }, []);
  useEffect(() => setLayoutKey(defaultKey ?? ""), [defaultKey]);

  useEffect(() => {
    let alive = true;
    setRows(null);
    (async () => {
      const { periods: ps } = await loadPaidEntries(year, month);
      const list = await loadPvdRows(ps.map((p) => p.id), branch || undefined);
      if (alive) {
        setPeriods(ps);
        setRows(list);
      }
    })().catch((e) => toast.error(e));
    return () => {
      alive = false;
    };
  }, [year, month, branch]);

  const list = useMemo(() => rows ?? [], [rows]);
  const t = useMemo(() => ({ wage: list.reduce((s, r) => s + r.wage, 0), employee: list.reduce((s, r) => s + r.employee, 0), employer: list.reduce((s, r) => s + r.employer, 0) }), [list]);
  const lastPay = periods.map((p) => p.pay_date).sort().pop() ?? `${year}-${String(month).padStart(2, "0")}-28`;
  const batch = { company: { name: info?.company.name ?? "", tax_id: info?.company.tax_id ?? "" }, period_code: `PVD${year}${String(month).padStart(2, "0")}`, pay_date: lastPay, year, month, fund_name: fund.pvd_fund_name, employer_code: fund.pvd_employer_code };
  const check = useMemo(() => (rows ? pvdFileData(batch, list).issues : []), [rows, info, fund]); // eslint-disable-line react-hooks/exhaustive-deps
  const layout = layouts.find((l) => l.key === layoutKey);

  const csv = () =>
    downloadCsv(`pvd-${year + 543}${String(month).padStart(2, "0")}.csv`, [
      ["รหัส", "เลขที่สมาชิก", "เลขประจำตัวประชาชน", "ชื่อ-สกุล", "ค่าจ้าง", "อัตราสะสม %", "อัตราสมทบ %", "เงินสะสม", "เงินสมทบ", "รวม"],
      ...list.map((r) => [r.emp_code, r.member_no ?? "", r.national_id ?? "", `${r.prefix ?? ""}${r.first_name} ${r.last_name}`, r.wage.toFixed(2), r.employee_rate, r.employer_rate, r.employee.toFixed(2), r.employer.toFixed(2), (r.employee + r.employer).toFixed(2)]),
      ["", "", "", "รวม", t.wage.toFixed(2), "", "", t.employee.toFixed(2), t.employer.toFixed(2), (t.employee + t.employer).toFixed(2)],
    ]);

  return (
    <div>
      <ReportShell
        title="กองทุนสำรองเลี้ยงชีพ"
        description="เงินสะสม (ลูกจ้าง) และเงินสมทบ (นายจ้าง) รายคนของงวดที่อนุมัติแล้วในเดือน — นำส่งบริษัทจัดการภายใน 3 วันทำการนับจากวันจ่ายค่าจ้าง"
        onCsv={list.length ? csv : undefined}
        extraActions={
          <Link href="/settings/file-formats" className="inline-flex h-10 items-center gap-1.5 rounded-[var(--radius-ctl)] border border-line bg-white px-3 text-[15px] font-medium hover:bg-paper">
            <FileCog className="size-4" /> รูปแบบไฟล์
          </Link>
        }
        filters={
          <>
            <YearSelect value={year} onChange={setYear} />
            <MonthSelect value={month} onChange={setMonth} />
            <FilterField label="สาขา">
              <Select className="h-9 w-48" value={branch} onChange={(e) => setBranch(e.target.value)}>
                <option value="">ทุกสาขา</option>
                {info?.branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </FilterField>
          </>
        }
      >
        {rows === null ? (
          <Spinner className="mx-auto my-10" />
        ) : (
          <>
            <div className="no-print mb-5 space-y-3 rounded-[var(--radius-ctl)] border border-line bg-paper/60 p-3">
              <div className="flex flex-wrap items-end gap-2">
                <FilterField label="ไฟล์นำส่งบริษัทจัดการกองทุน">
                  <LayoutPicker layouts={layouts} value={layoutKey} onChange={setLayoutKey} className="h-9 w-[28rem] max-w-full" />
                </FilterField>
                <Button icon={<FileDown className="size-4" />} disabled={!list.length || !layout} onClick={() => layout && setReview(buildExport(layout, pvdFileData(batch, list)))}>
                  ตรวจข้อมูลและสร้างไฟล์
                </Button>
              </div>
              <p className="text-xs text-ink-mute">
                งวดในเดือนนี้: {periods.length ? periods.map((p) => p.name).join(", ") : "ยังไม่มีงวดที่อนุมัติ"} · รูปแบบเริ่มต้นเป็น CSV ทั่วไป — คัดลอกไปแก้ให้ตรงกับ Template ของบริษัทจัดการได้ที่ “รูปแบบไฟล์”
              </p>
              <IssueList issues={check} max={6} />
            </div>
            <ReportHead company={info?.company.name} title={`รายการนำส่งกองทุนสำรองเลี้ยงชีพ ${fund.pvd_fund_name ?? ""}`.trim()} sub={`ค่าจ้างเดือน ${thMonthName(month)} ${year + 543}`} />
            {list.length === 0 ? (
              <p className="py-10 text-center text-neutral-500">ไม่มีเงินสะสม/เงินสมทบในเดือนนี้</p>
            ) : (
              <table className={tbl}>
                <thead>
                  <tr>
                    <th>ลำดับ</th>
                    <th>รหัส</th>
                    <th>เลขที่สมาชิก</th>
                    <th>ชื่อ-สกุล</th>
                    <th>ค่าจ้าง</th>
                    <th>สะสม %</th>
                    <th>เงินสะสม</th>
                    <th>สมทบ %</th>
                    <th>เงินสมทบ</th>
                    <th>รวม</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((r, i) => (
                    <tr key={r.employee_id}>
                      <td className="text-center">{i + 1}</td>
                      <td>{r.emp_code}</td>
                      <td>{r.member_no ?? <span className="text-rust">-</span>}</td>
                      <td>
                        {r.prefix}
                        {r.first_name} {r.last_name}
                      </td>
                      <td className="num text-right">{money(r.wage)}</td>
                      <td className="num text-right">{r.employee_rate}</td>
                      <td className="num text-right">{money(r.employee)}</td>
                      <td className="num text-right">{r.employer_rate}</td>
                      <td className="num text-right">{money(r.employer)}</td>
                      <td className="num text-right">{money(r.employee + r.employer)}</td>
                    </tr>
                  ))}
                  <tr className="font-semibold">
                    <td colSpan={4} className="text-right">
                      รวม {list.length} คน
                    </td>
                    <td className="num text-right">{money(t.wage)}</td>
                    <td />
                    <td className="num text-right">{money(t.employee)}</td>
                    <td />
                    <td className="num text-right">{money(t.employer)}</td>
                    <td className="num text-right">{money(t.employee + t.employer)}</td>
                  </tr>
                </tbody>
              </table>
            )}
          </>
        )}
      </ReportShell>
      <ExportReviewModal open={!!review} onClose={() => setReview(null)} title={`ไฟล์นำส่งกองทุนสำรองเลี้ยงชีพ ${thMonthName(month)} ${year + 543}`} layout={layout} file={review} />
    </div>
  );
}
