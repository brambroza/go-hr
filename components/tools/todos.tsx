"use client";

// To-do lists — used by /todos (kanban on desktop) and /m/todos (list on mobile)
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, CalendarDays, CheckCircle2, Circle, ListChecks, Plus, Trash2, Users } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useCan, useMe } from "@/components/app/me-context";
import { EmployeePicker, type EmpOption } from "@/components/crud/employee-picker";
import { Avatar } from "@/components/employees/avatar";
import { Badge, Button, Empty, Field, Input, Modal, Select, Spinner, Tabs, Textarea, clsx, errorText, toast, useConfirm } from "@/components/ui";
import { isoDate, thDate } from "@/lib/format";

type Status = "todo" | "doing" | "done" | "cancelled";
type Priority = "low" | "normal" | "high" | "urgent";
type ChecklistItem = { text: string; done: boolean };
export type Todo = {
  id: number; title: string; description: string | null; assignee_employee_id: number | null; team_id: number | null; created_by: string | null;
  due_date: string | null; priority: Priority; status: Status; checklist: ChecklistItem[]; completed_at: string | null; source: string | null; created_at: string;
};
type Team = { id: number; name: string };
type Emp = { id: number; code: string; first_name: string; last_name: string; nickname: string | null; photo_url: string | null };

const COLS: { key: Status; label: string; tone: string }[] = [
  { key: "todo", label: "ต้องทำ", tone: "bg-paper" },
  { key: "doing", label: "กำลังทำ", tone: "bg-amber-50/60" },
  { key: "done", label: "เสร็จแล้ว", tone: "bg-jade-50/60" },
];
const PRIORITY: Record<Priority, { label: string; color: string }> = {
  low: { label: "ต่ำ", color: "gray" },
  normal: { label: "ปกติ", color: "blue" },
  high: { label: "สูง", color: "amber" },
  urgent: { label: "ด่วนมาก", color: "red" },
};
const SCOPES = [
  { value: "mine", label: "งานของฉัน" },
  { value: "team", label: "งานของทีม" },
  { value: "assigned", label: "งานที่ฉันมอบหมาย" },
  { value: "all", label: "ทั้งหมด" },
] as const;
type Scope = (typeof SCOPES)[number]["value"];

const isOverdue = (t: Todo, today: string) => !!t.due_date && t.due_date < today && t.status !== "done" && t.status !== "cancelled";

