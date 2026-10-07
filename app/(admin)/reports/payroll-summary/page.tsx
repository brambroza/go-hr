"use client";

import { useEffect, useMemo, useState } from "react";
import { Select, Spinner, Tabs, toast } from "@/components/ui";
import { FilterField, ReportHead, ReportShell, YearSelect, tbl } from "@/components/reports/report-shell";
import { fetchRowsIn, loadCompanyAndBranches } from "@/components/reports/data";
import { supabaseBrowser } from "@/lib/supabase/client";
import { downloadCsv } from "@/lib/csv";
import { money, thDate } from "@/lib/format";
import type { PayEntryLite } from "@/components/reports/data";

type Period = { id: number; name: string; pay_date: string; status: string };
type Agg = { key: string; name: string; headcount: number; income: number; deduction: number; tax: number; sso_e: number; sso_r: number; pvd_e: number; pvd_r: number; net: number };

export default function PayrollSummaryPage() {
  const sb = supabaseBrowser();
  const [year, setYear] = useState(new Date().getFullYear());
  const [periods, setPeriods] = useState<Period[]>([]);
  const [pid, setPid] = useState<string>("");
  const [by, setBy] = useState<"org" | "branch">("org");
  const [entries, setEntries] = useState<PayEntryLite[] | null>(null);
  const [orgs, setOrgs] = useState<Map<number, string>>(new Map());
  const [branches, setBranches] = useState<Map<number, string>>(new Map());
  const [company, setCompany] = useState("");

  useEffect(() => {
    loadCompanyAndBranches().then((x) => {
      setCompany(x.company.name ?? "");
      setBranches(new Map(x.branches.map((b) => [b.id, b.name])));
    });
    sb.from("org_units").select("id, name").then(({ data }: { data: unknown }) => setOrgs(new Map(((data as { id: number; name: string }[]) ?? []).map((o) => [o.id, o.name]))));
  }, [sb]);
  useEffect(() => {
    sb.from("payroll_periods").select("id, name, pay_date, status").eq("pay_year", year).neq("status", "open").order("pay_date", { ascending: false }).then(({ data }: { data: unknown }) => {
      const list = (data as Period[]) ?? [];
      setPeriods(list);
      setPid(list[0] ? String(list[0].id) : "");
      if (!list.length) setEntries([]);
    });
  }, [sb, year]);
  useEffect(() => {
    if (!pid) return;
    setEntries(null);
    const ids = pid === "all" ? periods.map((p) => p.id) : [Number(pid)];
    fetchRowsIn<PayEntryLite>(ids, (part) => sb.from("payroll_entries").select("id, period_id, employee_id, branch_id, org_unit_id, total_income, total_deduction, net_pay, tax, sso_employee, sso_employer, pvd_employee, pvd_employer").in("period_id", part).order("id"))
      .then(setEntries)
      .catch((e) => toast.error(e.message));
  }, [sb, pid, periods]);

  const rows = useMemo(() => {
    const m = new Map<string, Agg & { emps: Set<number> }>();
    for (const e of entries ?? []) {
      const id = by === "org" ? e.org_unit_id : e.branch_id;
      const key = String(id ?? 0);
      const a = m.get(key) ?? { key, name: (by === "org" ? orgs.get(id ?? 0) : branches.get(id ?? 0)) ?? "ไม่ระบุ", headcount: 0, emps: new Set<number>(), income: 0, deduction: 0, tax: 0, sso_e: 0, sso_r: 0, pvd_e: 0, pvd_r: 0, net: 0 };
      a.emps.add(e.employee_id);
      a.income += Number(e.total_income);
      a.deduction += Number(e.total_deduction);
      a.tax += Number(e.tax);
      a.sso_e += Number(e.sso_employee);
      a.sso_r += Number(e.sso_employer);
      a.pvd_e += Number(e.pvd_employee);
      a.pvd_r += Number(e.pvd_employer);
      a.net += Number(e.net_pay);
      m.set(key, a);
    }
    return [...m.values()].map((a) => ({ ...a, headcount: a.emps.size })).sort((a, b) => b.income - a.income);
  }, [entries, by, orgs, branches]);
  const sum = (f: (a: Agg) => number) => rows.reduce((s, a) => s + f(a), 0);
  const allEmps = new Set((entries ?? []).map((e) => e.employee_id)).size;
  const periodLabel = pid === "all" ? `ทุกงวดในปี ${year + 543}` : periods.find((p) => String(p.id) === pid)?.name ?? "";

  const csv = () =>
    downloadCsv(`payroll-summary-${by}-${pid}.csv`, [
      [by === "org" ? "หน่วยงาน" : "สาขา", "จำนวนคน", "รายได้รวม", "รายการหักรวม", "ภาษี", "สปส.ลูกจ้าง", "PVD ลูกจ้าง", "จ่ายสุทธิ", "สปส.นายจ้าง", "PVD นายจ้าง", "ต้นทุนรวมนายจ้าง"],
      ...rows.map((a) => [a.name, a.headcount, a.income.toFixed(2), a.deduction.toFixed(2), a.tax.toFixed(2), a.sso_e.toFixed(2), a.pvd_e.toFixed(2), a.net.toFixed(2), a.sso_r.toFixed(2), a.pvd_r.toFixed(2), (a.income + a.sso_r + a.pvd_r).toFixed(2)]),
      ["รวม", allEmps, sum((a) => a.income).toFixed(2), sum((a) => a.deduction).toFixed(2), sum((a) => a.tax).toFixed(2), sum((a) => a.sso_e).toFixed(2), sum((a) => a.pvd_e).toFixed(2), sum((a) => a.net).toFixed(2), sum((a) => a.sso_r).toFixed(2), sum((a) => a.pvd_r).toFixed(2), sum((a) => a.income + a.sso_r + a.pvd_r).toFixed(2)],
    ]);

  return (
    <ReportShell
      landscape
      title="สรุปเงินเดือนตามหน่วยงาน / สาขา"
      description="ต้นทุนนายจ้าง = รายได้รวม + เงินสมทบประกันสังคมส่วนนายจ้าง + เงินสมทบกองทุนสำรองเลี้ยงชีพส่วนนายจ้าง"
      onCsv={rows.length ? csv : undefined}
      filters={
        <>
          <YearSelect value={year} onChange={setYear} />
          <FilterField label="งวด">
            <Select className="h-9 w-64" value={pid} onChange={(e) => setPid(e.target.value)}>
              {periods.length > 1 && <option value="all">ทุกงวดในปี</option>}
              {periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({thDate(p.pay_date)})
                </option>
              ))}
            </Select>
          </FilterField>
          <Tabs value={by} onChange={setBy} tabs={[{ value: "org", label: "ตามหน่วยงาน" }, { value: "branch", label: "ตามสาขา" }]} className="border-0" />
        </>
      }
    >
      <ReportHead company={company} title={`สรุปเงินเดือน${by === "org" ? "ตามหน่วยงาน" : "ตามสาขา"}`} sub={periodLabel} />
      {entries === null ? (
        <Spinner className="mx-auto my-10" />
      ) : (
        <table className={tbl}>
          <thead>
            <tr>
              <th className="text-left">{by === "org" ? "หน่วยงาน" : "สาขา"}</th>
              <th className="text-right">คน</th>
              <th className="text-right">รายได้รวม</th>
              <th className="text-right">รายการหัก</th>
              <th className="text-right">ภาษี</th>
              <th className="text-right">สปส. ลูกจ้าง</th>
              <th className="text-right">จ่ายสุทธิ</th>
              <th className="text-right">สปส. นายจ้าง</th>
              <th className="text-right">PVD นายจ้าง</th>
              <th className="text-right">ต้นทุนนายจ้าง</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.key}>
                <td>{a.name}</td>
                <td className="num text-right">{a.headcount}</td>
                <td className="num text-right">{money(a.income)}</td>
                <td className="num text-right">{money(a.deduction)}</td>
                <td className="num text-right">{money(a.tax)}</td>
                <td className="num text-right">{money(a.sso_e)}</td>
                <td className="num text-right">{money(a.net)}</td>
                <td className="num text-right">{money(a.sso_r)}</td>
                <td className="num text-right">{money(a.pvd_r)}</td>
                <td className="num text-right font-semibold">{money(a.income + a.sso_r + a.pvd_r)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={10} className="py-6 text-center text-neutral-500">
                  ไม่มีข้อมูล
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="font-semibold">
              <td>รวม</td>
              <td className="num text-right">{allEmps}</td>
              <td className="num text-right">{money(sum((a) => a.income))}</td>
              <td className="num text-right">{money(sum((a) => a.deduction))}</td>
              <td className="num text-right">{money(sum((a) => a.tax))}</td>
              <td className="num text-right">{money(sum((a) => a.sso_e))}</td>
              <td className="num text-right">{money(sum((a) => a.net))}</td>
              <td className="num text-right">{money(sum((a) => a.sso_r))}</td>
              <td className="num text-right">{money(sum((a) => a.pvd_r))}</td>
              <td className="num text-right">{money(sum((a) => a.income + a.sso_r + a.pvd_r))}</td>
            </tr>
          </tfoot>
        </table>
      )}
    </ReportShell>
  );
}
