"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input, Select, Spinner, toast } from "@/components/ui";
import { FilterField, ReportShell, YearSelect } from "@/components/reports/report-shell";
import { addressText, loadCompanyAndBranches, loadTaxRows, type TaxRow } from "@/components/reports/data";
import { Box, DigitBoxes, Dots, GovPrintStyle, Seal, bahtText, dmyBE, fmt } from "@/components/reports/gov-forms";
import { downloadCsv } from "@/lib/csv";

const COPIES = {
  "1": "ฉบับที่ 1 (สำหรับผู้ถูกหักภาษี ณ ที่จ่าย ใช้แนบพร้อมกับแบบแสดงรายการภาษี)",
  "2": "ฉบับที่ 2 (สำหรับผู้ถูกหักภาษี ณ ที่จ่าย เก็บไว้เป็นหลักฐาน)",
};

/** หนังสือรับรองการหักภาษี ณ ที่จ่าย ตามมาตรา 50 ทวิ — official layout, copies 1 and 2 per employee, bulk print */
export default function Tawi50Page() {
  const [year, setYear] = useState(new Date().getMonth() < 3 ? new Date().getFullYear() - 1 : new Date().getFullYear());
  const [rows, setRows] = useState<TaxRow[] | null>(null);
  const [q, setQ] = useState("");
  const [bookNo, setBookNo] = useState("1");
  const [copies, setCopies] = useState<"both" | "1" | "2">("both");
  const [info, setInfo] = useState<Awaited<ReturnType<typeof loadCompanyAndBranches>> | null>(null);

  useEffect(() => {
    loadCompanyAndBranches().then(setInfo);
  }, []);
  useEffect(() => {
    let alive = true;
    setRows(null);
    loadTaxRows(year, undefined, "", true)
      .then(({ rows }) => alive && setRows(rows.filter((r) => r.seq > 0 || r.sso > 0 || r.pvd > 0)))
      .catch((e) => toast.error(e));
    return () => {
      alive = false;
    };
  }, [year]);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (rows ?? []).filter((r) => !t || `${r.emp?.code} ${r.emp?.first_name} ${r.emp?.last_name}`.toLowerCase().includes(t));
  }, [rows, q]);
  const hq = info?.branches.find((b) => b.is_head_office);
  const today = new Date().toISOString().slice(0, 10);
  const issueDate = `${year}-12-31` < today ? today : `${year}-12-31`;
  const docNo = (r: TaxRow) => String((rows ?? []).indexOf(r) + 1).padStart(4, "0");
  const copyList = copies === "both" ? (["1", "2"] as const) : ([copies] as const);

  return (
    <div>
      <GovPrintStyle />
      <ReportShell
        title="หนังสือรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ)"
        description="ออกให้พนักงานทุกคนที่มีเงินได้ในปีภาษี ภายในเดือนกุมภาพันธ์ของปีถัดไป — ลำดับที่ตรงกับใบแนบ ภ.ง.ด.1ก"
        onCsv={
          rows?.length
            ? () =>
                downloadCsv(`tawi50-${year + 543}.csv`, [
                  ["เล่มที่", "เลขที่", "ลำดับที่ใน ภ.ง.ด.1ก", "รหัส", "เลขประจำตัวผู้เสียภาษี", "ชื่อ-สกุล", "เงินได้ 40(1)", "ภาษีที่หัก", "ประกันสังคม", "กองทุนสำรองเลี้ยงชีพ"],
                  ...shown.map((r) => [bookNo, docNo(r), r.seq || "", r.emp?.code, r.priv?.tax_id || r.priv?.national_id, `${r.emp?.prefix ?? ""}${r.emp?.first_name} ${r.emp?.last_name}`, r.income.toFixed(2), r.tax.toFixed(2), r.sso.toFixed(2), r.pvd.toFixed(2)]),
                ])
            : undefined
        }
        filters={
          <>
            <YearSelect value={year} onChange={setYear} />
            <FilterField label="เล่มที่">
              <Input className="h-9 w-20" value={bookNo} onChange={(e) => setBookNo(e.target.value)} />
            </FilterField>
            <FilterField label="ฉบับที่พิมพ์">
              <Select className="h-9 w-44" value={copies} onChange={(e) => setCopies(e.target.value as "both")}>
                <option value="both">ฉบับที่ 1 และ 2</option>
                <option value="1">ฉบับที่ 1 เท่านั้น</option>
                <option value="2">ฉบับที่ 2 เท่านั้น</option>
              </Select>
            </FilterField>
            <FilterField label="ค้นหาพนักงาน (พิมพ์เฉพาะที่ค้นพบ)">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-mute" />
                <Input className="h-9 w-64 pl-8" value={q} onChange={(e) => setQ(e.target.value)} placeholder="รหัส / ชื่อ" />
              </div>
            </FilterField>
            <span className="pb-2 text-sm text-ink-soft">
              {shown.length} คน · {shown.length * copyList.length} แผ่น
            </span>
          </>
        }
      >
        {rows === null ? (
          <Spinner className="mx-auto my-10" />
        ) : shown.length === 0 ? (
          <p className="py-10 text-center text-neutral-500">ไม่มีข้อมูลเงินได้ในปี {year + 543}</p>
        ) : (
          shown.flatMap((r) =>
            copyList.map((c) => (
              <Certificate
                key={`${r.employee_id}-${c}`}
                copy={COPIES[c]}
                row={r}
                year={year}
                bookNo={bookNo}
                docNo={docNo(r)}
                issueDate={issueDate}
                payer={{ name: info?.company.name ?? "", tax_id: info?.company.tax_id ?? "", address: hq?.address || info?.company.address || "" }}
              />
            )),
          )
        )}
      </ReportShell>
    </div>
  );
}

