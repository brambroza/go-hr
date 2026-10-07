"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Search } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useCan } from "@/components/app/me-context";
import { Badge, Button, Empty, Field, Input, Modal, PageHeader, Panel, Select, Spinner, toast } from "@/components/ui";
import { addDays, isoDate, thDateTime } from "@/lib/format";
import { downloadCsv } from "@/lib/csv";

type Log = { id: number; at: string; user_id: string | null; user_name: string | null; action: string; table_name: string | null; record_id: string | null; old_data: Record<string, unknown> | null; new_data: Record<string, unknown> | null; ip: string | null; note: string | null };

export const TABLE_TH: Record<string, string> = {
  announcement_reads: "การอ่านประกาศ", announcements: "ประกาศข่าวสาร", applicant_activities: "กิจกรรมผู้สมัคร", applicants: "ผู้สมัครงาน", approval_flows: "ลำดับการอนุมัติ",
  attendance_days: "ผลคำนวณเวลารายวัน", automation_rules: "กฎ Automation", branches: "สาขา", career_paths: "เส้นทางการเติบโต", commission_entries: "ค่าคอมมิชชั่น",
  commission_plans: "แผนค่าคอมมิชชั่น", course_enrollments: "การลงทะเบียนหลักสูตร", course_lessons: "บทเรียน", courses: "หลักสูตร", device_user_maps: "ผูกรหัสเครื่องสแกน",
  employee_addresses: "ที่อยู่พนักงาน", employee_assets: "ทรัพย์สินที่มอบให้พนักงาน", employee_documents: "เอกสารพนักงาน", employee_education: "ประวัติการศึกษา",
  employee_faces: "ข้อมูลใบหน้า", employee_family: "ข้อมูลครอบครัว", employee_funds: "กองทุนพนักงาน", employee_guarantees: "เงินค้ำประกัน", employee_kpis: "KPI พนักงาน",
  employee_loans: "เงินกู้พนักงาน", employee_movements: "โอนย้าย/แต่งตั้ง", employee_pay_items: "รายรับรายจ่ายประจำ", employee_private: "ข้อมูลอ่อนไหว (เงินเดือน/บัญชี)",
  employee_skills: "ทักษะ", employee_tax_deductions: "ค่าลดหย่อนภาษี", employee_trainings: "ประวัติการอบรม", employee_work_history: "ประวัติการทำงาน", employees: "ข้อมูลพนักงาน",
  eval_assignments: "ผู้ประเมิน", eval_cycles: "รอบการประเมิน", eval_forms: "แบบประเมิน", eval_results: "ผลการประเมิน", feed_posts: "โพสต์ News Feed",
  holidays: "วันหยุด", interviews: "นัดสัมภาษณ์", job_postings: "ประกาศรับสมัครงาน", kpi_items: "รายการ KPI", kpi_profiles: "KPI Profile", leave_quotas: "โควต้าวันลา",
  leave_types: "ประเภทการลา", library_items: "คลังความรู้", loan_payments: "ชำระเงินกู้", manpower_plans: "แผนกำลังพล", org_units: "หน่วยงาน", pay_item_groups: "กลุ่มรายรับรายจ่าย",
  pay_items: "ประเภทรายรับรายจ่าย", payroll_adjustments: "ปรับปรุงเงินเดือน", payroll_entries: "รายการเงินเดือน", payroll_entry_items: "รายละเอียดเงินเดือน", payroll_periods: "งวดเงินเดือน",
  policies: "นโยบายบริษัท", policy_acks: "การรับทราบนโยบาย", positions: "ตำแหน่งงาน", probation_evaluations: "ประเมินทดลองงาน", profiles: "ผู้ใช้งาน", request_approvals: "ขั้นตอนอนุมัติ",
  request_types: "ประเภทเอกสาร", requests: "เอกสาร/คำขอ", role_groups: "กลุ่มผู้ใช้และสิทธิ์", salary_advances: "เบิกเงินล่วงหน้า", salary_history: "ประวัติเงินเดือน",
  scheduled_jobs: "ตั้งค่าเวลารันคำสั่ง", settings: "ตั้งค่าระบบ", shifts: "กะการทำงาน", special_workdays: "วันทำงานพิเศษ", team_members: "สมาชิกทีม", teams: "ทีมงาน",
  time_devices: "อุปกรณ์ลงเวลา", time_logs: "บันทึกเวลา", todos: "To-do", training_attendees: "ผู้เข้าอบรม", training_sessions: "รอบอบรม", warning_letters: "จดหมายเตือน",
  welfare_types: "ประเภทสวัสดิการ", work_locations: "พื้นที่ลงเวลา", work_schedules: "ตารางกะ", audit_logs: "Back Log",
};
const ACTIONS: Record<string, { label: string; color: string }> = {
  INSERT: { label: "เพิ่ม", color: "green" }, UPDATE: { label: "แก้ไข", color: "blue" }, DELETE: { label: "ลบ", color: "red" },
  LOGIN: { label: "เข้าสู่ระบบ", color: "gray" }, VIEW_SENSITIVE: { label: "ดูข้อมูลอ่อนไหว", color: "amber" }, EXPORT: { label: "ดาวน์โหลด", color: "violet" },
};
const HIDE = new Set(["updated_at", "created_at", "calculated_at"]);
const PAGE = 50;

