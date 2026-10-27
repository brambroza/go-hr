"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarClock, Play, Plus, Search, XCircle } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useCan } from "@/components/app/me-context";
import { Badge, Button, Empty, Field, Input, Modal, PageHeader, Panel, Select, Spinner, Textarea, toast, useConfirm, clsx } from "@/components/ui";
import { EmployeePicker, type EmpOption } from "@/components/crud/employee-picker";
import { humanError } from "@/components/crud/crud-page";
import { Avatar } from "@/components/employees/avatar";
import { EMP_STATUS, EMP_TYPE, MOVEMENT_STATUS, MOVEMENT_STATUS_COLOR, MOVEMENT_TYPE, statusOptions, typeOptions, type Res } from "@/lib/employees/labels";
import { isoDate, money, thDate } from "@/lib/format";

type Mv = {
  id: number; doc_no: string | null; employee_id: number; movement_type: string; effective_date: string;
  new_branch_id: number | null; new_org_unit_id: number | null; new_position_id: number | null; new_supervisor_id: number | null;
  new_employee_type: string | null; new_status: string | null; new_salary: number | null; old_snapshot: Record<string, unknown> | null;
  reason: string | null; status: string; applied_at: string | null; created_at: string;
};
type Emp = { id: number; code: string; first_name: string; last_name: string; nickname: string | null; photo_url: string | null; branch_id: number | null; org_unit_id: number | null; position_id: number | null; supervisor_id: number | null; employee_type: string; status: string };
type Lookup = Record<number, string>;

const PAGE = 30;

