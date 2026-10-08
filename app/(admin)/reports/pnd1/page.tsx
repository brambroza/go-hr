"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FileCog, FileDown } from "lucide-react";
import { Button, Select, Spinner, Tabs, toast } from "@/components/ui";
import { FilterField, MonthSelect, ReportShell, YearSelect } from "@/components/reports/report-shell";
import { loadCompanyAndBranches, loadTaxRows, type TaxRow } from "@/components/reports/data";
import { Box, DigitBoxes, Dots, GovPrintStyle, Seal, chunk, dmyBE, fmt, thMonthName } from "@/components/reports/gov-forms";
import { ExportReviewModal, IssueList, LayoutPicker, useFileLayouts } from "@/components/payroll/file-export";
import { downloadCsv } from "@/lib/csv";
import { formatNationalId } from "@/lib/format";
import { buildExport, rdFileData, type RdRow, type RenderedFile } from "@/lib/payroll/files";

const PER_SHEET = 8;

/** ภ.ง.ด.1 (รายเดือน) / ภ.ง.ด.1ก (ประจำปี): แบบ + ใบแนบ + ไฟล์ยื่น e-Filing */
export default function Pnd1Page() {
  const now = new Date();
  const sp = useSearchParams();
  const qy = Number(sp.get("year")), qm = Number(sp.get("month"));
  const [mode, setMode] = useState<"pnd1" | "pnd1a">(sp.get("mode") === "pnd1a" ? "pnd1a" : "pnd1");
  const [year, setYear] = useState(qy >= 2000 && qy <= 2100 ? qy : now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear());
  const [month, setMonth] = useState(qm >= 1 && qm <= 12 ? qm : now.getMonth() === 0 ? 12 : now.getMonth());
  const [branch, setBranch] = useState("");
  const [formType, setFormType] = useState(0);
  const [rows, setRows] = useState<TaxRow[] | null>(null);
  const [periodCount, setPeriodCount] = useState(0);
  const [info, setInfo] = useState<Awaited<ReturnType<typeof loadCompanyAndBranches>> | null>(null);
  const { layouts, defaultKey } = useFileLayouts(mode);
  const [layoutKey, setLayoutKey] = useState("");
  const [review, setReview] = useState<(RenderedFile & { ok: boolean }) | null>(null);

  useEffect(() => {
    loadCompanyAndBranches().then(setInfo);
  }, []);
  useEffect(() => {
    setLayoutKey(defaultKey ?? "");
  }, [defaultKey]);

  useEffect(() => {
    let alive = true;
    setRows(null);
    loadTaxRows(year, mode === "pnd1" ? month : undefined, branch, true)
      .then(({ rows, periodCount }) => {
        if (!alive) return;
        setRows(rows.filter((r) => r.seq > 0));
        setPeriodCount(periodCount);
      })
      .catch((e) => toast.error(e));
    return () => {
      alive = false;
    };
  }, [year, month, mode, branch]);

  const br = info?.branches.find((b) => String(b.id) === branch);
  const branchNo = (br?.tax_branch_no ?? info?.company.branch_no ?? "00000").replace(/\D/g, "").padStart(5, "0");
  const company = { name: info?.company.name ?? "", tax_id: info?.company.tax_id ?? "" };
  const list = useMemo(() => rows ?? [], [rows]);
  const totals = useMemo(() => ({ income: list.reduce((s, r) => s + r.income, 0), tax: list.reduce((s, r) => s + r.tax, 0) }), [list]);
  const pin = (r: TaxRow) => r.priv?.tax_id || r.priv?.national_id || "";
  const label = mode === "pnd1" ? `เดือน ${thMonthName(month)} ${year + 543}` : `ปีภาษี ${year + 543}`;
  const layout = layouts.find((l) => l.key === layoutKey);

  const rdRows: RdRow[] = list.map((r) => ({
    employee_id: r.employee_id, emp_code: r.emp?.code ?? "", pin: pin(r), prefix: r.emp?.prefix ?? null, first_name: r.emp?.first_name ?? "", last_name: r.emp?.last_name ?? "",
    pay_date: r.pay_date, income: r.income, tax: r.tax, condition: r.condition, address: r.addr, sso: r.sso, pvd: r.pvd,
  }));
  const batch = { company, kind: mode, year, month, branch_no: branchNo, dept_name: br?.name, form_type: formType, requireAddress: !!layout?.key.includes("_v2_") };
  // validation list on screen (independent of the chosen layout's field rules)
  const check = useMemo(() => (rows ? rdFileData({ ...batch, requireAddress: false }, rdRows).issues : []), [rows, info, branch, formType, mode, year, month]); // eslint-disable-line react-hooks/exhaustive-deps

  const makeFile = () => layout && setReview(buildExport(layout, rdFileData(batch, rdRows)));
  const csv = () =>
    downloadCsv(`${mode === "pnd1" ? "pnd1" : "pnd1a"}-${year + 543}${mode === "pnd1" ? String(month).padStart(2, "0") : ""}.csv`, [
      ["ลำดับที่", "เลขประจำตัวผู้เสียภาษีอากร", "สาขา", "คำนำหน้าชื่อ", "ชื่อ", "ชื่อสกุล", "เงินได้ตามมาตรา", "วันเดือนปีที่จ่าย", "จำนวนเงินได้", "ภาษีที่หักและนำส่ง", "เงื่อนไข"],
      ...list.map((r) => [r.seq, pin(r), branchNo, r.emp?.prefix ?? "", r.emp?.first_name, r.emp?.last_name, "40(1)", dmyBE(r.pay_date), r.income.toFixed(2), r.tax.toFixed(2), r.condition]),
      ["", "", "", "", "", "รวม", "", "", totals.income.toFixed(2), totals.tax.toFixed(2), ""],
    ]);

  const sheets = chunk(list, PER_SHEET);

  return (
    <div>
      <GovPrintStyle />
      <ReportShell
        title="ภ.ง.ด.1 / ภ.ง.ด.1ก"
        description="แบบยื่นรายการภาษีเงินได้หัก ณ ที่จ่าย สำหรับเงินได้ตามมาตรา 40 (1) — พิมพ์แบบและใบแนบ หรือสร้างไฟล์ยื่นผ่าน e-Filing"
        onCsv={list.length ? csv : undefined}
        extraActions={
          <Link href="/settings/file-formats" className="inline-flex h-10 items-center gap-1.5 rounded-[var(--radius-ctl)] border border-line bg-white px-3 text-[15px] font-medium hover:bg-paper">
            <FileCog className="size-4" /> รูปแบบไฟล์
          </Link>
        }
        filters={
          <>
            <Tabs value={mode} onChange={setMode} tabs={[{ value: "pnd1", label: "ภ.ง.ด.1 รายเดือน" }, { value: "pnd1a", label: "ภ.ง.ด.1ก ประจำปี" }]} className="border-0" />
            <YearSelect value={year} onChange={setYear} />
            {mode === "pnd1" && <MonthSelect value={month} onChange={setMonth} />}
            {(info?.branches.length ?? 0) > 1 && (
              <FilterField label="สาขา (ยื่นแยกตามเลขที่สาขา)">
                <Select className="h-9 w-56" value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="ทุกสาขา (ยื่นรวม)">
                  {info!.branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.tax_branch_no ?? "00000"})
                    </option>
                  ))}
                </Select>
              </FilterField>
            )}
            <FilterField label="การยื่น">
              <Select className="h-9 w-40" value={formType} onChange={(e) => setFormType(Number(e.target.value))}>
                <option value={0}>ยื่นปกติ</option>
                {[1, 2, 3].map((n) => (
                  <option key={n} value={n}>
                    ยื่นเพิ่มเติมครั้งที่ {n}
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
                <FilterField label="ไฟล์สำหรับยื่น e-Filing">
                  <LayoutPicker layouts={layouts} value={layoutKey} onChange={setLayoutKey} className="h-9 w-[30rem] max-w-full" />
                </FilterField>
                <Button icon={<FileDown className="size-4" />} disabled={!list.length || !layout} onClick={makeFile}>
                  ตรวจข้อมูลและสร้างไฟล์
                </Button>
              </div>
              <p className="text-xs text-ink-mute">
                {list.length} ราย จาก {periodCount} งวดเงินเดือนที่อนุมัติแล้ว · เลขที่สาขา {branchNo} · {label}
              </p>
              <IssueList issues={check} max={6} />
            </div>

            <CoverSheet mode={mode} year={year} month={month} formType={formType} company={info?.company} branchNo={branchNo} address={br?.address ?? info?.company.address ?? ""} count={list.length} sheets={sheets.length} income={totals.income} tax={totals.tax} />
            {sheets.map((part, si) => (
              <AttachSheet key={si} mode={mode} rows={part} sheet={si + 1} sheets={sheets.length} taxId={company.tax_id} branchNo={branchNo} pin={pin} last={si === sheets.length - 1} totals={totals} />
            ))}
          </>
        )}
      </ReportShell>
      <ExportReviewModal open={!!review} onClose={() => setReview(null)} title={`ไฟล์ ${mode === "pnd1" ? "ภ.ง.ด.1" : "ภ.ง.ด.1ก"} ${label}`} layout={layout} file={review} />
    </div>
  );
}

