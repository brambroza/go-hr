"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FileCog, FileDown } from "lucide-react";
import { Button, Select, Spinner, toast } from "@/components/ui";
import { FilterField, MonthSelect, ReportShell, YearSelect } from "@/components/reports/report-shell";
import { loadCompanyAndBranches, loadPaidEntries, loadPeople, type EmpLite, type PrivLite } from "@/components/reports/data";
import { Box, DigitBoxes, Dots, GovPrintStyle, chunk, fmt, thMonthName } from "@/components/reports/gov-forms";
import { ExportReviewModal, IssueList, LayoutPicker, useFileLayouts } from "@/components/payroll/file-export";
import { downloadCsv } from "@/lib/csv";
import { bahtText, isoDate } from "@/lib/format";
import { DEFAULT_SSO_CONFIG, ssoLimits, type SsoConfig } from "@/lib/payroll/tax";
import { buildExport, ssoFileData, type RenderedFile, type SsoRow } from "@/lib/payroll/files";

type Row = { employee_id: number; emp?: EmpLite; priv?: PrivLite; wage: number; employee: number; employer: number };
const PER_SHEET = 10;

/**
 * สปส.1-10 — แบบรายการแสดงการส่งเงินสมทบ (ต่อเดือน ต่อสถานประกอบการ/สาขา)
 * ส่วนที่ 1 สรุป · ส่วนที่ 2 รายละเอียดผู้ประกันตน (แผ่นละ 10 คน) · ไฟล์ e-Service (lib/payroll/file-layouts.ts)
 */
