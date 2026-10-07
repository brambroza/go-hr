"use client";

import { useEffect, useMemo, useState } from "react";
import { FileDown } from "lucide-react";
import { Button, Spinner, Tabs, toast } from "@/components/ui";
import { FilterField, MonthSelect, ReportHead, ReportShell, YearSelect, tbl } from "@/components/reports/report-shell";
import { loadCompanyAndBranches, loadPaidEntries, loadPeople, type EmpLite, type PrivLite } from "@/components/reports/data";
import { downloadCsv } from "@/lib/csv";
import { formatNationalId, money, thDate, thMonthYear } from "@/lib/format";
import { buildRdPrepFile, downloadBuilt, RD_COLUMNS } from "@/lib/payroll/files";
import { Select } from "@/components/ui";

type Row = { employee_id: number; emp: EmpLite | undefined; priv: PrivLite | undefined; income: number; tax: number; pay_date: string };

export default function Pnd1Page() {
  const now = new Date();
  const [mode, setMode] = useState<"monthly" | "annual">("monthly");
  const [year, setYear] = useState(now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() === 0 ? 12 : now.getMonth());
  const [branch, setBranch] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [info, setInfo] = useState<Awaited<ReturnType<typeof loadCompanyAndBranches>> | null>(null);
  const [periodCount, setPeriodCount] = useState(0);

  useEffect(() => {
    loadCompanyAndBranches().then(setInfo);
  }, []);

  useEffect(() => {
    setRows(null);
    (async () => {
      const { periods, entries } = await loadPaidEntries(year, mode === "monthly" ? month : undefined);
      setPeriodCount(periods.length);
      const payDate = new Map(periods.map((p) => [p.id, p.pay_date]));
      const by = new Map<number, Row>();
      for (const e of entries) {
        if (branch && String(e.branch_id) !== branch) continue;
        const r = by.get(e.employee_id) ?? { employee_id: e.employee_id, emp: undefined, priv: undefined, income: 0, tax: 0, pay_date: "" };
        r.income += Number(e.taxable_income);
        r.tax += Number(e.tax);
        const pd = payDate.get(e.period_id) ?? "";
        if (pd > r.pay_date) r.pay_date = pd;
        by.set(e.employee_id, r);
      }
      const people = await loadPeople([...by.keys()]);
      const list = [...by.values()].map((r) => {
        const priv = people.priv.get(r.employee_id);
        // ภ.ง.ด.1ก includes income paid by this company before the system went live (opening balance)
        if (mode === "annual" && priv && Number(priv.ytd_open_year) === year) {
          r.income += Number(priv.ytd_open_income);
          r.tax += Number(priv.ytd_open_tax);
        }
        return { ...r, emp: people.emp.get(r.employee_id), priv, income: Math.round(r.income * 100) / 100, tax: Math.round(r.tax * 100) / 100, pay_date: mode === "annual" ? `${year}-12-31` : r.pay_date };
      });
      list.sort((a, b) => (a.emp?.code ?? "").localeCompare(b.emp?.code ?? ""));
      setRows(list.filter((r) => r.income > 0 || r.tax > 0));
    })().catch((e) => toast.error(String(e.message ?? e)));
  }, [year, month, mode, branch]);

  const totals = useMemo(() => ({ income: (rows ?? []).reduce((s, r) => s + r.income, 0), tax: (rows ?? []).reduce((s, r) => s + r.tax, 0) }), [rows]);
  const br = info?.branches.find((b) => String(b.id) === branch);
  const taxId = (r: Row) => r.priv?.tax_id || r.priv?.national_id || "";
  const label = mode === "monthly" ? `เดือน ${thMonthYear(year, month)}` : `ปีภาษี ${year + 543}`;
  const missingId = (rows ?? []).filter((r) => !taxId(r)).length;

  const csv = () =>
    downloadCsv(`${mode === "monthly" ? "pnd1" : "pnd1a"}-${year + 543}${mode === "monthly" ? String(month).padStart(2, "0") : ""}.csv`, [
      RD_COLUMNS,
      ...(rows ?? []).map((r, i) => [i + 1, taxId(r), "00000", r.emp?.prefix ?? "", r.emp?.first_name, r.emp?.last_name, "40(1)", thDate(r.pay_date, "num"), r.income.toFixed(2), r.tax.toFixed(2), 1]),
      ["", "", "", "", "", "รวม", "", "", totals.income.toFixed(2), totals.tax.toFixed(2), ""],
    ]);
  const rdFile = () => {
    const f = buildRdPrepFile(
      `${mode === "monthly" ? "PND1" : "PND1A"}_${(info?.company.tax_id ?? "").replace(/\D/g, "")}_${year + 543}${mode === "monthly" ? String(month).padStart(2, "0") : ""}.txt`,
      (rows ?? []).map((r) => ({ tax_id: taxId(r), prefix: r.emp?.prefix ?? null, first_name: r.emp?.first_name ?? "", last_name: r.emp?.last_name ?? "", pay_date: r.pay_date, income: r.income, tax: r.tax })),
    );
    downloadBuilt(f);
  };

  return (
    <ReportShell
      title="ภ.ง.ด.1 / ภ.ง.ด.1ก"
      description="แบบยื่นรายการภาษีเงินได้หัก ณ ที่จ่าย ตามมาตรา 50 (1) — เงินได้ตามมาตรา 40 (1) เงินเดือน ค่าจ้าง"
      onCsv={rows?.length ? csv : undefined}
      extraActions={
        rows?.length ? (
          <Button variant="secondary" icon={<FileDown className="size-4" />} onClick={rdFile}>
            ไฟล์ RD Prep (.txt)
          </Button>
        ) : null
      }
      filters={
        <>
          <Tabs value={mode} onChange={setMode} tabs={[{ value: "monthly", label: "ภ.ง.ด.1 รายเดือน" }, { value: "annual", label: "ภ.ง.ด.1ก ประจำปี" }]} className="border-0" />
          <YearSelect value={year} onChange={setYear} />
          {mode === "monthly" && <MonthSelect value={month} onChange={setMonth} />}
          {(info?.branches.length ?? 0) > 1 && (
            <FilterField label="สาขา">
              <Select className="h-9 w-56" value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="ทุกสาขา (ยื่นรวม)">
                {info!.branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </FilterField>
          )}
        </>
      }
    >
      <ReportHead title={mode === "monthly" ? "แบบ ภ.ง.ด.1 — สรุปและใบแนบ" : "แบบ ภ.ง.ด.1ก — สรุปเงินได้และภาษีทั้งปี"} sub={label} />
      <div className="mb-4 grid grid-cols-2 gap-x-6 gap-y-1 rounded border border-neutral-300 p-3">
        <div>
          ชื่อผู้มีหน้าที่หักภาษี ณ ที่จ่าย: <b>{info?.company.name}</b>
        </div>
        <div>
          เลขประจำตัวผู้เสียภาษีอากร: <b className="num">{formatNationalId(info?.company.tax_id) || "-"}</b> สาขา <b className="num">{br?.tax_branch_no ?? info?.company.branch_no ?? "00000"}</b>
        </div>
        <div className="col-span-2">ที่อยู่: {br?.address ?? info?.company.address}</div>
      </div>
      {rows === null ? (
        <Spinner className="mx-auto my-10" />
      ) : (
        <>
          <table className={`${tbl} mb-5`}>
            <tbody>
              <tr>
                <td className="w-2/3">1. เงินได้ตามมาตรา 40 (1) เงินเดือน ค่าจ้าง ฯลฯ กรณีทั่วไป</td>
                <td className="num text-right">{rows.length} ราย</td>
              </tr>
              <tr>
                <td>รวมเงินได้ทั้งสิ้น</td>
                <td className="num text-right font-semibold">{money(totals.income)}</td>
              </tr>
              <tr>
                <td>รวมภาษีที่นำส่งทั้งสิ้น</td>
                <td className="num text-right font-semibold">{money(totals.tax)}</td>
              </tr>
              <tr>
                <td>จำนวนงวดเงินเดือนที่รวมในรายงาน (อนุมัติ/จ่าย/ปิดแล้ว)</td>
                <td className="num text-right">{periodCount} งวด</td>
              </tr>
            </tbody>
          </table>
          {missingId > 0 && <p className="no-print mb-2 text-sm text-rust">พนักงาน {missingId} คนยังไม่มีเลขประจำตัวผู้เสียภาษี/เลขบัตรประชาชน — กรอกที่ข้อมูลพนักงานก่อนยื่น</p>}
          <h3 className="mb-1 font-semibold">{mode === "monthly" ? "ใบแนบ ภ.ง.ด.1" : "ใบแนบ ภ.ง.ด.1ก"}</h3>
          <table className={tbl}>
            <thead>
              <tr>
                <th className="w-10">ลำดับ</th>
                <th>เลขประจำตัวผู้เสียภาษีอากร</th>
                <th>ชื่อผู้มีเงินได้</th>
                <th>วันเดือนปีที่จ่าย</th>
                <th className="text-right">จำนวนเงินได้ที่จ่าย</th>
                <th className="text-right">ภาษีที่หักและนำส่ง</th>
                <th className="w-14">เงื่อนไข</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.employee_id}>
                  <td className="num text-center">{i + 1}</td>
                  <td className="num">{formatNationalId(taxId(r)) || <span className="text-rust">ไม่มีข้อมูล</span>}</td>
                  <td>
                    {r.emp?.prefix}
                    {r.emp?.first_name} {r.emp?.last_name}
                  </td>
                  <td className="num">{thDate(r.pay_date, "num")}</td>
                  <td className="num text-right">{money(r.income)}</td>
                  <td className="num text-right">{money(r.tax)}</td>
                  <td className="text-center">1</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-neutral-500">
                    ไม่มีข้อมูลเงินเดือนที่อนุมัติแล้วใน{label}
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <td colSpan={4} className="text-right">
                  รวม
                </td>
                <td className="num text-right">{money(totals.income)}</td>
                <td className="num text-right">{money(totals.tax)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
          <p className="mt-2 text-[11px] text-neutral-600">เงื่อนไข: 1 = หัก ณ ที่จ่าย, 2 = ออกให้ตลอดไป, 3 = ออกให้ครั้งเดียว</p>
        </>
      )}
    </ReportShell>
  );
}
