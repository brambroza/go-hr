"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Download, KeyRound, MoreHorizontal, Pencil, Plus, Power, Search, Trash2, Users } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useCan, useMaybeMe } from "@/components/app/me-context";
import { Badge, Button, Checkbox, Empty, Field, Input, Modal, PageHeader, Panel, Select, Spinner, Stat, Toggle, clsx, toast, useConfirm } from "@/components/ui";
import { EmployeePicker, type EmpOption } from "@/components/crud/employee-picker";
import { Avatar } from "@/components/employees/avatar";
import { CreateUserModal, ResetPasswordModal, useRoleGroups, type RoleGroup } from "@/components/employees/user-forms";
import { bulkCreateAccountsAction, deleteUserAction, setActiveAction, updateUserAction, type BulkResult } from "@/lib/employees/user-actions";
import { thDateTime } from "@/lib/format";
import { downloadCsv } from "@/lib/csv";

type Profile = {
  id: string; username: string | null; display_name: string | null; email: string | null; role_group_id: number | null; employee_id: number | null;
  is_admin: boolean; is_active: boolean; must_change_password: boolean; last_login_at: string | null; created_at: string;
};
type Emp = { id: number; code: string; first_name: string; last_name: string; nickname: string | null; photo_url: string | null; position_name: string | null };

