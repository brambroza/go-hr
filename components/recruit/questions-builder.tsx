"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button, Checkbox, Input, Select } from "@/components/ui";
import { QUESTION_TYPE, type JobQuestion } from "./labels";

/** builder for job_postings.questions [{key,label,type,required,options}] */
export function QuestionsBuilder({ value, onChange }: { value: JobQuestion[]; onChange: (v: JobQuestion[]) => void }) {
  const list = Array.isArray(value) ? value : [];
  const set = (i: number, patch: Partial<JobQuestion>) => onChange(list.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  const move = (i: number, d: number) => {
    const a = [...list];
    const [x] = a.splice(i, 1);
    a.splice(i + d, 0, x);
    onChange(a);
  };
  return (
    <div className="flex flex-col gap-2">
      {list.length === 0 && <p className="text-sm text-ink-mute">ยังไม่มีคำถามเพิ่มเติม — ใบสมัครจะมีเฉพาะข้อมูลมาตรฐาน (ข้อมูลส่วนตัว การศึกษา ประสบการณ์)</p>}
      {list.map((q, i) => (
        <div key={q.key} className="rounded-[var(--radius-ctl)] border border-line bg-paper/50 p-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="num w-5 text-sm text-ink-mute">{i + 1}.</span>
            <Input value={q.label} onChange={(e) => set(i, { label: e.target.value })} placeholder="คำถาม เช่น สามารถทำงานเป็นกะได้หรือไม่" className="min-w-48 flex-1" />
            <Select value={q.type} onChange={(e) => set(i, { type: e.target.value as JobQuestion["type"] })} className="!w-36">
              {Object.entries(QUESTION_TYPE).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </Select>
            <Checkbox label="ต้องตอบ" checked={!!q.required} onChange={(v) => set(i, { required: v })} />
            <div className="flex">
              <button type="button" className="rounded p-1.5 text-ink-mute hover:bg-white disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} aria-label="เลื่อนขึ้น">
                <ArrowUp className="size-4" />
              </button>
              <button type="button" className="rounded p-1.5 text-ink-mute hover:bg-white disabled:opacity-30" disabled={i === list.length - 1} onClick={() => move(i, 1)} aria-label="เลื่อนลง">
                <ArrowDown className="size-4" />
              </button>
              <button type="button" className="rounded p-1.5 text-ink-mute hover:bg-rust-soft hover:text-rust" onClick={() => onChange(list.filter((_, j) => j !== i))} aria-label="ลบคำถาม">
                <Trash2 className="size-4" />
              </button>
            </div>
          </div>
          {q.type === "select" && (
            <Input
              className="mt-2"
              value={(q.options ?? []).join(", ")}
              onChange={(e) => set(i, { options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
              placeholder="ตัวเลือก คั่นด้วยเครื่องหมายจุลภาค เช่น กะเช้า, กะบ่าย, กะดึก"
            />
          )}
        </div>
      ))}
      <div>
        <Button size="sm" variant="secondary" icon={<Plus className="size-4" />} onClick={() => onChange([...list, { key: `q${Date.now().toString(36)}`, label: "", type: "text", required: false }])}>
          เพิ่มคำถาม
        </Button>
      </div>
    </div>
  );
}
