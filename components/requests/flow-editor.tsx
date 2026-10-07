"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, FlaskConical, GitBranch, Pencil, Plus, Trash2, UserCheck } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useCan } from "@/components/app/me-context";
import { EmployeePicker, type EmpOption } from "@/components/crud/employee-picker";
import { Badge, Button, Empty, Field, Input, Modal, PageHeader, Panel, Select, Spinner, Toggle, clsx, toast, useConfirm } from "@/components/ui";
import { UserPicker } from "./user-picker";
import { STEP_TYPES, errMsg, stepLabel, type FlowStep } from "./lib";
import { loadReqLookups, orgOptions, useReqLookups } from "./use-req-lookups";

interface Flow {
  id: number;
  name: string;
  request_type: string | null;
  org_unit_id: number | null;
  branch_id: number | null;
  priority: number;
  steps: FlowStep[];
  skip_self: boolean;
  skip_missing: boolean;
  auto_approve_if_empty: boolean;
  is_active: boolean;
}

type Draft = Omit<Flow, "id"> & { id?: number };
const NEW: Draft = { name: "", request_type: null, org_unit_id: null, branch_id: null, priority: 0, steps: [{ type: "supervisor", level: 1 }, { type: "role", role_code: "HR" }], skip_self: true, skip_missing: true, auto_approve_if_empty: false, is_active: true };
const MAX_STEPS = 10;

interface ProfileOpt { id: string; label: string }

