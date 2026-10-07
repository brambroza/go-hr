"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { KeyRound, Power, UserPlus } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useCan } from "@/components/app/me-context";
import { Badge, Button, Empty, Panel, Select, Spinner, toast, useConfirm } from "@/components/ui";
import { CreateUserModal, ResetPasswordModal, useRoleGroups } from "@/components/employees/user-forms";
import { setActiveAction, updateUserAction } from "@/lib/employees/user-actions";
import { thDateTime } from "@/lib/format";
import type { TabProps } from "./types";

type Profile = { id: string; username: string | null; email: string | null; role_group_id: number | null; is_admin: boolean; is_active: boolean; must_change_password: boolean; last_login_at: string | null; password_changed_at: string | null; line_user_id: string | null; created_at: string };

export function AccountTab({ emp, isSelf }: TabProps) {
  const can = useCan();
  const groups = useRoleGroups();
  const { confirm, dialog } = useConfirm();
  const [p, setP] = useState<Profile | null | undefined>(undefined);
  const [creating, setCreating] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabaseBrowser().from("profiles").select("id, username, email, role_group_id, is_admin, is_active, must_change_password, last_login_at, password_changed_at, line_user_id, created_at").eq("employee_id", emp.id).maybeSingle();
    setP((data as Profile) ?? null);
  }, [emp.id]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount / reset form when opened
    load();
  }, [load]);

  async function changeGroup(v: string) {
    if (!p) return;
    setBusy(true);
    const r = await updateUserAction(p.id, { role_group_id: v ? Number(v) : null });
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    toast.ok("เปลี่ยนกลุ่มผู้ใช้แล้ว");
    load();
  }
  async function toggleActive() {
    if (!p) return;
    if (p.is_active && !(await confirm(`ปิดการใช้งานบัญชี ${p.username}? ผู้ใช้จะเข้าสู่ระบบไม่ได้จนกว่าจะเปิดอีกครั้ง`, { danger: true, confirmText: "ปิดการใช้งาน" }))) return;
    setBusy(true);
    const r = await setActiveAction(p.id, !p.is_active);
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    toast.ok(r.message ?? "บันทึกแล้ว");
    load();
  }

  if (p === undefined) return <Panel><div className="py-12"><Spinner className="mx-auto" /></div></Panel>;
  const canCreate = can("security", "create");
  const canEdit = can("security", "edit");

  if (!p)
    return (
      <Panel title="บัญชีผู้ใช้">
        <Empty
          icon={<UserPlus className="size-8" />}
          title="พนักงานคนนี้ยังไม่มีบัญชีผู้ใช้"
          description="สร้างบัญชีเพื่อให้พนักงานลงเวลา ยื่นลา และดูสลิปเงินเดือนผ่านมือถือได้"
          action={canCreate ? <Button icon={<UserPlus className="size-4" />} onClick={() => setCreating(true)}>สร้างบัญชีผู้ใช้</Button> : undefined}
        />
        <CreateUserModal open={creating} onClose={() => setCreating(false)} onCreated={load} employee={{ id: emp.id, code: emp.code, name: `${emp.first_name} ${emp.last_name}`, email: emp.email }} />
      </Panel>
    );

  const group = groups.find((g) => g.id === p.role_group_id);
  return (
    <Panel
      title="บัญชีผู้ใช้"
      actions={
        <>
          {isSelf && <Link href="/account/password" className="text-sm text-jade-700 hover:underline">เปลี่ยนรหัสผ่านของฉัน</Link>}
          {canEdit && !isSelf && (
            <>
              <Button size="sm" variant="secondary" icon={<KeyRound className="size-4" />} onClick={() => setResetting(true)}>รีเซ็ตรหัสผ่าน</Button>
              <Button size="sm" variant={p.is_active ? "ghost" : "subtle"} icon={<Power className="size-4" />} onClick={toggleActive} loading={busy}>
                {p.is_active ? "ปิดการใช้งาน" : "เปิดใช้งาน"}
              </Button>
            </>
          )}
        </>
      }
    >
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
        <Item label="ชื่อผู้ใช้" value={<span className="font-mono">{p.username ?? "-"}</span>} />
        <Item label="อีเมลสำหรับเข้าระบบ" value={p.email ?? "-"} />
        <Item
          label="สถานะ"
          value={
            <span className="flex flex-wrap gap-1">
              {p.is_active ? <Badge color="green">ใช้งาน</Badge> : <Badge color="red">ปิดใช้งาน</Badge>}
              {p.is_admin && <Badge color="violet">ผู้ดูแลระบบ</Badge>}
              {p.must_change_password && <Badge color="amber">รอเปลี่ยนรหัสผ่าน</Badge>}
            </span>
          }
        />
        <Item
          label="กลุ่มผู้ใช้"
          value={
            canEdit && !isSelf ? (
              <Select className="h-9 max-w-64 text-sm" value={p.role_group_id ?? ""} onChange={(e) => changeGroup(e.target.value)} disabled={busy} aria-label="กลุ่มผู้ใช้" placeholder="— ไม่ระบุ —">
                {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </Select>
            ) : (
              group?.name ?? "-"
            )
          }
        />
        <Item label="เข้าระบบล่าสุด" value={p.last_login_at ? thDateTime(p.last_login_at) : "ยังไม่เคยเข้าระบบ"} />
        <Item label="เปลี่ยนรหัสผ่านล่าสุด" value={p.password_changed_at ? thDateTime(p.password_changed_at) : "-"} />
        <Item label="เชื่อม LINE" value={p.line_user_id ? <Badge color="green">เชื่อมแล้ว</Badge> : <span className="text-ink-mute">ยังไม่เชื่อม</span>} />
        <Item label="สร้างบัญชีเมื่อ" value={thDateTime(p.created_at)} />
      </dl>
      <ResetPasswordModal user={resetting ? { id: p.id, username: p.username } : null} onClose={() => { setResetting(false); load(); }} />
      {dialog}
    </Panel>
  );
}

function Item({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[13px] text-ink-mute">{label}</dt>
      <dd className="mt-0.5 text-[15px]">{value}</dd>
    </div>
  );
}