const INCOME_ROWS: { label: React.ReactNode; indent?: number; key?: "salary" }[] = [
  { label: "1. เงินเดือน ค่าจ้าง เบี้ยเลี้ยง โบนัส ฯลฯ ตามมาตรา 40 (1)", key: "salary" },
  { label: "2. ค่าธรรมเนียม ค่านายหน้า ฯลฯ ตามมาตรา 40 (2)" },
  { label: "3. ค่าแห่งลิขสิทธิ์ ฯลฯ ตามมาตรา 40 (3)" },
  { label: "4. (ก) ดอกเบี้ย ฯลฯ ตามมาตรา 40 (4) (ก)" },
  { label: "(ข) เงินปันผล เงินส่วนแบ่งกำไร ฯลฯ ตามมาตรา 40 (4) (ข)", indent: 1 },
  { label: "(1) กรณีผู้ได้รับเงินปันผลได้รับเครดิตภาษี โดยจ่ายจากกำไรสุทธิของกิจการที่ต้องเสียภาษีเงินได้นิติบุคคลในอัตราดังนี้", indent: 2 },
  { label: "(1.1) อัตราร้อยละ 30 ของกำไรสุทธิ", indent: 3 },
  { label: "(1.2) อัตราร้อยละ 25 ของกำไรสุทธิ", indent: 3 },
  { label: "(1.3) อัตราร้อยละ 20 ของกำไรสุทธิ", indent: 3 },
  { label: "(1.4) อัตราอื่น ๆ (ระบุ) ........ ของกำไรสุทธิ", indent: 3 },
  { label: "(2) กรณีผู้ได้รับเงินปันผลไม่ได้รับเครดิตภาษี เนื่องจากจ่ายจาก", indent: 2 },
  { label: "(2.1) กำไรสุทธิของกิจการที่ได้รับยกเว้นภาษีเงินได้นิติบุคคล", indent: 3 },
  { label: "(2.2) เงินปันผลหรือเงินส่วนแบ่งของกำไรที่ได้รับยกเว้นไม่ต้องนำมารวมคำนวณเป็นรายได้เพื่อเสียภาษีเงินได้นิติบุคคล", indent: 3 },
  { label: "(2.3) กำไรสุทธิส่วนที่ได้หักผลขาดทุนสุทธิยกมาไม่เกิน 5 ปี ก่อนรอบระยะเวลาบัญชีปีปัจจุบัน", indent: 3 },
  { label: "(2.4) กำไรที่รับรู้ทางบัญชีโดยวิธีส่วนได้เสีย (equity method)", indent: 3 },
  { label: "(2.5) อื่น ๆ (ระบุ) ....................", indent: 3 },
  { label: "5. การจ่ายเงินได้ที่ต้องหักภาษี ณ ที่จ่าย ตามคำสั่งกรมสรรพากรที่ออกตามมาตรา 3 เตรส เช่น รางวัล ส่วนลดหรือประโยชน์ใด ๆ เนื่องจากการส่งเสริมการขาย รางวัลในการประกวด การแข่งขัน การชิงโชค ค่าแสดงของนักแสดงสาธารณะ ค่าจ้างทำของ ค่าโฆษณา ค่าเช่า ค่าขนส่ง ค่าบริการ ค่าเบี้ยประกันวินาศภัย ฯลฯ" },
  { label: "6. อื่น ๆ (ระบุ) ...................................................." },
];

