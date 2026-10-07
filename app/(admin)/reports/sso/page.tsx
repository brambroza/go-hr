"use client";

import { useEffect, useMemo, useState } from "react";
import { FileDown } from "lucide-react";
import { Button, Select, Spinner, toast } from "@/components/ui";
import { FilterField, MonthSelect, ReportHead, ReportShell, YearSelect, tbl } from "@/components/reports/report-shell";
import { loadCompanyAndBranches, loadPaidEntries, loadPeople, type EmpLite, type PrivLite } from "@/components/reports/data";
import { downloadCsv } from "@/lib/csv";
import { bahtText, formatNationalId, isoDate, money, thMonthYear } from "@/lib/format";
import { buildSsoFile, downloadBuilt } from "@/lib/payroll/files";

type Row = { employee_id: number; emp?: EmpLite; priv?: PrivLite; wage: number; employee: number; employer: number };

/**
 * สปส.1-10 — แบบรายการแสดงการส่งเงินสมทบ (ต่อเดือน ต่อสาขา/สถานประกอบการ)
 * ส่วนที่ 1 สรุป · ส่วนที่ 2 รายละเอียดผู้ประกันตน · ไฟล์ e-Service (fixed width, see lib/payroll/files.ts)
 */
export default function SsoReportPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() === 0 ? 12 : now.getMonth());
  const [branch, setBranch] = useState("");
  const [payDate, setPayDate] = useState(isoDate());
  const [rate, setRate] = useState(5);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [info, setInfo] = useState<Awaited<ReturnType<typeof loadCompanyAndBranches>> | null>(null);

  useEffect(() => {
    loadCompanyAndBranches().then((x) => {
      setInfo(x);
      if (x.branches.length) setBranch(String((x.branches.find((b) => b.is_head_office) ?? x.branches[0]).id));
    });
    import("@/lib/supabase/client").then(({ supabaseBrowser }) =>
      supabaseBrowser().from("settings").select("value").eq("key", "sso_config").maybeSingle().then(({ data }: { data: { value?: { rate_employee?: number } } | null }) => data?.value?.rate_employee && setRate(Number(data.value.rate_employee))),
    );
  }, []);

  useEffect(() => {
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
      setRows(list);
    })().catch((e) => toast.error(String(e.message ?? e)));
  }, [year, month, branch]);

  const br = info?.branches.find((b) => String(b.id) === branch);
  const t = useMemo(() => {
    const l = rows ?? [];
    return { wage: l.reduce((s, r) => s + r.wage, 0), employee: l.reduce((s, r) => s + r.employee, 0), employer: l.reduce((s, r) => s + r.employer, 0) };
  }, [rows]);
  const ssoNo = (r: Row) => r.priv?.sso_no || r.priv?.national_id || "";

  const csv = () =>
    downloadCsv(`sso-1-10-${year + 543}${String(month).padStart(2, "0")}-${br?.code ?? "all"}.csv`, [
      ["ลำดับ", "เลขประจำตัวประชาชน", "คำนำหน้า", "ชื่อ", "ชื่อสกุล", "ค่าจ้าง", "เงินสมทบผู้ประกันตน", "เงินสมทบนายจ้าง"],
      ...(rows ?? []).map((r, i) => [i + 1, ssoNo(r), r.emp?.prefix, r.emp?.first_name, r.emp?.last_name, r.wage.toFixed(2), r.employee.toFixed(2), r.employer.toFixed(2)]),
      ["", "", "", "", "รวม", t.wage.toFixed(2), t.employee.toFixed(2), t.employer.toFixed(2)],
    ]);
  const file = () => {
    if (!br?.sso_account_no) toast.info("สาขานี้ยังไม่ได้ระบุเลขที่บัญชีนายจ้าง — ตั้งค่าได้ที่ สาขา / สถานประกอบการ");
    downloadBuilt(
      buildSsoFile(
        { account_no: br?.sso_account_no ?? "", branch_no: br?.sso_branch_no ?? "000000", pay_date: payDate, year, month, company_name: info?.company.name ?? "", rate },
        (rows ?? []).map((r) => ({ sso_no: ssoNo(r), prefix: r.emp?.prefix ?? null, first_name: r.emp?.first_name ?? "", last_name: r.emp?.last_name ?? "", wage: r.wage, employee: r.employee, employer: r.employer })),
      ),
    );
  };

  return (
    <ReportShell
      title="สปส.1-10"
      description="แบบรายการแสดงการส่งเงินสมทบ — ยื่นภายในวันที่ 15 ของเดือนถัดไป แยกตามสถานประกอบการ (สาขา)"
      onCsv={rows?.length ? csv : undefined}
      extraActions={
        rows?.length ? (
          <Button variant="secondary" icon={<FileDown className="size-4" />} onClick={file}>
            ไฟล์ e-Service (.txt)
          </Button>
        ) : null
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
      <ReportHead title="แบบรายการแสดงการส่งเงินสมทบ (สปส.1-10)" sub={`สำหรับค่าจ้างเดือน ${thMonthYear(year, month)}`} />
      <h3 className="mb-1 font-semibold">ส่วนที่ 1</h3>
      <table className={`${tbl} mb-5`}>
        <tbody>
          <tr>
            <td className="w-1/3">ชื่อสถานประกอบการ</td>
            <td colSpan={3}>
              <b>{info?.company.name}</b> {br && <>— {br.name}</>}
            </td>
          </tr>
          <tr>
            <td>เลขที่บัญชีนายจ้าง</td>
            <td className="num">{br?.sso_account_no ?? <span className="text-rust">ยังไม่ระบุ</span>}</td>
            <td>ลำดับที่สาขา</td>
            <td className="num">{br?.sso_branch_no ?? "000000"}</td>
          </tr>
          <tr>
            <td>อัตราเงินสมทบ</td>
            <td className="num" colSpan={3}>
              ร้อยละ {rate}
            </td>
          </tr>
          <tr>
            <td>1. ค่าจ้างทั้งสิ้น</td>
            <td className="num text-right font-semibold" colSpan={3}>
              {money(t.wage)}
            </td>
          </tr>
          <tr>
            <td>2. เงินสมทบผู้ประกันตน</td>
            <td className="num text-right" colSpan={3}>
              {money(t.employee)}
            </td>
          </tr>
          <tr>
            <td>3. เงินสมทบนายจ้าง</td>
            <td className="num text-right" colSpan={3}>
              {money(t.employer)}
            </td>
          </tr>
          <tr>
            <td>4. รวมเงินสมทบที่นำส่งทั้งสิ้น</td>
            <td className="num text-right font-semibold" colSpan={3}>
              {money(t.employee + t.employer)}
              <div className="text-[11px] font-normal">({bahtText(t.employee + t.employer)})</div>
            </td>
          </tr>
          <tr>
            <td>5. จำนวนผู้ประกันตนที่ส่งเงินสมทบ</td>
            <td className="num text-right" colSpan={3}>
              {rows?.length ?? 0} คน
            </td>
          </tr>
        </tbody>
      </table>
      <h3 className="mb-1 font-semibold">ส่วนที่ 2 รายละเอียดการนำส่งเงินสมทบ</h3>
      {rows === null ? (
        <Spinner className="mx-auto my-10" />
      ) : (
        <table className={tbl}>
          <thead>
            <tr>
              <th className="w-10">ลำดับ</th>
              <th>เลขประจำตัวประชาชน</th>
              <th>คำนำหน้า</th>
              <th>ชื่อ - ชื่อสกุล</th>
              <th className="text-right">ค่าจ้าง</th>
              <th className="text-right">เงินสมทบ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.employee_id}>
                <td className="num text-center">{i + 1}</td>
                <td className="num">{formatNationalId(ssoNo(r)) || <span className="text-rust">ไม่มีข้อมูล</span>}</td>
                <td>{r.emp?.prefix}</td>
                <td>
                  {r.emp?.first_name} {r.emp?.last_name}
                </td>
                <td className="num text-right">{money(r.wage)}</td>
                <td className="num text-right">{money(r.employee)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-neutral-500">
                  ไม่มีข้อมูลเงินสมทบของเดือนนี้ (ต้องอนุมัติงวดเงินเดือนก่อน)
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="font-semibold">
              <td colSpan={4} className="text-right">
                รวม
              </td>
              <td className="num text-right">{money(t.wage)}</td>
              <td className="num text-right">{money(t.employee)}</td>
            </tr>
          </tfoot>
        </table>
      )}
      <div className="mt-10 grid grid-cols-2 gap-8 text-center text-[12px]">
        <div>
          ลงชื่อ ........................................................ นายจ้าง/ผู้รับมอบอำนาจ
          <div className="mt-1">( ........................................................ )</div>
        </div>
        <div>
          ยื่นแบบวันที่ ........ / ........ / ............
        </div>
      </div>
    </ReportShell>
  );
}
