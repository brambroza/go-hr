"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpDown, ChevronLeft, ChevronRight, Download, Plus, Search, Upload, Users } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useCan } from "@/components/app/me-context";
import { Badge, Button, Empty, Input, PageHeader, Panel, Select, Spinner, clsx, toast } from "@/components/ui";
import { Avatar } from "@/components/employees/avatar";
import { NewEmployeeModal } from "@/components/employees/new-employee-modal";
import { useLookups } from "@/components/employees/use-lookups";
import { EMP_STATUS, EMP_STATUS_COLOR, EMP_TYPE, GENDER, serviceText, type Res } from "@/lib/employees/labels";
import { thDate } from "@/lib/format";
import { downloadCsv } from "@/lib/csv";

type Row = {
  id: number; code: string; prefix: string | null; first_name: string; last_name: string; nickname: string | null; gender: string | null;
  birth_date: string | null; status: string; employee_type: string; hire_date: string; resign_date: string | null;
  branch_id: number | null; org_unit_id: number | null; position_id: number | null; photo_url: string | null; email: string | null; phone: string | null;
  org_unit_name: string | null; position_name: string | null; branch_name: string | null; supervisor_name: string | null; service_years: number | null; age_years: number | null;
};

const PAGE = 30;
const COLS = "id, code, prefix, first_name, last_name, nickname, gender, birth_date, status, employee_type, hire_date, resign_date, branch_id, org_unit_id, position_id, photo_url, email, phone, org_unit_name, position_name, branch_name, supervisor_name, service_years, age_years";

