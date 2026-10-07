"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Award, CheckCircle2, ChevronRight, ClipboardList, FileWarning } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useMe } from "@/components/app/me-context";
import { Badge, Button, Field, Modal, Spinner, Tabs, Textarea, clsx, toast } from "@/components/ui";
import { humanError } from "@/components/crud/crud-page";
import { isoDate, thDate } from "@/lib/format";
import { EvaluateModal, type EvalTarget } from "./evaluate-modal";
import { ASSIGN_STATUS, ASSIGN_STATUS_COLOR, PROB_STATUS, RELATION, WARNING_COLOR, WARNING_LEVEL } from "./labels";

type Person = { first_name: string; last_name: string; code?: string };
type Asg = { id: number; cycle_id: number; employee_id: number; relation: string; status: string; competency_score: number | null; submitted_at: string | null; eval_cycles: { name: string; form_id: number; upward_form_id: number | null; end_date: string; status: string } | null };
type Prob = { id: number; employee_id: number; form_id: number | null; round: number; due_date: string | null; status: string; total_score: number | null };
type Res = { id: number; cycle_id: number; competency_score: number | null; kpi_score: number | null; final_score: number | null; grade: string | null; calibrated_grade: string | null; salary_increase_pct: number | null; bonus_months: number | null; acknowledged_at: string | null; employee_comment: string | null; eval_cycles: { name: string; eval_year: number } | null };
type Warn = { id: number; doc_no: string | null; issue_date: string; level: string; offense: string; detail: string | null; penalty: string | null; expire_date: string | null; acknowledged_at: string | null };