function fmt(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
/** changed fields only (UPDATE) or all non-empty fields (INSERT / DELETE) */
export function diffFields(oldD: Record<string, unknown> | null, newD: Record<string, unknown> | null): { key: string; from: unknown; to: unknown }[] {
  const keys = [...new Set([...Object.keys(oldD ?? {}), ...Object.keys(newD ?? {})])].filter((k) => !HIDE.has(k));
  const out: { key: string; from: unknown; to: unknown }[] = [];
  for (const k of keys) {
    const a = oldD?.[k];
    const b = newD?.[k];
    if (oldD && newD) {
      if (JSON.stringify(a) !== JSON.stringify(b)) out.push({ key: k, from: a, to: b });
    } else if ((a ?? b) !== null && (a ?? b) !== undefined && (a ?? b) !== "") out.push({ key: k, from: a, to: b });
  }
  return out;
}

export function AuditLog() {
  const sb = supabaseBrowser();
  const can = useCan();
  const [from, setFrom] = useState(addDays(isoDate(), -7));
  const [to, setTo] = useState(isoDate());
  const [action, setAction] = useState("");
  const [table, setTable] = useState("");
  const [user, setUser] = useState("");
  const [q, setQ] = useState("");
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);
  const [rows, setRows] = useState<Log[] | null>(null);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<Log | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    sb.from("profiles").select("id, display_name, username").order("username").limit(2000).then(({ data }: { data: { id: string; display_name: string | null; username: string | null }[] | null }) =>
      setUsers((data ?? []).map((p) => ({ id: p.id, name: p.display_name || p.username || p.id.slice(0, 8) }))),
    );
  }, [sb]);

  const build = useCallback(
    (withCount: boolean) => {
      let qb = sb.from("audit_logs").select("*", withCount ? { count: "exact" } : undefined)
        .gte("at", new Date(from + "T00:00:00+07:00").toISOString()).lt("at", new Date(addDays(to, 1) + "T00:00:00+07:00").toISOString());
      if (action) qb = qb.eq("action", action);
      if (table) qb = qb.eq("table_name", table);
      if (user) qb = qb.eq("user_id", user);
      const t = q.trim().replace(/[%,()]/g, "");
      if (t) qb = qb.or(`record_id.eq.${t},note.ilike.%${t}%,user_name.ilike.%${t}%`);
      return qb.order("id", { ascending: false });
    },
    [sb, from, to, action, table, user, q],
  );

  useEffect(() => {
    setPage(0);
  }, [from, to, action, table, user, q]);

  useEffect(() => {
    let alive = true;
    setRows(null);
    const t = setTimeout(async () => {
      const { data, error, count: c } = await build(true).range(page * PAGE, page * PAGE + PAGE - 1);
      if (!alive) return;
      if (error) toast.error(error.message);
      setRows((data ?? []) as Log[]);
      setCount(c ?? 0);
    }, q ? 300 : 0);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [build, page, q]);

  const exportCsv = async () => {
    setExporting(true);
    const all: Log[] = [];
    for (let i = 0; i < 20; i++) {
      const { data, error } = await build(false).range(i * 1000, i * 1000 + 999);
      if (error) {
        setExporting(false);
        return toast.error(error.message);
      }
      all.push(...((data ?? []) as Log[]));
      if (!data || data.length < 1000) break;
    }
    downloadCsv(`backlog-${from}-${to}.csv`, [
      ["เวลา", "ผู้ใช้", "การกระทำ", "ตาราง", "รหัสรายการ", "ฟิลด์ที่เปลี่ยน", "หมายเหตุ", "IP"],
      ...all.map((l) => [thDateTime(l.at), l.user_name ?? "ระบบ", ACTIONS[l.action]?.label ?? l.action, TABLE_TH[l.table_name ?? ""] ?? l.table_name ?? "", l.record_id ?? "",
        diffFields(l.old_data, l.new_data).map((d) => (l.action === "UPDATE" ? `${d.key}: ${fmt(d.from)} → ${fmt(d.to)}` : d.key)).join("; ").slice(0, 2000), l.note ?? "", l.ip ?? ""]),
    ]);
    await sb.rpc("log_export", { p_table: "audit_logs", p_note: `ดาวน์โหลด Back Log ${from} ถึง ${to} (${all.length} รายการ)` });
    setExporting(false);
    if (all.length >= 20000) toast.info("ดาวน์โหลดได้สูงสุด 20,000 รายการต่อครั้ง กรุณาจำกัดช่วงวันที่");
  };

  const tables = useMemo(() => Object.entries(TABLE_TH).sort((a, b) => a[1].localeCompare(b[1], "th")), []);
  const userName = (l: Log) => l.user_name ?? (l.user_id ? users.find((u) => u.id === l.user_id)?.name : null) ?? "ระบบ";

  return (
    <div>
      <PageHeader title="Back Log" description="ประวัติการใช้งานระบบ: การเพิ่ม แก้ไข ลบข้อมูล การเข้าสู่ระบบ การเปิดดูข้อมูลอ่อนไหว และการดาวน์โหลดข้อมูล"
        actions={can("audit", "export") && <Button variant="secondary" icon={<Download className="size-4" />} loading={exporting} onClick={exportCsv}>ดาวน์โหลด CSV</Button>} />
      <Panel className="mb-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <Field label="ตั้งแต่"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} max={to} /></Field>
          <Field label="ถึง"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} min={from} /></Field>
          <Field label="ผู้ใช้"><Select value={user} onChange={(e) => setUser(e.target.value)} placeholder="ทุกคน">{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Field>
          <Field label="การกระทำ"><Select value={action} onChange={(e) => setAction(e.target.value)} placeholder="ทั้งหมด">{Object.entries(ACTIONS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select></Field>
          <Field label="ข้อมูล"><Select value={table} onChange={(e) => setTable(e.target.value)} placeholder="ทุกตาราง">{tables.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
          <Field label="ค้นหา">
            <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-mute" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="รหัสรายการ / หมายเหตุ" className="pl-9" /></div>
          </Field>
        </div>
      </Panel>
      <Panel bodyClass="p-0" footer={
        <div className="flex items-center justify-between text-sm text-ink-soft">
          <span className="num">{count.toLocaleString("th-TH")} รายการ</span>
          <span className="flex items-center gap-2">
            <Button variant="ghost" size="sm" icon={<ChevronLeft className="size-4" />} disabled={page === 0} onClick={() => setPage((p) => p - 1)} aria-label="หน้าก่อน" />
            <span className="num">หน้า {page + 1} / {Math.max(1, Math.ceil(count / PAGE))}</span>
            <Button variant="ghost" size="sm" icon={<ChevronRight className="size-4" />} disabled={(page + 1) * PAGE >= count} onClick={() => setPage((p) => p + 1)} aria-label="หน้าถัดไป" />
          </span>
        </div>
      }>
        {!rows ? <div className="flex justify-center py-12"><Spinner /></div> : !rows.length ? <Empty title="ไม่พบประวัติในช่วงที่เลือก" description="ลองขยายช่วงวันที่หรือล้างตัวกรอง" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-[14px]">
              <thead className="text-left text-sm text-ink-soft"><tr className="border-b border-line-soft">
                <th className="px-4 py-2 font-medium">เวลา</th><th className="px-3 py-2 font-medium">ผู้ใช้</th><th className="px-3 py-2 font-medium">การกระทำ</th><th className="px-3 py-2 font-medium">ข้อมูล</th><th className="px-4 py-2 font-medium">รายละเอียด</th>
              </tr></thead>
              <tbody>
                {rows.map((l) => {
                  const d = diffFields(l.old_data, l.new_data);
                  return (
                    <tr key={l.id} onClick={() => setOpen(l)} className="cursor-pointer border-b border-line-soft last:border-0 hover:bg-jade-50/40">
                      <td className="whitespace-nowrap px-4 py-2 text-ink-soft">{thDateTime(l.at)}</td>
                      <td className="px-3 py-2">{userName(l)}</td>
                      <td className="px-3 py-2"><Badge color={ACTIONS[l.action]?.color ?? "gray"}>{ACTIONS[l.action]?.label ?? l.action}</Badge></td>
                      <td className="px-3 py-2">{TABLE_TH[l.table_name ?? ""] ?? l.table_name ?? "-"} {l.record_id && <span className="text-xs text-ink-mute">#{l.record_id.length > 12 ? l.record_id.slice(0, 8) + "…" : l.record_id}</span>}</td>
                      <td className="max-w-md px-4 py-2 text-ink-soft">
                        <span className="line-clamp-1">
                          {l.action === "UPDATE" ? d.slice(0, 3).map((x) => `${x.key}: ${fmt(x.from).slice(0, 30)} → ${fmt(x.to).slice(0, 30)}`).join(" · ") + (d.length > 3 ? ` (+${d.length - 3})` : "") : l.note ?? (d.length ? `${d.length} ฟิลด์` : "")}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      {open && (
        <Modal open onClose={() => setOpen(null)} size="lg" title={`${ACTIONS[open.action]?.label ?? open.action} · ${TABLE_TH[open.table_name ?? ""] ?? open.table_name ?? ""}`}>
          <dl className="mb-3 grid grid-cols-[8rem_1fr] gap-y-1 text-sm">
            <dt className="text-ink-soft">เวลา</dt><dd>{thDateTime(open.at)}</dd>
            <dt className="text-ink-soft">ผู้ใช้</dt><dd>{userName(open)}</dd>
            <dt className="text-ink-soft">รหัสรายการ</dt><dd className="break-all">{open.record_id ?? "-"}</dd>
            {open.note && (<><dt className="text-ink-soft">หมายเหตุ</dt><dd>{open.note}</dd></>)}
            {open.ip && (<><dt className="text-ink-soft">IP</dt><dd>{open.ip}</dd></>)}
          </dl>
          {(() => {
            const d = diffFields(open.old_data, open.new_data);
            if (!d.length) return <p className="text-sm text-ink-mute">ไม่มีรายละเอียดข้อมูล</p>;
            return (
              <table className="w-full table-fixed text-sm">
                <thead className="text-left text-ink-soft"><tr className="border-b border-line-soft"><th className="w-40 py-1.5 font-medium">ฟิลด์</th>{open.old_data && <th className="py-1.5 font-medium">ค่าเดิม</th>}{open.new_data && <th className="py-1.5 font-medium">ค่าใหม่</th>}</tr></thead>
                <tbody>
                  {d.map((x) => (
                    <tr key={x.key} className="border-b border-line-soft align-top last:border-0">
                      <td className="py-1.5 pr-2 font-mono text-xs text-ink-soft">{x.key}</td>
                      {open.old_data && <td className="break-words py-1.5 pr-2 text-rust/90">{fmt(x.from)}</td>}
                      {open.new_data && <td className="break-words py-1.5 text-jade-800">{fmt(x.to)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            );
          })()}
        </Modal>
      )}
    </div>
  );
}
