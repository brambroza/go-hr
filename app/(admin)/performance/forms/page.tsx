"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Copy, Eye, Pencil, Plus, Trash2 } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useCan } from "@/components/app/me-context";
import { Badge, Button, Empty, Field, Input, Modal, PageHeader, Panel, Select, Spinner, Textarea, Toggle, clsx, toast, useConfirm } from "@/components/ui";
import { humanError } from "@/components/crud/crud-page";
import { EvaluationForm, type EvalValue } from "@/components/performance/evaluation-form";
import { FORM_TYPE } from "@/components/performance/labels";
import { validateForm, type EvalForm, type EvalSection } from "@/components/performance/scoring";

const DEFAULT_LABELS: Record<number, string[]> = {
  3: ["ต่ำกว่ามาตรฐาน", "ตามมาตรฐาน", "เกินมาตรฐาน"],
  4: ["ต้องปรับปรุง", "พอใช้", "ดี", "ดีมาก"],
  5: ["ต้องปรับปรุง", "พอใช้", "ดี", "ดีมาก", "ดีเยี่ยม"],
};

const blank = (): EvalForm => ({ id: 0, name: "", form_type: "annual", scale_max: 5, scale_labels: DEFAULT_LABELS[5], kpi_weight: 0, open_questions: [], is_active: true, sections: [{ title: "", weight: 100, criteria: [{ key: "c1", name: "", weight: 100 }] }] });
const newKey = () => "k" + Math.random().toString(36).slice(2, 7);