export default function SsoReportPage() {
  const now = new Date();
  const sp = useSearchParams();
  const qy = Number(sp.get("year")), qm = Number(sp.get("month"));
  const [year, setYear] = useState(qy >= 2000 && qy <= 2100 ? qy : now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear());
  const [month, setMonth] = useState(qm >= 1 && qm <= 12 ? qm : now.getMonth() === 0 ? 12 : now.getMonth());
  const [branch, setBranch] = useState("");
  const [payDate, setPayDate] = useState(isoDate());
  const [cfg, setCfg] = useState<SsoConfig>(DEFAULT_SSO_CONFIG);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [info, setInfo] = useState<Awaited<ReturnType<typeof loadCompanyAndBranches>> | null>(null);
  const { layouts, defaultKey } = useFileLayouts("sso");
  const [layoutKey, setLayoutKey] = useState("");
  const [review, setReview] = useState<(RenderedFile & { ok: boolean }) | null>(null);

  useEffect(() => {
    loadCompanyAndBranches().then((x) => {
      setInfo(x);
      if (x.branches.length) setBranch(String((x.branches.find((b) => b.is_head_office) ?? x.branches[0]).id));
    });
    import("@/lib/supabase/client").then(({ supabaseBrowser }) =>
      supabaseBrowser()
        .from("settings")
        .select("value")
        .eq("key", "sso_config")
        .maybeSingle()
        .then(({ data }: { data: { value?: Partial<SsoConfig> } | null }) => data?.value && setCfg({ ...DEFAULT_SSO_CONFIG, ...data.value })),
    );
  }, []);
  useEffect(() => {
    setLayoutKey(defaultKey ?? "");
  }, [defaultKey]);

  useEffect(() => {
    if (!info) return; // wait for the branch list so the first load is already for the right branch
    let alive = true;
    setRows(null);
    (async () => {
      const { entries } = await loadPaidEntries(year, month);
      const by = new Map<number, Row>();
      for (const e of entries) {
        if (branch && String(e.branch_id) !== branch) continue;
        if (!(Number(e.sso_employee) > 0 || Number(e.sso_employer) > 0)) continue;
        const r = by.get(e.employee_id) ?? { employee_id: e.employee_id, wage: 0, employee: 0, employer: 0 };
        r.wage += Number(e.sso_wage);
        r.employee += Number(e.sso_employee);
        r.employer += Number(e.sso_employer);
        by.set(e.employee_id, r);
      }
      const people = await loadPeople([...by.keys()]);
      const list = [...by.values()].map((r) => ({ ...r, emp: people.emp.get(r.employee_id), priv: people.priv.get(r.employee_id) }));
      list.sort((a, b) => (a.emp?.code ?? "").localeCompare(b.emp?.code ?? ""));
      if (alive) setRows(list);
    })().catch((e) => toast.error(e));
    return () => {
      alive = false;
    };
  }, [year, month, branch, info]);

  const br = info?.branches.find((b) => String(b.id) === branch);
  const list = useMemo(() => rows ?? [], [rows]);
  const t = useMemo(() => ({ wage: list.reduce((s, r) => s + r.wage, 0), employee: list.reduce((s, r) => s + r.employee, 0), employer: list.reduce((s, r) => s + r.employer, 0) }), [list]);
  const ssoNo = (r: Row) => r.priv?.sso_no || r.priv?.national_id || "";
  const limits = ssoLimits(`${year}-${String(month).padStart(2, "0")}-01`, cfg);
  const layout = layouts.find((l) => l.key === layoutKey);

  const ssoRows: SsoRow[] = list.map((r) => ({
    employee_id: r.employee_id, emp_code: r.emp?.code ?? "", sso_no: r.priv?.sso_no, national_id: r.priv?.national_id, prefix: r.emp?.prefix ?? null,
    first_name: r.emp?.first_name ?? "", last_name: r.emp?.last_name ?? "", wage: r.wage, employee: r.employee, employer: r.employer,
  }));
  const batch = { company: { name: info?.company.name ?? "", tax_id: info?.company.tax_id ?? "" }, branch_name: br?.name, account_no: br?.sso_account_no ?? "", branch_no: br?.sso_branch_no ?? "000000", pay_date: payDate, year, month, rate: cfg.rate_employee, employer_rate: cfg.rate_employer, ceiling: limits.ceiling, floor: limits.floor };
  const check = useMemo(() => (rows ? ssoFileData(batch, ssoRows).issues : []), [rows, info, branch, payDate, cfg]); // eslint-disable-line react-hooks/exhaustive-deps

  const csv = () =>
    downloadCsv(`sso-1-10-${year + 543}${String(month).padStart(2, "0")}-${br?.code ?? "all"}.csv`, [
      ["ลำดับ", "เลขประจำตัวประชาชน", "คำนำหน้า", "ชื่อ", "ชื่อสกุล", "ค่าจ้าง", "เงินสมทบผู้ประกันตน", "เงินสมทบนายจ้าง"],
      ...list.map((r, i) => [i + 1, ssoNo(r), r.emp?.prefix, r.emp?.first_name, r.emp?.last_name, r.wage.toFixed(2), r.employee.toFixed(2), r.employer.toFixed(2)]),
      ["", "", "", "", "รวม", t.wage.toFixed(2), t.employee.toFixed(2), t.employer.toFixed(2)],
    ]);
  const sheets = chunk(list, PER_SHEET);

  return (
    <div>
      <GovPrintStyle />
      <ReportShell
        title="สปส.1-10"
        description="แบบรายการแสดงการส่งเงินสมทบ — ยื่นภายในวันที่ 15 ของเดือนถัดไป แยกตามสถานประกอบการ (สาขา)"
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
            <FilterField label="สถานประกอบการ (สาขา)">
              <Select className="h-9 w-60" value={branch} onChange={(e) => setBranch(e.target.value)}>
                {info?.branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </FilterField>
            <FilterField label="วันที่ชำระเงิน (ในไฟล์)">
              <input type="date" className="h-9 rounded-[var(--radius-ctl)] border border-line px-2" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
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
                <FilterField label="ไฟล์สำหรับ e-Service ประกันสังคม">
                  <LayoutPicker layouts={layouts} value={layoutKey} onChange={setLayoutKey} className="h-9 w-[28rem] max-w-full" />
                </FilterField>
                <Button icon={<FileDown className="size-4" />} disabled={!list.length || !layout} onClick={() => layout && setReview(buildExport(layout, ssoFileData(batch, ssoRows)))}>
                  ตรวจข้อมูลและสร้างไฟล์
                </Button>
              </div>
              <p className="text-xs text-ink-mute">
                {list.length} คน · อัตราเงินสมทบร้อยละ {cfg.rate_employee} · ค่าจ้างขั้นต่ำ {limits.floor.toLocaleString()} / สูงสุด {limits.ceiling.toLocaleString()} บาท (ตั้งค่า sso_config) · เงินสมทบปัดเศษ 50 สตางค์ขึ้นเป็น 1 บาท
              </p>
              <IssueList issues={check} max={6} />
            </div>
            <PartOne company={info?.company} branchName={br?.name} branchAddress={br?.address ?? info?.company.address ?? ""} accountNo={br?.sso_account_no} branchNo={br?.sso_branch_no ?? "000000"} rate={cfg.rate_employee} year={year} month={month} t={t} count={list.length} sheets={sheets.length} />
            {sheets.map((part, si) => (
              <PartTwo key={si} rows={part} offset={si * PER_SHEET} sheet={si + 1} sheets={sheets.length} company={info?.company.name ?? ""} accountNo={br?.sso_account_no} branchNo={br?.sso_branch_no ?? "000000"} year={year} month={month} ssoNo={ssoNo} total={si === sheets.length - 1 ? t : undefined} />
            ))}
          </>
        )}
      </ReportShell>
      <ExportReviewModal open={!!review} onClose={() => setReview(null)} title={`ไฟล์ สปส.1-10 ค่าจ้างเดือน ${thMonthName(month)} ${year + 543}`} layout={layout} file={review} />
    </div>
  );
}