type Company = { name?: string; tax_id?: string; address?: string; branch_no?: string } | undefined;

function CoverSheet({ mode, year, month, formType, company, branchNo, address, count, sheets, income, tax }: { mode: "pnd1" | "pnd1a"; year: number; month: number; formType: number; company: Company; branchNo: string; address: string; count: number; sheets: number; income: number; tax: number }) {
  const rows: [string, number, number, number][] = [
    ["1. เงินได้ตามมาตรา 40 (1) เงินเดือน ค่าจ้าง ฯลฯ กรณีทั่วไป", count, income, tax],
    ["2. เงินได้ตามมาตรา 40 (1) เงินเดือน ค่าจ้าง ฯลฯ กรณีได้รับอนุมัติจากกรมสรรพากรให้หักอัตราร้อยละ 3", 0, 0, 0],
    ["3. เงินได้ตามมาตรา 40 (1) (2) กรณีนายจ้างจ่ายให้ครั้งเดียวเพราะเหตุออกจากงาน", 0, 0, 0],
    ["4. เงินได้ตามมาตรา 40 (2) กรณีผู้รับเงินได้เป็นผู้อยู่ในประเทศไทย", 0, 0, 0],
    ["5. เงินได้ตามมาตรา 40 (2) กรณีผู้รับเงินได้มิได้เป็นผู้อยู่ในประเทศไทย", 0, 0, 0],
  ];
  return (
    <section className="gov-sheet">
      <div className="flex items-start justify-between border border-black p-2">
        <div className="max-w-[72%]">
          <div className="text-[13px] font-bold">{mode === "pnd1" ? "แบบยื่นรายการภาษีเงินได้หัก ณ ที่จ่าย ตามมาตรา 59 แห่งประมวลรัษฎากร" : "แบบยื่นรายการภาษีเงินได้หัก ณ ที่จ่าย ตามมาตรา 58 (2) แห่งประมวลรัษฎากร"}</div>
          <div>สำหรับการหักภาษี ณ ที่จ่ายตามมาตรา 50 (1) กรณีการจ่ายเงินได้พึงประเมินตามมาตรา 40 (1) (2) แห่งประมวลรัษฎากร{mode === "pnd1a" ? ` ประจำปีภาษี ${year + 543}` : ""}</div>
        </div>
        <div className="text-right">
          <div className="text-[22px] font-black leading-none">{mode === "pnd1" ? "ภ.ง.ด.1" : "ภ.ง.ด.1ก"}</div>
          <div className="text-[10px]">พิมพ์จากระบบ GO HR</div>
        </div>
      </div>
      <div className="border-x border-b border-black p-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>
            เลขประจำตัวผู้เสียภาษีอากร (ของผู้มีหน้าที่หักภาษี ณ ที่จ่าย) <DigitBoxes value={company?.tax_id} />
          </span>
          <span>
            สาขาที่ <DigitBoxes value={branchNo} groups={[5]} />
          </span>
        </div>
        <div className="mt-1">
          ชื่อผู้มีหน้าที่หักภาษี ณ ที่จ่าย (หน่วยงาน) <Dots w="120mm">{company?.name}</Dots>
        </div>
        <div className="mt-1">
          ที่อยู่ <Dots w="170mm">{address}</Dots>
        </div>
      </div>
      <div className="grid grid-cols-[1fr_52mm] border-x border-b border-black">
        <div className="border-r border-black p-2">
          {mode === "pnd1" ? (
            <>
              <div>
                เดือนที่จ่ายเงินได้พึงประเมิน (ให้ทำเครื่องหมาย ✓ ลงใน □ หน้าชื่อเดือน) พ.ศ. <b className="num">{year + 543}</b>
              </div>
              <div className="mt-1 grid grid-cols-4 gap-y-0.5">
                {Array.from({ length: 12 }).map((_, i) => (
                  <Box key={i} on={i + 1 === month}>
                    ({i + 1}) {thMonthName(i + 1)}
                  </Box>
                ))}
              </div>
            </>
          ) : (
            <div>
              ประจำปีภาษี พ.ศ. <b className="num">{year + 543}</b> (เงินได้ที่จ่ายตั้งแต่ 1 มกราคม ถึง 31 ธันวาคม {year + 543})
            </div>
          )}
        </div>
        <div className="p-2">
          <Box on={formType === 0}>(1) ยื่นปกติ</Box>
          <div className="mt-1">
            <Box on={formType > 0}>(2) ยื่นเพิ่มเติมครั้งที่</Box> <Dots w="10mm">{formType > 0 ? formType : ""}</Dots>
          </div>
        </div>
      </div>
      <div className="border-x border-b border-black p-2 leading-6">
        มีรายละเอียดการหักเป็นรายผู้มีเงินได้ ปรากฏตาม
        <div className="pl-4">
          <Box on>ใบแนบ {mode === "pnd1" ? "ภ.ง.ด.1" : "ภ.ง.ด.1ก"}</Box> ที่แนบมาพร้อมนี้ : จำนวน <Dots w="14mm">{count}</Dots> ราย จำนวน <Dots w="10mm">{sheets}</Dots> แผ่น
        </div>
        <div className="pl-4">
          <Box>สื่อบันทึกในระบบคอมพิวเตอร์</Box> ที่แนบมาพร้อมนี้ : จำนวน <Dots w="14mm" /> ราย จำนวน <Dots w="10mm" /> แผ่น
        </div>
      </div>
      <table className="bx mt-[-1px]">
        <thead>
          <tr>
            <th className="w-[56%]">สรุปรายการภาษีที่นำส่ง</th>
            <th>จำนวนราย</th>
            <th colSpan={2}>เงินได้ทั้งสิ้น</th>
            <th colSpan={2}>ภาษีที่นำส่งทั้งสิ้น</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([t, n, i, x]) => (
            <tr key={t}>
              <td>{t}</td>
              <td className="num text-center">{n || ""}</td>
              <Money n={i} blank={!n} />
              <Money n={x} blank={!n} />
            </tr>
          ))}
          <tr className="font-semibold">
            <td className="text-right">6. รวม</td>
            <td className="num text-center">{count}</td>
            <Money n={income} />
            <Money n={tax} />
          </tr>
          {mode === "pnd1" && (
            <>
              <tr>
                <td className="text-right">7. เงินเพิ่ม (ถ้ามี)</td>
                <td className="bg-neutral-100" />
                <td className="bg-neutral-100" colSpan={2} />
                <Money n={0} blank />
              </tr>
              <tr className="font-semibold">
                <td className="text-right">8. รวมยอดภาษีที่นำส่งทั้งสิ้น และเงินเพิ่ม (6. + 7.)</td>
                <td className="bg-neutral-100" />
                <td className="bg-neutral-100" colSpan={2} />
                <Money n={tax} />
              </tr>
            </>
          )}
        </tbody>
      </table>
      <div className="mt-[-1px] grid grid-cols-[1fr_30mm] items-center border border-black p-3">
        <div className="text-center leading-7">
          <div>ข้าพเจ้าขอรับรองว่า รายการที่แจ้งไว้ข้างต้นนี้ เป็นรายการที่ถูกต้องและครบถ้วนทุกประการ</div>
          <div>
            ลงชื่อ <Dots w="60mm" /> ผู้จ่ายเงิน
          </div>
          <div>
            ( <Dots w="58mm" /> )
          </div>
          <div>
            ตำแหน่ง <Dots w="56mm" />
          </div>
          <div>
            ยื่นวันที่ <Dots w="10mm" /> เดือน <Dots w="26mm" /> พ.ศ. <Dots w="14mm" />
          </div>
        </div>
        <Seal />
      </div>
      <p className="mt-1 text-[10px]">
        {mode === "pnd1" ? "กำหนดยื่น: ภายใน 7 วันนับแต่วันสิ้นเดือนที่จ่ายเงินได้ (ยื่นทางอินเทอร์เน็ตได้อีก 8 วัน)" : "กำหนดยื่น: ภายในเดือนกุมภาพันธ์ของปีถัดไป (ยื่นทางอินเทอร์เน็ตได้อีก 8 วัน)"} · ตั้งแต่ปีภาษี 2567 ต้องยื่นแบบทางอิเล็กทรอนิกส์ — เอกสารนี้ใช้ตรวจทานและเก็บเป็นหลักฐาน
      </p>
    </section>
  );
}

