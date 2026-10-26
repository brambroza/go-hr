"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Badge, Select, Spinner, Tabs, toast } from "@/components/ui";
import { FilterField, MonthSelect, ReportShell, YearSelect, tbl } from "@/components/reports/report-shell";
import { fetchRowsIn, loadCompanyAndBranches } from "@/components/reports/data";
import { GovPrintStyle, dmyBE } from "@/components/reports/gov-forms";
import { Sso103Sheet, Sso609Sheet, type SsoFormEmployer, type SsoFormPerson } from "@/components/reports/sso-register-forms";
import { supabaseBrowser } from "@/lib/supabase/client";
import { downloadCsv } from "@/lib/csv";
import { isoDate } from "@/lib/format";
import { SSO_LEAVE_REASONS, deadlineState, monthRange, ssoIssues, ssoJoinDeadline, ssoLeaveDate, ssoLeaveDeadline } from "@/lib/payroll/sso-register";

type Kind = "join" | "leave";
type Emp = { id: number; code: string; prefix: string | null; first_name: string; last_name: string; gender: string | null; birth_date: string | null; nationality: string | null; hire_date: string; resign_date: string | null; resign_type: string | null; branch_id: number | null };
type Priv = { employee_id: number; national_id: string | null; sso_no: string | null; sso_enabled: boolean; sso_hospital: string | null };
type Row = SsoFormPerson & { id: number; code: string; branch_id: number | null; deadline: string; issues: string[] };

const DAY = 86_400_000;
const shift = (d: string, n: number) => new Date(Date.parse(d + "T00:00:00Z") + n * DAY).toISOString().slice(0, 10);
const STATE: Record<ReturnType<typeof deadlineState>, [string, string]> = { overdue: ["เลยกำหนด", "red"], due_soon: ["ใกล้กำหนด", "amber"], ok: ["ยังไม่ถึงกำหนด", "gray"] };