export default function MovementsPage() {
  const can = useCan();
  const canEdit = can("employee", "edit");
  const canSalary = can("employee_private", "edit");
  const canSeeSalary = can("employee_private", "view");
  const sb = supabaseBrowser();
  const { confirm, dialog } = useConfirm();

  const [rows, setRows] = useState<Mv[] | null>(null);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(0);
  const [status, setStatus] = useState("open");
  const [type, setType] = useState("");
  const [q, setQ] = useState("");
  const [emps, setEmps] = useState<Map<number, Emp>>(new Map());
  const [lk, setLk] = useState<{ branch: Lookup; org: Lookup; pos: Lookup }>({ branch: {}, org: {}, pos: {} });
  const [current, setCurrent] = useState<Map<number, number>>(new Map()); // current salaries (if visible)
  const [creating, setCreating] = useState(false);
  const [applying, setApplying] = useState(false);
  const [dueCount, setDueCount] = useState(0);

  useEffect(() => {
    Promise.all([
      sb.from("employees").select("id, code, first_name, last_name, nickname, photo_url, branch_id, org_unit_id, position_id, supervisor_id, employee_type, status").order("code").limit(10000),
      sb.from("branches").select("id, name"),
      sb.from("org_units").select("id, name"),
      sb.from("positions").select("id, name"),
    ]).then(([e, b, o, p]) => {
      setEmps(new Map(((e.data as Emp[]) ?? []).map((x) => [x.id, x])));
      const toMap = (d: unknown) => Object.fromEntries(((d as { id: number; name: string }[]) ?? []).map((x) => [x.id, x.name]));
      setLk({ branch: toMap(b.data), org: toMap(o.data), pos: toMap(p.data) });
    });
    if (canSeeSalary)
      sb.from("employee_private").select("employee_id, salary").limit(10000).then(({ data }: Res) => setCurrent(new Map(((data as { employee_id: number; salary: number }[]) ?? []).map((x) => [x.employee_id, Number(x.salary)]))));
  }, [sb, canSeeSalary]);

  const load = useCallback(async () => {
    let query = sb.from("employee_movements").select("*", { count: "exact" });
    if (status === "open") query = query.in("status", ["draft", "pending", "approved"]);
    else if (status) query = query.eq("status", status);
    if (type) query = query.eq("movement_type", type);
    const term = q.trim().toLowerCase();
    if (term) {
      const ids = [...emps.values()].filter((e) => `${e.code} ${e.first_name} ${e.last_name} ${e.nickname ?? ""}`.toLowerCase().includes(term)).map((e) => e.id);
      query = query.in("employee_id", ids.length ? ids : [-1]);
    }
    const { data, error, count } = await query.order("effective_date", { ascending: status !== "applied" }).order("id", { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) toast.error(error.message);
    setRows((data as Mv[]) ?? []);
    setCount(count ?? 0);
    const due = await sb.from("employee_movements").select("id", { count: "exact", head: true }).in("status", ["pending", "approved"]).lte("effective_date", isoDate());
    setDueCount(due.count ?? 0);
  }, [sb, status, type, q, page, emps]);

  useEffect(() => {
    const t = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  async function applyNow() {
    if (!(await confirm(<>นำรายการที่ถึงวันมีผลแล้ว <b className="num">{dueCount}</b> รายการไปใช้กับข้อมูลพนักงานตอนนี้? ระบบจะบันทึกข้อมูลก่อนเปลี่ยนไว้ในรายการ</>, { confirmText: "นำไปใช้ตอนนี้" }))) return;
    setApplying(true);
    const { data, error } = await sb.rpc("apply_movements", { p_until: isoDate() });
    setApplying(false);
    if (error) return toast.error(humanError(error));
    toast.ok(`นำไปใช้แล้ว ${data ?? 0} รายการ`);
    load();
  }

  async function cancel(m: Mv) {
    if (!(await confirm(`ยกเลิกรายการ ${m.doc_no ?? ""} (${MOVEMENT_TYPE[m.movement_type]}) ใช่หรือไม่?`, { danger: true, confirmText: "ยกเลิกรายการ" }))) return;
    const { error } = await sb.from("employee_movements").update({ status: "cancelled" }).eq("id", m.id);
    if (error) return toast.error(humanError(error));
    toast.ok("ยกเลิกรายการแล้ว");
    load();
  }

  const name = (id: number | null | undefined) => {
    if (id == null) return "-";
    const e = emps.get(Number(id));
    return e ? `${e.first_name} ${e.last_name}` : `#${id}`;
  };

  function changes(m: Mv): { label: string; from: string; to: string }[] {
    const snap = m.old_snapshot as Record<string, unknown> | null;
    const e = emps.get(m.employee_id);
    const before = (k: keyof Emp) => (snap ? (snap[k] as unknown) : m.status === "applied" ? undefined : e?.[k]);
    const out: { label: string; from: string; to: string }[] = [];
    const add = (label: string, from: unknown, to: unknown, fmt: (v: unknown) => string) => {
      if (to == null || to === "") return;
      out.push({ label, from: from == null || from === "" ? "-" : fmt(from), to: fmt(to) });
    };
    add("สาขา", before("branch_id"), m.new_branch_id, (v) => lk.branch[Number(v)] ?? String(v));
    add("หน่วยงาน", before("org_unit_id"), m.new_org_unit_id, (v) => lk.org[Number(v)] ?? String(v));
    add("ตำแหน่ง", before("position_id"), m.new_position_id, (v) => lk.pos[Number(v)] ?? String(v));
    add("หัวหน้า", before("supervisor_id"), m.new_supervisor_id, (v) => name(Number(v)));
    add("ประเภท", before("employee_type"), m.new_employee_type, (v) => EMP_TYPE[String(v)] ?? String(v));
    const impliedStatus = m.movement_type === "confirm" ? "permanent" : m.movement_type === "resign" ? "resigned" : m.movement_type === "rehire" ? "probation" : m.new_status;
    add("สถานะ", before("status"), impliedStatus, (v) => EMP_STATUS[String(v)] ?? String(v));
    if (m.new_salary != null && canSeeSalary) {
      const old = snap ? (snap.salary as number | null) : current.get(m.employee_id);
      add("เงินเดือน", old, m.new_salary, (v) => money(v as number));
    }
    return out;
  }

  const pages = Math.max(1, Math.ceil(count / PAGE));
  const today = isoDate();

  return (
    <div>
      <PageHeader
        title="โอนย้าย / แต่งตั้ง / ปรับโครงสร้าง"
        description="บันทึกการเปลี่ยนแปลงล่วงหน้า ระบบจะนำไปใช้เมื่อถึงวันมีผล (อัตโนมัติทุกคืน หรือกด “นำไปใช้ตอนนี้”)"
        actions={
          canEdit && (
            <>
              <Button variant="secondary" icon={<Play className="size-4" />} onClick={applyNow} loading={applying} disabled={!dueCount}>
                นำไปใช้ตอนนี้{dueCount ? <span className="num ml-1 rounded-full bg-amber-50 px-1.5 text-xs text-amber-ink">{dueCount}</span> : null}
              </Button>
              <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
                สร้างรายการ
              </Button>
            </>
          )
        }
      />

      <Panel
        bodyClass="p-0"
        footer={
          count > PAGE ? (
            <div className="flex items-center justify-between text-sm text-ink-soft">
              <span className="num">{page * PAGE + 1}–{Math.min(count, (page + 1) * PAGE)} จาก {count}</span>
              <div className="flex gap-1">
                <Button size="sm" variant="secondary" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>ก่อนหน้า</Button>
                <Button size="sm" variant="secondary" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>ถัดไป</Button>
              </div>
            </div>
          ) : null
        }
      >
        <div className="flex flex-wrap items-center gap-2 border-b border-line-soft px-3 py-2.5">
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-mute" />
            <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="ค้นหาชื่อหรือรหัสพนักงาน" className="h-9 pl-8 text-sm" aria-label="ค้นหา" />
          </div>
          <Select className="h-9 sm:w-auto text-sm" value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }} aria-label="สถานะ">
            <option value="open">ยังไม่มีผล</option>
            <option value="applied">มีผลแล้ว</option>
            <option value="cancelled">ยกเลิก</option>
            <option value="">ทุกสถานะ</option>
          </Select>
          <Select className="h-9 sm:w-auto text-sm" value={type} onChange={(e) => { setType(e.target.value); setPage(0); }} placeholder="ประเภท: ทั้งหมด" aria-label="ประเภท">
            {Object.entries(MOVEMENT_TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          <span className="num ml-auto text-sm text-ink-mute">{count} รายการ</span>
        </div>
        {!rows ? (
          <div className="py-16"><Spinner className="mx-auto" /></div>
        ) : rows.length === 0 ? (
          <Empty icon={<CalendarClock className="size-8" />} title={q || type ? "ไม่พบรายการที่ตรงกับเงื่อนไข" : status === "open" ? "ไม่มีรายการที่รอมีผล" : "ยังไม่มีรายการ"} action={canEdit && !q ? <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>สร้างรายการ</Button> : undefined} />
        ) : (
          <ul className="divide-y divide-line-soft">
            {rows.map((m) => {
              const e = emps.get(m.employee_id);
              const ch = changes(m);
              const due = ["pending", "approved"].includes(m.status) && m.effective_date <= today;
              return (
                <li key={m.id} className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(220px,1fr)_2fr_auto] md:items-center">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar src={e?.photo_url} name={name(m.employee_id)} size={38} />
                    <div className="min-w-0">
                      <Link href={`/employees/${m.employee_id}`} className="block truncate text-[14px] font-medium hover:text-jade-700 hover:underline">{name(m.employee_id)}</Link>
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-ink-mute">
                        <span>{e?.code}</span>·<span>{m.doc_no ?? `#${m.id}`}</span>
                      </div>
                    </div>
                  </div>
                  <div className="min-w-0">
                    <div className="mb-1 flex flex-wrap items-center gap-2 text-sm">
                      <Badge color="violet">{MOVEMENT_TYPE[m.movement_type] ?? m.movement_type}</Badge>
                      <span className={clsx("num", due ? "font-medium text-amber-ink" : "text-ink-soft")}>มีผล {thDate(m.effective_date)}</span>
                      <Badge color={MOVEMENT_STATUS_COLOR[m.status]}>{MOVEMENT_STATUS[m.status]}</Badge>
                      {due && <Badge color="amber">ถึงวันมีผลแล้ว</Badge>}
                    </div>
                    {ch.length ? (
                      <ul className="flex flex-col gap-0.5 text-[13px]">
                        {ch.map((c) => (
                          <li key={c.label} className="flex flex-wrap items-center gap-1.5">
                            <span className="w-16 shrink-0 text-ink-mute">{c.label}</span>
                            <span className="text-ink-soft line-through decoration-ink-mute/40">{c.from}</span>
                            <ArrowRight className="size-3.5 text-jade-600" aria-label="เป็น" />
                            <span className="font-medium text-ink">{c.to}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-[13px] text-ink-mute">{m.new_salary != null && !canSeeSalary ? "ปรับเงินเดือน (ไม่มีสิทธิ์ดูจำนวนเงิน)" : "ไม่มีการเปลี่ยนแปลงข้อมูล"}</p>
                    )}
                    {m.reason && <p className="mt-1 text-[13px] text-ink-soft">เหตุผล: {m.reason}</p>}
                  </div>
                  <div className="flex justify-end">
                    {canEdit && ["draft", "pending", "approved"].includes(m.status) && (
                      <Button size="sm" variant="ghost" icon={<XCircle className="size-4" />} onClick={() => cancel(m)}>
                        ยกเลิก
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
      <CreateMovement open={creating} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); load(); }} emps={emps} lk={lk} canSalary={canSalary} current={current} />
      {dialog}
    </div>
  );
}

function CreateMovement({ open, onClose, onSaved, emps, lk, canSalary, current }: { open: boolean; onClose: () => void; onSaved: () => void; emps: Map<number, Emp>; lk: { branch: Lookup; org: Lookup; pos: Lookup }; canSalary: boolean; current: Map<number, number> }) {
  const sb = supabaseBrowser();
  const blank = { employee_id: null as number | null, movement_type: "transfer", effective_date: isoDate(), new_branch_id: "", new_org_unit_id: "", new_position_id: "", new_supervisor_id: null as number | null, new_employee_type: "", new_status: "", new_salary: "", reason: "" };
  const [v, setV] = useState(blank);
  const [err, setErr] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount / reset form when opened
      setV(blank);
      setErr({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const empOpts: EmpOption[] = useMemo(() => [...emps.values()].map((e) => ({ value: e.id, label: `${e.first_name} ${e.last_name}${e.nickname ? ` (${e.nickname})` : ""}`, raw: e as unknown as Record<string, unknown> })), [emps]);
  const activeOpts = useMemo(() => empOpts.filter((o) => (v.movement_type === "rehire" ? o.raw?.status === "resigned" : o.raw?.status !== "resigned")), [empOpts, v.movement_type]);
  const e = v.employee_id ? emps.get(v.employee_id) : undefined;
  const set = (k: keyof typeof blank, val: unknown) => setV((x) => ({ ...x, [k]: val }));
  const t = v.movement_type;
  const show = {
    org: ["transfer", "promote", "demote", "appoint", "rehire"].includes(t),
    pos: ["transfer", "promote", "demote", "appoint", "rehire"].includes(t),
    type: ["transfer", "appoint", "status_change", "rehire", "confirm"].includes(t),
    status: t === "status_change",
    salary: canSalary && ["promote", "demote", "appoint", "salary_adjust", "confirm", "transfer", "rehire"].includes(t),
  };

  async function save() {
    const er: Record<string, string> = {};
    if (!v.employee_id) er.employee_id = "เลือกพนักงาน";
    if (!v.effective_date) er.effective_date = "ระบุวันมีผล";
    if (t === "salary_adjust" && !v.new_salary) er.new_salary = "ระบุเงินเดือนใหม่";
    if (v.new_salary !== "" && (isNaN(Number(v.new_salary)) || Number(v.new_salary) < 0)) er.new_salary = "ระบุจำนวนเงินที่ถูกต้อง";
    if (t === "status_change" && !v.new_status) er.new_status = "เลือกสถานะใหม่";
    if (v.new_supervisor_id && v.new_supervisor_id === v.employee_id) er.new_supervisor_id = "หัวหน้าต้องไม่ใช่ตัวพนักงานเอง";
    if (["transfer", "promote", "demote", "appoint"].includes(t) && !v.new_branch_id && !v.new_org_unit_id && !v.new_position_id && !v.new_supervisor_id && !v.new_employee_type && !v.new_salary)
      er.reason = "ระบุอย่างน้อยหนึ่งรายการที่จะเปลี่ยน";
    if (t === "resign" && !v.reason.trim()) er.reason = "ระบุเหตุผลการลาออก / พ้นสภาพ";
    setErr(er);
    if (Object.keys(er).length) return;
    setSaving(true);
    const n = (x: string) => (x === "" ? null : Number(x));
    const { error } = await sb.from("employee_movements").insert({
      employee_id: v.employee_id,
      movement_type: t,
      effective_date: v.effective_date,
      new_branch_id: show.org ? n(v.new_branch_id) : null,
      new_org_unit_id: show.org ? n(v.new_org_unit_id) : null,
      new_position_id: show.pos ? n(v.new_position_id) : null,
      new_supervisor_id: show.org ? v.new_supervisor_id : null,
      new_employee_type: show.type ? v.new_employee_type || null : null,
      new_status: show.status ? v.new_status || null : null,
      new_salary: show.salary ? n(v.new_salary) : null,
      reason: v.reason.trim() || null,
      status: "pending",
    });
    setSaving(false);
    if (error) return toast.error(humanError(error));
    toast.ok(v.effective_date <= isoDate() ? "บันทึกแล้ว รายการถึงวันมีผลแล้ว กด “นำไปใช้ตอนนี้” เพื่อปรับข้อมูลทันที" : "บันทึกแล้ว ระบบจะนำไปใช้เมื่อถึงวันมีผล");
    onSaved();
  }

  const cur = (label: string, val: string | undefined) => (e ? <span className="text-xs text-ink-mute">ปัจจุบัน: {val || "-"}</span> : label);

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="สร้างรายการเปลี่ยนแปลง"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>ยกเลิก</Button>
          <Button onClick={save} loading={saving}>บันทึก</Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="ประเภทการเปลี่ยนแปลง" required>
          <Select value={t} onChange={(x) => setV({ ...blank, employee_id: v.employee_id, effective_date: v.effective_date, movement_type: x.target.value })}>
            {Object.entries(MOVEMENT_TYPE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        </Field>
        <Field label="วันที่มีผล" required error={err.effective_date}>
          <Input type="date" value={v.effective_date} onChange={(x) => set("effective_date", x.target.value)} />
        </Field>
        <Field label="พนักงาน" required error={err.employee_id} className="sm:col-span-2">
          <EmployeePicker value={v.employee_id} onChange={(x) => set("employee_id", x)} options={activeOpts} />
        </Field>
        {e && (
          <div className="rounded-[var(--radius-ctl)] bg-paper px-3 py-2 text-sm text-ink-soft sm:col-span-2">
            ปัจจุบัน: {[lk.org[e.org_unit_id ?? -1], lk.pos[e.position_id ?? -1], lk.branch[e.branch_id ?? -1], EMP_TYPE[e.employee_type], EMP_STATUS[e.status]].filter(Boolean).join(" · ")}
            {canSalary && current.has(e.id) && <> · เงินเดือน <span className="num">{money(current.get(e.id))}</span></>}
          </div>
        )}
        {show.org && (
          <>
            <Field label="สาขาใหม่" hint={cur("เว้นว่างถ้าไม่เปลี่ยน", lk.branch[e?.branch_id ?? -1])}>
              <Select value={v.new_branch_id} onChange={(x) => set("new_branch_id", x.target.value)} placeholder="— ไม่เปลี่ยน —">
                {Object.entries(lk.branch).map(([id, n]) => <option key={id} value={id}>{n}</option>)}
              </Select>
            </Field>
            <Field label="หน่วยงานใหม่" hint={cur("เว้นว่างถ้าไม่เปลี่ยน", lk.org[e?.org_unit_id ?? -1])}>
              <Select value={v.new_org_unit_id} onChange={(x) => set("new_org_unit_id", x.target.value)} placeholder="— ไม่เปลี่ยน —">
                {Object.entries(lk.org).map(([id, n]) => <option key={id} value={id}>{n}</option>)}
              </Select>
            </Field>
          </>
        )}
        {show.pos && (
          <Field label="ตำแหน่งใหม่" hint={cur("เว้นว่างถ้าไม่เปลี่ยน", lk.pos[e?.position_id ?? -1])}>
            <Select value={v.new_position_id} onChange={(x) => set("new_position_id", x.target.value)} placeholder="— ไม่เปลี่ยน —">
              {Object.entries(lk.pos).map(([id, n]) => <option key={id} value={id}>{n}</option>)}
            </Select>
          </Field>
        )}
        {show.org && (
          <Field label="หัวหน้างานใหม่" error={err.new_supervisor_id} hint={e ? `ปัจจุบัน: ${e.supervisor_id ? `${emps.get(e.supervisor_id)?.first_name ?? ""} ${emps.get(e.supervisor_id)?.last_name ?? ""}` : "-"}` : "เว้นว่างถ้าไม่เปลี่ยน"}>
            <EmployeePicker value={v.new_supervisor_id} onChange={(x) => set("new_supervisor_id", x)} options={empOpts.filter((o) => o.raw?.status !== "resigned" && o.value !== v.employee_id)} placeholder="— ไม่เปลี่ยน —" />
          </Field>
        )}
        {show.type && (
          <Field label="ประเภทพนักงานใหม่" hint={e ? `ปัจจุบัน: ${EMP_TYPE[e.employee_type]}` : undefined}>
            <Select value={v.new_employee_type} onChange={(x) => set("new_employee_type", x.target.value)} placeholder="— ไม่เปลี่ยน —">
              {typeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </Field>
        )}
        {show.status && (
          <Field label="สถานะใหม่" required error={err.new_status}>
            <Select value={v.new_status} onChange={(x) => set("new_status", x.target.value)} placeholder="— เลือก —">
              {statusOptions.filter((o) => o.value !== "resigned").map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </Field>
        )}
        {show.salary && (
          <Field label="เงินเดือน / ค่าจ้างใหม่" required={t === "salary_adjust"} error={err.new_salary} hint={e && current.has(e.id) ? `ปัจจุบัน ${money(current.get(e.id))}${v.new_salary && current.get(e.id) ? ` · เปลี่ยน ${(((Number(v.new_salary) - current.get(e.id)!) / current.get(e.id)!) * 100).toFixed(2)}%` : ""}` : "เว้นว่างถ้าไม่เปลี่ยน"}>
            <Input type="money" min={0} className="num" value={v.new_salary} onChange={(x) => set("new_salary", x.target.value)} />
          </Field>
        )}
        {t === "confirm" && <p className="text-sm text-ink-soft sm:col-span-2">สถานะจะเปลี่ยนเป็น “พนักงานประจำ” และบันทึกวันผ่านทดลองงานตามวันมีผล</p>}
        {t === "resign" && <p className="text-sm text-ink-soft sm:col-span-2">สถานะจะเปลี่ยนเป็น “ลาออก” และบัญชีผู้ใช้ของพนักงานจะถูกปิดเมื่อถึงวันมีผล</p>}
        <Field label="เหตุผล / หมายเหตุ" error={err.reason} className="sm:col-span-2">
          <Textarea value={v.reason} onChange={(x) => set("reason", x.target.value)} rows={2} />
        </Field>
      </div>
    </Modal>
  );
}
