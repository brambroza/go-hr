"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input, Spinner, toast } from "@/components/ui";
import { FilterField, ReportShell, YearSelect } from "@/components/reports/report-shell";
import { addressText, loadCompanyAndBranches, loadPaidEntries, loadPeople, type AddrLite, type EmpLite, type PrivLite } from "@/components/reports/data";
import { downloadCsv } from "@/lib/csv";
import { bahtText, formatNationalId, money, thDate } from "@/lib/format";

type Row = { employee_id: number; emp?: EmpLite; priv?: PrivLite; addr?: AddrLite; income: number; tax: number; sso: number; pvd: number; last_pay: string };

/** หนังสือรับรองการหักภาษี ณ ที่จ่าย ตามมาตรา 50 ทวิ — one A4 per employee, bulk print */
export default function Tawi50Page() {
  const [year, setYear] = useState(new Date().getMonth() < 3 ? new Date().getFullYear() - 1 : new Date().getFullYear());
  const [rows, setRows] = useState<Row[] | null>(null);
  const [q, setQ] = useState("");
  const [bookNo, setBookNo] = useState("1");
  const [info, setInfo] = useState<Awaited<ReturnType<typeof loadCompanyAndBranches>> | null>(null);

  useEffect(() => {
    loadCompanyAndBranches().then(setInfo);
  }, []);
  useEffect(() => {
    setRows(null);
    (async () => {
      const { periods, entries } = await loadPaidEntries(year);
      const payDate = new Map(periods.map((p) => [p.id, p.pay_date]));
      const by = new Map<number, Row>();
      for (const e of entries) {
        const r = by.get(e.employee_id) ?? { employee_id: e.employee_id, income: 0, tax: 0, sso: 0, pvd: 0, last_pay: "" };
        r.income += Number(e.taxable_income);
        r.tax += Number(e.tax);
        r.sso += Number(e.sso_employee);
        r.pvd += Number(e.pvd_employee);
        const pd = payDate.get(e.period_id) ?? "";
        if (pd > r.last_pay) r.last_pay = pd;
        by.set(e.employee_id, r);
      }
      const people = await loadPeople([...by.keys()], true);
      const addrBy = new Map<number, AddrLite>();
      for (const a of people.addr) if (!addrBy.has(a.employee_id) || a.address_type === "registered") addrBy.set(a.employee_id, a);
      const list = [...by.values()].map((r) => {
        const priv = people.priv.get(r.employee_id);
        if (priv && Number(priv.ytd_open_year) === year) {
          r.income += Number(priv.ytd_open_income);
          r.tax += Number(priv.ytd_open_tax);
          r.sso += Number(priv.ytd_open_sso);
          r.pvd += Number(priv.ytd_open_pvd);
        }
        return { ...r, emp: people.emp.get(r.employee_id), priv, addr: addrBy.get(r.employee_id) };
      });
      list.sort((a, b) => (a.emp?.code ?? "").localeCompare(b.emp?.code ?? ""));
      setRows(list);
    })().catch((e) => toast.error(String(e.message ?? e)));
  }, [year]);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (rows ?? []).filter((r) => !t || `${r.emp?.code} ${r.emp?.first_name} ${r.emp?.last_name}`.toLowerCase().includes(t));
  }, [rows, q]);
  const hq = info?.branches.find((b) => b.is_head_office);
  const issueDate = `${year}-12-31` < new Date().toISOString().slice(0, 10) ? new Date().toISOString().slice(0, 10) : `${year}-12-31`;

  return (
    <div>
      <style>{`@media print { @page { size: A4; margin: 10mm; } .t50 { break-after: page; } .t50:last-child { break-after: auto; } .report-paper { padding: 0 !important; border: 0 !important; } }`}</style>
      <ReportShell
        title="หนังสือรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ)"
        description="ออกให้พนักงานทุกคนที่มีเงินได้ในปีภาษี — เลขที่เอกสารเรียงตามรหัสพนักงาน"
        onCsv={
          rows?.length
            ? () =>
                downloadCsv(`tawi50-${year + 543}.csv`, [
                  ["เล่มที่", "เลขที่", "รหัส", "เลขประจำตัวผู้เสียภาษี", "ชื่อ-สกุล", "เงินได้ 40(1)", "ภาษีที่หัก", "ประกันสังคม", "กองทุนสำรองเลี้ยงชีพ"],
                  ...shown.map((r, i) => [bookNo, i + 1, r.emp?.code, r.priv?.tax_id || r.priv?.national_id, `${r.emp?.prefix ?? ""}${r.emp?.first_name} ${r.emp?.last_name}`, r.income.toFixed(2), r.tax.toFixed(2), r.sso.toFixed(2), r.pvd.toFixed(2)]),
                ])
            : undefined
        }
        filters={
          <>
            <YearSelect value={year} onChange={setYear} />
            <FilterField label="เล่มที่">
              <Input className="h-9 w-20" value={bookNo} onChange={(e) => setBookNo(e.target.value)} />
            </FilterField>
            <FilterField label="ค้นหาพนักงาน (พิมพ์เฉพาะที่ค้นพบ)">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-mute" />
                <Input className="h-9 w-64 pl-8" value={q} onChange={(e) => setQ(e.target.value)} placeholder="รหัส / ชื่อ" />
              </div>
            </FilterField>
            <span className="pb-2 text-sm text-ink-soft">{shown.length} ฉบับ</span>
          </>
        }
      >
        {rows === null ? (
          <Spinner className="mx-auto my-10" />
        ) : shown.length === 0 ? (
          <p className="py-10 text-center text-neutral-500">ไม่มีข้อมูลเงินได้ในปี {year + 543}</p>
        ) : (
          shown.map((r) => (
            <section key={r.employee_id} className="t50 mb-10 border border-black p-4 text-[12px] leading-relaxed print:mb-0">
              <div className="flex items-start justify-between">
                <div className="text-[11px]">ฉบับที่ 1 (สำหรับผู้ถูกหักภาษี ณ ที่จ่าย ใช้แนบพร้อมกับแบบแสดงรายการภาษี)</div>
                <div className="num text-right text-[11px]">
                  เล่มที่ {bookNo} &nbsp; เลขที่ {(rows.indexOf(r) + 1).toString().padStart(4, "0")}
                </div>
              </div>
              <h2 className="my-2 text-center text-[15px] font-semibold">หนังสือรับรองการหักภาษี ณ ที่จ่าย</h2>
              <p className="mb-2 text-center text-[11px]">ตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร</p>
              <div className="mb-2 border border-black p-2">
                <div className="flex justify-between gap-3">
                  <b>ผู้มีหน้าที่หักภาษี ณ ที่จ่าย :</b>
                  <span className="num">เลขประจำตัวผู้เสียภาษีอากร {formatNationalId(info?.company.tax_id) || "-"}</span>
                </div>
                <div>ชื่อ {info?.company.name}</div>
                <div>ที่อยู่ {hq?.address || info?.company.address}</div>
              </div>
              <div className="mb-2 border border-black p-2">
                <div className="flex justify-between gap-3">
                  <b>ผู้ถูกหักภาษี ณ ที่จ่าย :</b>
                  <span className="num">เลขประจำตัวผู้เสียภาษีอากร {formatNationalId(r.priv?.tax_id || r.priv?.national_id) || "-"}</span>
                </div>
                <div>
                  ชื่อ {r.emp?.prefix}
                  {r.emp?.first_name} {r.emp?.last_name} <span className="text-neutral-600">(รหัส {r.emp?.code})</span>
                </div>
                <div>ที่อยู่ {addressText(r.addr) || "-"}</div>
                <div className="mt-1">
                  ลำดับที่ ...... ในแบบ <span className="ml-1">☑ ภ.ง.ด.1ก</span> <span className="ml-3">☐ ภ.ง.ด.1ก พิเศษ</span> <span className="ml-3">☐ ภ.ง.ด.2</span> <span className="ml-3">☐ ภ.ง.ด.3</span>
                </div>
              </div>
              <table className="w-full border-collapse [&_td]:border [&_td]:border-black [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-black [&_th]:px-2 [&_th]:py-1">
                <thead>
                  <tr>
                    <th className="text-left">ประเภทเงินได้พึงประเมินที่จ่าย</th>
                    <th className="w-28">วัน เดือน หรือปีภาษี ที่จ่าย</th>
                    <th className="w-32 text-right">จำนวนเงินที่จ่าย</th>
                    <th className="w-32 text-right">ภาษีที่หักและนำส่งไว้</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>1. เงินเดือน ค่าจ้าง เบี้ยเลี้ยง โบนัส ฯลฯ ตามมาตรา 40 (1)</td>
                    <td className="text-center">ปีภาษี {year + 543}</td>
                    <td className="num text-right">{money(r.income)}</td>
                    <td className="num text-right">{money(r.tax)}</td>
                  </tr>
                  <tr>
                    <td>2. ค่าธรรมเนียม ค่านายหน้า ฯลฯ ตามมาตรา 40 (2)</td>
                    <td />
                    <td />
                    <td />
                  </tr>
                  <tr className="font-semibold">
                    <td colSpan={2} className="text-right">
                      รวมเงินที่จ่ายและภาษีที่หักนำส่ง
                    </td>
                    <td className="num text-right">{money(r.income)}</td>
                    <td className="num text-right">{money(r.tax)}</td>
                  </tr>
                  <tr>
                    <td colSpan={4}>รวมเงินภาษีที่หักนำส่ง (ตัวอักษร) — {bahtText(r.tax)}</td>
                  </tr>
                </tbody>
              </table>
              <div className="mt-2 grid grid-cols-2 gap-x-4">
                <div className="num">เงินที่จ่ายเข้า กองทุนสำรองเลี้ยงชีพ {money(r.pvd)} บาท</div>
                <div className="num">เงินสมทบจ่ายเข้ากองทุนประกันสังคม {money(r.sso)} บาท</div>
              </div>
              <div className="mt-2">
                ผู้จ่ายเงิน <span className="ml-2">☑ (1) หัก ณ ที่จ่าย</span> <span className="ml-3">☐ (2) ออกให้ตลอดไป</span> <span className="ml-3">☐ (3) ออกให้ครั้งเดียว</span>
              </div>
              <div className="mt-6 flex justify-between gap-6">
                <p className="max-w-[50%] text-[11px]">ขอรับรองว่าข้อความและตัวเลขดังกล่าวข้างต้นถูกต้องตรงกับความจริงทุกประการ</p>
                <div className="text-center">
                  ลงชื่อ ................................................ ผู้จ่ายเงิน
                  <div className="mt-1">วันที่ออกหนังสือ {thDate(issueDate, "long")}</div>
                </div>
              </div>
            </section>
          ))
        )}
      </ReportShell>
    </div>
  );
}
