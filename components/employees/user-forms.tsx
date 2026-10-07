"use client";

import type { Res } from "@/lib/employees/labels";
import { useEffect, useState } from "react";
import { Eye, EyeOff, RefreshCw } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useMaybeMe } from "@/components/app/me-context";
import { Button, Checkbox, Field, Input, Modal, Select, Toggle, toast } from "@/components/ui";
import { EmployeePicker, type EmpOption } from "@/components/crud/employee-picker";
import { createUserAction, resetPasswordAction } from "@/lib/employees/user-actions";
import { DEFAULT_POLICY, normalizePolicy, passwordError, policyRules, randomPassword, type PasswordPolicy } from "@/lib/employees/password";

export type RoleGroup = { id: number; code: string; name: string };

export function usePasswordPolicy(): PasswordPolicy {
  const [p, setP] = useState<PasswordPolicy>(DEFAULT_POLICY);
  useEffect(() => {
    supabaseBrowser().from("settings").select("value").eq("key", "password_policy").maybeSingle().then(({ data }: Res) => data && setP(normalizePolicy(data.value)));
  }, []);
  return p;
}

export function useRoleGroups(): RoleGroup[] {
  const [g, setG] = useState<RoleGroup[]>([]);
  useEffect(() => {
    supabaseBrowser().from("role_groups").select("id, code, name").order("id").then(({ data }: Res) => setG((data as RoleGroup[]) ?? []));
  }, []);
  return g;
}