function Money({ n, blank }: { n: number; blank?: boolean }) {
  if (blank) return (<><td /><td className="w-7" /></>);
  const [b, s] = fmt(n).split(".");
  return (
    <>
      <td className="num text-right">{b}</td>
      <td className="num w-7 text-center">{s}</td>
    </>
  );
}

function PartOne({ company, branchName, branchAddress, accountNo, branchNo, rate, year, month, t, count, sheets }: {
  company?: { name?: string; phone?: string }; branchName?: string; branchAddress: string; accountNo?: string | null; branchNo: string; rate: number; year: number; month: number;
  t: { wage: number; employee: number; employer: number }; count: number; sheets: number;
}) {
  const total = t.employee + t.employer;
  const postcode = /(\d{5})\s*$/.exec(branchAddress)?.[1] ?? "";
  return (
    <section className="gov-sheet">
      <div className="flex items-start justify-between">
        <div className="text-[10px]">สำนักงานประกันสังคม</div>
        <div className="text-right text-[13px] font-black">สปส. 1-10 (ส่วนที่ 1)</div>
      </div>
      <h2 className="mt-1 text-center text-[16px] font-bold">แบบรายการแสดงการส่งเงินสมทบ</h2>
      <div className="mt-2 border border-black p-2 leading-7">
        <div>
          ชื่อสถานประกอบการ <Dots w="120mm">{company?.name}</Dots>
        </div>
        <div className="flex flex-wrap justify-between gap-2">
          <span>
            ชื่อสาขา (ถ้ามี) <Dots w="62mm">{branchName}</Dots>
          </span>
          <span>
            เลขที่บัญชี <DigitBoxes value={accountNo} groups={[2, 7, 1]} />
          </span>
        </div>
        <div className="flex flex-wrap justify-between gap-2">
          <span className="max-w-[60%]">
            ที่ตั้งสำนักงานใหญ่/สาขา <Dots w="80mm">{branchAddress}</Dots>
          </span>
          <span>
            ลำดับที่สาขา <DigitBoxes value={branchNo} groups={[6]} />
          </span>
        </div>
        <div className="flex flex-wrap gap-4">
          <span>
            รหัสไปรษณีย์ <Dots w="18mm">{postcode}</Dots>
          </span>
          <span>
            โทรศัพท์ <Dots w="34mm">{company?.phone}</Dots>
          </span>
          <span>
            อัตราเงินสมทบร้อยละ <Dots w="12mm">{rate}</Dots>
          </span>
        </div>
      </div>
      <div className="mt-[-1px] border border-black p-2 text-center font-semibold">
        การนำส่งเงินสมทบสำหรับค่าจ้างเดือน <Dots w="26mm">{thMonthName(month)}</Dots> พ.ศ. <Dots w="14mm">{year + 543}</Dots>
      </div>
      <table className="bx mt-[-1px]">
        <thead>
          <tr>
            <th className="w-[62%]">รายการ</th>
            <th colSpan={2}>จำนวนเงิน (บาท | สต.)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>1. เงินค่าจ้างทั้งสิ้น</td>
            <Money n={t.wage} />
          </tr>
          <tr>
            <td>2. เงินสมทบผู้ประกันตน</td>
            <Money n={t.employee} />
          </tr>
          <tr>
            <td>3. เงินสมทบนายจ้าง</td>
            <Money n={t.employer} />
          </tr>
          <tr className="font-semibold">
            <td>4. รวมเงินสมทบที่นำส่งทั้งสิ้น</td>
            <Money n={total} />
          </tr>
          <tr>
            <td colSpan={3}>
              (<b>{bahtText(total)}</b>)
            </td>
          </tr>
          <tr>
            <td>5. จำนวนผู้ประกันตนที่ส่งเงินสมทบ</td>
            <td colSpan={2} className="num text-right">
              {count} คน
            </td>
          </tr>
        </tbody>
      </table>
      <div className="mt-[-1px] border border-black p-2 leading-7">
        ข้าพเจ้าขอรับรองว่ารายการที่แจ้งไว้เป็นรายการที่ถูกต้องครบถ้วนและเป็นจริงทุกประการ พร้อมนี้ได้แนบ
        <div className="pl-3">
          <Box on>รายละเอียดการนำส่งเงินสมทบ จำนวน</Box> <Dots w="10mm">{sheets}</Dots> แผ่น หรือ
        </div>
        <div className="pl-3">
          <Box>สื่อข้อมูลอิเล็กทรอนิกส์ จำนวน</Box> <Dots w="10mm" /> แผ่น &nbsp; <Box>อินเตอร์เน็ต</Box> <Box>อื่นๆ</Box>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-4">
          <div />
          <div className="text-center leading-7">
            <div>
              ลงชื่อ <Dots w="46mm" /> นายจ้าง/ผู้รับมอบอำนาจ
            </div>
            <div>
              ( <Dots w="46mm" /> )
            </div>
            <div>
              ตำแหน่ง <Dots w="44mm" />
            </div>
            <div>
              ยื่นแบบวันที่ <Dots w="8mm" /> เดือน <Dots w="20mm" /> พ.ศ. <Dots w="12mm" />
            </div>
          </div>
        </div>
      </div>
      <div className="mt-[-1px] grid grid-cols-2 border border-black text-[10.5px]">
        <div className="border-r border-black p-2 leading-6">
          <b>สำหรับเจ้าหน้าที่สำนักงานประกันสังคม</b>
          <div>
            ชำระเงินวันที่ <Dots w="34mm" />
          </div>
          <div>
            เลขที่ใบเสร็จรับเงิน <Dots w="30mm" />
          </div>
          <div>
            ลงชื่อ <Dots w="40mm" /> ผู้รับเงิน
          </div>
        </div>
        <div className="p-2 leading-6">
          <b>สำหรับเจ้าหน้าที่ธนาคาร/หน่วยบริการ</b>
          <div>
            ชำระเงินวันที่ <Dots w="34mm" />
          </div>
          <div>
            ลงชื่อ <Dots w="40mm" /> ผู้รับเงิน
          </div>
        </div>
      </div>
      <p className="mt-1 text-[10px]">
        คำชี้แจง: ค่าจ้างที่ใช้คำนวณเงินสมทบต่ำสุด–สูงสุดตามที่กฎหมายกำหนดในเดือนนั้น · เงินสมทบแต่ละคน หากมีเศษสตางค์ตั้งแต่ 50 สตางค์ขึ้นไปให้ปัดเป็น 1 บาท ถ้าน้อยกว่า 50 สตางค์ให้ปัดทิ้ง · ยื่นภายในวันที่ 15 ของเดือนถัดไป
      </p>
    </section>
  );
}

