"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Download, List, Pencil, Plus, Trash2, Users } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useCan } from "@/components/app/me-context";
import { Badge, Button, Empty, Field, Input, Modal, PageHeader, Panel, Select, Spinner, Stat, Textarea, Toggle, clsx, toast, useConfirm } from "@/components/ui";
import { EmployeePicker } from "@/components/crud/employee-picker";
import { humanError } from "@/components/crud/crud-page";
import { useLookups } from "@/components/employees/use-lookups";
import { useDirectory } from "@/components/recruit/use-directory";
import { ATTENDEE_COLOR, ATTENDEE_STATUS, TRAINING_STATUS, TRAINING_STATUS_COLOR, TRAINING_TYPE } from "@/components/learning/labels";
import { downloadCsv } from "@/lib/csv";
import { TH_DAYS_SHORT, money, thDate, thMonthYear, thTime } from "@/lib/format";

type S = {
  id: number; title: string; course_id: number | null; training_type: string; provider: string | null; trainer: string | null; location: string | null; start_at: string; end_at: string;
  hours: number | null; cost_total: number | null; capacity: number | null; is_dsd: boolean; status: string; description: string | null; training_attendees: { status: string }[];
};
type At = { id: number; session_id: number; employee_id: number; status: string; pre_score: number | null; post_score: number | null; feedback: string | null; rating: number | null };

const blank = () => {
  const d = new Date(Date.now() + 7 * 86400000);
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(d);
  return { title: "", training_type: "internal", provider: "", trainer: "", location: "", start: `${day}T09:00`, end: `${day}T16:00`, hours: "6", cost_total: "", capacity: "", is_dsd: false, status: "planned", description: "" };
};
const toLocal = (ts: string) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(ts)).replace(" ", "T");
const bkkDay = (ts: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date(ts));

