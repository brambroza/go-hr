"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowLeft, ArrowUp, CheckCircle2, Download, Eye, EyeOff, Pencil, Plus, Trash2, UserPlus } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useCan } from "@/components/app/me-context";
import { Badge, Button, Checkbox, Empty, Field, Input, Modal, PageHeader, Panel, Select, Spinner, Tabs, Textarea, Toggle, clsx, toast, useConfirm } from "@/components/ui";
import { humanError } from "@/components/crud/crud-page";
import { useLookups } from "@/components/employees/use-lookups";
import { useDirectory } from "@/components/recruit/use-directory";
import { downloadCsv } from "@/lib/csv";
import { thDate } from "@/lib/format";
import { ENROLL_COLOR, ENROLL_STATUS, ITEM_TYPE, type QuizQuestion } from "./labels";
import { UploadUrlField } from "./upload-field";

type Course = {
  id: number; code: string | null; title: string; description: string | null; category: string | null; cover_url: string | null; hours: number | null; pass_score: number;
  quiz: QuizQuestion[]; audience: { all?: boolean; org_unit_ids?: number[]; position_ids?: number[] }; is_mandatory: boolean; due_days: number | null; certificate: boolean; is_published: boolean;
};
type Lesson = { id: number; course_id: number; library_item_id: number | null; title: string; content: string | null; sort_order: number; min_minutes: number };
type Lib = { id: number; title: string; item_type: string; duration_min: number | null };
type Enr = { id: number; employee_id: number; status: string; progress: number; quiz_score: number | null; attempts: number; due_date: string | null; started_at: string | null; completed_at: string | null };