export default function UsersPage() {
  const can = useCan();
  const me = useMaybeMe();
  const groups = useRoleGroups();
  const sb = supabaseBrowser();
  const { confirm, dialog } = useConfirm();
  const [rows, setRows] = useState<Profile[] | null>(null);
  const [emps, setEmps] = useState<Map<number, Emp>>(new Map());
  const [q, setQ] = useState("");
  const [fGroup, setFGroup] = useState("");
  const [fState, setFState] = useState("");
  const [creating, setCreating] = useState(false);
  const [bulk, setBulk] = useState(false);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [resetting, setResetting] = useState<Profile | null>(null);
  const [menu, setMenu] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [p, e] = await Promise.all([
      sb.from("profiles").select("id, username, display_name, email, role_group_id, employee_id, is_admin, is_active, must_change_password, last_login_at, created_at").order("username").limit(10000),
      sb.from("v_directory").select("id, code, first_name, last_name, nickname, photo_url, position_name").limit(10000),
    ]);
    if (p.error) toast.error(p.error.message);
    setRows((p.data as Profile[]) ?? []);
    setEmps(new Map(((e.data as Emp[]) ?? []).map((x) => [x.id, x])));
  }, [sb]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount / reset form when opened
    load();
  }, [load]);

  useEffect(() => {
    const close = () => setMenu(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  const groupBy = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);
  const withoutAccount = useMemo(() => {
    const linked = new Set((rows ?? []).map((r) => r.employee_id));
    return [...emps.values()].filter((e) => !linked.has(e.id)).length;
  }, [rows, emps]);
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (rows ?? []).filter((r) => {
      const e = r.employee_id ? emps.get(r.employee_id) : undefined;
      if (fGroup === "admin" ? !r.is_admin : fGroup && String(r.role_group_id) !== fGroup) return false;
      if (fState === "active" && !r.is_active) return false;
      if (fState === "inactive" && r.is_active) return false;
      if (fState === "must" && !r.must_change_password) return false;
      if (fState === "never" && r.last_login_at) return false;
      if (!t) return true;
      return [r.username, r.display_name, r.email, e?.code, e?.first_name, e?.last_name, e?.nickname].some((x) => x?.toLowerCase().includes(t));
    });
  }, [rows, emps, q, fGroup, fState]);

  const canCreate = can("security", "create");
  const canEdit = can("security", "edit");
  const canDelete = can("security", "delete");

  async function toggleActive(p: Profile) {
    if (p.is_active && !(await confirm(`ปิดการใช้งานบัญชี “${p.username}”? ผู้ใช้จะเข้าสู่ระบบไม่ได้จนกว่าจะเปิดอีกครั้ง`, { danger: true, confirmText: "ปิดการใช้งาน" }))) return;
    const r = await setActiveAction(p.id, !p.is_active);
    if (!r.ok) return toast.error(r.error);
    toast.ok(r.message!);
    load();
  }
  async function remove(p: Profile) {
    if (!(await confirm(<>ลบบัญชี <b>{p.username}</b> ถาวร? ข้อมูลพนักงานไม่ถูกลบ แต่ประวัติการใช้งานจะไม่ผูกกับบัญชีนี้อีก แนะนำให้ “ปิดการใช้งาน” แทน</>, { danger: true, confirmText: "ลบบัญชี" }))) return;
    const r = await deleteUserAction(p.id);
    if (!r.ok) return toast.error(r.error);
    toast.ok(r.message!);
    load();
  }
  async function changeGroup(p: Profile, gid: string) {
    const r = await updateUserAction(p.id, { role_group_id: gid ? Number(gid) : null });
    if (!r.ok) return toast.error(r.error);
    toast.ok(`เปลี่ยนกลุ่มของ ${p.username} แล้ว`);
    load();
  }

  const stats = {
    total: rows?.length ?? 0,
    active: rows?.filter((r) => r.is_active).length ?? 0,
    must: rows?.filter((r) => r.must_change_password && r.is_active).length ?? 0,
  };

  return (
    <div>
      <PageHeader
        title="ผู้ใช้งาน"
        description="บัญชีเข้าสู่ระบบของพนักงานและผู้ดูแล สิทธิ์การใช้งานกำหนดผ่านกลุ่มผู้ใช้"
        actions={
          canCreate && (
            <>
              <Button variant="secondary" icon={<Users className="size-4" />} onClick={() => setBulk(true)} disabled={!withoutAccount}>
                สร้างบัญชีให้พนักงานที่ยังไม่มีบัญชี{withoutAccount ? <span className="num ml-1 rounded-full bg-jade-50 px-1.5 text-xs text-jade-800">{withoutAccount}</span> : null}
              </Button>
              <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>สร้างบัญชีผู้ใช้</Button>
            </>
          )
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="บัญชีทั้งหมด" value={stats.total} />
        <Stat label="ใช้งานอยู่" value={stats.active} />
        <Stat label="รอเปลี่ยนรหัสผ่าน" value={stats.must} tone={stats.must ? "amber" : undefined} />
        <Stat label="พนักงานที่ยังไม่มีบัญชี" value={withoutAccount} tone={withoutAccount ? "amber" : undefined} />
      </div>
      <Panel bodyClass="p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-line-soft px-3 py-2.5">
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-mute" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ชื่อผู้ใช้ ชื่อ รหัสพนักงาน" className="h-9 pl-8 text-sm" aria-label="ค้นหาผู้ใช้" />
          </div>
          <Select className="h-9 text-sm sm:w-auto" value={fGroup} onChange={(e) => setFGroup(e.target.value)} placeholder="กลุ่ม: ทั้งหมด" aria-label="กลุ่มผู้ใช้">
            <option value="admin">ผู้ดูแลระบบ</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </Select>
          <Select className="h-9 text-sm sm:w-auto" value={fState} onChange={(e) => setFState(e.target.value)} placeholder="สถานะ: ทั้งหมด" aria-label="สถานะบัญชี">
            <option value="active">ใช้งาน</option>
            <option value="inactive">ปิดใช้งาน</option>
            <option value="must">รอเปลี่ยนรหัสผ่าน</option>
            <option value="never">ยังไม่เคยเข้าระบบ</option>
          </Select>
          <span className="num ml-auto text-sm text-ink-mute">{shown.length} บัญชี</span>
        </div>
        {!rows ? (
          <div className="py-16"><Spinner className="mx-auto" /></div>
        ) : shown.length === 0 ? (
          <Empty title={q || fGroup || fState ? "ไม่พบบัญชีที่ตรงกับเงื่อนไข" : "ยังไม่มีบัญชีผู้ใช้"} />
        ) : (
          <div className="thin-scroll overflow-x-auto">
            <table className="w-full min-w-[820px] text-[14px]">
              <thead>
                <tr className="border-b border-line bg-paper/60 text-left text-[13px] text-ink-soft">
                  <th className="px-3 py-2 font-medium">ผู้ใช้</th>
                  <th className="px-3 py-2 font-medium">พนักงานที่ผูก</th>
                  <th className="px-3 py-2 font-medium">กลุ่มผู้ใช้</th>
                  <th className="px-3 py-2 font-medium">เข้าระบบล่าสุด</th>
                  <th className="px-3 py-2 font-medium">สถานะ</th>
                  <th className="w-px px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {shown.map((p) => {
                  const e = p.employee_id ? emps.get(p.employee_id) : undefined;
                  const self = p.id === me?.userId;
                  return (
                    <tr key={p.id} className={clsx("border-b border-line-soft last:border-0", !p.is_active && "text-ink-mute")}>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2.5">
                          <Avatar src={e?.photo_url} name={e ? `${e.first_name} ${e.last_name}` : p.display_name ?? p.username} size={32} />
                          <div className="min-w-0">
                            <div className="font-mono text-[13px] font-medium text-ink">{p.username ?? "-"}{self && <span className="ml-1 font-sans text-xs font-normal text-ink-mute">(คุณ)</span>}</div>
                            <div className="truncate text-xs text-ink-mute">{p.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        {e ? (
                          <Link href={`/employees/${e.id}?tab=account`} className="hover:text-jade-700 hover:underline">
                            {e.first_name} {e.last_name} <span className="text-xs text-ink-mute">{e.code}</span>
                          </Link>
                        ) : p.employee_id ? <span className="text-ink-mute">พนักงานลาออกแล้ว</span> : <span className="text-ink-mute">{p.display_name ?? "-"}</span>}
                      </td>
                      <td className="px-3 py-2">
                        {p.is_admin ? (
                          <Badge color="violet">ผู้ดูแลระบบ</Badge>
                        ) : canEdit && !self ? (
                          <Select className="h-8 max-w-56 text-sm" value={p.role_group_id ?? ""} onChange={(x) => changeGroup(p, x.target.value)} aria-label={`กลุ่มผู้ใช้ของ ${p.username}`} placeholder="— ไม่ระบุ —">
                            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                          </Select>
                        ) : (
                          groupBy.get(p.role_group_id ?? -1)?.name ?? "-"
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-[13px]">{p.last_login_at ? thDateTime(p.last_login_at) : <span className="text-ink-mute">ยังไม่เคย</span>}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {p.is_active ? <Badge color="green">ใช้งาน</Badge> : <Badge color="red">ปิดใช้งาน</Badge>}
                          {p.must_change_password && p.is_active && <Badge color="amber">รอเปลี่ยนรหัส</Badge>}
                        </div>
                      </td>
                      <td className="px-2 py-1 text-right">
                        {(canEdit || canDelete) && (
                          <div className="relative inline-block">
                            <button
                              type="button"
                              className="rounded p-1.5 text-ink-mute hover:bg-jade-50 hover:text-jade-700"
                              aria-label={`จัดการบัญชี ${p.username}`}
                              aria-haspopup="menu"
                              aria-expanded={menu === p.id}
                              onClick={(ev) => { ev.stopPropagation(); setMenu(menu === p.id ? null : p.id); }}
                            >
                              <MoreHorizontal className="size-5" />
                            </button>
                            {menu === p.id && (
                              <div role="menu" className="absolute right-0 z-20 mt-1 w-48 overflow-hidden rounded-[var(--radius-ctl)] border border-line bg-white py-1 text-left shadow-lg">
                                {canEdit && <MenuItem icon={<Pencil className="size-4" />} onClick={() => setEditing(p)}>แก้ไขบัญชี</MenuItem>}
                                {canEdit && <MenuItem icon={<KeyRound className="size-4" />} onClick={() => setResetting(p)}>รีเซ็ตรหัสผ่าน</MenuItem>}
                                {canEdit && !self && <MenuItem icon={<Power className="size-4" />} onClick={() => toggleActive(p)}>{p.is_active ? "ปิดการใช้งาน" : "เปิดใช้งาน"}</MenuItem>}
                                {canDelete && !self && <MenuItem danger icon={<Trash2 className="size-4" />} onClick={() => remove(p)}>ลบบัญชี</MenuItem>}
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      <CreateUserModal open={creating} onClose={() => setCreating(false)} onCreated={load} />
      <EditUserModal user={editing} groups={groups} emps={emps} profiles={rows ?? []} onClose={() => setEditing(null)} onSaved={load} />
      <ResetPasswordModal user={resetting} onClose={() => { setResetting(null); load(); }} />
      <BulkModal open={bulk} groups={groups} onClose={() => setBulk(false)} onDone={load} count={withoutAccount} />
      {dialog}
    </div>
  );
}

function MenuItem({ icon, children, onClick, danger }: { icon: React.ReactNode; children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" role="menuitem" onClick={onClick} className={clsx("flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-jade-50", danger ? "text-rust hover:bg-rust-soft" : "text-ink")}>
      {icon}
      {children}
    </button>
  );
}

function EditUserModal({ user, groups, emps, profiles, onClose, onSaved }: { user: Profile | null; groups: RoleGroup[]; emps: Map<number, Emp>; profiles: Profile[]; onClose: () => void; onSaved: () => void }) {
  const me = useMaybeMe();
  const [v, setV] = useState({ username: "", email: "", display_name: "", role_group_id: "", is_admin: false, employee_id: null as number | null });
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount / reset form when opened
    if (user) setV({ username: user.username ?? "", email: user.email ?? "", display_name: user.display_name ?? "", role_group_id: user.role_group_id ? String(user.role_group_id) : "", is_admin: user.is_admin, employee_id: user.employee_id });
  }, [user]);
  const opts: EmpOption[] = useMemo(() => {
    const linked = new Set(profiles.filter((p) => p.id !== user?.id).map((p) => p.employee_id));
    return [...emps.values()].filter((e) => !linked.has(e.id)).map((e) => ({ value: e.id, label: `${e.first_name} ${e.last_name}${e.nickname ? ` (${e.nickname})` : ""}`, raw: e as unknown as Record<string, unknown> }));
  }, [emps, profiles, user]);
  async function save() {
    if (!user) return;
    if (!/^[A-Za-z0-9._-]{3,50}$/.test(v.username.trim())) return toast.error("ชื่อผู้ใช้ต้องยาว 3–50 ตัว ใช้ได้เฉพาะ A-Z a-z 0-9 . _ -");
    setSaving(true);
    const r = await updateUserAction(user.id, {
      username: v.username, email: v.email, display_name: v.display_name, role_group_id: v.role_group_id ? Number(v.role_group_id) : null,
      employee_id: v.employee_id, ...(me?.isAdmin ? { is_admin: v.is_admin } : {}),
    });
    setSaving(false);
    if (!r.ok) return toast.error(r.error);
    toast.ok("บันทึกแล้ว");
    onSaved();
    onClose();
  }
  return (
    <Modal open={!!user} onClose={onClose} size="lg" title={`แก้ไขบัญชี ${user?.username ?? ""}`} footer={<><Button variant="secondary" onClick={onClose}>ยกเลิก</Button><Button loading={saving} onClick={save}>บันทึก</Button></>}>
      <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
        <Field label="ชื่อผู้ใช้" required><Input value={v.username} onChange={(e) => setV({ ...v, username: e.target.value })} /></Field>
        <Field label="อีเมลสำหรับเข้าระบบ" required><Input type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} /></Field>
        <Field label="พนักงานที่ผูก" className="sm:col-span-2"><EmployeePicker value={v.employee_id} onChange={(x) => setV({ ...v, employee_id: x })} options={opts} placeholder="ไม่ผูกกับพนักงาน" /></Field>
        {!v.employee_id && <Field label="ชื่อที่แสดง" className="sm:col-span-2"><Input value={v.display_name} onChange={(e) => setV({ ...v, display_name: e.target.value })} /></Field>}
        <Field label="กลุ่มผู้ใช้">
          <Select value={v.role_group_id} onChange={(e) => setV({ ...v, role_group_id: e.target.value })} placeholder="— ไม่ระบุ —">
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </Select>
        </Field>
        {me?.isAdmin && <div className="flex items-end pb-2"><Toggle checked={v.is_admin} onChange={(x) => setV({ ...v, is_admin: x })} label="ผู้ดูแลระบบ (สิทธิ์ทุกเมนู)" disabled={user?.id === me.userId} /></div>}
      </div>
    </Modal>
  );
}

function BulkModal({ open, groups, onClose, onDone, count }: { open: boolean; groups: RoleGroup[]; onClose: () => void; onDone: () => void; count: number }) {
  const [mode, setMode] = useState<"birthdate" | "fixed">("birthdate");
  const [pw, setPw] = useState("");
  const [gid, setGid] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<BulkResult | null>(null);
  const [ack, setAck] = useState(false);
  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount / reset form when opened
      setRes(null);
      setAck(false);
      setPw("");
      const e = groups.find((g) => g.code === "EMPLOYEE");
      setGid(e ? String(e.id) : "");
    }
  }, [open, groups]);

  async function run() {
    if (mode === "fixed" && pw.length < 6) return toast.error("รหัสผ่านเริ่มต้นต้องยาวอย่างน้อย 6 ตัวอักษร");
    if (mode === "birthdate" && pw && pw.length < 6) return toast.error("รหัสผ่านสำรองต้องยาวอย่างน้อย 6 ตัวอักษร");
    setBusy(true);
    const r = await bulkCreateAccountsAction({ mode, password: pw, role_group_id: gid ? Number(gid) : null });
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    toast.ok(`สร้างบัญชีผู้ใช้แล้ว ${r.data!.created.length} บัญชี`);
    setRes(r.data!);
    onDone();
  }
  function exportCsv() {
    if (!res) return;
    downloadCsv(`บัญชีผู้ใช้ใหม่-${new Date().toISOString().slice(0, 10)}.csv`, [["รหัสพนักงาน", "ชื่อ", "ชื่อผู้ใช้", "รหัสผ่านเริ่มต้น"], ...res.created.map((c) => [c.code, c.name, c.username, c.password])]);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="สร้างบัญชีให้พนักงานที่ยังไม่มีบัญชี"
      footer={
        res ? (
          <>
            {res.created.length > 0 && <Button variant="secondary" icon={<Download className="size-4" />} onClick={exportCsv}>ดาวน์โหลดรายชื่อและรหัสผ่าน</Button>}
            <Button onClick={onClose}>เสร็จสิ้น</Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>ยกเลิก</Button>
            <Button loading={busy} onClick={run} disabled={!ack || !count}>สร้าง {count} บัญชี</Button>
          </>
        )
      }
    >
      {res ? (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Stat label="สร้างสำเร็จ" value={res.created.length} />
            <Stat label="ข้าม" value={res.skipped.length} tone={res.skipped.length ? "amber" : undefined} />
          </div>
          {res.created.length > 0 && <p className="text-sm text-ink-soft">ดาวน์โหลดรายชื่อเพื่อแจ้งพนักงาน ระบบจะไม่แสดงรหัสผ่านนี้อีก ทุกคนต้องเปลี่ยนรหัสผ่านเมื่อเข้าระบบครั้งแรก</p>}
          {res.skipped.length > 0 && (
            <ul className="divide-y divide-line-soft rounded-[var(--radius-ctl)] border border-line text-sm">
              {res.skipped.map((s) => <li key={s.code} className="flex gap-3 px-3 py-2"><span className="w-16 font-medium">{s.code}</span><span className="flex-1">{s.name}</span><span className="text-amber-ink">{s.reason}</span></li>)}
            </ul>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-[15px]">ระบบจะสร้างบัญชีให้พนักงานปัจจุบัน <b className="num">{count}</b> คนที่ยังไม่มีบัญชี โดยใช้ <b>รหัสพนักงาน</b> เป็นชื่อผู้ใช้ และบังคับเปลี่ยนรหัสผ่านเมื่อเข้าระบบครั้งแรก</p>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium text-ink-soft">รหัสผ่านเริ่มต้น</legend>
            <label className="flex cursor-pointer items-start gap-2 rounded-[var(--radius-ctl)] border border-line p-3 has-[:checked]:border-jade-500 has-[:checked]:bg-jade-50/50">
              <input type="radio" name="pwmode" className="mt-1 accent-jade-600" checked={mode === "birthdate"} onChange={() => setMode("birthdate")} />
              <span><span className="font-medium">วันเกิด (วว/ดด/ปปปป พ.ศ.)</span><span className="block text-sm text-ink-soft">เช่น เกิด 15 มี.ค. 2538 → <span className="font-mono">15032538</span></span></span>
            </label>
            <label className="flex cursor-pointer items-start gap-2 rounded-[var(--radius-ctl)] border border-line p-3 has-[:checked]:border-jade-500 has-[:checked]:bg-jade-50/50">
              <input type="radio" name="pwmode" className="mt-1 accent-jade-600" checked={mode === "fixed"} onChange={() => setMode("fixed")} />
              <span><span className="font-medium">กำหนดรหัสผ่านเดียวกันทุกคน</span><span className="block text-sm text-ink-soft">พนักงานต้องเปลี่ยนเป็นรหัสผ่านของตนเองตอนเข้าระบบครั้งแรก</span></span>
            </label>
          </fieldset>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={mode === "fixed" ? "รหัสผ่านเริ่มต้น" : "รหัสผ่านสำรอง (กรณีไม่มีวันเกิด)"} required={mode === "fixed"} hint={mode === "birthdate" ? "เว้นว่าง = ข้ามพนักงานที่ไม่มีวันเกิด" : "อย่างน้อย 6 ตัวอักษร"}>
              <Input value={pw} onChange={(e) => setPw(e.target.value)} className="font-mono" autoComplete="off" />
            </Field>
            <Field label="กลุ่มผู้ใช้">
              <Select value={gid} onChange={(e) => setGid(e.target.value)} placeholder="— ไม่ระบุ —">
                {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </Select>
            </Field>
          </div>
          <Checkbox label="เข้าใจแล้วว่ารหัสผ่านเริ่มต้นคาดเดาได้ และพนักงานจะถูกบังคับให้เปลี่ยนรหัสผ่าน" checked={ack} onChange={setAck} />
        </div>
      )}
    </Modal>
  );
}