export default function FormsPage() {
  const sb = supabaseBrowser();
  const can = useCan();
  const { confirm, dialog } = useConfirm();
  const [rows, setRows] = useState<EvalForm[] | null>(null);
  const [edit, setEdit] = useState<EvalForm | null>(null);
  const [preview, setPreview] = useState<EvalForm | null>(null);
  const [pv, setPv] = useState<EvalValue>({ scores: {}, answers: {}, comment: "" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await sb.from("eval_forms").select("*").order("id");
    if (error) toast.error(error.message);
    setRows((data as EvalForm[]) ?? []);
  }, [sb]);
  useEffect(() => {
    load();
  }, [load]);

  const errs = edit ? validateForm(edit) : [];
  const setSec = (i: number, p: Partial<EvalSection>) => edit && setEdit({ ...edit, sections: edit.sections.map((s, j) => (j === i ? { ...s, ...p } : s)) });

  async function save() {
    if (!edit) return;
    if (!edit.name.trim()) return toast.error("กรุณาตั้งชื่อแบบประเมิน");
    if (errs.length) return toast.error(errs[0]);
    setBusy(true);
    const { id, ...payload } = edit;
    const res = id ? await sb.from("eval_forms").update(payload).eq("id", id) : await sb.from("eval_forms").insert(payload);
    setBusy(false);
    if (res.error) return toast.error(humanError(res.error));
    toast.ok("บันทึกแบบประเมินแล้ว");
    setEdit(null);
    load();
  }
  async function remove(f: EvalForm) {
    if (!(await confirm(`ลบแบบประเมิน “${f.name}” ใช่หรือไม่? (ถ้าถูกใช้ในรอบการประเมินแล้วจะลบไม่ได้ ให้ปิดการใช้งานแทน)`, { danger: true, confirmText: "ลบ" }))) return;
    const { error } = await sb.from("eval_forms").delete().eq("id", f.id);
    if (error) return toast.error(humanError(error));
    toast.ok("ลบแบบประเมินแล้ว");
    load();
  }

  return (
    <div>
      <PageHeader
        title="แบบประเมิน"
        description="กำหนดหมวด หัวข้อ น้ำหนัก และระดับคะแนน ใช้ร่วมกันในการประเมินทดลองงาน ประเมินประจำปี และลูกน้องประเมินหัวหน้า"
        actions={can("performance", "create") && <Button icon={<Plus className="size-4" />} onClick={() => setEdit(blank())}>สร้างแบบประเมิน</Button>}
      />
      {rows === null ? (
        <Spinner className="mx-auto mt-16" />
      ) : rows.length === 0 ? (
        <Empty title="ยังไม่มีแบบประเมิน" />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((f) => (
            <Panel
              key={f.id}
              title={<span className="flex min-w-0 items-center gap-2 text-[15px]">{f.name}{!f.is_active && <Badge>ไม่ใช้งาน</Badge>}</span>}
              actions={
                <div className="-my-1 flex shrink-0">
                  <button className="rounded p-1.5 text-ink-mute hover:bg-jade-50" title="ดูตัวอย่าง" aria-label="ดูตัวอย่าง" onClick={() => (setPv({ scores: {}, answers: {}, comment: "" }), setPreview(f))}><Eye className="size-4" /></button>
                  {can("performance", "create") && <button className="rounded p-1.5 text-ink-mute hover:bg-jade-50" title="ทำสำเนา" aria-label="ทำสำเนา" onClick={() => setEdit({ ...f, id: 0, name: `${f.name} (สำเนา)` })}><Copy className="size-4" /></button>}
                  {can("performance", "edit") && <button className="rounded p-1.5 text-ink-mute hover:bg-jade-50" aria-label="แก้ไข" onClick={() => setEdit(structuredClone(f))}><Pencil className="size-4" /></button>}
                  {can("performance", "delete") && <button className="rounded p-1.5 text-ink-mute hover:bg-rust-soft hover:text-rust" aria-label="ลบ" onClick={() => remove(f)}><Trash2 className="size-4" /></button>}
                </div>
              }
            >
              <div className="mb-2 flex flex-wrap gap-1">
                <Badge color="blue">{FORM_TYPE[f.form_type]}</Badge>
                <Badge>คะแนน 1–{f.scale_max}</Badge>
                {Number(f.kpi_weight) > 0 && <Badge color="violet">KPI {Number(f.kpi_weight)}% · สมรรถนะ {100 - Number(f.kpi_weight)}%</Badge>}
              </div>
              <ul className="flex flex-col gap-1 text-sm">
                {f.sections.map((s, i) => (
                  <li key={i} className="flex justify-between gap-2">
                    <span className="text-ink-soft">{s.title} <span className="text-ink-mute">({s.criteria.length} หัวข้อ)</span></span>
                    <span className="num font-medium">{s.weight}%</span>
                  </li>
                ))}
              </ul>
              {f.open_questions.length > 0 && <p className="mt-2 text-xs text-ink-mute">คำถามปลายเปิด {f.open_questions.length} ข้อ</p>}
            </Panel>
          ))}
        </div>
      )}

      <Modal
        open={!!edit}
        onClose={() => setEdit(null)}
        size="xl"
        title={edit?.id ? "แก้ไขแบบประเมิน" : "สร้างแบบประเมิน"}
        footer={
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <span className={clsx("text-sm", errs.length ? "text-rust" : "text-jade-700")}>{errs.length ? errs[0] : "น้ำหนักครบ 100% ถูกต้อง"}</span>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setEdit(null)}>ยกเลิก</Button>
              <Button loading={busy} onClick={save} disabled={errs.length > 0}>บันทึกแบบประเมิน</Button>
            </div>
          </div>
        }
      >
        {edit && (
          <div className="flex flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-4">
              <Field label="ชื่อแบบประเมิน" required className="sm:col-span-2"><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
              <Field label="ใช้สำหรับ"><Select value={edit.form_type} onChange={(e) => setEdit({ ...edit, form_type: e.target.value })}>{Object.entries(FORM_TYPE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
              <div className="pt-6"><Toggle checked={edit.is_active !== false} onChange={(v) => setEdit({ ...edit, is_active: v })} label="ใช้งาน" /></div>
              <Field label="ระดับคะแนนสูงสุด">
                <Select value={edit.scale_max} onChange={(e) => { const n = Number(e.target.value); setEdit({ ...edit, scale_max: n, scale_labels: DEFAULT_LABELS[n] ?? Array.from({ length: n }, (_, i) => String(i + 1)) }); }}>
                  {[3, 4, 5, 7, 10].map((n) => <option key={n} value={n}>1–{n}</option>)}
                </Select>
              </Field>
              <Field label="น้ำหนัก KPI (%)" hint="ส่วนที่เหลือเป็นคะแนนสมรรถนะ"><Input type="number" min={0} max={100} value={edit.kpi_weight} onChange={(e) => setEdit({ ...edit, kpi_weight: Number(e.target.value) })} className="num" /></Field>
              <Field label="คำอธิบายแต่ละระดับ" className="sm:col-span-2">
                <div className="flex flex-wrap gap-1">
                  {Array.from({ length: edit.scale_max }, (_, i) => (
                    <Input key={i} value={edit.scale_labels[i] ?? ""} onChange={(e) => { const a = [...edit.scale_labels]; a[i] = e.target.value; setEdit({ ...edit, scale_labels: a }); }} className="h-9 !w-28 text-sm" placeholder={String(i + 1)} aria-label={`ระดับ ${i + 1}`} />
                  ))}
                </div>
              </Field>
            </div>

            {edit.sections.map((s, i) => {
              const cw = s.criteria.reduce((a, c) => a + (Number(c.weight) || 0), 0);
              return (
                <section key={i} className="rounded-[var(--radius-panel)] border border-line">
                  <header className="flex flex-wrap items-center gap-2 border-b border-line-soft bg-jade-50/50 px-3 py-2">
                    <span className="num text-sm font-semibold text-jade-800">หมวด {i + 1}</span>
                    <Input value={s.title} onChange={(e) => setSec(i, { title: e.target.value })} placeholder="ชื่อหมวด เช่น สมรรถนะหลัก" className="h-9 min-w-48 flex-1" />
                    <label className="flex items-center gap-1 text-sm text-ink-soft">น้ำหนัก <Input type="number" min={0} max={100} value={s.weight} onChange={(e) => setSec(i, { weight: Number(e.target.value) })} className="num h-9 !w-20" /> %</label>
                    <div className="flex">
                      <button className="rounded p-1.5 text-ink-mute hover:bg-white disabled:opacity-30" disabled={i === 0} onClick={() => { const a = [...edit.sections]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; setEdit({ ...edit, sections: a }); }} aria-label="เลื่อนขึ้น"><ArrowUp className="size-4" /></button>
                      <button className="rounded p-1.5 text-ink-mute hover:bg-white disabled:opacity-30" disabled={i === edit.sections.length - 1} onClick={() => { const a = [...edit.sections]; [a[i + 1], a[i]] = [a[i], a[i + 1]]; setEdit({ ...edit, sections: a }); }} aria-label="เลื่อนลง"><ArrowDown className="size-4" /></button>
                      <button className="rounded p-1.5 text-ink-mute hover:bg-rust-soft hover:text-rust" onClick={() => setEdit({ ...edit, sections: edit.sections.filter((_, j) => j !== i) })} aria-label="ลบหมวด"><Trash2 className="size-4" /></button>
                    </div>
                  </header>
                  <div className="flex flex-col gap-2 p-3">
                    {s.criteria.map((c, k) => (
                      <div key={c.key} className="grid gap-2 sm:grid-cols-[1fr_1.4fr_6rem_auto]">
                        <Input value={c.name} onChange={(e) => setSec(i, { criteria: s.criteria.map((x, j) => (j === k ? { ...x, name: e.target.value } : x)) })} placeholder={`หัวข้อที่ ${k + 1}`} className="h-9 text-sm" />
                        <Input value={c.description ?? ""} onChange={(e) => setSec(i, { criteria: s.criteria.map((x, j) => (j === k ? { ...x, description: e.target.value || undefined } : x)) })} placeholder="คำอธิบาย / พฤติกรรมที่คาดหวัง (ไม่บังคับ)" className="h-9 text-sm" />
                        <div className="flex items-center gap-1"><Input type="number" min={0} max={100} value={c.weight} onChange={(e) => setSec(i, { criteria: s.criteria.map((x, j) => (j === k ? { ...x, weight: Number(e.target.value) } : x)) })} className="num h-9 text-sm" aria-label="น้ำหนัก" /><span className="text-sm text-ink-mute">%</span></div>
                        <button className="rounded p-1.5 text-ink-mute hover:bg-rust-soft hover:text-rust" disabled={s.criteria.length === 1} onClick={() => setSec(i, { criteria: s.criteria.filter((_, j) => j !== k) })} aria-label="ลบหัวข้อ"><Trash2 className="size-4" /></button>
                      </div>
                    ))}
                    <div className="flex items-center justify-between">
                      <button className="text-sm text-jade-700 hover:underline" onClick={() => setSec(i, { criteria: [...s.criteria, { key: newKey(), name: "", weight: 0 }] })}>+ เพิ่มหัวข้อ</button>
                      <span className={clsx("num text-xs", Math.abs(cw - 100) > 0.001 ? "text-rust" : "text-ink-mute")}>น้ำหนักหัวข้อรวม {cw}%</span>
                    </div>
                  </div>
                </section>
              );
            })}
            <div className="flex items-center justify-between">
              <Button size="sm" variant="secondary" icon={<Plus className="size-4" />} onClick={() => setEdit({ ...edit, sections: [...edit.sections, { title: "", weight: 0, criteria: [{ key: newKey(), name: "", weight: 100 }] }] })}>เพิ่มหมวด</Button>
              <span className={clsx("num text-sm", Math.abs(edit.sections.reduce((a, s) => a + Number(s.weight || 0), 0) - 100) > 0.001 ? "text-rust" : "text-ink-soft")}>น้ำหนักหมวดรวม {edit.sections.reduce((a, s) => a + Number(s.weight || 0), 0)}%</span>
            </div>
            <Field label="คำถามปลายเปิด (บรรทัดละ 1 ข้อ)">
              <Textarea value={edit.open_questions.join("\n")} onChange={(e) => setEdit({ ...edit, open_questions: e.target.value.split("\n") })} onBlur={() => setEdit({ ...edit, open_questions: edit.open_questions.map((q) => q.trim()).filter(Boolean) })} rows={3} placeholder={"จุดเด่นของพนักงาน\nสิ่งที่ควรพัฒนา"} />
            </Field>
          </div>
        )}
      </Modal>

      <Modal open={!!preview} onClose={() => setPreview(null)} size="lg" title={`ตัวอย่าง: ${preview?.name ?? ""}`}>
        {preview && <EvaluationForm form={preview} value={pv} onChange={setPv} withResult={preview.form_type === "probation"} />}
      </Modal>
      {dialog}
    </div>
  );
}