export function PasswordInput({ value, onChange, policy, id, autoComplete = "new-password", onGenerate }: { value: string; onChange: (v: string) => void; policy: PasswordPolicy; id?: string; autoComplete?: string; onGenerate?: boolean }) {
  const [show, setShow] = useState(false);
  return (
    <div className="flex gap-2">
      <div className="relative flex-1">
        <Input id={id} type={show ? "text" : "password"} autoComplete={autoComplete} value={value} onChange={(e) => onChange(e.target.value)} className="pr-10 font-mono" />
        <button type="button" onClick={() => setShow((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-ink-mute" aria-label={show ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}>
          {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
      {onGenerate && (
        <Button variant="secondary" icon={<RefreshCw className="size-4" />} onClick={() => { onChange(randomPassword(policy)); setShow(true); }}>
          สุ่ม
        </Button>
      )}
    </div>
  );
}

export function policyHint(p: PasswordPolicy) {
  return `ต้อง${policyRules(p).join(", ")}`;
}

/** Create a login account. `employee` pre-links (used from the employee profile). */
export function CreateUserModal({ open, onClose, onCreated, employee }: { open: boolean; onClose: () => void; onCreated?: () => void; employee?: { id: number; code: string; name: string; email?: string | null } | null }) {
  const me = useMaybeMe();
  const policy = usePasswordPolicy();
  const groups = useRoleGroups();
  const [emps, setEmps] = useState<EmpOption[]>([]);
  const blank = { email: "", username: "", password: "", display_name: "", role_group_id: "", is_admin: false, employee_id: null as number | null, must_change_password: true };
  const [v, setV] = useState(blank);
  const [err, setErr] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount / reset form when opened
    setErr({});
    setV({ ...blank, employee_id: employee?.id ?? null, username: employee?.code ?? "", password: randomPassword(policy) });
    if (!employee) {
      const sb = supabaseBrowser();
      Promise.all([sb.from("v_directory").select("id, code, first_name, last_name, nickname, email").order("code").limit(5000), sb.from("profiles").select("employee_id")]).then(([e, p]) => {
        const linked = new Set(((p.data as { employee_id: number | null }[]) ?? []).map((x) => x.employee_id));
        setEmps(((e.data ?? []) as Record<string, unknown>[]).filter((r) => !linked.has(r.id as number)).map((r) => ({ value: r.id as number, label: `${r.first_name} ${r.last_name}${r.nickname ? ` (${r.nickname})` : ""}`, raw: r })));
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, employee]);

  useEffect(() => {
    if (open && groups.length && !v.role_group_id) {
      const emp = groups.find((g) => g.code === "EMPLOYEE");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount / reset form when opened
      if (emp) setV((x) => ({ ...x, role_group_id: String(emp.id) }));
    }
  }, [open, groups, v.role_group_id]);

  const set = (k: keyof typeof blank, val: unknown) => setV((x) => ({ ...x, [k]: val }));
  const pickEmp = (id: number | null) => {
    const o = emps.find((e) => Number(e.value) === id);
    setV((x) => ({ ...x, employee_id: id, username: x.username || String(o?.raw?.code ?? "") }));
  };
  const emailPreview = v.email.trim() || (employee ? `${employee.code.toLowerCase()}@staff.gohr.local` : v.employee_id ? `${String(emps.find((e) => Number(e.value) === v.employee_id)?.raw?.code ?? "").toLowerCase()}@staff.gohr.local` : v.username ? `${v.username.toLowerCase()}@staff.gohr.local` : "");

  async function save() {
    const e: Record<string, string> = {};
    if (!/^[A-Za-z0-9._-]{3,50}$/.test(v.username.trim())) e.username = "3–50 ตัว ใช้ได้เฉพาะ A-Z a-z 0-9 . _ -";
    if (v.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim())) e.email = "รูปแบบอีเมลไม่ถูกต้อง";
    const pe = passwordError(v.password, policy);
    if (pe) e.password = pe;
    if (!v.role_group_id && !v.is_admin) e.role_group_id = "เลือกกลุ่มผู้ใช้";
    setErr(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    const r = await createUserAction({
      email: v.email.trim() || null,
      username: v.username.trim(),
      password: v.password,
      display_name: v.display_name.trim() || null,
      role_group_id: v.role_group_id ? Number(v.role_group_id) : null,
      is_admin: v.is_admin,
      employee_id: v.employee_id,
      must_change_password: v.must_change_password,
    });
    setSaving(false);
    if (!r.ok) return toast.error(r.error);
    toast.ok(`สร้างบัญชีแล้ว ใช้ชื่อผู้ใช้ “${v.username.trim()}” เข้าสู่ระบบ`);
    onCreated?.();
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={employee ? `สร้างบัญชีผู้ใช้ให้ ${employee.name}` : "สร้างบัญชีผู้ใช้"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>ยกเลิก</Button>
          <Button onClick={save} loading={saving}>สร้างบัญชี</Button>
        </>
      }
    >
      <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
        {!employee && (
          <Field label="ผูกกับพนักงาน" hint="บัญชีของพนักงานจะเห็นข้อมูลตัวเองและใช้งานมือถือได้" className="sm:col-span-2">
            <EmployeePicker value={v.employee_id} onChange={pickEmp} options={emps} placeholder="ไม่ผูกกับพนักงาน (เช่น บัญชีผู้ดูแลระบบ)" />
          </Field>
        )}
        <Field label="ชื่อผู้ใช้" required error={err.username} hint="ใช้เข้าสู่ระบบ (พนักงานใช้รหัสพนักงานได้)">
          <Input value={v.username} onChange={(e) => set("username", e.target.value)} autoComplete="off" />
        </Field>
        <Field label="อีเมล" error={err.email} hint={emailPreview && !v.email ? `เว้นว่างได้ ระบบจะใช้ ${emailPreview}` : undefined}>
          <Input type="email" value={v.email} onChange={(e) => set("email", e.target.value)} autoComplete="off" />
        </Field>
        {!v.employee_id && (
          <Field label="ชื่อที่แสดง" className="sm:col-span-2">
            <Input value={v.display_name} onChange={(e) => set("display_name", e.target.value)} />
          </Field>
        )}
        <Field label="รหัสผ่านเริ่มต้น" required error={err.password} hint={policyHint(policy)} className="sm:col-span-2">
          <PasswordInput value={v.password} onChange={(x) => set("password", x)} policy={policy} onGenerate />
        </Field>
        <Field label="กลุ่มผู้ใช้" required={!v.is_admin} error={err.role_group_id}>
          <Select value={v.role_group_id} onChange={(e) => set("role_group_id", e.target.value)} placeholder="— เลือก —">
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </Select>
        </Field>
        <div className="flex flex-col justify-end gap-2 pb-1">
          <Checkbox label="ต้องเปลี่ยนรหัสผ่านเมื่อเข้าระบบครั้งแรก" checked={v.must_change_password} onChange={(x) => set("must_change_password", x)} />
          {me?.isAdmin && <Toggle checked={v.is_admin} onChange={(x) => set("is_admin", x)} label="ผู้ดูแลระบบ (สิทธิ์ทุกเมนู)" />}
        </div>
      </div>
    </Modal>
  );
}

export function ResetPasswordModal({ user, onClose }: { user: { id: string; username: string | null } | null; onClose: () => void }) {
  const policy = usePasswordPolicy();
  const [pw, setPw] = useState("");
  const [must, setMust] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount / reset form when opened
      setPw(randomPassword(policy));
      setMust(true);
      setErr(null);
    }
  }, [user, policy]);
  async function save() {
    if (!user) return;
    const e = passwordError(pw, policy);
    setErr(e);
    if (e) return;
    setSaving(true);
    const r = await resetPasswordAction(user.id, pw, must);
    setSaving(false);
    if (!r.ok) return toast.error(r.error);
    toast.ok(`ตั้งรหัสผ่านใหม่ให้ ${user.username ?? ""} แล้ว`);
    onClose();
  }
  return (
    <Modal
      open={!!user}
      onClose={onClose}
      size="sm"
      title={`รีเซ็ตรหัสผ่าน ${user?.username ?? ""}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>ยกเลิก</Button>
          <Button onClick={save} loading={saving}>ตั้งรหัสผ่านใหม่</Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="รหัสผ่านใหม่" error={err} hint={policyHint(policy)}>
          <PasswordInput value={pw} onChange={setPw} policy={policy} onGenerate />
        </Field>
        <Checkbox label="ให้ผู้ใช้เปลี่ยนรหัสผ่านเมื่อเข้าระบบครั้งถัดไป" checked={must} onChange={setMust} />
        <p className="text-sm text-ink-soft">แจ้งรหัสผ่านใหม่ให้ผู้ใช้ทางช่องทางที่ปลอดภัย ระบบไม่ได้ส่งให้อัตโนมัติ</p>
      </div>
    </Modal>
  );
}