function PartTwo({ rows, offset, sheet, sheets, company, accountNo, branchNo, year, month, ssoNo, total }: {
  rows: Row[]; offset: number; sheet: number; sheets: number; company: string; accountNo?: string | null; branchNo: string; year: number; month: number; ssoNo: (r: Row) => string; total?: { wage: number; employee: number };
}) {
  const pad = Array.from({ length: Math.max(0, PER_SHEET - rows.length) });
  const sub = { wage: rows.reduce((s, r) => s + r.wage, 0), employee: rows.reduce((s, r) => s + r.employee, 0) };
  return (
    <section className="gov-sheet">
      <div className="flex items-start justify-between">
        <div>
          สำหรับค่าจ้างเดือน <Dots w="24mm">{thMonthName(month)}</Dots> พ.ศ. <Dots w="12mm">{year + 543}</Dots>
        </div>
        <div className="text-right">
          <div className="text-[13px] font-black">สปส. 1-10 (ส่วนที่ 2)</div>
          <div>
            แผ่นที่ <Dots w="8mm">{sheet}</Dots> ในจำนวน <Dots w="8mm">{sheets}</Dots> แผ่น
          </div>
        </div>
      </div>
      <h2 className="mt-1 text-center text-[15px] font-bold">รายละเอียดการนำส่งเงินสมทบ</h2>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2 border border-black p-2">
        <span>
          ชื่อสถานประกอบการ <Dots w="70mm">{company}</Dots>
        </span>
        <span>
          เลขที่บัญชี <DigitBoxes value={accountNo} groups={[2, 7, 1]} size={13} />
        </span>
        <span>
          ลำดับที่สาขา <DigitBoxes value={branchNo} groups={[6]} size={13} />
        </span>
      </div>
      <table className="bx mt-[-1px]">
        <thead>
          <tr>
            <th className="w-10">ลำดับที่</th>
            <th className="w-[44mm]">เลขประจำตัวประชาชน</th>
            <th>คำนำหน้านาม — ชื่อ — ชื่อสกุล</th>
            <th colSpan={2}>ค่าจ้างที่จ่ายจริง</th>
            <th colSpan={2}>เงินสมทบผู้ประกันตน</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.employee_id} className="h-[8.5mm]">
              <td className="num text-center align-middle">{offset + i + 1}</td>
              <td className="align-middle">{ssoNo(r) ? <DigitBoxes value={ssoNo(r)} size={12} /> : <span className="text-rust">ไม่มีข้อมูล</span>}</td>
              <td className="align-middle">
                {r.emp?.prefix}
                {r.emp?.first_name} &nbsp;{r.emp?.last_name}
              </td>
              <Money n={r.wage} />
              <Money n={r.employee} />
            </tr>
          ))}
          {pad.map((_, i) => (
            <tr key={`p${i}`} className="h-[8.5mm]">
              <td />
              <td />
              <td />
              <Money n={0} blank />
              <Money n={0} blank />
            </tr>
          ))}
          <tr className="font-semibold">
            <td colSpan={3} className="text-right">
              รวมแผ่นนี้
            </td>
            <Money n={sub.wage} />
            <Money n={sub.employee} />
          </tr>
          {total && sheets > 1 && (
            <tr className="font-semibold">
              <td colSpan={3} className="text-right">
                รวมทั้งสิ้น (ทุกแผ่น)
              </td>
              <Money n={total.wage} />
              <Money n={total.employee} />
            </tr>
          )}
        </tbody>
      </table>
      <div className="mt-[-1px] grid grid-cols-2 border border-black p-2">
        <div className="text-[10.5px] leading-5">ข้าพเจ้าขอรับรองว่ารายการที่แจ้งไว้เป็นรายการที่ถูกต้องครบถ้วนและเป็นจริงทุกประการ</div>
        <div className="text-center leading-7">
          <div>
            ลงชื่อ <Dots w="40mm" /> นายจ้าง
          </div>
          <div>
            ( <Dots w="40mm" /> )
          </div>
          <div>
            ตำแหน่ง <Dots w="38mm" />
          </div>
        </div>
      </div>
    </section>
  );
}