export function CourseBuilder({ id }: { id: number }) {
  const sb = supabaseBrowser();
  const can = useCan();
  const canEdit = can("learning", "edit");
  const lk = useLookups();
  const dir = useDirectory();
  const { confirm, dialog } = useConfirm();
  const [c, setC] = useState<Course | null | undefined>(undefined);
  const [saved, setSaved] = useState<string>("");
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [lib, setLib] = useState<Lib[]>([]);
  const [enr, setEnr] = useState<Enr[]>([]);
  const [tab, setTab] = useState<"details" | "lessons" | "quiz" | "enroll">("details");
  const [lesson, setLesson] = useState<Partial<Lesson> | null>(null);
  const [busy, setBusy] = useState(false);
  const [assign, setAssign] = useState<{ mode: "audience" | "pick"; ids: number[] } | null>(null);

  const load = useCallback(async () => {
    const [a, b, l, e] = await Promise.all([
      sb.from("courses").select("*").eq("id", id).maybeSingle(),
      sb.from("course_lessons").select("*").eq("course_id", id).order("sort_order").order("id"),
      sb.from("library_items").select("id, title, item_type, duration_min").eq("is_active", true).order("title"),
      sb.from("course_enrollments").select("id, employee_id, status, progress, quiz_score, attempts, due_date, started_at, completed_at").eq("course_id", id).order("id"),
    ]);
    const row = a.data as Course | null;
    if (row) {
      row.quiz = Array.isArray(row.quiz) ? row.quiz : [];
      row.audience = row.audience ?? { all: true };
    }
    setC(row);
    setSaved(JSON.stringify(row));
    setLessons((b.data as Lesson[]) ?? []);
    setLib((l.data as Lib[]) ?? []);
    setEnr((e.data as Enr[]) ?? []);
  }, [sb, id]);
  useEffect(() => {
    load();
  }, [load]);

  const dirty = c ? JSON.stringify(c) !== saved : false;
  const set = (p: Partial<Course>) => setC((x) => (x ? { ...x, ...p } : x));

  async function saveCourse(extra?: Partial<Course>) {
    if (!c) return;
    const next = { ...c, ...extra };
    for (const [i, q] of next.quiz.entries()) {
      if (!q.q.trim()) return toast.error(`แบบทดสอบข้อ ${i + 1} ยังไม่มีคำถาม`);
      if (q.choices.filter((x) => x.trim()).length < 2) return toast.error(`แบบทดสอบข้อ ${i + 1} ต้องมีตัวเลือกอย่างน้อย 2 ข้อ`);
      if (!q.choices[q.answer]?.trim()) return toast.error(`แบบทดสอบข้อ ${i + 1} ยังไม่ได้เลือกคำตอบที่ถูก`);
    }
    if (next.is_published && !lessons.length) return toast.error("ต้องมีบทเรียนอย่างน้อย 1 บทก่อนเผยแพร่");
    setBusy(true);
    const { id: _i, ...payload } = next;
    void _i;
    const { error } = await sb.from("courses").update(payload).eq("id", id);
    setBusy(false);
    if (error) return toast.error(humanError(error));
    toast.ok(extra?.is_published === true ? "เผยแพร่หลักสูตรแล้ว พนักงานเห็นในแอปแล้ว" : extra?.is_published === false ? "ยกเลิกการเผยแพร่แล้ว" : "บันทึกหลักสูตรแล้ว");
    setC(next);
    setSaved(JSON.stringify(next));
  }

  async function saveLesson() {
    if (!lesson) return;
    if (!lesson.title?.trim()) return toast.error("กรุณาตั้งชื่อบทเรียน");
    if (!lesson.library_item_id && !lesson.content?.trim()) return toast.error("กรุณาเลือกสื่อจากคลังความรู้ หรือพิมพ์เนื้อหาบทเรียน");
    setBusy(true);
    const payload = { course_id: id, title: lesson.title.trim(), library_item_id: lesson.library_item_id || null, content: lesson.content || null, min_minutes: lesson.min_minutes ?? 0, sort_order: lesson.sort_order ?? (lessons.at(-1)?.sort_order ?? 0) + 1 };
    const res = lesson.id ? await sb.from("course_lessons").update(payload).eq("id", lesson.id) : await sb.from("course_lessons").insert(payload);
    setBusy(false);
    if (res.error) return toast.error(humanError(res.error));
    setLesson(null);
    load();
  }
  async function moveLesson(i: number, d: number) {
    const a = [...lessons];
    const [x] = a.splice(i, 1);
    a.splice(i + d, 0, x);
    setLessons(a);
    await Promise.all(a.map((l, j) => sb.from("course_lessons").update({ sort_order: j + 1 }).eq("id", l.id)));
  }
  async function removeLesson(l: Lesson) {
    if (!(await confirm(`ลบบทเรียน “${l.title}” ใช่หรือไม่?`, { danger: true, confirmText: "ลบ" }))) return;
    const { error } = await sb.from("course_lessons").delete().eq("id", l.id);
    if (error) return toast.error(humanError(error));
    load();
  }

  async function doAssign() {
    if (!assign) return;
    setBusy(true);
    const { data, error } = await sb.rpc("course_assign", { p_course_id: id, p_employee_ids: assign.mode === "pick" ? assign.ids : null });
    setBusy(false);
    if (error) return toast.error(humanError(error));
    toast.ok(data ? `มอบหมายหลักสูตรให้พนักงาน ${data} คนแล้ว` : "พนักงานกลุ่มนี้ได้รับมอบหมายครบแล้ว");
    setAssign(null);
    load();
  }

  const libMap = useMemo(() => new Map(lib.map((l) => [l.id, l])), [lib]);
  if (c === undefined) return <Spinner className="mx-auto mt-20" />;
  if (c === null) return <Empty title="ไม่พบหลักสูตร" action={<Link href="/learning/courses" className="text-jade-700 underline">กลับไปหน้าหลักสูตร</Link>} />;

  const aud = c.audience;
  const done = enr.filter((e) => e.status === "completed").length;
  const totalMin = lessons.reduce((a, l) => a + (l.min_minutes || libMap.get(l.library_item_id ?? 0)?.duration_min || 0), 0);

  return (
    <div>
      <PageHeader
        back={
          <Link href="/learning/courses" className="mb-1 inline-flex items-center gap-1 text-sm text-ink-soft hover:text-jade-700">
            <ArrowLeft className="size-4" /> หลักสูตรทั้งหมด
          </Link>
        }
        title={<span className="flex flex-wrap items-center gap-2">{c.title}{c.is_published ? <Badge color="green">เผยแพร่แล้ว</Badge> : <Badge>ร่าง</Badge>}</span>}
        description={`${lessons.length} บทเรียน · ประมาณ ${totalMin} นาที · แบบทดสอบ ${c.quiz.length} ข้อ · ผ่านที่ ${c.pass_score}% · เรียนจบ ${done}/${enr.length} คน`}
        actions={
          canEdit && (
            <>
              {dirty && <Button loading={busy} onClick={() => saveCourse()}>บันทึก</Button>}
              {c.is_published ? (
                <Button variant="secondary" icon={<EyeOff className="size-4" />} onClick={() => saveCourse({ is_published: false })}>ยกเลิกการเผยแพร่</Button>
              ) : (
                <Button variant={dirty ? "secondary" : "primary"} icon={<Eye className="size-4" />} onClick={() => saveCourse({ is_published: true })}>บันทึกและเผยแพร่</Button>
              )}
            </>
          )
        }
      />

      <Tabs
        className="mb-4"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "details", label: "รายละเอียด" },
          { value: "lessons", label: "บทเรียน", count: lessons.length },
          { value: "quiz", label: "แบบทดสอบ", count: c.quiz.length },
          { value: "enroll", label: "ผู้เรียน", count: enr.length },
        ]}
      />

      {tab === "details" && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <Panel title="ข้อมูลหลักสูตร">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="ชื่อหลักสูตร" required className="sm:col-span-2"><Input value={c.title} onChange={(e) => set({ title: e.target.value })} disabled={!canEdit} /></Field>
              <Field label="รหัสหลักสูตร"><Input value={c.code ?? ""} onChange={(e) => set({ code: e.target.value || null })} disabled={!canEdit} placeholder="เช่น SAF-101" /></Field>
              <Field label="หมวดหมู่"><Input value={c.category ?? ""} onChange={(e) => set({ category: e.target.value || null })} disabled={!canEdit} placeholder="เช่น ความปลอดภัย" /></Field>
              <Field label="คำอธิบาย" className="sm:col-span-2"><Textarea value={c.description ?? ""} onChange={(e) => set({ description: e.target.value || null })} disabled={!canEdit} rows={3} /></Field>
              <Field label="จำนวนชั่วโมง (บันทึกในประวัติอบรม)"><Input type="number" min={0} step="0.5" value={c.hours ?? ""} onChange={(e) => set({ hours: e.target.value ? Number(e.target.value) : null })} disabled={!canEdit} className="num" /></Field>
              <Field label="คะแนนผ่านแบบทดสอบ (%)"><Input type="number" min={0} max={100} value={c.pass_score} onChange={(e) => set({ pass_score: Number(e.target.value) })} disabled={!canEdit} className="num" /></Field>
              <Field label="รูปหน้าปก" className="sm:col-span-2">
                <UploadUrlField value={c.cover_url ?? ""} onChange={(v) => set({ cover_url: v || null })} accept="image/*" maxMb={5} />
              </Field>
              {c.cover_url && (
                 
                <img src={c.cover_url} alt="" className="aspect-[16/7] w-full rounded-[var(--radius-ctl)] object-cover sm:col-span-2" />
              )}
            </div>
          </Panel>
          <div className="flex flex-col gap-4">
            <Panel title="ผู้เรียนเป้าหมาย">
              <div className="flex flex-col gap-3">
                <Toggle checked={!!aud.all} onChange={(v) => set({ audience: { ...aud, all: v } })} label="พนักงานทุกคน" disabled={!canEdit} />
                {!aud.all && (
                  <>
                    <Field label="หน่วยงาน">
                      <div className="thin-scroll max-h-40 overflow-y-auto rounded-[var(--radius-ctl)] border border-line p-2">
                        {lk.orgs.map((o) => (
                          <div key={o.id}><Checkbox label={o.name} checked={(aud.org_unit_ids ?? []).includes(o.id)} disabled={!canEdit} onChange={(v) => set({ audience: { ...aud, org_unit_ids: v ? [...(aud.org_unit_ids ?? []), o.id] : (aud.org_unit_ids ?? []).filter((x) => x !== o.id) } })} /></div>
                        ))}
                      </div>
                    </Field>
                    <Field label="ตำแหน่ง">
                      <div className="thin-scroll max-h-40 overflow-y-auto rounded-[var(--radius-ctl)] border border-line p-2">
                        {lk.positions.map((o) => (
                          <div key={o.id}><Checkbox label={o.name} checked={(aud.position_ids ?? []).includes(o.id)} disabled={!canEdit} onChange={(v) => set({ audience: { ...aud, position_ids: v ? [...(aud.position_ids ?? []), o.id] : (aud.position_ids ?? []).filter((x) => x !== o.id) } })} /></div>
                        ))}
                      </div>
                    </Field>
                  </>
                )}
                <p className="text-xs text-ink-mute">พนักงานกลุ่มนี้เห็นหลักสูตรในแอปและลงทะเบียนเรียนเองได้</p>
              </div>
            </Panel>
            <Panel title="เงื่อนไข">
              <div className="flex flex-col gap-3">
                <Toggle checked={c.is_mandatory} onChange={(v) => set({ is_mandatory: v })} label="บังคับเรียน" disabled={!canEdit} />
                <Field label="ต้องเรียนจบภายใน (วัน หลังได้รับมอบหมาย)"><Input type="number" min={1} value={c.due_days ?? ""} onChange={(e) => set({ due_days: e.target.value ? Number(e.target.value) : null })} disabled={!canEdit} className="num" placeholder="ไม่กำหนด" /></Field>
                <Toggle checked={c.certificate} onChange={(v) => set({ certificate: v })} label="ออกใบประกาศนียบัตรเมื่อเรียนจบ" disabled={!canEdit} />
              </div>
            </Panel>
          </div>
        </div>
      )}

      {tab === "lessons" && (
        <Panel bodyClass="p-0" title="บทเรียน (เรียงตามลำดับที่ผู้เรียนเห็น)" actions={canEdit && <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setLesson({ title: "", min_minutes: 0 })}>เพิ่มบทเรียน</Button>}>
          {lessons.length === 0 ? (
            <Empty title="ยังไม่มีบทเรียน" description="เพิ่มบทเรียนจากคลังความรู้ (วิดีโอ PDF) หรือพิมพ์เนื้อหาเอง" />
          ) : (
            <ol>
              {lessons.map((l, i) => {
                const item = l.library_item_id ? libMap.get(l.library_item_id) : null;
                return (
                  <li key={l.id} className="flex items-center gap-3 border-b border-line-soft px-4 py-3 last:border-0">
                    <span className="num grid size-8 shrink-0 place-items-center rounded-full bg-jade-50 text-sm font-semibold text-jade-800">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{l.title}</div>
                      <div className="text-sm text-ink-soft">
                        {item ? `${ITEM_TYPE[item.item_type]} · ${item.title}` : "เนื้อหาในบทเรียน"}
                        {l.min_minutes > 0 && ` · เรียนอย่างน้อย ${l.min_minutes} นาที`}
                      </div>
                    </div>
                    {canEdit && (
                      <div className="flex shrink-0">
                        <button className="rounded p-1.5 text-ink-mute hover:bg-paper disabled:opacity-30" disabled={i === 0} onClick={() => moveLesson(i, -1)} aria-label="เลื่อนขึ้น"><ArrowUp className="size-4" /></button>
                        <button className="rounded p-1.5 text-ink-mute hover:bg-paper disabled:opacity-30" disabled={i === lessons.length - 1} onClick={() => moveLesson(i, 1)} aria-label="เลื่อนลง"><ArrowDown className="size-4" /></button>
                        <button className="rounded p-1.5 text-ink-mute hover:bg-jade-50" onClick={() => setLesson(l)} aria-label="แก้ไข"><Pencil className="size-4" /></button>
                        <button className="rounded p-1.5 text-ink-mute hover:bg-rust-soft hover:text-rust" onClick={() => removeLesson(l)} aria-label="ลบ"><Trash2 className="size-4" /></button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </Panel>
      )}

      {tab === "quiz" && (
        <Panel title={`แบบทดสอบท้ายหลักสูตร (ผ่านที่ ${c.pass_score}%)`} actions={canEdit && dirty && <Button size="sm" loading={busy} onClick={() => saveCourse()}>บันทึกแบบทดสอบ</Button>}>
          <div className="flex flex-col gap-3">
            {c.quiz.length === 0 && <p className="text-sm text-ink-mute">ไม่มีแบบทดสอบ — ผู้เรียนจะเรียนจบเมื่อเรียนครบทุกบท</p>}
            {c.quiz.map((q, i) => {
              const upd = (p: Partial<QuizQuestion>) => set({ quiz: c.quiz.map((x, j) => (j === i ? { ...x, ...p } : x)) });
              return (
                <div key={i} className="rounded-[var(--radius-ctl)] border border-line p-3">
                  <div className="flex items-start gap-2">
                    <span className="num mt-2 w-6 text-sm font-semibold text-ink-soft">{i + 1}.</span>
                    <Input value={q.q} onChange={(e) => upd({ q: e.target.value })} placeholder="คำถาม" disabled={!canEdit} />
                    {canEdit && <button className="mt-1 rounded p-1.5 text-ink-mute hover:bg-rust-soft hover:text-rust" onClick={() => set({ quiz: c.quiz.filter((_, j) => j !== i) })} aria-label="ลบคำถาม"><Trash2 className="size-4" /></button>}
                  </div>
                  <div className="mt-2 flex flex-col gap-1.5 pl-8">
                    {q.choices.map((ch, k) => (
                      <div key={k} className="flex items-center gap-2">
                        <button type="button" disabled={!canEdit} onClick={() => upd({ answer: k })} className={clsx("grid size-6 shrink-0 place-items-center rounded-full border", q.answer === k ? "border-jade-600 bg-jade-600 text-white" : "border-line text-transparent")} aria-label="เลือกเป็นคำตอบที่ถูก" title="คำตอบที่ถูก">
                          <CheckCircle2 className="size-4" />
                        </button>
                        <Input value={ch} onChange={(e) => upd({ choices: q.choices.map((x, j) => (j === k ? e.target.value : x)) })} placeholder={`ตัวเลือก ${k + 1}`} disabled={!canEdit} className="h-9 text-sm" />
                        {canEdit && q.choices.length > 2 && <button className="rounded p-1 text-ink-mute hover:text-rust" onClick={() => upd({ choices: q.choices.filter((_, j) => j !== k), answer: q.answer >= k && q.answer > 0 ? q.answer - (q.answer === k ? 0 : 1) : q.answer })} aria-label="ลบตัวเลือก"><Trash2 className="size-3.5" /></button>}
                      </div>
                    ))}
                    {canEdit && q.choices.length < 6 && <button className="self-start text-sm text-jade-700 hover:underline" onClick={() => upd({ choices: [...q.choices, ""] })}>+ เพิ่มตัวเลือก</button>}
                  </div>
                </div>
              );
            })}
            {canEdit && (
              <div>
                <Button size="sm" variant="secondary" icon={<Plus className="size-4" />} onClick={() => set({ quiz: [...c.quiz, { q: "", choices: ["", "", "", ""], answer: 0 }] })}>เพิ่มคำถาม</Button>
              </div>
            )}
            <p className="text-xs text-ink-mute">วงกลมสีเขียว = คำตอบที่ถูก · ระบบตรวจคะแนนที่เซิร์ฟเวอร์ ผู้เรียนไม่เห็นเฉลย</p>
          </div>
        </Panel>
      )}

      {tab === "enroll" && (
        <Panel
          bodyClass="p-0"
          title={`ผู้เรียน ${enr.length} คน · เรียนจบ ${done} คน`}
          actions={
            <>
              {can("learning", "export") && (
                <Button size="sm" variant="secondary" icon={<Download className="size-4" />} onClick={() => downloadCsv(`course-${c.code ?? c.id}.csv`, [["รหัส", "ชื่อ", "สถานะ", "ความคืบหน้า (%)", "คะแนนแบบทดสอบ", "จำนวนครั้งที่สอบ", "ครบกำหนด", "เริ่มเรียน", "เรียนจบ"], ...enr.map((e) => [dir.byId.get(e.employee_id)?.code, dir.name(e.employee_id), ENROLL_STATUS[e.status], e.progress, e.quiz_score, e.attempts, e.due_date, e.started_at?.slice(0, 10), e.completed_at?.slice(0, 10)])])}>ส่งออก</Button>
              )}
              {canEdit && <Button size="sm" icon={<UserPlus className="size-4" />} onClick={() => setAssign({ mode: "audience", ids: [] })} disabled={!c.is_published}>มอบหมายหลักสูตร</Button>}
            </>
          }
        >
          {!c.is_published && <p className="border-b border-line-soft bg-amber-50 px-4 py-2 text-sm text-amber-ink">เผยแพร่หลักสูตรก่อน จึงจะมอบหมายให้พนักงานได้</p>}
          {enr.length === 0 ? (
            <Empty title="ยังไม่มีผู้เรียน" />
          ) : (
            <div className="thin-scroll overflow-x-auto">
              <table className="w-full text-[14px]">
                <thead>
                  <tr className="border-b border-line bg-paper/60 text-left text-[13px] text-ink-soft">
                    <th className="px-3 py-2 font-medium">พนักงาน</th>
                    <th className="px-3 py-2 font-medium">สถานะ</th>
                    <th className="w-48 px-3 py-2 font-medium">ความคืบหน้า</th>
                    <th className="px-3 py-2 text-right font-medium">คะแนนสอบ</th>
                    <th className="px-3 py-2 text-right font-medium">สอบ (ครั้ง)</th>
                    <th className="px-3 py-2 font-medium">ครบกำหนด</th>
                    <th className="px-3 py-2 font-medium">เรียนจบ</th>
                  </tr>
                </thead>
                <tbody>
                  {enr.map((e) => {
                    const late = e.status !== "completed" && e.due_date && e.due_date < new Date().toISOString().slice(0, 10);
                    return (
                      <tr key={e.id} className="border-b border-line-soft last:border-0">
                        <td className="px-3 py-2"><span className="font-medium">{dir.name(e.employee_id)}</span> <span className="num text-xs text-ink-mute">{dir.byId.get(e.employee_id)?.code}</span></td>
                        <td className="px-3 py-2"><Badge color={ENROLL_COLOR[e.status]}>{ENROLL_STATUS[e.status]}</Badge></td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2"><div className="h-1.5 flex-1 rounded-full bg-jade-50"><div className="h-1.5 rounded-full bg-jade-500" style={{ width: `${e.progress}%` }} /></div><span className="num w-10 text-right text-xs">{Math.round(e.progress)}%</span></div>
                        </td>
                        <td className="num px-3 py-2 text-right">{e.quiz_score != null ? `${e.quiz_score}%` : "-"}</td>
                        <td className="num px-3 py-2 text-right">{e.attempts}</td>
                        <td className={clsx("num whitespace-nowrap px-3 py-2", late && "text-rust")}>{thDate(e.due_date)}</td>
                        <td className="num whitespace-nowrap px-3 py-2">{thDate(e.completed_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}

      <Modal open={!!lesson} onClose={() => setLesson(null)} size="lg" title={lesson?.id ? "แก้ไขบทเรียน" : "เพิ่มบทเรียน"} footer={<><Button variant="secondary" onClick={() => setLesson(null)}>ยกเลิก</Button><Button loading={busy} onClick={saveLesson}>บันทึกบทเรียน</Button></>}>
        {lesson && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="ชื่อบทเรียน" required className="sm:col-span-2"><Input value={lesson.title ?? ""} onChange={(e) => setLesson({ ...lesson, title: e.target.value })} /></Field>
            <Field label="สื่อจากคลังความรู้" hint="เลือกวิดีโอ / PDF / ลิงก์ หรือเว้นว่างแล้วพิมพ์เนื้อหาเอง" className="sm:col-span-2">
              <Select
                value={lesson.library_item_id ?? ""}
                onChange={(e) => {
                  const it = libMap.get(Number(e.target.value));
                  setLesson({ ...lesson, library_item_id: e.target.value ? Number(e.target.value) : null, title: lesson.title || it?.title || "", min_minutes: lesson.min_minutes || it?.duration_min || 0 });
                }}
                placeholder="— ไม่ใช้สื่อ (เนื้อหาในบทเรียน) —"
              >
                {lib.map((l) => <option key={l.id} value={l.id}>[{ITEM_TYPE[l.item_type]}] {l.title}</option>)}
              </Select>
            </Field>
            <Field label="เนื้อหา / คำอธิบายบทเรียน" className="sm:col-span-2"><Textarea value={lesson.content ?? ""} onChange={(e) => setLesson({ ...lesson, content: e.target.value })} rows={6} /></Field>
            <Field label="เวลาเรียนขั้นต่ำ (นาที)" hint="ปุ่ม “เรียนจบบทนี้” จะกดได้เมื่อครบเวลา (0 = ไม่กำหนด)"><Input type="number" min={0} value={lesson.min_minutes ?? 0} onChange={(e) => setLesson({ ...lesson, min_minutes: Number(e.target.value) })} className="num" /></Field>
          </div>
        )}
      </Modal>

      <Modal open={!!assign} onClose={() => setAssign(null)} title="มอบหมายหลักสูตร" footer={<><Button variant="secondary" onClick={() => setAssign(null)}>ยกเลิก</Button><Button loading={busy} onClick={doAssign} disabled={assign?.mode === "pick" && !assign.ids.length}>มอบหมาย</Button></>}>
        {assign && (
          <div className="flex flex-col gap-3">
            <div className="grid gap-2 sm:grid-cols-2">
              {(["audience", "pick"] as const).map((m) => (
                <button key={m} type="button" onClick={() => setAssign({ ...assign, mode: m })} className={clsx("rounded-[var(--radius-ctl)] border p-3 text-left text-sm", assign.mode === m ? "border-jade-600 bg-jade-50" : "border-line")}>
                  <div className="font-medium">{m === "audience" ? "ทุกคนในกลุ่มเป้าหมาย" : "เลือกพนักงานเอง"}</div>
                  <div className="text-ink-soft">{m === "audience" ? (aud.all ? "พนักงานทุกคนที่ยังทำงานอยู่" : "ตามหน่วยงาน / ตำแหน่งที่กำหนด") : "เลือกรายชื่อด้านล่าง"}</div>
                </button>
              ))}
            </div>
            {assign.mode === "pick" && (
              <div className="thin-scroll max-h-72 overflow-y-auto rounded-[var(--radius-ctl)] border border-line p-2">
                {dir.rows.filter((r) => r.status !== "resigned").map((r) => (
                  <div key={r.id}><Checkbox label={`${r.code} ${r.first_name} ${r.last_name}${enr.some((e) => e.employee_id === r.id) ? " (มอบหมายแล้ว)" : ""}`} checked={assign.ids.includes(r.id)} onChange={(v) => setAssign({ ...assign, ids: v ? [...assign.ids, r.id] : assign.ids.filter((x) => x !== r.id) })} /></div>
                ))}
              </div>
            )}
            <p className="text-xs text-ink-mute">{c.due_days ? `กำหนดเรียนจบภายใน ${c.due_days} วันนับจากวันนี้ · ` : ""}คนที่ได้รับมอบหมายแล้วจะไม่ถูกเพิ่มซ้ำ</p>
          </div>
        )}
      </Modal>
      {dialog}
    </div>
  );
}