export default function TrainingPage() {
  const sb = supabaseBrowser();
  const can = useCan();
  const canEdit = can("learning", "edit");
  const dir = useDirectory();
  const lk = useLookups();
  const { confirm, dialog } = useConfirm();
  const [rows, setRows] = useState<S[] | null>(null);
  const [view, setView] = useState<"list" | "calendar">("list");
  const [month, setMonth] = useState(() => {
    const n = new Date();
    return { y: n.getFullYear(), m: n.getMonth() + 1 };
  });
  const [edit, setEdit] = useState<(ReturnType<typeof blank> & { id?: number }) | null>(null);
  const [open, setOpen] = useState<S | null>(null);
  const [att, setAtt] = useState<At[]>([]);
  const [addOrg, setAddOrg] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await sb.from("training_sessions").select("*, training_attendees(status)").order("start_at", { ascending: false }).limit(500);
    if (error) toast.error(error.message);
    setRows((data as S[]) ?? []);
  }, [sb]);
  const loadAtt = useCallback(async (sid: number) => {
    const { data } = await sb.from("training_attendees").select("*").eq("session_id", sid).order("id");
    setAtt((data as At[]) ?? []);
  }, [sb]);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (open) loadAtt(open.id);
  }, [open, loadAtt]);

  async function save() {
    if (!edit) return;
    if (!edit.title.trim()) return toast.error("กรุณาระบุชื่อหลักสูตรอบรม");
    if (edit.end <= edit.start) return toast.error("เวลาสิ้นสุดต้องหลังเวลาเริ่ม");
    setBusy(true);
    const n = (s: string) => (s === "" ? null : Number(s));
    const payload = {
      title: edit.title.trim(), training_type: edit.training_type, provider: edit.provider || null, trainer: edit.trainer || null, location: edit.location || null,
      start_at: new Date(`${edit.start}:00+07:00`).toISOString(), end_at: new Date(`${edit.end}:00+07:00`).toISOString(), hours: n(edit.hours), cost_total: n(edit.cost_total), capacity: n(edit.capacity),
      is_dsd: edit.is_dsd, status: edit.status, description: edit.description || null,
    };
    const res = edit.id ? await sb.from("training_sessions").update(payload).eq("id", edit.id) : await sb.from("training_sessions").insert(payload);
    setBusy(false);
    if (res.error) return toast.error(humanError(res.error));
    toast.ok("บันทึกรอบอบรมแล้ว");
    setEdit(null);
    load();
  }
  async function remove(s: S) {
    if (!(await confirm(`ลบรอบอบรม “${s.title}” และรายชื่อผู้เข้าอบรมทั้งหมดใช่หรือไม่?`, { danger: true, confirmText: "ลบ" }))) return;
    const { error } = await sb.from("training_sessions").delete().eq("id", s.id);
    if (error) return toast.error(humanError(error));
    load();
  }

  async function addPeople(ids: number[]) {
    if (!open) return;
    const fresh = ids.filter((id) => !att.some((a) => a.employee_id === id));
    if (!fresh.length) return toast.info("พนักงานกลุ่มนี้อยู่ในรายชื่อแล้ว");
    if (open.capacity && att.filter((a) => a.status !== "cancelled").length + fresh.length > open.capacity && !(await confirm(`จำนวนผู้เข้าอบรมจะเกินที่นั่ง (${open.capacity}) ต้องการเพิ่มต่อหรือไม่?`))) return;
    const { error } = await sb.from("training_attendees").insert(fresh.map((employee_id) => ({ session_id: open.id, employee_id, status: "registered" })));
    if (error) return toast.error(humanError(error));
    toast.ok(`เพิ่มผู้เข้าอบรม ${fresh.length} คน`);
    loadAtt(open.id);
    load();
  }
  async function patchAtt(a: At, p: Partial<At>) {
    setAtt((x) => x.map((y) => (y.id === a.id ? { ...y, ...p } : y)));
    const { error } = await sb.from("training_attendees").update(p).eq("id", a.id);
    if (error) {
      toast.error(humanError(error));
      if (open) loadAtt(open.id);
    }
    if (p.status) load();
  }
  async function markAll(status: string) {
    if (!open) return;
    const ids = att.filter((a) => a.status === "registered").map((a) => a.id);
    if (!ids.length) return;
    const { error } = await sb.from("training_attendees").update({ status }).in("id", ids);
    if (error) return toast.error(humanError(error));
    toast.ok(status === "attended" ? "บันทึกว่าเข้าอบรมครบ และเพิ่มในประวัติการอบรมของพนักงานแล้ว" : "บันทึกแล้ว");
    loadAtt(open.id);
    load();
  }
  async function removeAtt(a: At) {
    const { error } = await sb.from("training_attendees").delete().eq("id", a.id);
    if (error) return toast.error(humanError(error));
    if (open) loadAtt(open.id);
    load();
  }

  const year = new Date().getFullYear();
  const stats = useMemo(() => {
    const ys = (rows ?? []).filter((s) => new Date(s.start_at).getFullYear() === year && s.status !== "cancelled");
    return {
      sessions: ys.length,
      hours: ys.reduce((a, s) => a + Number(s.hours ?? 0) * s.training_attendees.filter((x) => x.status === "attended").length, 0),
      cost: ys.reduce((a, s) => a + Number(s.cost_total ?? 0), 0),
      dsd: ys.filter((s) => s.is_dsd).length,
    };
  }, [rows, year]);

  // calendar
  const first = new Date(month.y, month.m - 1, 1);
  const startPad = first.getDay();
  const daysIn = new Date(month.y, month.m, 0).getDate();
  const cells = Array.from({ length: Math.ceil((startPad + daysIn) / 7) * 7 }, (_, i) => i - startPad + 1);
  const byDay = useMemo(() => {
    const m = new Map<string, S[]>();
    for (const s of rows ?? []) {
      const a = bkkDay(s.start_at);
      const b = bkkDay(s.end_at);
      for (let d = new Date(a + "T00:00:00"); d <= new Date(b + "T00:00:00"); d.setDate(d.getDate() + 1)) {
        const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        m.set(k, [...(m.get(k) ?? []), s]);
      }
    }
    return m;
  }, [rows]);

  return (
    <div>
      <PageHeader
        title="ฝึกอบรม (Classroom)"
        description="วางแผนรอบอบรมภายใน/ภายนอก จัดรายชื่อผู้เข้าอบรม เช็คชื่อ และบันทึกคะแนนก่อน–หลังอบรม — ผู้ที่เข้าอบรมจะถูกบันทึกในประวัติการฝึกอบรมอัตโนมัติ"
        actions={
          <>
            <div className="flex rounded-[var(--radius-ctl)] border border-line bg-white p-0.5">
              <button onClick={() => setView("list")} className={clsx("flex h-8 items-center gap-1 rounded-md px-2.5 text-sm", view === "list" ? "bg-jade-600 text-white" : "text-ink-soft")}><List className="size-4" /> รายการ</button>
              <button onClick={() => setView("calendar")} className={clsx("flex h-8 items-center gap-1 rounded-md px-2.5 text-sm", view === "calendar" ? "bg-jade-600 text-white" : "text-ink-soft")}><CalendarDays className="size-4" /> ปฏิทิน</button>
            </div>
            {can("learning", "create") && <Button icon={<Plus className="size-4" />} onClick={() => setEdit(blank())}>เพิ่มรอบอบรม</Button>}
          </>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={`รอบอบรมปี ${year + 543}`} value={stats.sessions} />
        <Stat label="ชั่วโมงอบรมรวม (คน-ชั่วโมง)" value={stats.hours.toLocaleString("th-TH")} />
        <Stat label="ค่าใช้จ่ายรวม (บาท)" value={money(stats.cost, 0)} />
        <Stat label="หลักสูตรที่ยื่นกรมพัฒนาฝีมือแรงงาน" value={stats.dsd} sub="ใช้ประกอบการยื่นลดหย่อนภาษี / เงินสมทบกองทุน" />
      </div>

      {rows === null ? (
        <Spinner className="mx-auto mt-10" />
      ) : view === "list" ? (
        <Panel bodyClass="p-0">
          {rows.length === 0 ? (
            <Empty title="ยังไม่มีรอบอบรม" />
          ) : (
            <div className="thin-scroll overflow-x-auto">
              <table className="w-full text-[14px]">
                <thead>
                  <tr className="border-b border-line bg-paper/60 text-left text-[13px] text-ink-soft">
                    <th className="px-3 py-2 font-medium">หลักสูตรอบรม</th>
                    <th className="px-3 py-2 font-medium">วันเวลา</th>
                    <th className="px-3 py-2 font-medium">ประเภท</th>
                    <th className="px-3 py-2 text-right font-medium">ชั่วโมง</th>
                    <th className="whitespace-nowrap px-3 py-2 text-right font-medium">ค่าใช้จ่าย</th>
                    <th className="whitespace-nowrap px-3 py-2 text-right font-medium">ผู้เข้าอบรม</th>
                    <th className="px-3 py-2 font-medium">สถานะ</th>
                    <th className="w-px px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s) => {
                    const reg = s.training_attendees.filter((x) => x.status !== "cancelled").length;
                    const came = s.training_attendees.filter((x) => x.status === "attended").length;
                    return (
                      <tr key={s.id} className="cursor-pointer border-b border-line-soft last:border-0 hover:bg-jade-50/40" onClick={() => setOpen(s)}>
                        <td className="px-3 py-2">
                          <div className="font-medium">{s.title} {s.is_dsd && <Badge color="violet">กพร.</Badge>}</div>
                          <div className="text-xs text-ink-mute">{[s.trainer && `วิทยากร ${s.trainer}`, s.provider, s.location].filter(Boolean).join(" · ")}</div>
                        </td>
                        <td className="num whitespace-nowrap px-3 py-2">{thDate(s.start_at)} {thTime(s.start_at)}–{thTime(s.end_at)}{bkkDay(s.start_at) !== bkkDay(s.end_at) && <div className="text-xs text-ink-mute">ถึง {thDate(s.end_at)}</div>}</td>
                        <td className="px-3 py-2 text-ink-soft">{TRAINING_TYPE[s.training_type]}</td>
                        <td className="num px-3 py-2 text-right">{s.hours ?? "-"}</td>
                        <td className="num px-3 py-2 text-right">{s.cost_total ? money(s.cost_total, 0) : "-"}</td>
                        <td className="num px-3 py-2 text-right">{s.status === "done" ? `${came}/${reg}` : reg}{s.capacity ? <span className="text-ink-mute"> / {s.capacity}</span> : null}</td>
                        <td className="px-3 py-2"><Badge color={TRAINING_STATUS_COLOR[s.status]}>{TRAINING_STATUS[s.status]}</Badge></td>
                        <td className="whitespace-nowrap px-2 py-1" onClick={(e) => e.stopPropagation()}>
                          <div className="flex justify-end">
                            <button className="rounded p-1.5 text-ink-mute hover:bg-jade-50" title="ผู้เข้าอบรม" aria-label="ผู้เข้าอบรม" onClick={() => setOpen(s)}><Users className="size-4" /></button>
                            {canEdit && <button className="rounded p-1.5 text-ink-mute hover:bg-jade-50" aria-label="แก้ไข" onClick={() => setEdit({ id: s.id, title: s.title, training_type: s.training_type, provider: s.provider ?? "", trainer: s.trainer ?? "", location: s.location ?? "", start: toLocal(s.start_at), end: toLocal(s.end_at), hours: s.hours != null ? String(s.hours) : "", cost_total: s.cost_total != null ? String(s.cost_total) : "", capacity: s.capacity != null ? String(s.capacity) : "", is_dsd: s.is_dsd, status: s.status, description: s.description ?? "" })}><Pencil className="size-4" /></button>}
                            {can("learning", "delete") && <button className="rounded p-1.5 text-ink-mute hover:bg-rust-soft hover:text-rust" aria-label="ลบ" onClick={() => remove(s)}><Trash2 className="size-4" /></button>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      ) : (
        <Panel
          title={thMonthYear(month.y, month.m)}
          actions={
            <>
              <Button size="sm" variant="secondary" aria-label="เดือนก่อน" onClick={() => setMonth((x) => (x.m === 1 ? { y: x.y - 1, m: 12 } : { y: x.y, m: x.m - 1 }))}><ChevronLeft className="size-4" /></Button>
              <Button size="sm" variant="secondary" aria-label="เดือนถัดไป" onClick={() => setMonth((x) => (x.m === 12 ? { y: x.y + 1, m: 1 } : { y: x.y, m: x.m + 1 }))}><ChevronRight className="size-4" /></Button>
            </>
          }
          bodyClass="p-0"
        >
          <div className="grid grid-cols-7 border-b border-line-soft bg-paper/60 text-center text-xs text-ink-soft">
            {TH_DAYS_SHORT.map((d) => <div key={d} className="py-1.5">{d}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {cells.map((d, i) => {
              const key = `${month.y}-${String(month.m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
              const list = d >= 1 && d <= daysIn ? byDay.get(key) ?? [] : [];
              return (
                <div key={i} className={clsx("min-h-24 border-b border-r border-line-soft p-1", (d < 1 || d > daysIn) && "bg-paper/40")}>
                  {d >= 1 && d <= daysIn && <div className="num px-1 text-xs text-ink-mute">{d}</div>}
                  {list.map((s) => (
                    <button key={s.id} onClick={() => setOpen(s)} className={clsx("mb-0.5 block w-full truncate rounded px-1.5 py-0.5 text-left text-xs", s.status === "cancelled" ? "bg-paper text-ink-mute line-through" : s.status === "done" ? "bg-jade-100 text-jade-900" : "bg-sky-50 text-sky-900")}>
                      {thTime(s.start_at)} {s.title}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </Panel>
      )}

      <Modal open={!!edit} onClose={() => setEdit(null)} size="lg" title={edit?.id ? "แก้ไขรอบอบรม" : "เพิ่มรอบอบรม"} footer={<><Button variant="secondary" onClick={() => setEdit(null)}>ยกเลิก</Button><Button loading={busy} onClick={save}>บันทึก</Button></>}>
        {edit && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="ชื่อหลักสูตรอบรม" required className="sm:col-span-2"><Input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></Field>
            <Field label="ประเภท"><Select value={edit.training_type} onChange={(e) => setEdit({ ...edit, training_type: e.target.value })}>{Object.entries(TRAINING_TYPE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
            <Field label="สถานะ"><Select value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}>{Object.entries(TRAINING_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
            <Field label="วิทยากร"><Input value={edit.trainer} onChange={(e) => setEdit({ ...edit, trainer: e.target.value })} /></Field>
            <Field label="สถาบัน / ผู้จัด"><Input value={edit.provider} onChange={(e) => setEdit({ ...edit, provider: e.target.value })} /></Field>
            <Field label="สถานที่ / ลิงก์" className="sm:col-span-2"><Input value={edit.location} onChange={(e) => setEdit({ ...edit, location: e.target.value })} /></Field>
            <Field label="เริ่ม" required><Input type="datetime-local" value={edit.start} onChange={(e) => setEdit({ ...edit, start: e.target.value })} /></Field>
            <Field label="สิ้นสุด" required><Input type="datetime-local" value={edit.end} onChange={(e) => setEdit({ ...edit, end: e.target.value })} /></Field>
            <Field label="จำนวนชั่วโมงอบรม"><Input type="number" min={0} step="0.5" value={edit.hours} onChange={(e) => setEdit({ ...edit, hours: e.target.value })} className="num" /></Field>
            <Field label="ค่าใช้จ่ายรวม (บาท)" hint="ระบบเฉลี่ยต่อคนลงในประวัติอบรม"><Input type="number" min={0} value={edit.cost_total} onChange={(e) => setEdit({ ...edit, cost_total: e.target.value })} className="num" /></Field>
            <Field label="จำนวนที่นั่ง"><Input type="number" min={1} value={edit.capacity} onChange={(e) => setEdit({ ...edit, capacity: e.target.value })} className="num" /></Field>
            <div className="pt-6"><Toggle checked={edit.is_dsd} onChange={(v) => setEdit({ ...edit, is_dsd: v })} label="ยื่นรับรองกรมพัฒนาฝีมือแรงงาน (กพร.)" /></div>
            <Field label="รายละเอียด / วัตถุประสงค์" className="sm:col-span-2"><Textarea value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} rows={3} /></Field>
          </div>
        )}
      </Modal>

      <Modal open={!!open} onClose={() => setOpen(null)} size="xl" title={open ? <span className="block">{open.title}<span className="block text-sm font-normal text-ink-soft">{thDate(open.start_at)} {thTime(open.start_at)}–{thTime(open.end_at)} · {open.location ?? TRAINING_TYPE[open.training_type]}</span></span> : ""}>
        {open && (
          <div className="flex flex-col gap-3">
            {canEdit && (
              <div className="flex flex-wrap items-end gap-2">
                <div className="w-full sm:w-72"><EmployeePicker value={null} onChange={(v) => v && addPeople([v])} options={dir.options} placeholder="เพิ่มพนักงานทีละคน" /></div>
                <Select className="!w-auto" value={addOrg} onChange={(e) => setAddOrg(e.target.value)} placeholder="เพิ่มทั้งหน่วยงาน…">
                  {lk.orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </Select>
                <Button variant="secondary" disabled={!addOrg} onClick={() => (addPeople(dir.rows.filter((r) => r.status !== "resigned" && String(r.org_unit_id) === addOrg).map((r) => r.id)), setAddOrg(""))}>เพิ่มหน่วยงาน</Button>
                <div className="ml-auto flex gap-2">
                  <Button variant="secondary" icon={<Download className="size-4" />} onClick={() => downloadCsv(`training-${open.id}.csv`, [["ลำดับ", "รหัส", "ชื่อ-สกุล", "ตำแหน่ง", "หน่วยงาน", "สถานะ", "คะแนนก่อน", "คะแนนหลัง", "ความเห็น", "ลายมือชื่อ"], ...att.map((a, i) => { const r = dir.byId.get(a.employee_id); return [i + 1, r?.code, dir.name(a.employee_id), r?.position_name, r?.org_unit_name, ATTENDEE_STATUS[a.status], a.pre_score, a.post_score, a.feedback, ""]; })])}>ใบลงชื่อ (CSV)</Button>
                  <Button onClick={() => markAll("attended")} disabled={!att.some((a) => a.status === "registered")}>เช็คชื่อเข้าอบรมทั้งหมด</Button>
                </div>
              </div>
            )}
            {att.length === 0 ? (
              <Empty title="ยังไม่มีผู้เข้าอบรม" />
            ) : (
              <div className="thin-scroll overflow-x-auto rounded-[var(--radius-ctl)] border border-line">
                <table className="w-full text-[14px]">
                  <thead>
                    <tr className="border-b border-line bg-paper/60 text-left text-[13px] text-ink-soft">
                      <th className="px-3 py-2 font-medium">#</th>
                      <th className="px-3 py-2 font-medium">พนักงาน</th>
                      <th className="px-3 py-2 font-medium">สถานะ</th>
                      <th className="px-3 py-2 font-medium">ก่อนอบรม</th>
                      <th className="px-3 py-2 font-medium">หลังอบรม</th>
                      <th className="px-3 py-2 font-medium">ความเห็น</th>
                      <th className="w-px" />
                    </tr>
                  </thead>
                  <tbody>
                    {att.map((a, i) => (
                      <tr key={a.id} className="border-b border-line-soft last:border-0">
                        <td className="num px-3 py-1.5 text-ink-mute">{i + 1}</td>
                        <td className="px-3 py-1.5"><div className="font-medium">{dir.name(a.employee_id)}</div><div className="text-xs text-ink-mute">{dir.byId.get(a.employee_id)?.org_unit_name}</div></td>
                        <td className="px-3 py-1.5">
                          {canEdit ? (
                            <div className="flex gap-1">
                              {(["registered", "attended", "absent"] as const).map((st) => (
                                <button key={st} onClick={() => patchAtt(a, { status: st })} className={clsx("h-7 rounded-md border px-2 text-xs", a.status === st ? (st === "attended" ? "border-jade-600 bg-jade-600 text-white" : st === "absent" ? "border-rust bg-rust text-white" : "border-sky-300 bg-sky-50 text-sky-800") : "border-line text-ink-soft hover:bg-paper")}>{ATTENDEE_STATUS[st]}</button>
                              ))}
                            </div>
                          ) : (
                            <Badge color={ATTENDEE_COLOR[a.status]}>{ATTENDEE_STATUS[a.status]}</Badge>
                          )}
                        </td>
                        <td className="px-3 py-1.5"><Input type="number" className="num h-8 w-20 text-sm" defaultValue={a.pre_score ?? ""} disabled={!canEdit} onBlur={(e) => String(a.pre_score ?? "") !== e.target.value && patchAtt(a, { pre_score: e.target.value === "" ? null : Number(e.target.value) })} /></td>
                        <td className="px-3 py-1.5"><Input type="number" className="num h-8 w-20 text-sm" defaultValue={a.post_score ?? ""} disabled={!canEdit} onBlur={(e) => String(a.post_score ?? "") !== e.target.value && patchAtt(a, { post_score: e.target.value === "" ? null : Number(e.target.value) })} /></td>
                        <td className="px-3 py-1.5"><Input className="h-8 min-w-40 text-sm" defaultValue={a.feedback ?? ""} disabled={!canEdit} onBlur={(e) => (a.feedback ?? "") !== e.target.value && patchAtt(a, { feedback: e.target.value || null })} /></td>
                        <td className="px-2">{canEdit && <button className="rounded p-1.5 text-ink-mute hover:bg-rust-soft hover:text-rust" aria-label="เอาออก" onClick={() => removeAtt(a)}><Trash2 className="size-4" /></button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-xs text-ink-mute">
              ลงทะเบียน {att.filter((a) => a.status !== "cancelled").length}{open.capacity ? `/${open.capacity}` : ""} คน · เข้าอบรม {att.filter((a) => a.status === "attended").length} คน
              {att.some((a) => a.post_score != null && a.pre_score != null) && ` · คะแนนเฉลี่ยเพิ่มขึ้น ${(att.filter((a) => a.post_score != null && a.pre_score != null).reduce((s, a) => s + Number(a.post_score) - Number(a.pre_score), 0) / att.filter((a) => a.post_score != null && a.pre_score != null).length).toFixed(1)} คะแนน`}
            </p>
          </div>
        )}
      </Modal>
      {dialog}
    </div>
  );
}
