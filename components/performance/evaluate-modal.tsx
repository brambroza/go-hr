"use client";

import { useEffect, useState } from "react";
import { Button, Modal, Spinner, toast, useConfirm } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import { humanError } from "@/components/crud/crud-page";
import { EvaluationForm, type EvalValue } from "./evaluation-form";
import { formScore, missingCriteria, type EvalForm } from "./scoring";

export type EvalTarget =
  | { kind: "probation"; id: number; formId: number | null; title: string; subtitle?: string; readOnly?: boolean }
  | { kind: "assignment"; id: number; formId: number; title: string; subtitle?: string; readOnly?: boolean };

const formCache = new Map<number, EvalForm>();

export async function loadForm(id: number): Promise<EvalForm | null> {
  if (formCache.has(id)) return formCache.get(id)!;
  const { data } = await supabaseBrowser().from("eval_forms").select("*").eq("id", id).maybeSingle();
  if (data) formCache.set(id, data as EvalForm);
  return (data as EvalForm) ?? null;
}

/**
 * Opens a probation evaluation or an eval assignment, lets the evaluator save a draft or submit.
 * Probation: status stays 'pending' on draft, 'submitted' on submit (with result). Assignment: 'draft' / 'submitted'.
 */
export function EvaluateModal({ target, onClose, onDone, fullScreen }: { target: EvalTarget | null; onClose: () => void; onDone: () => void; fullScreen?: boolean }) {
  const sb = supabaseBrowser();
  const { confirm, dialog } = useConfirm();
  const [form, setForm] = useState<EvalForm | null>(null);
  const [value, setValue] = useState<EvalValue>({ scores: {}, answers: {}, comment: "" });
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<"draft" | "submit" | null>(null);

  useEffect(() => {
    if (!target) return;
    let alive = true;
    setLoading(true);
    (async () => {
      const table = target.kind === "probation" ? "probation_evaluations" : "eval_assignments";
      const { data: row } = await sb.from(table).select("*").eq("id", target.id).maybeSingle();
      let formId = target.formId;
      if (!formId && target.kind === "probation") {
        const { data } = await sb.from("eval_forms").select("id").eq("form_type", "probation").eq("is_active", true).order("id").limit(1).maybeSingle();
        formId = (data as { id: number } | null)?.id ?? null;
      }
      const f = formId ? await loadForm(formId) : null;
      if (!alive) return;
      const r = (row ?? {}) as { scores?: Record<string, number>; answers?: Record<string, string>; comment?: string; result?: EvalValue["result"]; extend_days?: number };
      setForm(f);
      setValue({ scores: r.scores ?? {}, answers: r.answers ?? {}, comment: r.comment ?? "", result: r.result ?? null, extend_days: r.extend_days ?? null });
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [target, sb]);

  async function save(submit: boolean) {
    if (!target || !form) return;
    if (submit) {
      const miss = missingCriteria(form, value.scores);
      if (miss.length) return toast.error(`ยังไม่ได้ให้คะแนน ${miss.length} หัวข้อ เช่น “${miss[0]}”`);
      if (target.kind === "probation" && !value.result) return toast.error("กรุณาเลือกผลการทดลองงาน (ผ่าน / ขยาย / ไม่ผ่าน)");
      if (target.kind === "probation" && value.result === "extend" && !(value.extend_days && value.extend_days > 0)) return toast.error("กรุณาระบุจำนวนวันที่ขยาย");
      if (!(await confirm("ส่งแบบประเมินแล้วจะแก้ไขไม่ได้ ต้องการส่งใช่หรือไม่?", { confirmText: "ส่งแบบประเมิน" }))) return;
    }
    setBusy(submit ? "submit" : "draft");
    const total = formScore(form, value.scores);
    const now = new Date().toISOString();
    const res =
      target.kind === "probation"
        ? await sb
            .from("probation_evaluations")
            .update({
              form_id: form.id, scores: value.scores, answers: value.answers, comment: value.comment || null, total_score: total, result: value.result ?? null,
              extend_days: value.result === "extend" ? value.extend_days : null, ...(submit ? { status: "submitted", submitted_at: now } : {}),
            })
            .eq("id", target.id)
            .select("id")
        : await sb
            .from("eval_assignments")
            .update({ scores: value.scores, answers: value.answers, comment: value.comment || null, competency_score: total, status: submit ? "submitted" : "draft", ...(submit ? { submitted_at: now } : {}) })
            .eq("id", target.id)
            .select("id");
    setBusy(null);
    if (res.error) return toast.error(humanError(res.error));
    if (!res.data?.length) return toast.error("บันทึกไม่ได้ — แบบประเมินนี้อาจถูกส่งไปแล้ว หรือคุณไม่ใช่ผู้ประเมิน");
    toast.ok(submit ? "ส่งแบบประเมินแล้ว" : "บันทึกร่างแล้ว");
    onDone();
    if (submit) onClose();
  }

  const ro = !!target?.readOnly;
  const total = form ? formScore(form, value.scores) : null;
  return (
    <>
      <Modal
        open={!!target}
        onClose={onClose}
        size={fullScreen ? "lg" : "lg"}
        title={
          <span className="block">
            {target?.title}
            {target?.subtitle && <span className="block text-sm font-normal text-ink-soft">{target.subtitle}</span>}
          </span>
        }
        footer={
          ro ? (
            <Button variant="secondary" onClick={onClose}>ปิด</Button>
          ) : (
            <div className="flex w-full items-center justify-between gap-2">
              <span className="num text-sm text-ink-soft">{total == null ? "" : `รวม ${total.toFixed(1)}%`}</span>
              <div className="flex gap-2">
                <Button variant="secondary" loading={busy === "draft"} disabled={!form} onClick={() => save(false)}>บันทึกร่าง</Button>
                <Button loading={busy === "submit"} disabled={!form} onClick={() => save(true)}>ส่งแบบประเมิน</Button>
              </div>
            </div>
          )
        }
      >
        {loading ? (
          <Spinner className="mx-auto my-10" />
        ) : !form ? (
          <p className="py-8 text-center text-ink-soft">ไม่พบแบบประเมินที่ใช้กับรายการนี้ — ให้ HR สร้างแบบประเมินในเมนู “แบบประเมิน” ก่อน</p>
        ) : (
          <EvaluationForm form={form} value={value} onChange={setValue} readOnly={ro} withResult={target?.kind === "probation"} compact={fullScreen} />
        )}
      </Modal>
      {dialog}
    </>
  );
}