export function Todos({ variant = "desktop" }: { variant?: "desktop" | "mobile" }) {
  const sb = supabaseBrowser();
  const me = useMe();
  const can = useCan();
  const params = useSearchParams();
  const { confirm, dialog } = useConfirm();
  const today = isoDate();
  const [rows, setRows] = useState<Todo[] | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [myTeams, setMyTeams] = useState<number[]>([]);
  const [emps, setEmps] = useState<Map<number, Emp>>(new Map());
  const [scope, setScope] = useState<Scope>(me.employeeId ? "mine" : can("tools", "view") ? "all" : "assigned");
  const [showDone, setShowDone] = useState(variant === "desktop");
  const [editing, setEditing] = useState<Partial<Todo> | null>(null);
  const [dragId, setDragId] = useState<number | null>(null);

  const load = useCallback(async () => {
    const [t, tm, mt, e] = await Promise.all([
      sb.from("todos").select("*").neq("status", "cancelled").order("due_date", { ascending: true, nullsFirst: false }).order("id", { ascending: false }).limit(1000),
      sb.from("teams").select("id, name").eq("is_active", true).order("name"),
      me.employeeId ? sb.from("team_members").select("team_id").eq("employee_id", me.employeeId) : Promise.resolve({ data: [] as { team_id: number }[] }),
      sb.from("v_directory").select("id, code, first_name, last_name, nickname, photo_url").order("code").limit(5000),
    ]);
    if (t.error) toast.error(t.error.message);
    setRows((t.data ?? []) as Todo[]);
    setTeams((tm.data ?? []) as Team[]);
    setMyTeams(((mt.data ?? []) as { team_id: number }[]).map((x) => x.team_id));
    setEmps(new Map(((e.data ?? []) as Emp[]).map((x) => [x.id, x])));
  }, [sb, me.employeeId]);

  useEffect(() => {
    load();
  }, [load]);

  // open a task from a notification link (?id=)
  useEffect(() => {
    const id = Number(params.get("id"));
    if (id && rows) {
      const t = rows.find((r) => r.id === id);
      if (t) setEditing(t);
    }
  }, [params, rows]);

  const filtered = useMemo(() => {
    const list = rows ?? [];
    const f = list.filter((t) => {
      if (scope === "mine") return t.assignee_employee_id === me.employeeId;
      if (scope === "team") return t.team_id != null && myTeams.includes(t.team_id);
      if (scope === "assigned") return t.created_by === me.userId;
      return true;
    });
    return showDone ? f : f.filter((t) => t.status !== "done");
  }, [rows, scope, me, myTeams, showDone]);

  const counts = useMemo(() => {
    const list = (rows ?? []).filter((t) => t.status !== "done");
    return {
      mine: list.filter((t) => t.assignee_employee_id === me.employeeId).length,
      team: list.filter((t) => t.team_id != null && myTeams.includes(t.team_id)).length,
      assigned: list.filter((t) => t.created_by === me.userId).length,
      all: list.length,
    };
  }, [rows, me, myTeams]);

  const setStatus = async (t: Todo, status: Status) => {
    if (t.status === status) return;
    setRows((l) => l?.map((x) => (x.id === t.id ? { ...x, status } : x)) ?? null);
    const { error } = await sb.from("todos").update({ status }).eq("id", t.id);
    if (error) {
      toast.error(`เปลี่ยนสถานะไม่ได้: ${errorText(error)}`);
      load();
    } else toast.ok(`ย้ายไป “${COLS.find((c) => c.key === status)?.label ?? "ยกเลิก"}” แล้ว`);
  };

  const toggleCheck = async (t: Todo, i: number) => {
    const checklist = t.checklist.map((c, j) => (j === i ? { ...c, done: !c.done } : c));
    setRows((l) => l?.map((x) => (x.id === t.id ? { ...x, checklist } : x)) ?? null);
    const { error } = await sb.from("todos").update({ checklist }).eq("id", t.id);
    if (error) toast.error(error.message);
  };

  const remove = async (t: Todo) => {
    if (!(await confirm(`ลบงาน "${t.title}"?`, { danger: true, confirmText: "ลบงาน" }))) return;
    const { error } = await sb.from("todos").delete().eq("id", t.id);
    if (error) return toast.error(`ลบไม่ได้: ${errorText(error)}`);
    toast.ok("ลบงานแล้ว");
    setEditing(null);
    load();
  };

  const scopeOptions = SCOPES.filter((s) => s.value !== "all" || can("tools", "view"));
  const ctx = { emps, teams, today };

  return (
    <div>
      <div className={clsx("mb-4 flex flex-wrap items-center justify-between gap-3", variant === "mobile" && "flex-col items-stretch")}>
        {variant === "desktop" ? (
          <Tabs tabs={scopeOptions.map((s) => ({ value: s.value, label: s.label, count: counts[s.value] }))} value={scope} onChange={setScope} className="border-b-0" />
        ) : (
          <div className="thin-scroll -mx-4 flex gap-2 overflow-x-auto px-4">
            {scopeOptions.map((s) => (
              <button key={s.value} type="button" onClick={() => setScope(s.value)}
                className={clsx("h-9 shrink-0 rounded-full border px-3.5 text-sm", scope === s.value ? "border-jade-600 bg-jade-600 text-white" : "border-line bg-white text-ink-soft")}>
                {s.label} <span className="num ml-0.5 opacity-80">{counts[s.value]}</span>
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-3">
          <label className="inline-flex items-center gap-2 text-sm text-ink-soft">
            <input type="checkbox" className="size-4 accent-jade-600" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> แสดงงานที่เสร็จแล้ว
          </label>
          <Button icon={<Plus className="size-4" />} onClick={() => setEditing({ priority: "normal", status: "todo", checklist: [], assignee_employee_id: me.employeeId })} className={clsx(variant === "mobile" && "ml-auto h-11")}>
            เพิ่มงาน
          </Button>
        </div>
      </div>

      {!rows ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : variant === "desktop" ? (
        <div className="grid gap-3 lg:grid-cols-3">
          {COLS.filter((c) => showDone || c.key !== "done").map((c) => {
            const list = filtered.filter((t) => t.status === c.key);
            return (
              <section
                key={c.key}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  const t = rows.find((r) => r.id === dragId);
                  if (t) setStatus(t, c.key);
                  setDragId(null);
                }}
                className={clsx("flex min-h-60 flex-col rounded-[var(--radius-panel)] border border-line p-2", c.tone)}
              >
                <h2 className="flex items-center justify-between px-2 pb-2 pt-1 text-sm font-semibold text-ink-soft">
                  {c.label} <span className="num rounded-full bg-white px-2 text-xs ring-1 ring-line">{list.length}</span>
                </h2>
                <div className="flex flex-col gap-2">
                  {list.map((t) => (
                    <TodoCard key={t.id} t={t} ctx={ctx} draggable onDragStart={() => setDragId(t.id)} onOpen={() => setEditing(t)} onStatus={(s) => setStatus(t, s)} />
                  ))}
                  {!list.length && <p className="px-2 py-6 text-center text-sm text-ink-mute">ลากงานมาวางที่นี่</p>}
                </div>
              </section>
            );
          })}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-[var(--radius-panel)] border border-line bg-white">
          <Empty icon={<ListChecks className="size-8" />} title="ไม่มีงานค้าง" description="งานที่ได้รับมอบหมายจะแสดงที่นี่" />
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map((t) => (
            <li key={t.id}>
              <TodoCard t={t} ctx={ctx} mobile onOpen={() => setEditing(t)} onStatus={(s) => setStatus(t, s)} onCheck={(i) => toggleCheck(t, i)} />
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <TodoForm
          value={editing}
          teams={teams}
          emps={emps}
          canDelete={!!editing.id && (editing.created_by === me.userId || can("tools", "delete"))}
          onDelete={() => remove(editing as Todo)}
          onClose={() => setEditing(null)}
          onSaved={() => (setEditing(null), load())}
        />
      )}
      {dialog}
    </div>
  );
}

function Assignee({ t, ctx }: { t: Todo; ctx: { emps: Map<number, Emp>; teams: Team[] } }) {
  if (t.assignee_employee_id) {
    const e = ctx.emps.get(t.assignee_employee_id);
    return (
      <span className="inline-flex min-w-0 items-center gap-1.5">
        <Avatar src={e?.photo_url} name={e ? `${e.first_name} ${e.last_name}` : "?"} size={22} />
        <span className="truncate">{e ? `${e.first_name}${e.nickname ? ` (${e.nickname})` : ""}` : "พนักงาน"}</span>
      </span>
    );
  }
  if (t.team_id) return <span className="inline-flex items-center gap-1"><Users className="size-4" /> {ctx.teams.find((x) => x.id === t.team_id)?.name ?? "ทีม"}</span>;
  return <span className="text-ink-mute">ยังไม่มอบหมาย</span>;
}

function TodoCard({ t, ctx, mobile, onOpen, onStatus, onCheck, draggable, onDragStart }: {
  t: Todo; ctx: { emps: Map<number, Emp>; teams: Team[]; today: string }; mobile?: boolean; onOpen: () => void; onStatus: (s: Status) => void; onCheck?: (i: number) => void; draggable?: boolean; onDragStart?: () => void;
}) {
  const overdue = isOverdue(t, ctx.today);
  const doneItems = t.checklist?.filter((c) => c.done).length ?? 0;
  const done = t.status === "done";
  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      className={clsx("rounded-[var(--radius-ctl)] border bg-white p-3 shadow-[0_1px_0_rgba(0,0,0,0.02)]", overdue ? "border-rust/50" : "border-line", draggable && "cursor-grab active:cursor-grabbing")}
    >
      <div className="flex items-start gap-2.5">
        <button type="button" aria-label={done ? "ทำเครื่องหมายว่ายังไม่เสร็จ" : "ทำเครื่องหมายว่าเสร็จแล้ว"} onClick={() => onStatus(done ? "todo" : "done")}
          className={clsx("-m-1 shrink-0 p-1", mobile && "-m-2 p-2")}>
          {done ? <CheckCircle2 className="size-5 text-jade-600" /> : <Circle className={clsx("size-5", overdue ? "text-rust" : "text-ink-mute")} />}
        </button>
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
          <div className={clsx("text-[15px] font-medium leading-snug", done && "text-ink-mute line-through")}>{t.title}</div>
          {t.description && !mobile && <p className="mt-0.5 line-clamp-2 text-sm text-ink-soft">{t.description}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-soft">
            <Assignee t={t} ctx={ctx} />
            {t.due_date && (
              <span className={clsx("inline-flex items-center gap-1", overdue && "font-medium text-rust")}>
                {overdue ? <AlertTriangle className="size-3.5" /> : <CalendarDays className="size-3.5" />}
                {overdue ? `เลยกำหนด ${thDate(t.due_date)}` : thDate(t.due_date)}
              </span>
            )}
            {t.checklist?.length > 0 && <span className="inline-flex items-center gap-1"><ListChecks className="size-3.5" /> {doneItems}/{t.checklist.length}</span>}
            {t.priority !== "normal" && <Badge color={PRIORITY[t.priority].color}>{PRIORITY[t.priority].label}</Badge>}
            {t.source === "automation" && <Badge color="violet">อัตโนมัติ</Badge>}
          </div>
        </button>
      </div>
      {mobile && !done && (
        <div className="mt-2 flex gap-2 pl-8">
          {t.status === "todo" ? (
            <button type="button" onClick={() => onStatus("doing")} className="h-9 rounded-full border border-line px-3 text-sm text-ink-soft active:bg-paper">เริ่มทำ</button>
          ) : (
            <Badge color="amber" className="h-7">กำลังทำ</Badge>
          )}
          {onCheck && t.checklist?.length > 0 && t.checklist.length <= 4 && (
            <div className="flex flex-wrap gap-1.5">
              {t.checklist.map((c, i) => (
                <button key={i} type="button" onClick={() => onCheck(i)} className={clsx("h-9 rounded-full border px-3 text-sm", c.done ? "border-jade-200 bg-jade-50 text-jade-800 line-through" : "border-line text-ink-soft")}>
                  {c.text}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TodoForm({ value, teams, emps, canDelete, onDelete, onClose, onSaved }: {
  value: Partial<Todo>; teams: Team[]; emps: Map<number, Emp>; canDelete: boolean; onDelete: () => void; onClose: () => void; onSaved: () => void;
}) {
  const sb = supabaseBrowser();
  const me = useMe();
  const [v, setV] = useState<Partial<Todo>>({ ...value, checklist: value.checklist ?? [] });
  const [mode, setMode] = useState<"employee" | "team">(value.team_id ? "team" : "employee");
  const [newItem, setNewItem] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<Record<string, string>>({});
  const options: EmpOption[] = useMemo(() => [...emps.values()].map((e) => ({ value: e.id, label: `${e.first_name} ${e.last_name}${e.nickname ? ` (${e.nickname})` : ""}`, raw: e })), [emps]);
  const set = (patch: Partial<Todo>) => setV((x) => ({ ...x, ...patch }));

  const save = async () => {
    const e: Record<string, string> = {};
    if (!v.title?.trim()) e.title = "กรอกชื่องาน";
    if (mode === "team" && !v.team_id) e.assignee = "เลือกทีมที่รับผิดชอบ";
    setErr(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    const checklist = [...(v.checklist ?? []), ...(newItem.trim() ? [{ text: newItem.trim(), done: false }] : [])];
    const row = {
      title: v.title!.trim(),
      description: v.description?.trim() || null,
      assignee_employee_id: mode === "employee" ? v.assignee_employee_id ?? null : null,
      team_id: mode === "team" ? v.team_id ?? null : null,
      due_date: v.due_date || null,
      priority: v.priority ?? "normal",
      status: v.status ?? "todo",
      checklist,
    };
    const res = v.id ? await sb.from("todos").update(row).eq("id", v.id) : await sb.from("todos").insert({ ...row, created_by: me.userId, source: "manual" });
    setSaving(false);
    if (res.error) return toast.error(`บันทึกไม่ได้: ${res.error.message}`);
    toast.ok(v.id ? "บันทึกงานแล้ว" : row.assignee_employee_id && row.assignee_employee_id !== me.employeeId ? "มอบหมายงานแล้ว ระบบแจ้งเตือนผู้รับผิดชอบแล้ว" : "เพิ่มงานแล้ว");
    onSaved();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={v.id ? "รายละเอียดงาน" : "เพิ่มงาน"}
      footer={
        <>
          {canDelete && <Button variant="ghost" className="mr-auto text-rust" icon={<Trash2 className="size-4" />} onClick={onDelete}>ลบงาน</Button>}
          <Button variant="secondary" onClick={onClose}>ยกเลิก</Button>
          <Button loading={saving} onClick={save}>บันทึก</Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="ชื่องาน" required error={err.title}>
          <Input value={v.title ?? ""} onChange={(e) => set({ title: e.target.value })} maxLength={300} placeholder="เช่น เตรียมเอกสารต่อใบอนุญาตทำงาน" />
        </Field>
        <Field label="รายละเอียด">
          <Textarea value={v.description ?? ""} onChange={(e) => set({ description: e.target.value })} rows={3} />
        </Field>
        <div>
          <div className="mb-1 flex items-center gap-3 text-sm font-medium text-ink-soft">
            ผู้รับผิดชอบ
            <span className="inline-flex rounded-md bg-paper p-0.5 text-xs">
              {(["employee", "team"] as const).map((m) => (
                <button key={m} type="button" onClick={() => setMode(m)} className={clsx("rounded px-2 py-1", mode === m && "bg-white font-medium shadow-sm")}>{m === "employee" ? "พนักงาน" : "ทีม"}</button>
              ))}
            </span>
          </div>
          {mode === "employee" ? (
            <EmployeePicker value={v.assignee_employee_id ?? null} onChange={(id) => set({ assignee_employee_id: id })} options={options} placeholder="เลือกพนักงาน (ว่าง = ยังไม่มอบหมาย)" />
          ) : (
            <Select value={v.team_id ?? ""} onChange={(e) => set({ team_id: e.target.value ? Number(e.target.value) : null })} placeholder="เลือกทีม">
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          )}
          {err.assignee && <span className="text-xs text-rust">{err.assignee}</span>}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="กำหนดเสร็จ">
            <Input type="date" value={v.due_date ?? ""} onChange={(e) => set({ due_date: e.target.value || null })} />
          </Field>
          <Field label="ความสำคัญ">
            <Select value={v.priority ?? "normal"} onChange={(e) => set({ priority: e.target.value as Priority })}>
              {(Object.keys(PRIORITY) as Priority[]).map((p) => <option key={p} value={p}>{PRIORITY[p].label}</option>)}
            </Select>
          </Field>
          <Field label="สถานะ">
            <Select value={v.status ?? "todo"} onChange={(e) => set({ status: e.target.value as Status })}>
              {COLS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
              <option value="cancelled">ยกเลิก</option>
            </Select>
          </Field>
        </div>
        <div>
          <div className="mb-1 text-sm font-medium text-ink-soft">รายการย่อย (Checklist)</div>
          <ul className="flex flex-col gap-1">
            {(v.checklist ?? []).map((c, i) => (
              <li key={i} className="flex items-center gap-2">
                <input type="checkbox" className="size-4 accent-jade-600" checked={c.done} onChange={() => set({ checklist: v.checklist!.map((x, j) => (j === i ? { ...x, done: !x.done } : x)) })} />
                <Input value={c.text} onChange={(e) => set({ checklist: v.checklist!.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} className={clsx("h-9", c.done && "text-ink-mute line-through")} />
                <button type="button" aria-label="ลบรายการ" onClick={() => set({ checklist: v.checklist!.filter((_, j) => j !== i) })} className="p-1 text-ink-mute hover:text-rust"><Trash2 className="size-4" /></button>
              </li>
            ))}
          </ul>
          <form className="mt-1 flex gap-2" onSubmit={(e) => (e.preventDefault(), newItem.trim() && (set({ checklist: [...(v.checklist ?? []), { text: newItem.trim(), done: false }] }), setNewItem("")))}>
            <Input value={newItem} onChange={(e) => setNewItem(e.target.value)} placeholder="เพิ่มรายการย่อย แล้วกด Enter" className="h-9" />
            <Button type="submit" variant="secondary" size="sm" className="h-9">เพิ่ม</Button>
          </form>
        </div>
      </div>
    </Modal>
  );
}