/** “แบบประเมินที่ต้องทำ” + “ผลการประเมินของฉัน” + หนังสือเตือน — back office (`variant="desktop"`) and the /m app */
export function MyEvaluations({ variant }: { variant: "desktop" | "mobile" }) {
  const me = useMe();
  const sb = supabaseBrowser();
  const [asg, setAsg] = useState<Asg[] | null>(null);
  const [prob, setProb] = useState<Prob[]>([]);
  const [res, setRes] = useState<Res[]>([]);
  const [warn, setWarn] = useState<Warn[]>([]);
  const [people, setPeople] = useState<Map<number, Person>>(new Map());
  const [tab, setTab] = useState<"todo" | "done" | "results" | "warnings">("todo");
  const [target, setTarget] = useState<EvalTarget | null>(null);
  const [ack, setAck] = useState<{ kind: "result"; r: Res } | { kind: "warning"; w: Warn } | null>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const mobile = variant === "mobile";

  const load = useCallback(async () => {
    const eid = me.employeeId;
    if (!eid) return setAsg([]);
    const [a, p, r, w] = await Promise.all([
      sb.from("eval_assignments").select("id, cycle_id, employee_id, relation, status, competency_score, submitted_at, eval_cycles(name, form_id, upward_form_id, end_date, status)").eq("evaluator_employee_id", eid).order("id"),
      sb.from("probation_evaluations").select("id, employee_id, form_id, round, due_date, status, total_score").eq("evaluator_employee_id", eid).neq("status", "cancelled").order("id"),
      sb.from("eval_results").select("id, cycle_id, competency_score, kpi_score, final_score, grade, calibrated_grade, salary_increase_pct, bonus_months, acknowledged_at, employee_comment, eval_cycles!inner(name, eval_year, status)").eq("employee_id", eid).eq("eval_cycles.status", "closed").order("id", { ascending: false }),
      sb.from("warning_letters").select("id, doc_no, issue_date, level, offense, detail, penalty, expire_date, acknowledged_at").eq("employee_id", eid).order("issue_date", { ascending: false }),
    ]);
    const A = ((a.data as unknown as Asg[]) ?? []).filter((x) => x.eval_cycles && x.eval_cycles.status !== "draft");
    const P = (p.data as Prob[]) ?? [];
    setAsg(A);
    setProb(P);
    setRes((r.data as unknown as Res[]) ?? []);
    setWarn((w.data as Warn[]) ?? []);
    const ids = [...new Set([...A.map((x) => x.employee_id), ...P.map((x) => x.employee_id)])];
    if (ids.length) {
      const { data } = await sb.from("v_directory").select("id, code, first_name, last_name").in("id", ids);
      setPeople(new Map(((data ?? []) as (Person & { id: number })[]).map((x) => [x.id, x])));
    }
  }, [sb, me.employeeId]);
  useEffect(() => {
    load();
  }, [load]);

  async function doAck() {
    if (!ack) return;
    setBusy(true);
    const { error } = ack.kind === "result" ? await sb.rpc("eval_result_ack", { p_id: ack.r.id, p_comment: comment || null }) : await sb.rpc("warning_ack", { p_id: ack.w.id, p_comment: comment || null });
    setBusy(false);
    if (error) return toast.error(humanError(error));
    toast.ok("บันทึกการรับทราบแล้ว");
    setAck(null);
    load();
  }

  if (asg === null) return <Spinner className="mx-auto mt-16" />;

  const name = (id: number) => {
    const p = people.get(id);
    return p ? `${p.first_name} ${p.last_name}` : "-";
  };
  type Item = { key: string; title: string; sub: string; due: string | null; status: string; statusLabel: string; done: boolean; open: () => void };
  const items: Item[] = [
    ...prob.map((p) => ({
      key: `p${p.id}`,
      title: `ประเมินทดลองงาน: ${name(p.employee_id)}`,
      sub: `รอบที่ ${p.round}`,
      due: p.due_date,
      status: p.status === "pending" ? "pending" : "submitted",
      statusLabel: PROB_STATUS[p.status],
      done: p.status !== "pending",
      open: () => setTarget({ kind: "probation", id: p.id, formId: p.form_id, title: `ประเมินทดลองงาน ${name(p.employee_id)}`, subtitle: `รอบที่ ${p.round}${p.due_date ? ` · ส่งภายใน ${thDate(p.due_date)}` : ""}`, readOnly: p.status !== "pending" }),
    })),
    ...asg.map((a) => {
      const formId = a.relation === "upward" ? a.eval_cycles?.upward_form_id ?? a.eval_cycles!.form_id : a.eval_cycles!.form_id;
      const title = a.relation === "self" ? "ประเมินตนเอง" : a.relation === "upward" ? `ประเมินหัวหน้า: ${name(a.employee_id)}` : `ประเมินลูกทีม: ${name(a.employee_id)}`;
      const locked = a.status === "submitted" || a.eval_cycles?.status === "closed";
      return {
        key: `a${a.id}`,
        title,
        sub: `${a.eval_cycles?.name ?? ""}${a.relation === "upward" ? " · ไม่เปิดเผยชื่อผู้ประเมิน" : ""}`,
        due: a.eval_cycles?.end_date ?? null,
        status: a.status,
        statusLabel: ASSIGN_STATUS[a.status],
        done: locked,
        open: () => setTarget({ kind: "assignment", id: a.id, formId, title, subtitle: `${a.eval_cycles?.name ?? ""} · ${RELATION[a.relation]}`, readOnly: locked }),
      };
    }),
  ];
  const todo = items.filter((i) => !i.done);
  const done = items.filter((i) => i.done);
  const pendingWarn = warn.filter((w) => !w.acknowledged_at).length;
  const pendingRes = res.filter((r) => !r.acknowledged_at).length;
  const list = tab === "todo" ? todo : done;

  return (
    <div>
      <Tabs
        className="mb-3"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "todo", label: "ต้องทำ", count: todo.length },
          { value: "done", label: "ส่งแล้ว", count: done.length },
          { value: "results", label: "ผลของฉัน", count: pendingRes || undefined },
          ...(warn.length ? [{ value: "warnings" as const, label: "หนังสือเตือน", count: pendingWarn || undefined }] : []),
        ]}
      />

      {(tab === "todo" || tab === "done") &&
        (list.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-[var(--radius-panel)] border border-line bg-white px-6 py-12 text-center">
            {tab === "todo" ? <CheckCircle2 className="size-8 text-jade-500" /> : <ClipboardList className="size-8 text-jade-400" />}
            <p className="font-medium">{tab === "todo" ? "ไม่มีแบบประเมินที่ต้องทำ" : "ยังไม่มีแบบประเมินที่ส่งแล้ว"}</p>
            {tab === "todo" && <p className="text-sm text-ink-soft">เมื่อ HR เปิดรอบประเมิน รายการจะแสดงที่นี่</p>}
          </div>
        ) : (
          <ul className={clsx("overflow-hidden rounded-[var(--radius-panel)] border border-line bg-white", !mobile && "max-w-3xl")}>
            {list.map((i) => {
              const late = !i.done && i.due && i.due < isoDate();
              return (
                <li key={i.key} className="border-b border-line-soft last:border-0">
                  <button onClick={i.open} className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left hover:bg-jade-50/40 active:bg-jade-50">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-ink">{i.title}</div>
                      <div className="text-[13px] text-ink-soft">{i.sub}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <Badge color={ASSIGN_STATUS_COLOR[i.status] ?? "gray"}>{i.statusLabel}</Badge>
                        {i.due && !i.done && <span className={clsx("text-xs", late ? "text-rust" : "text-ink-mute")}>{late ? "เลยกำหนด " : "ส่งภายใน "}{thDate(i.due)}</span>}
                      </div>
                    </div>
                    <ChevronRight className="size-5 shrink-0 text-ink-mute" />
                  </button>
                </li>
              );
            })}
          </ul>
        ))}

      {tab === "results" &&
        (res.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-[var(--radius-panel)] border border-line bg-white px-6 py-12 text-center">
            <Award className="size-8 text-jade-400" />
            <p className="font-medium">ยังไม่มีผลการประเมินที่ประกาศ</p>
          </div>
        ) : (
          <ul className={clsx("flex flex-col gap-3", !mobile && "max-w-3xl")}>
            {res.map((r) => (
              <li key={r.id} className="rounded-[var(--radius-panel)] border border-line bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold">{r.eval_cycles?.name}</div>
                    <div className="text-sm text-ink-soft">คะแนนรวม <b className="num text-ink">{r.final_score != null ? Number(r.final_score).toFixed(1) : "-"}</b></div>
                  </div>
                  <div className="grid size-14 shrink-0 place-items-center rounded-full bg-jade-600 text-2xl font-semibold text-white">{r.calibrated_grade || r.grade || "-"}</div>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-[var(--radius-ctl)] bg-paper px-3 py-2"><dt className="text-ink-mute">สมรรถนะ</dt><dd className="num font-medium">{r.competency_score != null ? Number(r.competency_score).toFixed(1) : "-"}</dd></div>
                  <div className="rounded-[var(--radius-ctl)] bg-paper px-3 py-2"><dt className="text-ink-mute">KPI</dt><dd className="num font-medium">{r.kpi_score != null ? Number(r.kpi_score).toFixed(1) : "-"}</dd></div>
                  {r.salary_increase_pct != null && <div className="rounded-[var(--radius-ctl)] bg-paper px-3 py-2"><dt className="text-ink-mute">ปรับเงินเดือน</dt><dd className="num font-medium">{Number(r.salary_increase_pct)}%</dd></div>}
                  {r.bonus_months != null && <div className="rounded-[var(--radius-ctl)] bg-paper px-3 py-2"><dt className="text-ink-mute">โบนัส</dt><dd className="num font-medium">{Number(r.bonus_months)} เดือน</dd></div>}
                </dl>
                {r.acknowledged_at ? (
                  <p className="mt-3 flex items-center gap-1.5 text-sm text-jade-700"><CheckCircle2 className="size-4" /> รับทราบเมื่อ {thDate(r.acknowledged_at)}</p>
                ) : (
                  <Button className="mt-3 w-full" size={mobile ? "lg" : "md"} onClick={() => (setComment(""), setAck({ kind: "result", r }))}>รับทราบผลการประเมิน</Button>
                )}
              </li>
            ))}
          </ul>
        ))}

      {tab === "warnings" && (
        <ul className={clsx("flex flex-col gap-3", !mobile && "max-w-3xl")}>
          {warn.map((w) => (
            <li key={w.id} className={clsx("rounded-[var(--radius-panel)] border bg-white p-4", w.acknowledged_at ? "border-line" : "border-amber-300")}>
              <div className="flex items-start gap-3">
                <FileWarning className="mt-0.5 size-5 shrink-0 text-rust" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5"><Badge color={WARNING_COLOR[w.level]}>{WARNING_LEVEL[w.level]}</Badge><span className="num text-xs text-ink-mute">{w.doc_no} · {thDate(w.issue_date)}</span></div>
                  <div className="mt-1 font-medium">{w.offense}</div>
                  {w.detail && <p className="mt-0.5 text-sm text-ink-soft">{w.detail}</p>}
                  {w.expire_date && <p className="mt-1 text-xs text-ink-mute">มีผลถึง {thDate(w.expire_date)}</p>}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Link href={`/m/evaluations/warnings/${w.id}`} className="text-sm text-jade-700 underline">ดูหนังสือเตือน</Link>
                {w.acknowledged_at ? (
                  <span className="ml-auto flex items-center gap-1.5 text-sm text-jade-700"><CheckCircle2 className="size-4" /> รับทราบเมื่อ {thDate(w.acknowledged_at)}</span>
                ) : (
                  <Button className="ml-auto" onClick={() => (setComment(""), setAck({ kind: "warning", w }))}>รับทราบ</Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <EvaluateModal target={target} onClose={() => setTarget(null)} onDone={load} fullScreen={mobile} />
      <Modal
        open={!!ack}
        onClose={() => setAck(null)}
        size="sm"
        title={ack?.kind === "warning" ? "รับทราบหนังสือเตือน" : "รับทราบผลการประเมิน"}
        footer={<><Button variant="secondary" onClick={() => setAck(null)}>ยกเลิก</Button><Button loading={busy} onClick={doAck}>ยืนยันรับทราบ</Button></>}
      >
        <div className="flex flex-col gap-3">
          {ack?.kind === "warning" && (
            <p className="flex gap-2 rounded-[var(--radius-ctl)] bg-amber-50 p-3 text-sm text-amber-ink"><AlertTriangle className="size-4 shrink-0" /> การกดรับทราบหมายถึงคุณได้รับและอ่านหนังสือเตือนแล้ว ไม่ได้หมายความว่ายอมรับข้อกล่าวหา คุณสามารถเขียนคำชี้แจงได้</p>
          )}
          <Field label={ack?.kind === "warning" ? "คำชี้แจงของพนักงาน (ถ้ามี)" : "ความเห็นของพนักงาน (ถ้ามี)"}>
            <Textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
