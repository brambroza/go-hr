"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, Lock, Plus, ShieldCheck, Trash2, Users } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useCan } from "@/components/app/me-context";
import { Badge, Button, Empty, Field, Input, Modal, PageHeader, Panel, Spinner, Textarea, clsx, toast, useConfirm } from "@/components/ui";
import { humanError } from "@/components/crud/crud-page";
import { ACTIONS, ACTION_LABELS, MENUS, type Action, type Permissions } from "@/lib/permissions";
import { DATA_SCOPE } from "@/lib/employees/labels";

type Group = { id: number; code: string; name: string; description: string | null; permissions: Permissions; data_scope: string; is_system: boolean };

export default function RolesPage() {
  const can = useCan();
  const sb = supabaseBrowser();
  const { confirm, dialog } = useConfirm();
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [counts, setCounts] = useState<Record<number, number>>({});
  const [selId, setSelId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Group | null>(null);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState<null | { copyFrom?: Group }>(null);

  const canEdit = can("security", "edit");
  const canCreate = can("security", "create");
  const canDelete = can("security", "delete");

  const load = useCallback(async () => {
    const [g, p] = await Promise.all([sb.from("role_groups").select("*").order("is_system", { ascending: false }).order("id"), sb.from("profiles").select("role_group_id").limit(20000)]);
    if (g.error) toast.error(g.error.message);
    const list = (g.data as Group[]) ?? [];
    setGroups(list);
    const c: Record<number, number> = {};
    for (const r of (p.data as { role_group_id: number | null }[]) ?? []) if (r.role_group_id) c[r.role_group_id] = (c[r.role_group_id] ?? 0) + 1;
    setCounts(c);
    return list;
  }, [sb]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount / reset form when opened
    load().then((l) => {
      if (l.length) setSelId((id) => id ?? l[0].id);
    });
  }, [load]);

  const selected = useMemo(() => groups?.find((g) => g.id === selId) ?? null, [groups, selId]);
  const [draftOf, setDraftOf] = useState<Group | null>(null);
  if (draftOf !== selected) {
    // reset the editable copy whenever the selected (or reloaded) group changes
    setDraftOf(selected);
    setDraft(selected ? structuredClone(selected) : null);
  }
  const dirty = !!draft && !!selected && JSON.stringify(normalize(draft)) !== JSON.stringify(normalize(selected));

  async function select(id: number) {
    if (dirty && !(await confirm("มีการแก้ไขที่ยังไม่บันทึก ต้องการทิ้งการแก้ไขหรือไม่?", { confirmText: "ทิ้งการแก้ไข", danger: true }))) return;
    setSelId(id);
  }

  function toggle(menu: string, action: Action, on: boolean) {
    setDraft((d) => {
      if (!d) return d;
      const cur = new Set(d.permissions[menu as keyof Permissions] ?? []);
      if (on) {
        cur.add(action);
        if (action !== "view") cur.add("view"); // any action implies view
      } else {
        cur.delete(action);
        if (action === "view") cur.clear(); // no view → nothing else
      }
      const perms = { ...d.permissions, [menu]: ACTIONS.filter((a) => cur.has(a)) };
      if (!perms[menu as keyof Permissions]?.length) delete perms[menu as keyof Permissions];
      return { ...d, permissions: perms };
    });
  }
  function toggleRow(menu: string, actions: readonly Action[], on: boolean) {
    setDraft((d) => {
      if (!d) return d;
      const perms = { ...d.permissions };
      if (on) perms[menu as keyof Permissions] = [...actions];
      else delete perms[menu as keyof Permissions];
      return { ...d, permissions: perms };
    });
  }
  function toggleCol(action: Action, on: boolean) {
    for (const m of MENUS) if ((m.actions as readonly Action[]).includes(action)) toggle(m.key, action, on);
  }

  async function save() {
    if (!draft) return;
    if (!draft.name.trim()) return toast.error("ระบุชื่อกลุ่ม");
    setSaving(true);
    const { error } = await sb.from("role_groups").update({ name: draft.name.trim(), description: draft.description?.trim() || null, permissions: draft.permissions, data_scope: draft.data_scope }).eq("id", draft.id);
    setSaving(false);
    if (error) return toast.error(humanError(error));
    toast.ok("บันทึกสิทธิ์แล้ว ผู้ใช้ในกลุ่มจะได้รับสิทธิ์ใหม่เมื่อเปิดหน้าถัดไป");
    load();
  }

  async function remove(g: Group) {
    if (g.is_system) return;
    if (counts[g.id]) return toast.error(`ลบไม่ได้ เพราะยังมีผู้ใช้ ${counts[g.id]} คนในกลุ่มนี้ ย้ายผู้ใช้ไปกลุ่มอื่นก่อน`);
    if (!(await confirm(`ลบกลุ่ม “${g.name}”?`, { danger: true, confirmText: "ลบกลุ่ม" }))) return;
    const { error } = await sb.from("role_groups").delete().eq("id", g.id);
    if (error) return toast.error(humanError(error));
    toast.ok("ลบกลุ่มแล้ว");
    setSelId(null);
    const l = await load();
    setSelId(l[0]?.id ?? null);
  }

  const readOnly = !canEdit;

  return (
    <div>
      <PageHeader
        title="กลุ่มผู้ใช้และสิทธิ์"
        description="กำหนดว่าแต่ละกลุ่มเข้าเมนูใดได้ ทำอะไรได้บ้าง และเห็นข้อมูลพนักงานในขอบเขตใด"
        actions={canCreate && <Button icon={<Plus className="size-4" />} onClick={() => setCreating({})}>เพิ่มกลุ่ม</Button>}
      />
      {!groups ? (
        <Panel><div className="py-16"><Spinner className="mx-auto" /></div></Panel>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          <Panel bodyClass="p-1.5" className="h-fit">
            <ul className="flex flex-col gap-0.5" role="listbox" aria-label="กลุ่มผู้ใช้">
              {groups.map((g) => (
                <li key={g.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={g.id === selId}
                    onClick={() => select(g.id)}
                    className={clsx("flex w-full items-start justify-between gap-2 rounded-md px-3 py-2 text-left", g.id === selId ? "bg-jade-50" : "hover:bg-paper")}
                  >
                    <span className="min-w-0">
                      <span className={clsx("block truncate text-[14px]", g.id === selId ? "font-medium text-jade-800" : "text-ink")}>{g.name}</span>
                      <span className="block text-xs text-ink-mute">{g.code} · {DATA_SCOPE[g.data_scope]?.label}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1 pt-0.5">
                      {g.is_system && <Lock className="size-3.5 text-ink-mute" aria-label="กลุ่มมาตรฐาน" />}
                      <span className="num inline-flex items-center gap-0.5 text-xs text-ink-mute"><Users className="size-3" />{counts[g.id] ?? 0}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Panel>

          {!draft ? (
            <Panel><Empty icon={<ShieldCheck className="size-8" />} title="เลือกกลุ่มผู้ใช้ทางซ้าย" /></Panel>
          ) : (
            <div className="flex min-w-0 flex-col gap-4">
              <Panel
                title={<span className="inline-flex items-center gap-2">{draft.is_system && <Badge>กลุ่มมาตรฐาน</Badge>}<span className="font-mono text-sm text-ink-soft">{draft.code}</span></span>}
                actions={
                  <>
                    {canCreate && <Button size="sm" variant="ghost" icon={<Copy className="size-4" />} onClick={() => setCreating({ copyFrom: draft })}>คัดลอกเป็นกลุ่มใหม่</Button>}
                    {canDelete && !draft.is_system && <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" />} onClick={() => remove(draft)}>ลบกลุ่ม</Button>}
                  </>
                }
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="ชื่อกลุ่ม" required><Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} disabled={readOnly} /></Field>
                  <Field label="คำอธิบาย"><Input value={draft.description ?? ""} onChange={(e) => setDraft({ ...draft, description: e.target.value })} disabled={readOnly} /></Field>
                </div>
                <fieldset className="mt-4">
                  <legend className="mb-2 text-sm font-medium text-ink-soft">ขอบเขตข้อมูลพนักงานที่เห็นได้</legend>
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {Object.entries(DATA_SCOPE).map(([k, s]) => (
                      <label key={k} className={clsx("flex items-start gap-2 rounded-[var(--radius-ctl)] border p-2.5", draft.data_scope === k ? "border-jade-500 bg-jade-50/60" : "border-line", readOnly ? "cursor-default" : "cursor-pointer hover:border-jade-300")}>
                        <input type="radio" name="scope" className="mt-1 accent-jade-600" checked={draft.data_scope === k} disabled={readOnly} onChange={() => setDraft({ ...draft, data_scope: k })} />
                        <span><span className="block text-[14px] font-medium">{s.label}</span><span className="block text-xs text-ink-soft">{s.hint}</span></span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              </Panel>

              <Panel
                title="สิทธิ์การใช้งานเมนู"
                bodyClass="p-0"
                footer={
                  canEdit ? (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm text-ink-soft">{dirty ? "มีการแก้ไขที่ยังไม่บันทึก" : "หัวหน้างานเห็นข้อมูลลูกทีมและอนุมัติเอกสารได้เสมอ โดยไม่ต้องให้สิทธิ์"}</span>
                      <div className="flex gap-2">
                        {dirty && <Button variant="secondary" onClick={() => setDraft(structuredClone(selected!))}>ยกเลิก</Button>}
                        <Button onClick={save} loading={saving} disabled={!dirty}>บันทึกสิทธิ์</Button>
                      </div>
                    </div>
                  ) : undefined
                }
              >
                <div className="thin-scroll overflow-x-auto">
                  <table className="w-full min-w-[720px] text-[14px]">
                    <thead>
                      <tr className="border-b border-line bg-paper/60 text-[13px] text-ink-soft">
                        <th className="px-4 py-2 text-left font-medium">เมนู</th>
                        {ACTIONS.map((a) => (
                          <th key={a} className="w-20 px-2 py-2 text-center font-medium">
                            {canEdit ? (
                              <button type="button" className="hover:text-jade-700" title={`เลือก/ยกเลิก “${ACTION_LABELS[a]}” ทุกเมนู`} onClick={() => toggleCol(a, !MENUS.filter((m) => (m.actions as readonly Action[]).includes(a)).every((m) => draft.permissions[m.key]?.includes(a)))}>
                                {ACTION_LABELS[a]}
                              </button>
                            ) : ACTION_LABELS[a]}
                          </th>
                        ))}
                        <th className="w-16 px-2 py-2 text-center font-medium">ทั้งหมด</th>
                      </tr>
                    </thead>
                    <tbody>
                      {MENUS.map((m) => {
                        const acts = m.actions as readonly Action[];
                        const cur = draft.permissions[m.key] ?? [];
                        const all = acts.every((a) => cur.includes(a));
                        return (
                          <tr key={m.key} className={clsx("border-b border-line-soft last:border-0", cur.length ? "" : "text-ink-soft")}>
                            <td className="px-4 py-2">
                              {m.label}
                              {m.key === "employee_private" && <span className="ml-1 text-xs text-amber-ink">(ระวัง)</span>}
                            </td>
                            {ACTIONS.map((a) => (
                              <td key={a} className="px-2 py-2 text-center">
                                {acts.includes(a) ? (
                                  <input
                                    type="checkbox"
                                    className="size-4 accent-jade-600"
                                    checked={cur.includes(a)}
                                    disabled={readOnly}
                                    onChange={(e) => toggle(m.key, a, e.target.checked)}
                                    aria-label={`${m.label}: ${ACTION_LABELS[a]}`}
                                  />
                                ) : (
                                  <span className="text-line" aria-hidden>—</span>
                                )}
                              </td>
                            ))}
                            <td className="px-2 py-2 text-center">
                              <input type="checkbox" className="size-4 accent-jade-600" checked={all} disabled={readOnly} onChange={(e) => toggleRow(m.key, acts, e.target.checked)} aria-label={`${m.label}: ทั้งหมด`} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Panel>
            </div>
          )}
        </div>
      )}
      <CreateGroupModal
        state={creating}
        onClose={() => setCreating(null)}
        onCreated={async (id) => {
          setCreating(null);
          await load();
          setSelId(id);
        }}
      />
      {dialog}
    </div>
  );
}

function normalize(g: Group) {
  const perms: Record<string, string[]> = {};
  for (const m of MENUS) {
    const a = g.permissions[m.key];
    if (a?.length) perms[m.key] = [...a].sort();
  }
  return { name: g.name, description: g.description ?? "", data_scope: g.data_scope, perms };
}

function CreateGroupModal({ state, onClose, onCreated }: { state: null | { copyFrom?: Group }; onClose: () => void; onCreated: (id: number) => void }) {
  const [v, setV] = useState({ code: "", name: "", description: "" });
  const [err, setErr] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (state) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount / reset form when opened
      setErr({});
      setV({ code: state.copyFrom ? `${state.copyFrom.code}_COPY` : "", name: state.copyFrom ? `${state.copyFrom.name} (สำเนา)` : "", description: state.copyFrom?.description ?? "" });
    }
  }, [state]);
  async function save() {
    const e: Record<string, string> = {};
    if (!/^[A-Z0-9_]{2,30}$/.test(v.code)) e.code = "ใช้ A-Z 0-9 _ ยาว 2–30 ตัว";
    if (!v.name.trim()) e.name = "จำเป็นต้องกรอก";
    setErr(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    const { data, error } = await supabaseBrowser()
      .from("role_groups")
      .insert({ code: v.code, name: v.name.trim(), description: v.description.trim() || null, permissions: state?.copyFrom?.permissions ?? {}, data_scope: state?.copyFrom?.data_scope ?? "self", is_system: false })
      .select("id")
      .single();
    setSaving(false);
    if (error) return toast.error(error.message.includes("duplicate") ? "รหัสกลุ่มนี้มีอยู่แล้ว" : humanError(error));
    toast.ok("เพิ่มกลุ่มแล้ว กำหนดสิทธิ์ต่อได้เลย");
    onCreated((data as { id: number }).id);
  }
  return (
    <Modal open={!!state} onClose={onClose} title={state?.copyFrom ? `คัดลอกกลุ่ม ${state.copyFrom.name}` : "เพิ่มกลุ่มผู้ใช้"} footer={<><Button variant="secondary" onClick={onClose}>ยกเลิก</Button><Button onClick={save} loading={saving}>เพิ่มกลุ่ม</Button></>}>
      <div className="flex flex-col gap-3">
        <Field label="รหัสกลุ่ม" required error={err.code} hint="ใช้อ้างอิงในลำดับขั้นการอนุมัติ เช่น QC_LEAD"><Input value={v.code} onChange={(e) => setV({ ...v, code: e.target.value.toUpperCase().replace(/\s/g, "_") })} className="font-mono" /></Field>
        <Field label="ชื่อกลุ่ม" required error={err.name}><Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
        <Field label="คำอธิบาย"><Textarea rows={2} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}