export default function EmployeesPage() {
  const can = useCan();
  const router = useRouter();
  const lk = useLookups();
  const sb = supabaseBrowser();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [count, setCount] = useState(0);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [page, setPage] = useState(0);
  const [q, setQ] = useState("");
  const [f, setF] = useState({ status: "active", org: "", branch: "", position: "", type: "" });
  const [order, setOrder] = useState<{ col: string; asc: boolean }>({ col: "code", asc: true });
  const [creating, setCreating] = useState(false);
  const [exporting, setExporting] = useState(false);

  const build = useCallback(
    (withCount: boolean) => {
      let query = sb.from("v_employee_overview").select(COLS, withCount ? { count: "exact" } : undefined);
      if (f.status === "active") query = query.neq("status", "resigned");
      else if (f.status) query = query.eq("status", f.status);
      if (f.org) query = query.eq("org_unit_id", Number(f.org));
      if (f.branch) query = query.eq("branch_id", Number(f.branch));
      if (f.position) query = query.eq("position_id", Number(f.position));
      if (f.type) query = query.eq("employee_type", f.type);
      const t = q.trim().replace(/[%,()]/g, "");
      if (t) query = query.or(["code", "first_name", "last_name", "nickname", "phone", "email"].map((c) => `${c}.ilike.%${t}%`).join(","));
      return query.order(order.col, { ascending: order.asc, nullsFirst: false }).order("id");
    },
    [sb, f, q, order],
  );

  const load = useCallback(async () => {
    const { data, error, count } = await build(true).range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) toast.error(error.message);
    setRows((data as Row[]) ?? []);
    setCount(count ?? 0);
  }, [build, page]);

  useEffect(() => {
    const t = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  useEffect(() => {
    sb.from("v_employee_overview").select("status").limit(20000).then(({ data }: Res) => {
      const m: Record<string, number> = {};
      for (const r of (data as { status: string }[]) ?? []) m[r.status] = (m[r.status] ?? 0) + 1;
      setStatusCounts(m);
    });
  }, [sb]);

  const setFilter = (k: keyof typeof f, v: string) => {
    setF((x) => ({ ...x, [k]: v }));
    setPage(0);
  };

  async function exportCsv() {
    setExporting(true);
    const { data, error } = await build(false).range(0, 19999);
    setExporting(false);
    if (error) return toast.error(error.message);
    const list = (data as Row[]) ?? [];
    downloadCsv(`employees-${new Date().toISOString().slice(0, 10)}.csv`, [
      ["รหัส", "คำนำหน้า", "ชื่อ", "นามสกุล", "ชื่อเล่น", "เพศ", "วันเกิด", "ตำแหน่ง", "หน่วยงาน", "สาขา", "หัวหน้า", "ประเภท", "สถานะ", "วันเริ่มงาน", "อายุงาน (ปี)", "โทรศัพท์", "อีเมล"],
      ...list.map((r) => [r.code, r.prefix, r.first_name, r.last_name, r.nickname, GENDER[r.gender ?? ""] ?? "", r.birth_date, r.position_name, r.org_unit_name, r.branch_name, r.supervisor_name, EMP_TYPE[r.employee_type], EMP_STATUS[r.status], r.hire_date, r.service_years, r.phone, r.email]),
    ]);
    await sb.rpc("log_sensitive_view", { p_table: "employees", p_record: "export", p_field: `export ${list.length} rows` });
  }

  const pages = Math.max(1, Math.ceil(count / PAGE));
  const active = useMemo(() => Object.entries(statusCounts).filter(([k]) => k !== "resigned").reduce((a, [, v]) => a + v, 0), [statusCounts]);
  const filtered = q || f.org || f.branch || f.position || f.type || (f.status !== "active" && f.status !== "");


  return (
    <div>
      <PageHeader
        title="ข้อมูลพนักงาน"
        description={<>พนักงานปัจจุบัน <b className="num font-medium text-ink">{active.toLocaleString()}</b> คน · ทดลองงาน <span className="num">{statusCounts.probation ?? 0}</span> · ลาออกแล้ว <span className="num">{statusCounts.resigned ?? 0}</span></>}
        actions={
          <>
            {can("employee", "export") && <Button variant="secondary" icon={<Download className="size-4" />} onClick={exportCsv} loading={exporting}>ส่งออก CSV</Button>}
            {can("employee", "create") && (
              <>
                <Link href="/employees/import" className="inline-flex h-10 items-center gap-1.5 rounded-[var(--radius-ctl)] border border-line bg-white px-4 text-[15px] font-medium hover:border-jade-200 hover:bg-jade-50"><Upload className="size-4" />นำเข้า</Link>
                <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>เพิ่มพนักงาน</Button>
              </>
            )}
          </>
        }
      />
      <Panel
        bodyClass="p-0"
        footer={
          count > PAGE ? (
            <div className="flex items-center justify-between text-sm text-ink-soft">
              <span className="num">{page * PAGE + 1}–{Math.min(count, (page + 1) * PAGE)} จาก {count.toLocaleString()} คน</span>
              <div className="flex gap-1">
                <Button size="sm" variant="secondary" disabled={page === 0} onClick={() => setPage((p) => p - 1)} aria-label="หน้าก่อน"><ChevronLeft className="size-4" /></Button>
                <Button size="sm" variant="secondary" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)} aria-label="หน้าถัดไป"><ChevronRight className="size-4" /></Button>
              </div>
            </div>
          ) : null
        }
      >
        <div className="flex flex-wrap items-center gap-2 border-b border-line-soft px-3 py-2.5">
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-mute" />
            <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="ชื่อ ชื่อเล่น รหัส เบอร์โทร" className="h-9 pl-8 text-sm" aria-label="ค้นหาพนักงาน" />
          </div>
          <Select className="h-9 sm:w-auto text-sm" value={f.status} onChange={(e) => setFilter("status", e.target.value)} aria-label="สถานะ">
            <option value="active">ปัจจุบัน (ไม่รวมลาออก)</option>
            {Object.entries(EMP_STATUS).map(([k, l]) => <option key={k} value={k}>{l}{statusCounts[k] ? ` (${statusCounts[k]})` : ""}</option>)}
            <option value="">ทุกสถานะ</option>
          </Select>
          <Select className="h-9 text-sm sm:w-auto sm:max-w-48" value={f.org} onChange={(e) => setFilter("org", e.target.value)} placeholder="หน่วยงาน: ทั้งหมด" aria-label="หน่วยงาน">
            {lk.orgs.map((o) => <option key={o.id} value={o.id}>{"— ".repeat((o.level ?? 1) - 1)}{o.name}</option>)}
          </Select>
          {lk.branches.length > 1 && (
            <Select className="h-9 text-sm sm:w-auto sm:max-w-44" value={f.branch} onChange={(e) => setFilter("branch", e.target.value)} placeholder="สาขา: ทั้งหมด" aria-label="สาขา">
              {lk.branches.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </Select>
          )}
          <Select className="h-9 text-sm sm:w-auto sm:max-w-48" value={f.position} onChange={(e) => setFilter("position", e.target.value)} placeholder="ตำแหน่ง: ทั้งหมด" aria-label="ตำแหน่ง">
            {lk.positions.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </Select>
          <Select className="h-9 sm:w-auto text-sm" value={f.type} onChange={(e) => setFilter("type", e.target.value)} placeholder="ประเภท: ทั้งหมด" aria-label="ประเภทพนักงาน">
            {Object.entries(EMP_TYPE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
          {filtered && (
            <button type="button" className="text-sm text-jade-700 hover:underline" onClick={() => { setQ(""); setF({ status: "active", org: "", branch: "", position: "", type: "" }); setPage(0); }}>
              ล้างตัวกรอง
            </button>
          )}
          <span className="num ml-auto text-sm text-ink-mute">{count.toLocaleString()} คน</span>
        </div>

        {!rows ? (
          <div className="py-16"><Spinner className="mx-auto" /></div>
        ) : rows.length === 0 ? (
          <Empty
            icon={<Users className="size-8" />}
            title={filtered ? "ไม่พบพนักงานที่ตรงกับเงื่อนไข" : "ยังไม่มีพนักงาน"}
            description={filtered ? "ลองเปลี่ยนคำค้นหาหรือล้างตัวกรอง" : "เพิ่มพนักงานทีละคน หรือนำเข้าจากไฟล์ CSV"}
            action={!filtered && can("employee", "create") ? <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>เพิ่มพนักงาน</Button> : undefined}
          />
        ) : (
          <>
            {/* phone: cards */}
            <ul className="divide-y divide-line-soft md:hidden">
              {rows.map((r) => (
                <li key={r.id}>
                  <Link href={`/employees/${r.id}`} className="flex items-center gap-3 px-4 py-3 active:bg-jade-50">
                    <Avatar src={r.photo_url} name={`${r.first_name} ${r.last_name}`} size={44} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{r.first_name} {r.last_name}{r.nickname && <span className="font-normal text-ink-mute"> ({r.nickname})</span>}</div>
                      <div className="truncate text-sm text-ink-soft">{r.position_name ?? "-"}</div>
                      <div className="truncate text-xs text-ink-mute">{r.code} · {r.org_unit_name ?? "-"}</div>
                    </div>
                    <Badge color={EMP_STATUS_COLOR[r.status]}>{EMP_STATUS[r.status]}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
            {/* desktop: table */}
            <div className="thin-scroll hidden overflow-x-auto md:block">
              <table className="w-full text-[14px]">
                <thead>
                  <tr className="border-b border-line bg-paper/60 text-left text-[13px] text-ink-soft">
                    <Th order={order} setOrder={setOrder} col="code">รหัส</Th>
                    <Th order={order} setOrder={setOrder} col="first_name">ชื่อ-นามสกุล</Th>
                    <Th order={order} setOrder={setOrder} col="position_name">ตำแหน่ง</Th>
                    <Th order={order} setOrder={setOrder} col="org_unit_name">หน่วยงาน</Th>
                    <Th order={order} setOrder={setOrder} col="employee_type">ประเภท</Th>
                    <Th order={order} setOrder={setOrder} col="hire_date">วันเริ่มงาน</Th>
                    <Th order={order} setOrder={setOrder}>อายุงาน</Th>
                    <Th order={order} setOrder={setOrder} col="status">สถานะ</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="cursor-pointer border-b border-line-soft last:border-0 hover:bg-jade-50/40" onClick={() => router.push(`/employees/${r.id}`)}>
                      <td className="num whitespace-nowrap px-3 py-2 text-ink-soft">{r.code}</td>
                      <td className="px-3 py-2">
                        <Link href={`/employees/${r.id}`} className="flex items-center gap-2.5 whitespace-nowrap hover:text-jade-800" onClick={(e) => e.stopPropagation()}>
                          <Avatar src={r.photo_url} name={`${r.first_name} ${r.last_name}`} size={30} />
                          <span>
                            {r.first_name} {r.last_name}
                            {r.nickname && <span className="text-ink-mute"> ({r.nickname})</span>}
                          </span>
                        </Link>
                      </td>
                      <td className="px-3 py-2">{r.position_name ?? <span className="text-ink-mute">-</span>}</td>
                      <td className="px-3 py-2">{r.org_unit_name ?? <span className="text-ink-mute">-</span>}{r.branch_name && lk.branches.length > 1 && <div className="text-xs text-ink-mute">{r.branch_name}</div>}</td>
                      <td className="whitespace-nowrap px-3 py-2">{EMP_TYPE[r.employee_type]}</td>
                      <td className="num whitespace-nowrap px-3 py-2">{thDate(r.hire_date)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-ink-soft">{serviceText(r.hire_date, r.resign_date)}</td>
                      <td className="px-3 py-2"><Badge color={EMP_STATUS_COLOR[r.status]}>{EMP_STATUS[r.status]}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Panel>
      <NewEmployeeModal open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

type Order = { col: string; asc: boolean };
function Th({ col, children, className, order, setOrder }: { col?: string; children: React.ReactNode; className?: string; order: Order; setOrder: React.Dispatch<React.SetStateAction<Order>> }) {
  return (
    <th className={clsx("whitespace-nowrap px-3 py-2 font-medium", className)} aria-sort={col && order.col === col ? (order.asc ? "ascending" : "descending") : undefined}>
      {col ? (
        <button className="inline-flex items-center gap-1 hover:text-ink" onClick={() => setOrder((o) => ({ col, asc: o.col === col ? !o.asc : true }))}>
          {children}
          <ArrowUpDown className={clsx("size-3", order.col === col ? "text-jade-600" : "text-ink-mute")} />
        </button>
      ) : (
        children
      )}
    </th>
  );
}