function Certificate({ copy, row: r, year, bookNo, docNo, issueDate, payer }: { copy: string; row: TaxRow; year: number; bookNo: string; docNo: string; issueDate: string; payer: { name: string; tax_id: string; address: string } }) {
  const pin = r.priv?.tax_id || r.priv?.national_id || "";
  const [ib, is] = fmt(r.income).split(".");
  const [tb, ts] = fmt(r.tax).split(".");
  return (
    <section className="gov-sheet text-[10.5px] leading-[1.35]">
      <div className="mb-1 font-semibold">{copy}</div>
      <div className="border-[1.5px] border-black">
        <div className="relative px-2 pt-1 text-center">
          <div className="text-[15px] font-bold">หนังสือรับรองการหักภาษี ณ ที่จ่าย</div>
          <div>ตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร</div>
          <div className="absolute right-2 top-1 text-left leading-5">
            <div>
              เล่มที่ <Dots w="18mm">{bookNo}</Dots>
            </div>
            <div>
              เลขที่ <Dots w="18mm">{docNo}</Dots>
            </div>
          </div>
        </div>
        {/* payer */}
        <div className="mx-1 mt-1 rounded-md border border-black px-2 py-1">
          <div className="flex items-center justify-between gap-2">
            <b className="text-[11.5px]">ผู้มีหน้าที่หักภาษี ณ ที่จ่าย :-</b>
            <span>
              เลขประจำตัวผู้เสียภาษีอากร (13 หลัก)* <DigitBoxes value={payer.tax_id} size={13} />
            </span>
          </div>
          <div className="flex items-end justify-between gap-2">
            <span className="flex min-w-0 grow items-end gap-1">
              ชื่อ <span className="dots grow">{payer.name}</span>
            </span>
            <span className="shrink-0">
              เลขประจำตัวผู้เสียภาษีอากร <DigitBoxes value="" groups={[1, 4, 4, 1]} size={13} />
            </span>
          </div>
          <div className="text-[9px] italic">(ให้ระบุว่าเป็น บุคคล นิติบุคคล บริษัท สมาคม หรือคณะบุคคล)</div>
          <div className="flex items-end gap-1">
            ที่อยู่ <span className="dots grow">{payer.address}</span>
          </div>
          <div className="text-[9px] italic">(ให้ระบุ ชื่ออาคาร/หมู่บ้าน ห้องเลขที่ ชั้นที่ เลขที่ ตรอก/ซอย หมู่ที่ ถนน ตำบล/แขวง อำเภอ/เขต จังหวัด)</div>
        </div>
        {/* payee */}
        <div className="mx-1 mt-1 rounded-md border border-black px-2 py-1">
          <div className="flex items-center justify-between gap-2">
            <b className="text-[11.5px]">ผู้ถูกหักภาษี ณ ที่จ่าย :-</b>
            <span>
              เลขประจำตัวผู้เสียภาษีอากร (13 หลัก)* <DigitBoxes value={pin} size={13} />
            </span>
          </div>
          <div className="flex items-end justify-between gap-2">
            <span className="flex min-w-0 grow items-end gap-1">
              ชื่อ{" "}
              <span className="dots grow">
                {r.emp?.prefix}
                {r.emp?.first_name} {r.emp?.last_name}
              </span>
            </span>
            <span className="shrink-0">
              เลขประจำตัวผู้เสียภาษีอากร <DigitBoxes value="" groups={[1, 4, 4, 1]} size={13} />
            </span>
          </div>
          <div className="text-[9px] italic">(ให้ระบุว่าเป็น บุคคล นิติบุคคล บริษัท สมาคม หรือคณะบุคคล)</div>
          <div className="flex items-end gap-1">
            ที่อยู่ <span className="dots grow">{addressText(r.addr) || "\u00a0"}</span>
          </div>
          <div className="text-[9px] italic">(ให้ระบุ ชื่ออาคาร/หมู่บ้าน ห้องเลขที่ ชั้นที่ เลขที่ ตรอก/ซอย หมู่ที่ ถนน ตำบล/แขวง อำเภอ/เขต จังหวัด)</div>
          <div className="mt-1 grid grid-cols-[40mm_1fr] items-start gap-1">
            <div>
              <div className="flex items-center gap-1 whitespace-nowrap">
                <b>ลำดับที่</b>
                <span className="num inline-grid h-[6mm] min-w-[16mm] place-items-center border border-black px-1 font-semibold">{r.seq || ""}</span>
                <span>ในแบบ</span>
              </div>
              <div className="text-[8.5px] italic leading-tight">(ให้สามารถอ้างอิงหรือสอบยันกันได้ระหว่างลำดับที่ตามหนังสือรับรองฯ กับแบบยื่นรายการภาษีหักที่จ่าย)</div>
            </div>
            <div className="grid grid-cols-4 gap-y-0.5">
              <Box on>(1) ภ.ง.ด.1ก</Box>
              <Box>(2) ภ.ง.ด.1ก พิเศษ</Box>
              <Box>(3) ภ.ง.ด.2</Box>
              <Box>(4) ภ.ง.ด.3</Box>
              <Box>(5) ภ.ง.ด.2ก</Box>
              <Box>(6) ภ.ง.ด.3ก</Box>
              <Box>(7) ภ.ง.ด.53</Box>
            </div>
          </div>
        </div>
        {/* income table */}
        <div className="mx-1 mt-1 overflow-hidden rounded-md border border-black">
          <table className="w-full border-collapse">
            <thead>
              <tr className="[&>th]:border-b [&>th]:border-black [&>th]:px-1 [&>th]:py-0.5 [&>th]:text-center">
                <th className="text-[11px]">ประเภทเงินได้พึงประเมินที่จ่าย</th>
                <th className="w-[22mm] border-l border-black">วัน เดือน หรือปีภาษี ที่จ่าย</th>
                <th className="w-[30mm] border-l border-black" colSpan={2}>จำนวนเงินที่จ่าย</th>
                <th className="w-[26mm] border-l border-black" colSpan={2}>ภาษีที่หัก และนำส่งไว้</th>
              </tr>
            </thead>
            <tbody>
              {INCOME_ROWS.map((x, i) => {
                const on = x.key === "salary";
                return (
                  <tr key={i} className="align-bottom">
                    <td className="px-1" style={{ paddingLeft: 4 + (x.indent ?? 0) * 14 }}>{x.label}</td>
                    <td className="num border-l border-black px-1 text-center">{on ? `ปีภาษี ${year + 543}` : ""}</td>
                    <td className="num border-l border-black px-1 text-right">{on ? ib : ""}</td>
                    <td className="num w-6 border-l border-dotted border-black text-center">{on ? is : ""}</td>
                    <td className="num border-l border-black px-1 text-right">{on ? tb : ""}</td>
                    <td className="num w-6 border-l border-dotted border-black text-center">{on ? ts : ""}</td>
                  </tr>
                );
              })}
              <tr className="font-bold [&>td]:border-t [&>td]:border-black">
                <td colSpan={2} className="px-1 text-right">
                  รวมเงินที่จ่ายและภาษีที่หักนำส่ง
                </td>
                <td className="num border-l border-black px-1 text-right">{ib}</td>
                <td className="num border-l border-dotted border-black text-center">{is}</td>
                <td className="num border-l border-black px-1 text-right">{tb}</td>
                <td className="num border-l border-dotted border-black text-center">{ts}</td>
              </tr>
              <tr className="[&>td]:border-t [&>td]:border-black">
                <td colSpan={6} className="px-2 py-1">
                  <b>รวมเงินภาษีที่หักนำส่ง</b> <i>(ตัวอักษร)</i> <span className="ml-2 inline-block min-w-[100mm] bg-neutral-100 px-2 font-semibold">{bahtText(r.tax)}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="mx-1 mt-1 rounded-md border border-black px-2 py-1">
          <span className="whitespace-nowrap text-[10px]">
            <b>เงินที่จ่ายเข้า</b> กบข./กสจ./กองทุนสงเคราะห์ครูโรงเรียนเอกชน <Dots w="12mm" /> บาท กองทุนประกันสังคม <Dots w="16mm">{fmt(r.sso)}</Dots> บาท กองทุนสำรองเลี้ยงชีพ <Dots w="16mm">{fmt(r.pvd)}</Dots> บาท
          </span>
        </div>
        <div className="mx-1 mt-1 rounded-md border border-black px-2 py-1">
          <b className="mr-2">ผู้จ่ายเงิน</b>
          <Box on={r.condition === 1}>(1) หัก ณ ที่จ่าย</Box>
          <Box on={r.condition === 2}>(2) ออกให้ตลอดไป</Box>
          <Box on={r.condition === 3}>(3) ออกให้ครั้งเดียว</Box>
          <Box>(4) อื่น ๆ (ระบุ) ..........................</Box>
        </div>
        <div className="mx-1 mb-1 mt-1 grid grid-cols-[42%_1fr] gap-1">
          <div className="grid grid-cols-[auto_1fr] gap-2 rounded-md border border-black px-2 py-1 text-[10px]">
            <b>คำเตือน</b>
            <span>ผู้มีหน้าที่ออกหนังสือรับรองการหักภาษี ณ ที่จ่าย ฝ่าฝืนไม่ปฏิบัติตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร ต้องรับโทษทางอาญาตามมาตรา 35 แห่งประมวลรัษฎากร</span>
          </div>
          <div className="grid grid-cols-[1fr_24mm] items-center rounded-md border border-black px-2 py-1">
            <div className="text-center leading-6">
              <div>ขอรับรองว่าข้อความและตัวเลขดังกล่าวข้างต้นถูกต้องตรงกับความจริงทุกประการ</div>
              <div>
                ลงชื่อ <Dots w="44mm" /> ผู้จ่ายเงิน
              </div>
              <div className="num">{dmyBE(issueDate).split("/").join(" / ")}</div>
              <div className="text-[9px] italic">(วัน เดือน ปี ที่ออกหนังสือรับรองฯ)</div>
            </div>
            <Seal />
          </div>
        </div>
      </div>
      <div className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 text-[9px]">
        <span>หมายเหตุ เลขประจำตัวผู้เสียภาษีอากร (13 หลัก)* หมายถึง</span>
        <span>1. กรณีบุคคลธรรมดาไทย ให้ใช้เลขประจำตัวประชาชนของกรมการปกครอง</span>
        <span />
        <span>2. กรณีนิติบุคคล ให้ใช้เลขทะเบียนนิติบุคคลของกรมพัฒนาธุรกิจการค้า</span>
        <span />
        <span>3. กรณีอื่น ๆ นอกเหนือจาก 1. และ 2. ให้ใช้เลขประจำตัวผู้เสียภาษีอากร (13 หลัก) ของกรมสรรพากร</span>
      </div>
    </section>
  );
}