export function FlowEditor() {
  const sb = supabaseBrowser();
  const can = useCan();
  const lk = useReqLookups();
  const canEdit = can("request_admin", "edit");
  const [flows, setFlows] = useState<Flow[]>([]);
  const [usage, setUsage] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [users, setUsers] = useState<ProfileOpt[]>([]);
  const [testOpen, setTestOpen] = useState(false);
  const { confirm, dialog } = useConfirm();

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data, error }, used] = await Promise.all([
      sb.from("approval_flows").select("*").order("request_type", { nullsFirst: true }).order("priority", { ascending: false }).order("id"),
      sb.from("requests").select("flow_id").eq("status", "pending").not("flow_id", "is", null).limit(5000),
    ]);
    if (error) toast.error(errMsg(error));
    setFlows((data ?? []) as Flow[]);
    const u: Record<number, number> = {};
    for (const r of (used.data ?? []) as { flow_id: number }[]) u[r.flow_id] = (u[r.flow_id] ?? 0) + 1;
    setUsage(u);
    setLoading(false);
  }, [sb]);

  useEffect(() => {
    load();
    sb.from("profiles")
      .select("id, username, display_name, is_active, employees:employee_id(first_name, last_name, code)")
      .eq("is_active", true)
      .order("username")
      .then(({ data }: { data: unknown }) =>
        setUsers(
          ((data ?? []) as unknown as { id: string; username: string | null; display_name: string | null; employees: { first_name: string; last_name: string; code: string } | null }[]).map((p) => ({
            id: p.id,
            label: p.display_name || (p.employees ? `${p.employees.first_name} ${p.employees.last_name}` : p.username || p.id.slice(0, 8)) + (p.employees?.code ? ` · ${p.employees.code}` : p.username ? ` · ${p.username}` : ""),
          })),
        ),
      );
  }, [load, sb]);

  const names = useMemo(
    () => ({ users: Object.fromEntries(users.map((u) => [u.id, u.label])), roles: Object.fromEntries(lk.roles.map((r) => [r.code, r.name])) }),
    [users, lk.roles],
  );
  const typeName = Object.fromEntries(lk.types.map((t) => [t.code, t.name]));
  const orgName = Object.fromEntries(lk.orgUnits.map((o) => [o.id, o.name]));
  const branchName = Object.fromEntries(lk.branches.map((b) => [b.id, b.name]));

  async function save() {
    if (!draft) return;
    if (!draft.name.trim()) return toast.error("กรุณาตั้งชื่อลำดับอนุมัติ");
    if (!draft.steps.length && !draft.auto_approve_if_empty) return toast.error("ต้องมีอย่างน้อย 1 ขั้น หรือเปิด “อนุมัติอัตโนมัติเมื่อไม่มีผู้อนุมัติ”");
    for (const [i, s] of draft.steps.entries()) {
      if (s.type === "user" && !s.user_id) return toast.error(`ขั้นที่ ${i + 1}: กรุณาเลือกผู้ใช้`);
      if (s.type === "role" && !s.role_code) return toast.error(`ขั้นที่ ${i + 1}: กรุณาเลือกกลุ่มผู้ใช้`);
    }
    const steps = draft.steps.map((s) =>
      s.type === "supervisor" ? { type: s.type, level: Number(s.level ?? 1) } : s.type === "user" ? { type: s.type, user_id: s.user_id } : s.type === "role" ? { type: s.type, role_code: s.role_code } : { type: s.type },
    );
    const payload = {
      name: draft.name.trim(),
      request_type: draft.request_type || null,
      org_unit_id: draft.org_unit_id || null,
      branch_id: draft.branch_id || null,
      priority: Number(draft.priority) || 0,
      steps,
      skip_self: draft.skip_self,
      skip_missing: draft.skip_missing,
      auto_approve_if_empty: draft.auto_approve_if_empty,
      is_active: draft.is_active,
    };
    setSaving(true);
    const { error } = draft.id ? await sb.from("approval_flows").update(payload).eq("id", draft.id) : await sb.from("approval_flows").insert(payload);
    setSaving(false);
    if (error) return toast.error(errMsg(error));
    toast.ok("บันทึกลำดับอนุมัติแล้ว — ใช้กับเอกสารที่ยื่นหลังจากนี้");
    setDraft(null);
    load();
  }

  async function remove(f: Flow) {
    if (!(await confirm(<>ลบลำดับอนุมัติ “{f.name}”? เอกสารที่ยื่นไปแล้วยังใช้ลำดับเดิมจนจบ</>, { danger: true, confirmText: "ลบ" }))) return;
    const { error } = await sb.from("approval_flows").delete().eq("id", f.id);
    if (error) {
      if (/foreign key|violates/i.test(error.message)) {
        toast.error("ลำดับนี้ถูกใช้กับเอกสารแล้ว ลบไม่ได้ — ปิดการใช้งานแทน");
        await sb.from("approval_flows").update({ is_active: false }).eq("id", f.id);
        load();
      } else toast.error(errMsg(error));
      return;
    }
    toast.ok("ลบแล้ว");
    load();
  }

  async function toggleActive(f: Flow) {
    const { error } = await sb.from("approval_flows").update({ is_active: !f.is_active }).eq("id", f.id);
    if (error) return toast.error(errMsg(error));
    load();
  }

  return (
    <>
      <PageHeader
        title="ลำดับขั้นการอนุมัติ"
        description="กำหนดว่าเอกสารแต่ละประเภทต้องผ่านใครบ้าง (สูงสุด 10 ขั้น) ระบบเลือกลำดับที่เจาะจงที่สุด: ระบุประเภทเอกสาร > ระบุหน่วยงาน > ลำดับความสำคัญสูงกว่า"
        actions={
          <>
            <Button variant="secondary" icon={<FlaskConical className="size-4" />} onClick={() => setTestOpen(true)}>
              ทดสอบลำดับอนุมัติ
            </Button>
            {canEdit && (
              <Button icon={<Plus className="size-4" />} onClick={() => setDraft({ ...NEW, steps: NEW.steps.map((s) => ({ ...s })) })}>
                เพิ่มลำดับอนุมัติ
              </Button>
            )}
          </>
        }
      />

      <Panel bodyClass="p-0">
        {loading ? (
          <div className="flex justify-center py-10"><Spinner /></div>
        ) : flows.length === 0 ? (
          <Empty icon={<GitBranch className="size-8" />} title="ยังไม่มีลำดับอนุมัติ" description="ถ้าไม่มีลำดับที่ตรง ระบบใช้ค่าเริ่มต้น: หัวหน้างาน → ฝ่ายบุคคล" />
        ) : (
          <ul className="divide-y divide-line-soft">
            {flows.map((f) => (
              <li key={f.id} className={clsx("flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start", !f.is_active && "opacity-60")}>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{f.name}</span>
                    {!f.is_active && <Badge>ปิดใช้งาน</Badge>}
                    {usage[f.id] ? <Badge color="amber">รออนุมัติ {usage[f.id]} ฉบับ</Badge> : null}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1.5 text-sm">
                    <Badge color={f.request_type ? "blue" : "gray"}>{f.request_type ? typeName[f.request_type] ?? f.request_type : "ทุกประเภทเอกสาร"}</Badge>
                    {f.org_unit_id && <Badge color="violet">หน่วยงาน: {orgName[f.org_unit_id] ?? f.org_unit_id}</Badge>}
                    {f.branch_id && <Badge color="violet">สาขา: {branchName[f.branch_id] ?? f.branch_id}</Badge>}
                    <span className="num text-xs text-ink-mute self-center">ลำดับความสำคัญ {f.priority}</span>
                  </div>
                  <ol className="mt-2 flex flex-wrap items-center gap-1 text-sm text-ink-soft">
                    {f.steps.map((s, i) => (
                      <li key={i} className="flex items-center gap-1">
                        {i > 0 && <span className="text-ink-mute">→</span>}
                        <span className="rounded-md border border-line bg-paper px-2 py-0.5">
                          <span className="num mr-1 text-xs text-ink-mute">{i + 1}</span>
                          {stepLabel(s, names)}
                        </span>
                      </li>
                    ))}
                    {!f.steps.length && <li className="text-ink-mute">ไม่มีขั้น (อนุมัติอัตโนมัติ)</li>}
                  </ol>
                </div>
                {canEdit && (
                  <div className="flex shrink-0 items-center gap-1">
                    <Toggle checked={f.is_active} onChange={() => toggleActive(f)} />
                    <Button size="sm" variant="ghost" icon={<Pencil className="size-4" />} onClick={() => setDraft({ ...f, steps: f.steps.map((s) => ({ ...s })) })}>
                      แก้ไข
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(f)} aria-label="ลบ">
                      <Trash2 className="size-4 text-rust" />
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Modal
        open={!!draft}
        onClose={() => setDraft(null)}
        title={draft?.id ? "แก้ไขลำดับอนุมัติ" : "เพิ่มลำดับอนุมัติ"}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDraft(null)}>
              ยกเลิก
            </Button>
            <Button loading={saving} onClick={save}>
              บันทึก
            </Button>
          </>
        }
      >
        {draft && <FlowForm draft={draft} setDraft={setDraft} users={users} />}
      </Modal>

      <TestChain open={testOpen} onClose={() => setTestOpen(false)} names={names} />
      {dialog}
    </>
  );
}

function FlowForm({ draft, setDraft, users }: { draft: Draft; setDraft: (d: Draft) => void; users: ProfileOpt[] }) {
  const lk = useReqLookups();
  const set = (p: Partial<Draft>) => setDraft({ ...draft, ...p });
  const setStep = (i: number, s: FlowStep) => set({ steps: draft.steps.map((x, j) => (j === i ? s : x)) });
  const move = (i: number, d: -1 | 1) => {
    const a = [...draft.steps];
    [a[i], a[i + d]] = [a[i + d], a[i]];
    set({ steps: a });
  };
  const orgOpts = orgOptions(lk.orgUnits);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="ชื่อลำดับอนุมัติ" required className="sm:col-span-2">
          <Input value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="เช่น ลาพักร้อนฝ่ายผลิต: หัวหน้า → ผู้จัดการ → HR" />
        </Field>
        <Field label="ใช้กับประเภทเอกสาร">
          <Select value={draft.request_type ?? ""} onChange={(e) => set({ request_type: e.target.value || null })} placeholder="ทุกประเภทเอกสาร">
            {lk.types.map((t) => (
              <option key={t.code} value={t.code}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="ลำดับความสำคัญ" hint="ตัวเลขมากถูกเลือกก่อน เมื่อเงื่อนไขเท่ากัน">
          <Input type="number" value={draft.priority} onChange={(e) => set({ priority: Number(e.target.value) })} />
        </Field>
        <Field label="ใช้กับหน่วยงาน" hint="รวมหน่วยงานย่อยทั้งหมด">
          <Select value={draft.org_unit_id ?? ""} onChange={(e) => set({ org_unit_id: e.target.value ? Number(e.target.value) : null })} placeholder="ทุกหน่วยงาน">
            {orgOpts.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="ใช้กับสาขา">
          <Select value={draft.branch_id ?? ""} onChange={(e) => set({ branch_id: e.target.value ? Number(e.target.value) : null })} placeholder="ทุกสาขา">
            {lk.branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-sm font-medium text-ink-soft">
            ขั้นการอนุมัติ <span className="num text-ink-mute">({draft.steps.length}/{MAX_STEPS})</span>
          </h4>
          <Button size="sm" variant="subtle" icon={<Plus className="size-4" />} disabled={draft.steps.length >= MAX_STEPS} onClick={() => set({ steps: [...draft.steps, { type: "supervisor", level: Math.min(5, draft.steps.filter((s) => s.type === "supervisor").length + 1) }] })}>
            เพิ่มขั้น
          </Button>
        </div>
        <ol className="flex flex-col gap-2">
          {draft.steps.map((s, i) => (
            <li key={i} className="flex flex-col gap-2 rounded-[var(--radius-ctl)] border border-line bg-paper/50 p-2.5 sm:flex-row sm:items-center">
              <span className="num grid size-7 shrink-0 place-items-center rounded-full bg-jade-600 text-sm font-medium text-white">{i + 1}</span>
              <Select
                value={s.type}
                onChange={(e) => {
                  const t = e.target.value as FlowStep["type"];
                  setStep(i, t === "supervisor" ? { type: t, level: 1 } : t === "role" ? { type: t, role_code: "HR" } : { type: t });
                }}
                className="sm:w-48"
                aria-label={`ประเภทขั้นที่ ${i + 1}`}
              >
                {STEP_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
              <div className="min-w-0 flex-1">
                {s.type === "supervisor" && (
                  <Select value={s.level ?? 1} onChange={(e) => setStep(i, { ...s, level: Number(e.target.value) })} aria-label="ลำดับหัวหน้า">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        หัวหน้างานลำดับที่ {n}{n === 1 ? " (หัวหน้าโดยตรง)" : ""}
                      </option>
                    ))}
                  </Select>
                )}
                {s.type === "org_manager" && <p className="text-sm text-ink-soft">ผู้จัดการของหน่วยงานผู้ยื่น (ถ้าไม่มี ใช้ผู้จัดการหน่วยงานแม่)</p>}
                {s.type === "user" && <UserPicker value={s.user_id} onChange={(v) => setStep(i, { ...s, user_id: v ?? undefined })} options={users} />}
                {s.type === "role" && (
                  <Select value={s.role_code ?? ""} onChange={(e) => setStep(i, { ...s, role_code: e.target.value })} placeholder="เลือกกลุ่มผู้ใช้" aria-label="กลุ่มผู้ใช้">
                    {lk.roles.map((r) => (
                      <option key={r.code} value={r.code}>
                        {r.name} ({r.code})
                      </option>
                    ))}
                  </Select>
                )}
              </div>
              <div className="flex shrink-0 gap-0.5 self-end sm:self-auto">
                <Button size="sm" variant="ghost" disabled={i === 0} onClick={() => move(i, -1)} aria-label="เลื่อนขึ้น">
                  <ArrowUp className="size-4" />
                </Button>
                <Button size="sm" variant="ghost" disabled={i === draft.steps.length - 1} onClick={() => move(i, 1)} aria-label="เลื่อนลง">
                  <ArrowDown className="size-4" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => set({ steps: draft.steps.filter((_, j) => j !== i) })} aria-label="ลบขั้น">
                  <Trash2 className="size-4 text-rust" />
                </Button>
              </div>
            </li>
          ))}
          {!draft.steps.length && <li className="rounded-[var(--radius-ctl)] border border-dashed border-line px-3 py-4 text-center text-sm text-ink-mute">ยังไม่มีขั้น — เอกสารจะอนุมัติอัตโนมัติ</li>}
        </ol>
      </section>

      <section className="flex flex-col gap-2.5">
        <Toggle checked={draft.skip_self} onChange={(v) => set({ skip_self: v })} label="ข้ามขั้นที่ผู้อนุมัติคือผู้ยื่นเอง" />
        <Toggle checked={draft.skip_missing} onChange={(v) => set({ skip_missing: v })} label="ข้ามขั้นที่หาผู้อนุมัติไม่พบ (เช่น ไม่มีหัวหน้าลำดับที่ 2)" />
        <Toggle checked={draft.auto_approve_if_empty} onChange={(v) => set({ auto_approve_if_empty: v })} label="อนุมัติอัตโนมัติเมื่อไม่เหลือขั้นให้อนุมัติ" />
        <Toggle checked={draft.is_active} onChange={(v) => set({ is_active: v })} label="เปิดใช้งาน" />
      </section>
    </div>
  );
}

interface Preview {
  flow_id: number | null;
  flow_name: string;
  is_default: boolean;
  auto_approve: boolean;
  total_steps: number;
  steps: { index: number; step: number | null; def: FlowStep; approver_name: string | null; members: string[] | null; note: string | null; over_limit: boolean }[];
}

function TestChain({ open, onClose, names }: { open: boolean; onClose: () => void; names: { users: Record<string, string>; roles: Record<string, string> } }) {
  const lk = useReqLookups();
  const [emps, setEmps] = useState<EmpOption[]>([]);
  const [emp, setEmp] = useState<number | null>(null);
  const [type, setType] = useState("leave");
  const [res, setRes] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || emps.length) return;
    loadReqLookups();
    supabaseBrowser()
      .from("v_directory")
      .select("id, code, first_name, last_name, nickname")
      .neq("status", "resigned")
      .order("code")
      .limit(5000)
      .then(({ data }: { data: unknown }) => setEmps(((data ?? []) as { id: number; code: string; first_name: string; last_name: string; nickname: string | null }[]).map((e) => ({ value: e.id, label: `${e.first_name} ${e.last_name}${e.nickname ? ` (${e.nickname})` : ""}`, raw: { code: e.code } }))));
  }, [open, emps.length]);

  useEffect(() => {
    if (!emp || !type) return setRes(null);
    let alive = true;
    setBusy(true);
    supabaseBrowser()
      .rpc("preview_approval_chain", { p_type: type, p_employee_id: emp })
      .then(({ data, error }: { data: unknown; error: { message: string } | null }) => {
        if (!alive) return;
        setBusy(false);
        if (error) return toast.error(errMsg(error));
        setRes(data as Preview);
      });
    return () => {
      alive = false;
    };
  }, [emp, type]);

  return (
    <Modal open={open} onClose={onClose} title="ทดสอบลำดับอนุมัติ" size="lg">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="พนักงานผู้ยื่น">
          <EmployeePicker value={emp} onChange={setEmp} options={emps} />
        </Field>
        <Field label="ประเภทเอกสาร">
          <Select value={type} onChange={(e) => setType(e.target.value)}>
            {lk.types.map((t) => (
              <option key={t.code} value={t.code}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="mt-4">
        {!emp ? (
          <p className="rounded-[var(--radius-ctl)] bg-paper px-3 py-6 text-center text-sm text-ink-soft">เลือกพนักงานเพื่อดูว่าเอกสารจะผ่านใครบ้าง</p>
        ) : busy && !res ? (
          <div className="flex justify-center py-6"><Spinner /></div>
        ) : res ? (
          <div className={clsx("flex flex-col gap-3", busy && "opacity-60")}>
            <div className="rounded-[var(--radius-ctl)] border border-jade-200 bg-jade-50 px-3 py-2 text-[15px]">
              ใช้ลำดับ: <span className="font-medium">{res.flow_name}</span>
              {res.is_default && <span className="text-ink-soft"> — ไม่มีลำดับที่ตรงเงื่อนไข</span>}
              <div className="text-sm text-ink-soft">{res.auto_approve ? "ไม่มีผู้อนุมัติ — เอกสารจะอนุมัติอัตโนมัติทันที" : `ผ่านการอนุมัติ ${res.total_steps} ขั้น`}</div>
            </div>
            <ol className="flex flex-col gap-2">
              {res.steps.map((s) => {
                const skipped = s.step == null;
                return (
                  <li key={s.index} className={clsx("flex items-start gap-3 rounded-[var(--radius-ctl)] border px-3 py-2", skipped ? "border-dashed border-line text-ink-mute" : "border-line")}>
                    <span className={clsx("num grid size-7 shrink-0 place-items-center rounded-full text-sm font-medium", skipped ? "bg-paper text-ink-mute" : "bg-jade-600 text-white")}>{s.step ?? "–"}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-ink-soft">{stepLabel(s.def, names)}</div>
                      <div className="flex items-center gap-1.5 text-[15px]">
                        <UserCheck className="size-4 shrink-0 text-jade-600" />
                        {s.def.type === "role" ? (
                          <span>{s.members?.length ? s.members.join(", ") : <span className="text-rust">ไม่มีผู้ใช้ในกลุ่มนี้</span>} <span className="text-xs text-ink-mute">(คนใดคนหนึ่งอนุมัติได้)</span></span>
                        ) : (
                          <span>{s.approver_name ?? "-"}</span>
                        )}
                      </div>
                      {s.note && <div className={clsx("text-sm", s.note.startsWith("ข้าม") ? "text-ink-mute" : "text-rust")}>{s.note}</div>}
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
