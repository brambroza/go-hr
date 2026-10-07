"use client";

import { useEffect, useMemo, useState } from "react";
import { Select, Spinner, Tabs, toast } from "@/components/ui";
import { FilterField, ReportHead, ReportShell, YearSelect, tbl } from "@/components/reports/report-shell";
import { fetchRows } from "@/components/reports/data";
import { supabaseBrowser } from "@/lib/supabase/client";
import { downloadCsv } from "@/lib/csv";
import { num } from "@/lib/format";

type Bal = { employee_id: number; leave_type_id: number; total_days: number; used_days: number; pending_days: number; remaining_days: number };
type Req = { employee_id: number; leave_type_id: number; days: number };
type Emp = { id: number; code: string; first_name: string; last_name: string; org_unit_id: number | null; org_unit_name: string | null };
type LT = { id: number; code: string; name: string; sort_order: number };

const d = (n: number) => (n ? num(n, n % 1 ? 1 : 0) : "-");

export default function LeaveReportPage() {
  const sb = supabaseBrowser();
  const [year, setYear] = useState(new Date().getFullYear());
  const [org, setOrg] = useState("");
  const [view, setView] = useState<"used" | "balance">("used");
  const [orgs, setOrgs] = useState<{ id: number; name: string }[]>([]);
  const [types, setTypes] = useState<LT[]>([]);
  const [data, setData] = useState<{ emps: Emp[]; bal: Bal[]; reqs: Req[] } | null>(null);

  useEffect(() => {
    sb.from("org_units").select("id, name").order("name").then(({ data }: { data: unknown }) => setOrgs((data as { id: number; name: string }[]) ?? []));
    sb.from("leave_types").select("id, code, name, sort_order").eq("is_active", true).order("sort_order").then(({ data }: { data: unknown }) => setTypes((data as LT[]) ?? []));
  }, [sb]);
  useEffect(() => {
    setData(null);
    (async () => {
      const emps = await fetchRows<Emp>(() => {
        let q = sb.from("v_directory").select("id, code, first_name, last_name, org_unit_id, org_unit_name").order("code");
        if (org) q = q.eq("org_unit_id", Number(org));
        return q;
      });
      const [bal, reqs] = await Promise.all([
        fetchRows<Bal>(() => sb.from("v_leave_balances").select("id, employee_id, leave_type_id, total_days, used_days, pending_days, remaining_days").eq("leave_year", year).order("id")),
        sb.rpc("report_leave_usage", { p_year: year }).then(({ data, error }: { data: unknown; error: { message: string } | null }) => {
          if (error) throw new Error(error.message);
          return (data as Req[]) ?? [];
        }),
      ]);
      setData({ emps, bal, reqs });
    })().catch((e) => toast.error(String(e.message ?? e)));
  }, [sb, year, org]);

  const { used, balBy, colTypes } = useMemo(() => {
    const used = new Map<string, number>();
    for (const r of data?.reqs ?? []) {
      const k = `${r.employee_id}|${Number(r.leave_type_id)}`;
      used.set(k, (used.get(k) ?? 0) + Number(r.days ?? 0));
    }
    const balBy = new Map((data?.bal ?? []).map((b) => [`${b.employee_id}|${b.leave_type_id}`, b]));
    const usedTypes = new Set([...used.keys()].map((k) => Number(k.split("|")[1])));
    const quotaTypes = new Set((data?.bal ?? []).map((b) => b.leave_type_id));
    const colTypes = types.filter((t) => usedTypes.has(t.id) || (view === "balance" && quotaTypes.has(t.id)) || ["SICK", "PERSONAL", "VACATION"].includes(t.code));
    return { used, balBy, colTypes };
  }, [data, types, view]);

  const csv = () =>
    downloadCsv(`leave-${year + 543}-${view}.csv`, [
      ["รหัส", "ชื่อ-สกุล", "หน่วยงาน", ...colTypes.flatMap((t) => (view === "used" ? [t.name] : [`${t.name} สิทธิ์`, `${t.name} ใช้`, `${t.name} คงเหลือ`])), ...(view === "used" ? ["รวม"] : [])],
      ...(data?.emps ?? []).map((e) => [
        e.code,
        `${e.first_name} ${e.last_name}`,
        e.org_unit_name,
        ...colTypes.flatMap((t) => {
          const b = balBy.get(`${e.id}|${t.id}`);
          return view === "used" ? [used.get(`${e.id}|${t.id}`) ?? 0] : [b?.total_days ?? "", used.get(`${e.id}|${t.id}`) ?? 0, b ? Number(b.total_days) - (used.get(`${e.id}|${t.id}`) ?? 0) : ""];
        }),
        ...(view === "used" ? [colTypes.reduce((s, t) => s + (used.get(`${e.id}|${t.id}`) ?? 0), 0)] : []),
      ]),
    ]);

  return (
    <ReportShell
      landscape
      title="สรุปการลา"
      description="จำนวนวันลาที่อนุมัติแล้วของแต่ละคน แยกตามประเภทการลา และสิทธิ์คงเหลือ"
      onCsv={data ? csv : undefined}
      filters={
        <>
          <YearSelect value={year} onChange={setYear} />
          <FilterField label="หน่วยงาน">
            <Select className="h-9 w-56" value={org} onChange={(e) => setOrg(e.target.value)} placeholder="ทั้งหมด">
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </Select>
          </FilterField>
          <Tabs value={view} onChange={setView} tabs={[{ value: "used", label: "วันลาที่ใช้" }, { value: "balance", label: "สิทธิ์ / ใช้ / คงเหลือ" }]} className="border-0" />
        </>
      }
    >
      <ReportHead title="รายงานสรุปการลา" sub={`ปี ${year + 543}`} />
      {!data ? (
        <Spinner className="mx-auto my-10" />
      ) : (
        <table className={tbl}>
          <thead>
            <tr>
              <th rowSpan={view === "balance" ? 2 : 1}>รหัส</th>
              <th rowSpan={view === "balance" ? 2 : 1} className="text-left">
                ชื่อ-สกุล
              </th>
              <th rowSpan={view === "balance" ? 2 : 1} className="text-left">
                หน่วยงาน
              </th>
              {colTypes.map((t) => (
                <th key={t.id} colSpan={view === "balance" ? 3 : 1} className="text-center">
                  {t.name}
                </th>
              ))}
              {view === "used" && <th className="text-right">รวม</th>}
            </tr>
            {view === "balance" && (
              <tr>
                {colTypes.flatMap((t) => [
                  <th key={`${t.id}a`} className="text-right">สิทธิ์</th>,
                  <th key={`${t.id}b`} className="text-right">ใช้</th>,
                  <th key={`${t.id}c`} className="text-right">เหลือ</th>,
                ])}
              </tr>
            )}
          </thead>
          <tbody>
            {data.emps.map((e) => (
              <tr key={e.id}>
                <td>{e.code}</td>
                <td>
                  {e.first_name} {e.last_name}
                </td>
                <td>{e.org_unit_name}</td>
                {colTypes.flatMap((t) => {
                  const u = used.get(`${e.id}|${t.id}`) ?? 0;
                  if (view === "used")
                    return [
                      <td key={t.id} className="num text-right">
                        {d(u)}
                      </td>,
                    ];
                  const b = balBy.get(`${e.id}|${t.id}`);
                  return [
                    <td key={`${t.id}a`} className="num text-right">{b ? d(Number(b.total_days)) : "-"}</td>,
                    <td key={`${t.id}b`} className="num text-right">{d(u)}</td>,
                    <td key={`${t.id}c`} className={`num text-right ${b && Number(b.total_days) - u < 0 ? "text-rust" : ""}`}>{b ? d(Number(b.total_days) - u) : "-"}</td>,
                  ];
                })}
                {view === "used" && <td className="num text-right font-semibold">{d(colTypes.reduce((s, t) => s + (used.get(`${e.id}|${t.id}`) ?? 0), 0))}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </ReportShell>
  );
}