function Money({ n, blank }: { n: number; blank?: boolean }) {
  if (blank) return (<><td className="text-right" /><td className="w-7" /></>);
  const [b, s] = fmt(n).split(".");
  return (
    <>
      <td className="num text-right">{b}</td>
      <td className="num w-7 text-center">{s}</td>
    </>
  );
}

function AttachSheet({ mode, rows, sheet, sheets, taxId, branchNo, pin, last, totals }: { mode: "pnd1" | "pnd1a"; rows: TaxRow[]; sheet: number; sheets: number; taxId: string; branchNo: string; pin: (r: TaxRow) => string; last: boolean; totals: { income: number; tax: number } }) {
  const sub = { income: rows.reduce((s, r) => s + r.income, 0), tax: rows.reduce((s, r) => s + r.tax, 0) };
  const pad = Array.from({ length: Math.max(0, PER_SHEET - rows.length) });
  return (
    <section className="gov-sheet">
      <div className="flex items-end justify-between">
        <div className="text-[16px] font-black">ใบแนบ {mode === "pnd1" ? "ภ.ง.ด.1" : "ภ.ง.ด.1ก"}</div>
        <div className="text-right">
          แผ่นที่ <Dots w="8mm">{sheet}</Dots> ในจำนวน <Dots w="8mm">{sheets}</Dots> แผ่น
        </div>
      </div>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2 border border-black p-2">
        <span>
          เลขประจำตัวผู้เสียภาษีอากร (ของผู้มีหน้าที่หักภาษี ณ ที่จ่าย) <DigitBoxes value={taxId} />
        </span>
        <span>
          สาขาที่ <DigitBoxes value={branchNo} groups={[5]} />
        </span>
      </div>
      <div className="border-x border-b border-black p-2 text-[10.5px]">
        <b>ประเภทเงินได้</b> (ให้กรอกใบแนบแยกตามประเภทเงินได้)
        <div className="mt-0.5 grid grid-cols-2 gap-y-0.5">
          <Box on>(1) เงินได้ตามมาตรา 40 (1) เงินเดือน ค่าจ้าง ฯลฯ กรณีทั่วไป</Box>
          <Box>(2) 40 (1) กรณีได้รับอนุมัติให้หักอัตราร้อยละ 3</Box>
          <Box>(3) 40 (1) (2) กรณีจ่ายครั้งเดียวเพราะเหตุออกจากงาน</Box>
          <Box>(4) 40 (2) ผู้รับเงินได้อยู่ในประเทศไทย</Box>
          <Box>(5) 40 (2) ผู้รับเงินได้มิได้อยู่ในประเทศไทย</Box>
        </div>
      </div>
      <table className="bx mt-[-1px] text-[11px]">
        <thead>
          <tr>
            <th rowSpan={2} className="w-9">ลำดับที่</th>
            <th>เลขประจำตัวผู้เสียภาษีอากร (ของผู้มีเงินได้)</th>
            <th rowSpan={2} className="w-[19mm]">{mode === "pnd1" ? "วัน เดือน ปี ที่จ่าย" : "ปีภาษี"}</th>
            <th rowSpan={2} colSpan={2}>{mode === "pnd1" ? "จำนวนเงินได้ที่จ่ายในครั้งนี้" : "จำนวนเงินได้ที่จ่ายทั้งปี"}</th>
            <th rowSpan={2} colSpan={2}>{mode === "pnd1" ? "จำนวนเงินภาษีที่หักและนำส่งในครั้งนี้" : "จำนวนเงินภาษีที่หักและนำส่งทั้งปี"}</th>
            <th rowSpan={2} className="w-9">เงื่อนไข *</th>
          </tr>
          <tr>
            <th className="font-normal">ชื่อผู้มีเงินได้ (ให้ระบุให้ชัดเจนว่าเป็น นาย นาง นางสาว หรือยศ) — ชื่อสกุล{mode === "pnd1a" ? " / ที่อยู่" : ""}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <Fragment key={r.employee_id}>
              <tr className="[&>td]:border-b-0">
                <td rowSpan={2} className="num text-center align-middle">{r.seq}</td>
                <td className="num">{pin(r) ? <DigitBoxes value={pin(r)} size={13} /> : <span className="text-rust">ไม่มีเลขประจำตัว</span>}</td>
                <td rowSpan={2} className="num text-center align-middle">{mode === "pnd1" ? dmyBE(r.pay_date) : String(Number(r.pay_date.slice(0, 4)) + 543)}</td>
                <Money2 n={r.income} />
                <Money2 n={r.tax} />
                <td rowSpan={2} className="text-center align-middle">{r.condition}</td>
              </tr>
              <tr className="[&>td]:border-t-0">
                <td>
                  {r.emp?.prefix}
                  {r.emp?.first_name} &nbsp; {r.emp?.last_name}
                  {mode === "pnd1a" && r.addr && <div className="text-[10px] text-neutral-700">{[r.addr.house_no, r.addr.moo && `ม.${r.addr.moo}`, r.addr.soi && `ซ.${r.addr.soi}`, r.addr.road && `ถ.${r.addr.road}`, r.addr.subdistrict, r.addr.district, r.addr.province, r.addr.postcode].filter(Boolean).join(" ")}</div>}
                </td>
              </tr>
            </Fragment>
          ))}
          {pad.map((_, i) => (
            <Fragment key={`p${i}`}>
              <tr className="h-[7mm] [&>td]:border-b-0">
                <td rowSpan={2} />
                <td />
                <td rowSpan={2} />
                <td rowSpan={2} />
                <td rowSpan={2} />
                <td rowSpan={2} />
                <td rowSpan={2} />
                <td rowSpan={2} />
              </tr>
              <tr className="h-[5mm] [&>td]:border-t-0">
                <td />
              </tr>
            </Fragment>
          ))}
          <tr className="font-semibold">
            <td colSpan={3} className="text-right">
              รวมยอดเงินได้และภาษีที่นำส่ง (นำไปรวมกับใบแนบ {mode === "pnd1" ? "ภ.ง.ด.1" : "ภ.ง.ด.1ก"} แผ่นอื่น (ถ้ามี))
            </td>
            <Money n={sub.income} />
            <Money n={sub.tax} />
            <td />
          </tr>
          {last && sheets > 1 && (
            <tr className="font-semibold">
              <td colSpan={3} className="text-right">
                รวมทุกแผ่น
              </td>
              <Money n={totals.income} />
              <Money n={totals.tax} />
              <td />
            </tr>
          )}
        </tbody>
      </table>
      <div className="mt-[-1px] grid grid-cols-[1fr_1fr_26mm] items-center gap-2 border border-black p-2 text-[10.5px]">
        <div>
          <b>* เงื่อนไขการหักภาษีให้กรอกดังนี้</b>
          <div>• หัก ณ ที่จ่าย กรอก 1</div>
          <div>• ออกภาษีให้ตลอดไป กรอก 2</div>
          <div>• ออกภาษีให้ครั้งเดียว กรอก 3</div>
        </div>
        <div className="text-center leading-6">
          <div>
            ลงชื่อ <Dots w="40mm" /> ผู้จ่ายเงิน
          </div>
          <div>
            ( <Dots w="38mm" /> )
          </div>
          <div>
            ตำแหน่ง <Dots w="36mm" />
          </div>
          <div>
            ยื่นวันที่ <Dots w="7mm" /> เดือน <Dots w="16mm" /> พ.ศ. <Dots w="10mm" />
          </div>
        </div>
        <Seal />
      </div>
      <p className="mt-1 text-[10px] text-neutral-700">เลขประจำตัวผู้เสียภาษีอากรของบุคคลธรรมดาคือเลขประจำตัวประชาชน 13 หลัก · {formatNationalId(taxId) ? `ผู้หักภาษี ${formatNationalId(taxId)}` : ""}</p>
    </section>
  );
}

function Money2({ n }: { n: number }) {
  const [b, s] = fmt(n).split(".");
  return (
    <>
      <td rowSpan={2} className="num text-right align-middle">{b}</td>
      <td rowSpan={2} className="num w-7 text-center align-middle">{s}</td>
    </>
  );
}