/** แจ้งเข้า สปส.1-03 / แจ้งออก สปส.6-09 — monthly checklist with deadlines, CSV for keying in e-Service, printable forms */
export default function SsoRegisterPage() {
  const now = new Date();
  const sp = useSearchParams();
  const [kind, setKind] = useState<Kind>(sp.get("kind") === "leave" ? "leave" : "join");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [branch, setBranch] = useState("");
  const [view, setView] = useState<"list" | "forms">("list");
  const [info, setInfo] = useState<Awaited<ReturnType<typeof loadCompanyAndBranches>> | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    loadCompanyAndBranches().then(setInfo).catch((e) => toast.error(e));
  }, []);

  useEffect(() => {
    if (!info) return;
    let alive = true;
    setRows(null);
    (async () => {
      const sb = supabaseBrowser();
      const [first, last] = monthRange(year, month);
      // leavers: the leave date (day after the last working day) falls in the month
      const [col, from, to] = kind === "join" ? ["hire_date", first, last] : ["resign_date", shift(first, -1), shift(last, -1)];
      const { data, error } = await sb
        .from("employees")
        .select("id, code, prefix, first_name, last_name, gender, birth_date, nationality, hire_date, resign_date, resign_type, branch_id")
        .gte(col, from)
        .lte(col, to)
        .order(col)
        .limit(2000);
      if (error) throw new Error(error.message);
      const emps = (data ?? []) as Emp[];
      const privs = await fetchRowsIn<Priv>(emps.map((e) => e.id), (part) => sb.from("employee_private").select("employee_id, national_id, sso_no, sso_enabled, sso_hospital").in("employee_id", part).order("employee_id"));
      const privBy = new Map(privs.map((p) => [Number(p.employee_id), p]));
      const brBy = new Map(info.branches.map((b) => [b.id, b]));
      const list: Row[] = [];
      for (const e of emps) {
        const p = privBy.get(e.id);
        if (p && !p.sso_enabled) continue;
        if (kind === "leave" && !e.resign_date) continue;
        const person: SsoFormPerson = { ...e, national_id: p?.sso_no || p?.national_id || null, sso_hospital: p?.sso_hospital ?? null };
        const br = e.branch_id ? brBy.get(e.branch_id) ?? null : null;
        const issues = ssoIssues({ ...person, sso_enabled: true }, kind, br);
        if (!p) issues.unshift("ไม่มีข้อมูลส่วนบุคคล (employee_private)");
        list.push({ ...person, id: e.id, code: e.code, branch_id: e.branch_id, deadline: kind === "join" ? ssoJoinDeadline(e.hire_date) : ssoLeaveDeadline(e.resign_date!), issues });
      }
      if (alive) setRows(list);
    })().catch((e) => toast.error(e));
    return () => {
      alive = false;
    };
  }, [info, kind, year, month]);

  const shown = useMemo(() => (rows ?? []).filter((r) => !branch || String(r.branch_id) === branch), [rows, branch]);
  const today = isoDate();
  const employerOf = (r: Row): SsoFormEmployer => {
    const b = info?.branches.find((x) => x.id === r.branch_id) ?? info?.branches.find((x) => x.is_head_office);
    return { name: info?.company.name ?? "", branch_name: b?.name ?? "", account_no: b?.sso_account_no ?? "", branch_no: b?.sso_branch_no ?? "" };
  };

  const csv = () =>
    downloadCsv(`sso-${kind === "join" ? "1-03" : "6-09"}-${year + 543}-${String(month).padStart(2, "0")}.csv`, [
      kind === "join"
        ? ["รหัส", "เลขประจำตัวประชาชน", "คำนำหน้า", "ชื่อ", "ชื่อสกุล", "เพศ", "วันเกิด", "สัญชาติ", "วันที่เข้าทำงาน", "สถานพยาบาล", "เลขที่บัญชีนายจ้าง", "ลำดับที่สาขา", "กำหนดยื่น", "ปัญหา"]
        : ["รหัส", "เลขประจำตัวประชาชน", "คำนำหน้า", "ชื่อ", "ชื่อสกุล", "วันทำงานวันสุดท้าย", "วันที่สิ้นสภาพ", "รหัสสาเหตุ", "สาเหตุ", "เลขที่บัญชีนายจ้าง", "ลำดับที่สาขา", "กำหนดยื่น", "ปัญหา"],
      ...shown.map((r) => {
        const e = employerOf(r);
        const reason = r.resign_type ? SSO_LEAVE_REASONS[r.resign_type] : undefined;
        return kind === "join"
          ? [r.code, r.national_id ?? "", r.prefix ?? "", r.first_name, r.last_name, r.gender === "M" ? "ชาย" : r.gender === "F" ? "หญิง" : "", dmyBE(r.birth_date), r.nationality ?? "", dmyBE(r.hire_date), r.sso_hospital ?? "", e.account_no, e.branch_no, dmyBE(r.deadline), r.issues.join("; ")]
          : [r.code, r.national_id ?? "", r.prefix ?? "", r.first_name, r.last_name, dmyBE(r.resign_date), r.resign_date ? dmyBE(ssoLeaveDate(r.resign_date)) : "", reason?.code ?? "", reason?.label ?? "", e.account_no, e.branch_no, dmyBE(r.deadline), r.issues.join("; ")];
      }),
    ]);

  return (
    <div>
      <GovPrintStyle />
      <ReportShell
        title="แจ้งเข้า / แจ้งออก ประกันสังคม (สปส.1-03 / 6-09)"
        description="แจ้งเข้าภายใน 30 วันนับจากวันเข้าทำงาน · แจ้งออกภายในวันที่ 15 ของเดือนถัดไป — ตรวจข้อมูลที่ขาด ส่งออก CSV สำหรับกรอกใน e-Service หรือพิมพ์แบบฟอร์มยื่นที่สำนักงาน"
        onCsv={shown.length ? csv : undefined}
        filters={
          <>
            <Tabs value={kind} onChange={setKind} tabs={[{ value: "join", label: "แจ้งเข้า (1-03)" }, { value: "leave", label: "แจ้งออก (6-09)" }]} />
            <YearSelect value={year} onChange={setYear} />
            <MonthSelect value={month} onChange={setMonth} />
            <FilterField label="สาขา">
              <Select className="h-9 w-44" value={branch} onChange={(e) => setBranch(e.target.value)}>
                <option value="">ทุกสาขา</option>
                {info?.branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </FilterField>
            <FilterField label="แสดง">
              <Select className="h-9 w-48" value={view} onChange={(e) => setView(e.target.value as "list")}>
                <option value="list">รายการตรวจสอบ</option>
                <option value="forms">แบบฟอร์มสำหรับพิมพ์</option>
              </Select>
            </FilterField>
          </>
        }
      >
        {rows === null ? (
          <Spinner className="mx-auto my-10" />
        ) : shown.length === 0 ? (
          <p className="py-10 text-center text-neutral-500">{kind === "join" ? "ไม่มีพนักงานเข้าใหม่ที่ต้องแจ้งเข้าในเดือนนี้" : "ไม่มีพนักงานที่สิ้นสภาพในเดือนนี้"}</p>
        ) : view === "forms" ? (
          shown.map((r) => (kind === "join" ? <Sso103Sheet key={r.id} p={r} employer={employerOf(r)} /> : <Sso609Sheet key={r.id} p={r} employer={employerOf(r)} />))
        ) : (
          <table className={tbl}>
            <thead>
              <tr>
                <th>รหัส</th>
                <th>ชื่อ-สกุล</th>
                <th>เลขประจำตัว</th>
                <th>{kind === "join" ? "วันเข้าทำงาน" : "วันที่สิ้นสภาพ"}</th>
                {kind === "leave" && <th>สาเหตุ</th>}
                <th>กำหนดยื่น</th>
                <th>ตรวจข้อมูล</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const [label, color] = STATE[deadlineState(r.deadline, today)];
                const reason = r.resign_type ? SSO_LEAVE_REASONS[r.resign_type] : undefined;
                return (
                  <tr key={r.id}>
                    <td>{r.code}</td>
                    <td>
                      {r.prefix}
                      {r.first_name} {r.last_name}
                    </td>
                    <td className="num">{r.national_id}</td>
                    <td>{kind === "join" ? dmyBE(r.hire_date) : r.resign_date ? dmyBE(ssoLeaveDate(r.resign_date)) : ""}</td>
                    {kind === "leave" && <td>{reason ? `${reason.code}. ${reason.label}` : r.resign_type ?? "-"}</td>}
                    <td>
                      {dmyBE(r.deadline)} <Badge color={color}>{label}</Badge>
                    </td>
                    <td>{r.issues.length ? <span className="text-rust">{r.issues.join(" · ")}</span> : <span className="text-jade-700">ครบ</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </ReportShell>
    </div>
  );
}
