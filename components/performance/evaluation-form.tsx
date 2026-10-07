"use client";

import { Field, Input, Textarea, clsx } from "@/components/ui";
import { PROB_RESULT } from "./labels";
import { formScore, sectionScore, type EvalForm, type Scores } from "./scoring";

export interface EvalValue {
  scores: Scores;
  answers: Record<string, string>;
  comment: string;
  result?: "pass" | "extend" | "fail" | null;
  extend_days?: number | null;
}

/**
 * Renders an eval_forms definition: sections → criteria rated 1..scale_max (weights shown), live weighted total,
 * open questions and comment. `withResult` adds the probation decision (pass / extend / fail + extend days).
 * Shared by probation, annual/upward evaluations (back office and the /m employee app).
 */
export function EvaluationForm({
  form,
  value,
  onChange,
  readOnly,
  withResult,
  compact,
}: {
  form: EvalForm;
  value: EvalValue;
  onChange?: (v: EvalValue) => void;
  readOnly?: boolean;
  withResult?: boolean;
  compact?: boolean;
}) {
  const max = form.scale_max || 5;
  const labels: string[] = Array.isArray(form.scale_labels) ? form.scale_labels : [];
  const total = formScore(form, value.scores);
  const set = (patch: Partial<EvalValue>) => onChange?.({ ...value, ...patch });
  const levels = Array.from({ length: max }, (_, i) => i + 1);

  return (
    <div className="flex flex-col gap-5">
      {labels.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 rounded-[var(--radius-ctl)] bg-paper px-3 py-2 text-xs text-ink-soft">
          <span className="font-medium text-ink">ระดับคะแนน:</span>
          {levels.map((l) => (
            <span key={l}>
              <b className="num text-ink">{l}</b> = {labels[l - 1] ?? ""}
            </span>
          ))}
        </div>
      )}

      {(form.sections ?? []).map((s, si) => {
        const sec = sectionScore(s, value.scores, max);
        return (
          <section key={si} className="rounded-[var(--radius-panel)] border border-line">
            <header className="flex items-center justify-between gap-2 border-b border-line-soft bg-jade-50/60 px-3 py-2">
              <h3 className="text-[15px] font-semibold text-jade-900">
                {si + 1}. {s.title}
              </h3>
              <span className="num shrink-0 text-xs text-ink-soft">
                น้ำหนัก {s.weight}%{sec != null && <> · ได้ {sec.toFixed(0)}%</>}
              </span>
            </header>
            <ul>
              {s.criteria.map((c) => {
                const v = value.scores[c.key];
                return (
                  <li key={c.key} className={clsx("border-b border-line-soft px-3 last:border-0", compact ? "py-2.5" : "py-3")}>
                    <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
                      <div className="min-w-0 flex-1 basis-60">
                        <div className="text-[15px] text-ink">
                          {c.name} <span className="num text-xs text-ink-mute">({c.weight}%)</span>
                        </div>
                        {c.description && <p className="mt-0.5 text-[13px] text-ink-soft">{c.description}</p>}
                      </div>
                      <div className="flex gap-1.5" role="radiogroup" aria-label={c.name}>
                        {levels.map((l) => (
                          <button
                            key={l}
                            type="button"
                            role="radio"
                            aria-checked={v === l}
                            title={labels[l - 1]}
                            disabled={readOnly}
                            onClick={() => set({ scores: { ...value.scores, [c.key]: l } })}
                            className={clsx(
                              "num grid size-10 place-items-center rounded-full border text-[15px] font-medium transition-colors",
                              v === l ? "border-jade-600 bg-jade-600 text-white" : "border-line bg-white text-ink-soft",
                              !readOnly && v !== l && "hover:border-jade-300 hover:bg-jade-50",
                              readOnly && v !== l && "opacity-50",
                            )}
                          >
                            {l}
                          </button>
                        ))}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      <div className="flex items-center justify-between rounded-[var(--radius-panel)] border border-jade-200 bg-jade-50 px-4 py-3">
        <span className="text-[15px] font-medium text-jade-900">คะแนนรวมถ่วงน้ำหนัก</span>
        <span className="num text-2xl font-semibold text-jade-800">{total == null ? "-" : `${total.toFixed(2)}%`}</span>
      </div>

      {(form.open_questions ?? []).length > 0 && (
        <div className="flex flex-col gap-3">
          {form.open_questions.map((q, i) => (
            <Field key={i} label={q}>
              <Textarea value={value.answers[q] ?? ""} onChange={(e) => set({ answers: { ...value.answers, [q]: e.target.value } })} disabled={readOnly} rows={2} />
            </Field>
          ))}
        </div>
      )}

      <Field label="ความเห็นเพิ่มเติม">
        <Textarea value={value.comment ?? ""} onChange={(e) => set({ comment: e.target.value })} disabled={readOnly} rows={2} />
      </Field>

      {withResult && (
        <div className="rounded-[var(--radius-panel)] border border-line p-3">
          <div className="mb-2 text-sm font-medium text-ink-soft">
            สรุปผลการทดลองงาน<span className="ml-0.5 text-rust">*</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            {(["pass", "extend", "fail"] as const).map((r) => (
              <button
                key={r}
                type="button"
                disabled={readOnly}
                onClick={() => set({ result: r, extend_days: r === "extend" ? value.extend_days ?? 30 : null })}
                className={clsx(
                  "h-12 rounded-[var(--radius-ctl)] border text-[15px] font-medium",
                  value.result === r
                    ? r === "pass"
                      ? "border-jade-600 bg-jade-600 text-white"
                      : r === "extend"
                        ? "border-amber-400 bg-amber-50 text-amber-ink"
                        : "border-rust bg-rust text-white"
                    : "border-line bg-white text-ink-soft",
                )}
              >
                {PROB_RESULT[r]}
              </button>
            ))}
          </div>
          {value.result === "extend" && (
            <Field label="ขยายเวลาทดลองงาน (วัน)" className="mt-3 max-w-48" hint="นับต่อจากวันครบทดลองงานเดิม">
              <Input type="number" min={1} max={120} value={value.extend_days ?? ""} onChange={(e) => set({ extend_days: e.target.value ? Number(e.target.value) : null })} disabled={readOnly} className="num" />
            </Field>
          )}
        </div>
      )}
    </div>
  );
}
