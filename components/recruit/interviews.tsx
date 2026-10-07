"use client";

import { useState } from "react";
import { CalendarPlus, ExternalLink, MapPin, Pencil, Trash2, Video } from "lucide-react";
import { Badge, Button, Field, Input, Modal, Select, Textarea, clsx, toast, useConfirm } from "@/components/ui";
import { EmployeePicker } from "@/components/crud/employee-picker";
import { humanError } from "@/components/crud/crud-page";
import { supabaseBrowser } from "@/lib/supabase/client";
import { thDate, thTime } from "@/lib/format";
import { useMe } from "@/components/app/me-context";
import { INTERVIEW_MODE, INTERVIEW_RESULT } from "./labels";
import { useDirectory } from "./use-directory";

export type Interview = {
  id: number; applicant_id: number; round: number; scheduled_at: string; duration_min: number; mode: string; location: string | null; meeting_url: string | null;
  interviewer_ids: number[] | null; scores: Record<string, { score?: number; comment?: string }>; result: string | null; comment: string | null;
};

function toLocal(ts: string) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(ts)).replace(" ", "T");
}

export function InterviewsPanel({ applicantId, interviews, onChange, canEdit }: { applicantId: number; interviews: Interview[]; onChange: () => void; canEdit: boolean }) {
  const me = useMe();
  const dir = useDirectory();
  const sb = supabaseBrowser();
  const { confirm, dialog } = useConfirm();
  const [edit, setEdit] = useState<Partial<Interview> | null>(null);
  const [whenLocal, setWhenLocal] = useState("");
  const [score, setScore] = useState<{ iv: Interview; who: number; score: number | null; comment: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [now] = useState(() => Date.now());

  function openNew() {
    const d = new Date(Date.now() + 2 * 86400000);
    d.setHours(10, 0, 0, 0);
    setWhenLocal(toLocal(d.toISOString()));
    setEdit({ applicant_id: applicantId, round: (interviews.at(-1)?.round ?? 0) + 1, duration_min: 60, mode: "onsite", interviewer_ids: me.employeeId ? [me.employeeId] : [], scores: {} });
  }

  async function save() {
    if (!edit) return;
    if (!whenLocal) return toast.error("กรุณาระบุวันเวลาสัมภาษณ์");
    if (!(edit.interviewer_ids ?? []).length) return toast.error("กรุณาเลือกผู้สัมภาษณ์อย่างน้อย 1 คน");
    setBusy(true);
    const payload = {
      applicant_id: applicantId, round: edit.round ?? 1, scheduled_at: new Date(`${whenLocal}:00+07:00`).toISOString(), duration_min: edit.duration_min ?? 60, mode: edit.mode ?? "onsite",
      location: edit.location || null, meeting_url: edit.meeting_url || null, interviewer_ids: edit.interviewer_ids, result: edit.result || null, comment: edit.comment || null,
    };
    const res = edit.id ? await sb.from("interviews").update(payload).eq("id", edit.id) : await sb.from("interviews").insert(payload);
    if (!res.error && !edit.id) {
      await sb.from("applicant_activities").insert({ applicant_id: applicantId, activity_type: "interview", note: `นัดสัมภาษณ์รอบที่ ${payload.round} วันที่ ${thDate(payload.scheduled_at)} ${thTime(payload.scheduled_at)} น.` });
    }
    setBusy(false);
    if (res.error) return toast.error(humanError(res.error));
    toast.ok(edit.id ? "บันทึกการสัมภาษณ์แล้ว" : "นัดสัมภาษณ์แล้ว");
    setEdit(null);
    onChange();
  }

  async function saveScore() {
    if (!score) return;
    setBusy(true);
    const scores = { ...score.iv.scores, [score.who]: { score: score.score ?? undefined, comment: score.comment || undefined } };
    const { error } = await sb.from("interviews").update({ scores }).eq("id", score.iv.id);
    setBusy(false);
    if (error) return toast.error(humanError(error));
    toast.ok("บันทึกคะแนนสัมภาษณ์แล้ว");
    setScore(null);
    onChange();
  }

  async function setResult(iv: Interview, result: string) {
    const { error } = await sb.from("interviews").update({ result }).eq("id", iv.id);
    if (error) return toast.error(humanError(error));
    await sb.from("applicant_activities").insert({ applicant_id: applicantId, activity_type: "interview", note: `ผลสัมภาษณ์รอบที่ ${iv.round}: ${INTERVIEW_RESULT[result]}` });
    onChange();
  }

  async function remove(iv: Interview) {
    if (!(await confirm("ลบนัดสัมภาษณ์นี้ใช่หรือไม่?", { danger: true, confirmText: "ลบ" }))) return;
    const { error } = await sb.from("interviews").delete().eq("id", iv.id);
    if (error) return toast.error(humanError(error));
    onChange();
  }

  const ids = edit?.interviewer_ids ?? [];
  return (
    <div className="flex flex-col gap-3">
      {interviews.length === 0 && <p className="text-sm text-ink-mute">ยังไม่มีนัดสัมภาษณ์</p>}
      {interviews.map((iv) => {
        const vals = Object.values(iv.scores ?? {}).map((s) => s.score).filter((x): x is number => typeof x === "number");
        const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
        const past = new Date(iv.scheduled_at).getTime() < now;
        return (
          <div key={iv.id} className="rounded-[var(--radius-ctl)] border border-line">
            <div className="flex flex-wrap items-start justify-between gap-2 border-b border-line-soft px-3 py-2">
              <div>
                <div className="font-medium">
                  รอบที่ {iv.round} · <span className="num">{thDate(iv.scheduled_at)} {thTime(iv.scheduled_at)} น.</span>{" "}
                  <span className="text-sm font-normal text-ink-mute">({iv.duration_min} นาที)</span>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-sm text-ink-soft">
                  <span className="inline-flex items-center gap-1">
                    {iv.mode === "online" ? <Video className="size-3.5" /> : <MapPin className="size-3.5" />}
                    {INTERVIEW_MODE[iv.mode]}
                    {iv.location ? ` · ${iv.location}` : ""}
                  </span>
                  {iv.meeting_url && (
                    <a href={iv.meeting_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-jade-700 hover:underline">
                      ลิงก์ประชุม <ExternalLink className="size-3" />
                    </a>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1">
                {iv.result ? <Badge color={iv.result === "pass" ? "green" : iv.result === "fail" ? "red" : "amber"}>{INTERVIEW_RESULT[iv.result]}</Badge> : <Badge color={past ? "amber" : "blue"}>{past ? "รอผล" : "นัดแล้ว"}</Badge>}
                {canEdit && (
                  <>
                    <button className="rounded p-1.5 text-ink-mute hover:bg-jade-50" aria-label="แก้ไข" onClick={() => (setWhenLocal(toLocal(iv.scheduled_at)), setEdit(iv))}>
                      <Pencil className="size-4" />
                    </button>
                    <button className="rounded p-1.5 text-ink-mute hover:bg-rust-soft hover:text-rust" aria-label="ลบ" onClick={() => remove(iv)}>
                      <Trash2 className="size-4" />
                    </button>
                  </>
                )}
              </div>
            </div>
            <ul className="divide-y divide-line-soft">
              {(iv.interviewer_ids ?? []).map((who) => {
                const s = iv.scores?.[who];
                const mine = who === me.employeeId;
                return (
                  <li key={who} className="flex items-start justify-between gap-2 px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <div className="font-medium">{dir.name(who)}</div>
                      {s?.comment && <p className="text-ink-soft">{s.comment}</p>}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {s?.score != null ? <span className="num font-semibold text-jade-800">{s.score}/5</span> : <span className="text-ink-mute">ยังไม่ให้คะแนน</span>}
                      {(canEdit || mine) && (
                        <Button size="sm" variant="ghost" onClick={() => setScore({ iv, who, score: s?.score ?? null, comment: s?.comment ?? "" })}>
                          ให้คะแนน
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line-soft bg-paper/50 px-3 py-2 text-sm">
              <span className="text-ink-soft">
                คะแนนเฉลี่ย <b className="num text-ink">{avg == null ? "-" : avg.toFixed(1)}</b>
                {iv.comment && <> · {iv.comment}</>}
              </span>
              {canEdit && (
                <div className="flex gap-1">
                  {(["pass", "hold", "fail"] as const).map((r) => (
                    <button key={r} onClick={() => setResult(iv, r)} className={clsx("h-7 rounded-md border px-2 text-xs", iv.result === r ? "border-jade-600 bg-jade-600 text-white" : "border-line bg-white text-ink-soft hover:bg-jade-50")}>
                      {INTERVIEW_RESULT[r]}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
      {canEdit && (
        <div>
          <Button size="sm" variant="secondary" icon={<CalendarPlus className="size-4" />} onClick={openNew}>
            นัดสัมภาษณ์
          </Button>
        </div>
      )}

      <Modal
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit?.id ? "แก้ไขนัดสัมภาษณ์" : "นัดสัมภาษณ์"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEdit(null)}>ยกเลิก</Button>
            <Button loading={busy} onClick={save}>บันทึกนัด</Button>
          </>
        }
      >
        {edit && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="รอบที่">
              <Input type="number" min={1} value={edit.round ?? 1} onChange={(e) => setEdit({ ...edit, round: Number(e.target.value) })} className="num" />
            </Field>
            <Field label="วันเวลา" required>
              <Input type="datetime-local" value={whenLocal} onChange={(e) => setWhenLocal(e.target.value)} />
            </Field>
            <Field label="รูปแบบ">
              <Select value={edit.mode} onChange={(e) => setEdit({ ...edit, mode: e.target.value })}>
                {Object.entries(INTERVIEW_MODE).map(([k, l]) => (
                  <option key={k} value={k}>{l}</option>
                ))}
              </Select>
            </Field>
            <Field label="ระยะเวลา (นาที)">
              <Input type="number" min={10} step={5} value={edit.duration_min ?? 60} onChange={(e) => setEdit({ ...edit, duration_min: Number(e.target.value) })} className="num" />
            </Field>
            {edit.mode === "online" ? (
              <Field label="ลิงก์ประชุม (Google Meet / Zoom / Teams)" className="sm:col-span-2">
                <Input value={edit.meeting_url ?? ""} onChange={(e) => setEdit({ ...edit, meeting_url: e.target.value })} placeholder="https://" />
              </Field>
            ) : (
              <Field label="สถานที่" className="sm:col-span-2">
                <Input value={edit.location ?? ""} onChange={(e) => setEdit({ ...edit, location: e.target.value })} placeholder="เช่น ห้องประชุม 2 อาคารสำนักงาน" />
              </Field>
            )}
            <div className="sm:col-span-2">
              <Field label="ผู้สัมภาษณ์" required hint="ผู้สัมภาษณ์เห็นข้อมูลผู้สมัครและให้คะแนนได้เอง">
                <div className="flex flex-col gap-2">
                  {ids.map((id) => (
                    <div key={id} className="flex items-center justify-between rounded-[var(--radius-ctl)] border border-line px-3 py-1.5 text-sm">
                      {dir.name(id)}
                      <button type="button" className="text-ink-mute hover:text-rust" onClick={() => setEdit({ ...edit, interviewer_ids: ids.filter((x) => x !== id) })} aria-label="เอาออก">
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  ))}
                  <EmployeePicker value={null} onChange={(v) => v && !ids.includes(v) && setEdit({ ...edit, interviewer_ids: [...ids, v] })} options={dir.options} placeholder="เพิ่มผู้สัมภาษณ์" />
                </div>
              </Field>
            </div>
            <Field label="หมายเหตุ" className="sm:col-span-2">
              <Textarea value={edit.comment ?? ""} onChange={(e) => setEdit({ ...edit, comment: e.target.value })} rows={2} />
            </Field>
          </div>
        )}
      </Modal>

      <Modal
        open={!!score}
        onClose={() => setScore(null)}
        size="sm"
        title="คะแนนสัมภาษณ์"
        footer={
          <>
            <Button variant="secondary" onClick={() => setScore(null)}>ยกเลิก</Button>
            <Button loading={busy} onClick={saveScore}>บันทึกคะแนน</Button>
          </>
        }
      >
        {score && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-ink-soft">ผู้สัมภาษณ์: <b className="text-ink">{dir.name(score.who)}</b></p>
            <Field label="คะแนนภาพรวม (1–5)">
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" onClick={() => setScore({ ...score, score: n })} className={clsx("num grid size-11 place-items-center rounded-full border text-[15px] font-medium", score.score === n ? "border-jade-600 bg-jade-600 text-white" : "border-line text-ink-soft")}>
                    {n}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="ความเห็น">
              <Textarea value={score.comment} onChange={(e) => setScore({ ...score, comment: e.target.value })} rows={3} placeholder="จุดแข็ง ข้อกังวล ความเหมาะสมกับตำแหน่ง" />
            </Field>
          </div>
        )}
      </Modal>
      {dialog}
    </div>
  );
}
