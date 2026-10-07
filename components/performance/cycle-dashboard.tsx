"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Calculator, Clock3, Download, Eye, Lock, RefreshCw, Sparkles, Unlock, Users } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useCan, useMe } from "@/components/app/me-context";
import { Badge, Button, Empty, Input, PageHeader, Panel, Select, Spinner, Stat, Tabs, clsx, toast, useConfirm } from "@/components/ui";
import { BarList } from "@/components/charts";
import { humanError } from "@/components/crud/crud-page";
import { useDirectory } from "@/components/recruit/use-directory";
import { downloadCsv } from "@/lib/csv";
import { thDate } from "@/lib/format";
import { EvaluateModal, type EvalTarget } from "./evaluate-modal";
import { ASSIGN_STATUS, ASSIGN_STATUS_COLOR, CYCLE_STATUS, CYCLE_STATUS_COLOR, RELATION } from "./labels";
import { gradeOf, kpiScore, type GradeStep, type ScoringStep } from "./scoring";

type Cycle = { id: number; name: string; eval_year: number; form_id: number; upward_form_id: number | null; start_date: string; end_date: string; period_from: string | null; period_to: string | null; self_eval: boolean; supervisor_eval: boolean; supervisor_weight: number; upward_eval: boolean; grade_scale: GradeStep[]; status: string; eval_forms: { name: string; kpi_weight: number } | null };
type Asg = { id: number; employee_id: number; evaluator_employee_id: number; relation: string; status: string; competency_score: number | null; submitted_at: string | null };
type Kpi = { id: number; employee_id: number; kpi_item_id: number | null; name: string; unit: string | null; target: number | null; weight: number; direction: string; actual: number | null; score: number | null; source: string; note: string | null };
type Res = { id: number; employee_id: number; competency_score: number | null; kpi_score: number | null; final_score: number | null; grade: string | null; calibrated_grade: string | null; salary_increase_pct: number | null; bonus_months: number | null; note: string | null; acknowledged_at: string | null };

export function CycleDashboard({ id }: { id: number }) {
  const sb = supabaseBrowser();
  const can = useCan();
  const me = useMe();
  const dir = useDirectory();
  const { confirm, dialog } = useConfirm();
  const canEdit = can("performance", "edit");
  const [c, setC] = useState<Cycle | null | undefined>(undefined);
  const [asg, setAsg] = useState<Asg[]>([]);
  const [kpis, setKpis] = useState<Kpi[]>([]);
  const [res, setRes] = useState<Res[]>([]);
  const [scoring, setScoring] = useState<Map<number, ScoringStep[] | null>>(new Map());
  const [tab, setTab] = useState<"progress" | "kpi" | "results">("progress");
  const [busy, setBusy] = useState<string | null>(null);
  const [orgF, setOrgF] = useState("");
  const [relF, setRelF] = useState("");
  const [stF, setStF] = useState("");
  const [target, setTarget] = useState<EvalTarget | null>(null);

  const load = useCallback(async () => {
    const [a, b, k, r, items] = await Promise.all([
      sb.from("eval_cycles").select("*, eval_forms!eval_cycles_form_id_fkey(name, kpi_weight)").eq("id", id).maybeSingle(),
      sb.from("eval_assignments").select("id, employee_id, evaluator_employee_id, relation, status, competency_score, submitted_at").eq("cycle_id", id).limit(20000),
      sb.from("employee_kpis").select("id, employee_id, kpi_item_id, name, unit, target, weight, direction, actual, score, source, note").eq("cycle_id", id).order("id").limit(50000),
      sb.from("eval_results").select("id, employee_id, competency_score, kpi_score, final_score, grade, calibrated_grade, salary_increase_pct, bonus_months, note, acknowledged_at").eq("cycle_id", id).limit(20000),
      sb.from("kpi_items").select("id, scoring"),
    ]);
    if (a.error) toast.error(a.error.message);
    setC((a.data as Cycle) ?? null);
    setAsg((b.data as Asg[]) ?? []);
    setKpis((k.data as Kpi[]) ?? []);
    setRes((r.data as Res[]) ?? []);
    setScoring(new Map(((items.data ?? []) as { id: number; scoring: ScoringStep[] | null }[]).map((x) => [x.id, x.scoring])));
  }, [sb, id]);
  useEffect(() => {
    load();
  }, [load]);

  async function rpc(name: string, label: string, fn: () => PromiseLike<{ data: unknown; error: { message: string } | null }>, ok: (d: unknown) => string) {
    setBusy(name);
    const { data, error } = await fn();
    setBusy(null);
    if (error) return toast.error(humanError(error));
    toast.ok(ok(data));
    void label;
    load();
  }
  const generate = () => rpc("gen", "", () => sb.rpc("eval_cycle_generate", { p_cycle_id: id }), (n) => `สร้างรายการประเมินแล้ว (${n} รายการ ไม่รวมที่มีอยู่แล้ว)`);
  const pullAtt = () => rpc("att", "", () => sb.rpc("eval_cycle_attendance_kpis", { p_cycle_id: id }), (n) => `ดึงข้อมูลเวลาทำงานแล้ว ${n} รายการ`);
  const compute = () => rpc("calc", "", () => sb.rpc("eval_cycle_compute", { p_cycle_id: id }), (n) => `คำนวณผลแล้ว ${n} คน`);
  async function setStatus(status: string) {
    if (status === "closed" && !(await confirm("ปิดรอบและประกาศผล? พนักงานจะเห็นผลการประเมินของตนเองและกดรับทราบได้ หลังปิดรอบแก้ไขคะแนนไม่ได้", { confirmText: "ปิดรอบและประกาศผล" }))) return;
    if (status === "calibration" && !(await confirm("เปิดรอบที่ประกาศผลแล้วให้แก้ไขผลอีกครั้ง? พนักงานจะเห็นผลที่อาจเปลี่ยนแปลงหลังปิดรอบใหม่", { confirmText: "เปิดแก้ไขผล" }))) return;
    setBusy("status");
    const { error } = await sb.from("eval_cycles").update({ status }).eq("id", id);
    setBusy(null);
    if (error) return toast.error(humanError(error));
    toast.ok(status === "closed" ? "ปิดรอบและประกาศผลแล้ว" : status === "open" ? "เปิดให้ประเมินแล้ว" : status === "calibration" ? "เปิดแก้ไขผลอีกครั้งแล้ว" : "เปลี่ยนสถานะแล้ว");
    load();
  }

  async function saveKpi(k: Kpi, actual: string) {
    const v = actual.trim() === "" ? null : Number(actual.replace(/,/g, ""));
    if (v !== null && isNaN(v)) return toast.error("ผลงานต้องเป็นตัวเลข");
    if (v === k.actual) return;
    const score = kpiScore(v, k.target, k.direction, k.kpi_item_id ? scoring.get(k.kpi_item_id) : null);
    setKpis((x) => x.map((y) => (y.id === k.id ? { ...y, actual: v, score } : y)));
    const { error } = await sb.from("employee_kpis").update({ actual: v, score }).eq("id", k.id);
    if (error) {
      toast.error(humanError(error));
      load();
    } else toast.ok(`บันทึกผล “${k.name}” แล้ว`);
  }
  async function saveRes(r: Res, p: Partial<Res>) {
    setRes((x) => x.map((y) => (y.id === r.id ? { ...y, ...p } : y)));
    const { error } = await sb.from("eval_results").update(p).eq("id", r.id);
    if (error) {
      toast.error(humanError(error));
      load();
    } else toast.ok("บันทึกแล้ว");
  }

  const orgOf = (empId: number) => dir.byId.get(empId)?.org_unit_name ?? "ไม่ระบุหน่วยงาน";
  const orgs = useMemo(() => [...new Set(asg.map((a) => orgOf(a.employee_id)))].sort(), [asg, dir.rows]); // eslint-disable-line react-hooks/exhaustive-deps

  if (c === undefined) return <Spinner className="mx-auto mt-20" />;
  if (c === null) return <Empty title="ไม่พบรอบการประเมิน" action={<Link href="/performance/cycles" className="text-jade-700 underline">กลับ</Link>} />;

  const closed = c.status === "closed";
  const kpiWeight = Number(c.eval_forms?.kpi_weight ?? 0);
  const submitted = asg.filter((a) => a.status === "submitted").length;
  const pct = asg.length ? Math.round((submitted / asg.length) * 100) : 0;
  const byRel = Object.keys(RELATION).filter((r) => asg.some((a) => a.relation === r)).map((r) => {
    const l = asg.filter((a) => a.relation === r);
    return { r, total: l.length, done: l.filter((a) => a.status === "submitted").length };
  });
  const byOrg = orgs.map((o) => {
    const l = asg.filter((a) => orgOf(a.employee_id) === o);
    return { o, total: l.length, done: l.filter((a) => a.status === "submitted").length };
  });
  const filteredAsg = asg.filter((a) => (!orgF || orgOf(a.employee_id) === orgF) && (!relF || a.relation === relF) && (!stF || a.status === stF));
  const finalGrade = (r: Res) => r.calibrated_grade || r.grade;
  const dist = (c.grade_scale ?? []).map((g) => ({ name: `เกรด ${g.grade}`, value: res.filter((r) => finalGrade(r) === g.grade).length }));
  const kpiEmps = [...new Set(kpis.map((k) => k.employee_id))].filter((e) => !orgF || orgOf(e) === orgF);
  const canKpi = (empId: number) => !closed && (canEdit || (me.employeeId && dir.byId.get(empId)?.supervisor_id === me.employeeId) || false);

  function exportResults() {
    downloadCsv(`eval-results-${c!.eval_year}.csv`, [
      ["รหัส", "ชื่อ-สกุล", "ตำแหน่ง", "หน่วยงาน", "คะแนนสมรรถนะ", "คะแนน KPI", "คะแนนรวม", "เกรด", "เกรดหลังปรับเทียบ", "ขึ้นเงินเดือน (%)", "โบนัส (เดือน)", "หมายเหตุ", "รับทราบเมื่อ"],
      ...res.map((r) => {
        const e = dir.byId.get(r.employee_id);
        return [e?.code, dir.name(r.employee_id), e?.position_name, e?.org_unit_name, r.competency_score, r.kpi_score, r.final_score, r.grade, r.calibrated_grade, r.salary_increase_pct, r.bonus_months, r.note, r.acknowledged_at?.slice(0, 10)];
      }),
    ]);
  }

  return (
    <div>
      <PageHeader
        back={<Link href="/performance/cycles" className="mb-1 inline-flex items-center gap-1 text-sm text-ink-soft hover:text-jade-700"><ArrowLeft className="size-4" /> รอบการประเมินทั้งหมด</Link>}
        title={<span className="flex flex-wrap items-center gap-2">{c.name}<Badge color={CYCLE_STATUS_COLOR[c.status]}>{CYCLE_STATUS[c.status]}</Badge></span>}
        description={`${c.eval_forms?.name ?? ""} · ประเมิน ${thDate(c.start_date)} – ${thDate(c.end_date)} · คะแนนรวม = สมรรถนะ ${100 - kpiWeight}% + KPI ${kpiWeight}%${c.self_eval && c.supervisor_eval ? ` · หัวหน้า ${c.supervisor_weight}% / ตนเอง ${100 - c.supervisor_weight}%` : ""}`}
        actions={
          canEdit && (
            <>
              {!closed && <Button variant={asg.length ? "secondary" : "primary"} icon={<Sparkles className="size-4" />} loading={busy === "gen"} onClick={generate}>{asg.length ? "สร้างรายการเพิ่ม (พนักงานใหม่)" : "สร้างรายการประเมิน"}</Button>}
              {c.status === "draft" && asg.length > 0 && <Button icon={<Unlock className="size-4" />} loading={busy === "status"} onClick={() => setStatus("open")}>เปิดให้ประเมิน</Button>}
              {closed ? (
                <Button variant="secondary" icon={<Unlock className="size-4" />} loading={busy === "status"} onClick={() => setStatus("calibration")}>เปิดแก้ไขผลอีกครั้ง</Button>
              ) : (
                asg.length > 0 && <Button variant="secondary" icon={<Lock className="size-4" />} loading={busy === "status"} onClick={() => setStatus("closed")}>ปิดรอบและประกาศผล</Button>
              )}
            </>
          )
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="พนักงานในรอบ" value={res.length} />
        <Stat label="แบบประเมินที่ส่งแล้ว" value={`${submitted}/${asg.length}`} sub={`${pct}%`} tone={pct < 100 && asg.length ? "amber" : undefined} />
        <Stat label="KPI ที่มีผลงานแล้ว" value={`${kpis.filter((k) => k.actual != null).length}/${kpis.length}`} />
        <Stat label="รับทราบผลแล้ว" value={`${res.filter((r) => r.acknowledged_at).length}/${res.length}`} sub={closed ? "หลังประกาศผล" : "ยังไม่ประกาศผล"} />
      </div>

      <Tabs className="mb-4" value={tab} onChange={setTab} tabs={[{ value: "progress", label: "ความคืบหน้า", count: asg.length - submitted }, { value: "kpi", label: "ผลงาน KPI", count: kpis.length }, { value: "results", label: "สรุปผลและปรับเทียบ" }]} />

      {asg.length === 0 && tab !== "results" ? (
        <Panel>
          <Empty icon={<Users className="size-8" />} title="ยังไม่มีรายการประเมินในรอบนี้" description="กด “สร้างรายการประเมิน” เพื่อสร้างแบบประเมินตนเอง หัวหน้าประเมิน และ KPI ตามโปรไฟล์ของแต่ละตำแหน่งให้พนักงานทุกคนในขอบเขต" action={canEdit && <Button icon={<Sparkles className="size-4" />} loading={busy === "gen"} onClick={generate}>สร้างรายการประเมิน</Button>} />
        </Panel>
      ) : tab === "progress" ? (
        <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <div className="flex flex-col gap-4">
            <Panel title="ตามประเภทผู้ประเมิน">
              <ul className="flex flex-col gap-3">
                {byRel.map((x) => (
                  <li key={x.r}>
                    <div className="mb-1 flex justify-between text-sm"><span>{RELATION[x.r]}</span><span className="num text-ink-soft">{x.done}/{x.total}</span></div>
                    <div className="h-2 rounded-full bg-jade-50"><div className="h-2 rounded-full bg-jade-500" style={{ width: `${(x.done / Math.max(1, x.total)) * 100}%` }} /></div>
                  </li>
                ))}
              </ul>
            </Panel>
            <Panel title="ตามหน่วยงาน">
              <ul className="flex flex-col gap-2.5">
                {byOrg.map((x) => (
                  <li key={x.o}>
                    <button className={clsx("w-full text-left", orgF === x.o && "font-medium text-jade-800")} onClick={() => setOrgF(orgF === x.o ? "" : x.o)}>
                      <div className="mb-1 flex justify-between text-sm"><span className="truncate">{x.o}</span><span className="num text-ink-soft">{x.done}/{x.total}</span></div>
                      <div className="h-1.5 rounded-full bg-jade-50"><div className="h-1.5 rounded-full bg-jade-400" style={{ width: `${(x.done / Math.max(1, x.total)) * 100}%` }} /></div>
                    </button>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
          <Panel bodyClass="p-0">
            <div className="flex flex-wrap items-center gap-2 border-b border-line-soft px-3 py-2.5">
              <Select className="h-9 !w-auto text-sm" value={orgF} onChange={(e) => setOrgF(e.target.value)} placeholder="ทุกหน่วยงาน">{orgs.map((o) => <option key={o}>{o}</option>)}</Select>
              <Select className="h-9 !w-auto text-sm" value={relF} onChange={(e) => setRelF(e.target.value)} placeholder="ทุกประเภท">{Object.entries(RELATION).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
              <Select className="h-9 !w-auto text-sm" value={stF} onChange={(e) => setStF(e.target.value)} placeholder="ทุกสถานะ">{Object.entries(ASSIGN_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
              <span className="num ml-auto text-sm text-ink-mute">{filteredAsg.length} รายการ</span>
            </div>
            <div className="thin-scroll max-h-[640px] overflow-auto">
              <table className="w-full text-[14px]">
                <thead className="sticky top-0 bg-paper">
                  <tr className="text-left text-[13px] text-ink-soft">
                    <th className="px-3 py-2 font-medium">ผู้ถูกประเมิน</th>
                    <th className="px-3 py-2 font-medium">ผู้ประเมิน</th>
                    <th className="px-3 py-2 font-medium">ประเภท</th>
                    <th className="px-3 py-2 font-medium">สถานะ</th>
                    <th className="px-3 py-2 text-right font-medium">คะแนน</th>
                    <th className="w-px" />
                  </tr>
                </thead>
                <tbody>
                  {filteredAsg.map((a) => (
                    <tr key={a.id} className="border-t border-line-soft">
                      <td className="px-3 py-1.5"><div className="font-medium">{dir.name(a.employee_id)}</div><div className="text-xs text-ink-mute">{orgOf(a.employee_id)}</div></td>
                      <td className="px-3 py-1.5 text-ink-soft">{a.relation === "upward" ? <span className="italic text-ink-mute">ไม่เปิดเผยชื่อ</span> : dir.name(a.evaluator_employee_id)}</td>
                      <td className="px-3 py-1.5 text-ink-soft">{RELATION[a.relation]}</td>
                      <td className="px-3 py-1.5"><Badge color={ASSIGN_STATUS_COLOR[a.status]}>{ASSIGN_STATUS[a.status]}</Badge></td>
                      <td className="num px-3 py-1.5 text-right">{a.competency_score != null ? Number(a.competency_score).toFixed(1) : "-"}</td>
                      <td className="px-2">
                        {a.status === "submitted" && a.relation !== "upward" && (
                          <button className="rounded p-1.5 text-ink-mute hover:bg-jade-50" aria-label="ดูแบบประเมิน" onClick={() => setTarget({ kind: "assignment", id: a.id, formId: c.form_id, title: `${RELATION[a.relation]}: ${dir.name(a.employee_id)}`, subtitle: `ผู้ประเมิน ${dir.name(a.evaluator_employee_id)}`, readOnly: true })}><Eye className="size-4" /></button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      ) : tab === "kpi" ? (
        <Panel
          bodyClass="p-0"
          title="ผลงานจริงของ KPI"
          actions={
            <>
              <Select className="h-9 !w-auto text-sm" value={orgF} onChange={(e) => setOrgF(e.target.value)} placeholder="ทุกหน่วยงาน">{orgs.map((o) => <option key={o}>{o}</option>)}</Select>
              {canEdit && !closed && <Button size="sm" variant="secondary" icon={<Clock3 className="size-4" />} loading={busy === "att"} onClick={pullAtt}>ดึง KPI จากเวลาทำงาน</Button>}
              {canEdit && <Link href="/performance/kpi" className="text-sm text-jade-700 hover:underline">นำเข้าจากไฟล์</Link>}
            </>
          }
        >
          {kpis.length === 0 ? (
            <Empty title="ไม่มี KPI ในรอบนี้" description="KPI ถูกสร้างจาก KPI Profile ที่ตรงกับตำแหน่ง/หน่วยงานของพนักงานตอนสร้างรายการประเมิน" />
          ) : (
            <div className="thin-scroll max-h-[680px] overflow-auto">
              <table className="w-full text-[14px]">
                <thead className="sticky top-0 z-[1] bg-paper">
                  <tr className="text-left text-[13px] text-ink-soft">
                    <th className="px-3 py-2 font-medium">พนักงาน / KPI</th>
                    <th className="px-3 py-2 text-right font-medium">น้ำหนัก</th>
                    <th className="px-3 py-2 text-right font-medium">เป้าหมาย</th>
                    <th className="px-3 py-2 font-medium">ผลงานจริง</th>
                    <th className="px-3 py-2 text-right font-medium">คะแนน (0–100)</th>
                  </tr>
                </thead>
                <tbody>
                  {kpiEmps.map((e) => {
                    const list = kpis.filter((k) => k.employee_id === e);
                    const ws = list.filter((k) => k.score != null);
                    const tot = ws.length ? ws.reduce((a, k) => a + Number(k.score) * Number(k.weight), 0) / Math.max(1, ws.reduce((a, k) => a + Number(k.weight), 0)) : null;
                    return [
                      <tr key={`h${e}`} className="border-t border-line bg-jade-50/40">
                        <td className="px-3 py-1.5 font-medium" colSpan={4}>{dir.name(e)} <span className="text-xs font-normal text-ink-mute">{dir.byId.get(e)?.code} · {orgOf(e)}</span></td>
                        <td className="num px-3 py-1.5 text-right font-semibold text-jade-800">{tot != null ? tot.toFixed(1) : "-"}</td>
                      </tr>,
                      ...list.map((k) => (
                        <tr key={k.id} className="border-t border-line-soft">
                          <td className="py-1.5 pl-7 pr-3">{k.name}{k.source !== "manual" && <Badge className="ml-1" color={k.source === "external" ? "violet" : "blue"}>{k.source === "external" ? "นำเข้า" : "เวลาทำงาน"}</Badge>}</td>
                          <td className="num px-3 py-1.5 text-right">{Number(k.weight)}%</td>
                          <td className="num px-3 py-1.5 text-right">{k.target != null ? Number(k.target).toLocaleString("th-TH") : "-"} <span className="text-ink-mute">{k.unit}</span></td>
                          <td className="px-3 py-1">
                            <Input key={`${k.id}-${k.actual}`} defaultValue={k.actual ?? ""} disabled={!canKpi(k.employee_id)} inputMode="decimal" className="num h-8 !w-28 text-sm" onBlur={(ev) => saveKpi(k, ev.target.value)} onKeyDown={(ev) => ev.key === "Enter" && (ev.target as HTMLInputElement).blur()} aria-label={`ผลงาน ${k.name}`} />
                          </td>
                          <td className="num px-3 py-1.5 text-right">{k.score != null ? Number(k.score).toFixed(0) : "-"}</td>
                        </tr>
                      )),
                    ];
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
          <Panel
            bodyClass="p-0"
            title="ผลการประเมินรายบุคคล"
            actions={
              <>
                {canEdit && !closed && <Button size="sm" icon={res.some((r) => r.final_score != null) ? <RefreshCw className="size-4" /> : <Calculator className="size-4" />} loading={busy === "calc"} onClick={compute}>{res.some((r) => r.final_score != null) ? "คำนวณใหม่" : "คำนวณผล"}</Button>}
                {can("performance", "export") && <Button size="sm" variant="secondary" icon={<Download className="size-4" />} onClick={exportResults}>ส่งออก</Button>}
              </>
            }
          >
            {res.length === 0 ? (
              <Empty title="ยังไม่มีผล" />
            ) : (
              <div className="thin-scroll max-h-[680px] overflow-auto">
                <table className="w-full text-[14px]">
                  <thead className="sticky top-0 z-[1] bg-paper">
                    <tr className="text-left text-[13px] text-ink-soft">
                      <th className="px-3 py-2 font-medium">พนักงาน</th>
                      <th className="px-2 py-2 text-right font-medium">สมรรถนะ</th>
                      <th className="px-2 py-2 text-right font-medium">KPI</th>
                      <th className="px-2 py-2 text-right font-medium">รวม</th>
                      <th className="px-2 py-2 text-center font-medium">เกรด</th>
                      <th className="px-2 py-2 font-medium">ปรับเทียบ</th>
                      <th className="px-2 py-2 font-medium">ขึ้นเงินเดือน %</th>
                      <th className="px-2 py-2 font-medium">โบนัส (เดือน)</th>
                      <th className="px-2 py-2 font-medium">หมายเหตุ</th>
                      <th className="px-2 py-2 font-medium">รับทราบ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...res].sort((a, b) => Number(b.final_score ?? -1) - Number(a.final_score ?? -1)).map((r) => (
                      <tr key={r.id} className="border-t border-line-soft">
                        <td className="px-3 py-1.5"><div className="font-medium">{dir.name(r.employee_id)}</div><div className="text-xs text-ink-mute">{orgOf(r.employee_id)}</div></td>
                        <td className="num px-2 py-1.5 text-right">{r.competency_score != null ? Number(r.competency_score).toFixed(1) : "-"}</td>
                        <td className="num px-2 py-1.5 text-right">{r.kpi_score != null ? Number(r.kpi_score).toFixed(1) : "-"}</td>
                        <td className="num px-2 py-1.5 text-right font-semibold">{r.final_score != null ? Number(r.final_score).toFixed(1) : "-"}</td>
                        <td className="px-2 py-1.5 text-center">{r.grade ? <Badge color={r.grade <= "B" ? "green" : r.grade === "C" ? "blue" : "amber"}>{r.grade}</Badge> : "-"}</td>
                        <td className="px-2 py-1">
                          <Select value={r.calibrated_grade ?? ""} disabled={!canEdit || closed} onChange={(e) => saveRes(r, { calibrated_grade: e.target.value || null })} className="h-8 !w-20 text-sm" placeholder="—">
                            {(c.grade_scale ?? []).map((g) => <option key={g.grade}>{g.grade}</option>)}
                          </Select>
                        </td>
                        <td className="px-2 py-1"><Input key={`s${r.id}-${r.salary_increase_pct}`} defaultValue={r.salary_increase_pct ?? ""} disabled={!canEdit || closed} inputMode="decimal" className="num h-8 !w-20 text-sm" onBlur={(e) => { const v = e.target.value === "" ? null : Number(e.target.value); if (v !== r.salary_increase_pct) saveRes(r, { salary_increase_pct: v }); }} /></td>
                        <td className="px-2 py-1"><Input key={`b${r.id}-${r.bonus_months}`} defaultValue={r.bonus_months ?? ""} disabled={!canEdit || closed} inputMode="decimal" className="num h-8 !w-20 text-sm" onBlur={(e) => { const v = e.target.value === "" ? null : Number(e.target.value); if (v !== r.bonus_months) saveRes(r, { bonus_months: v }); }} /></td>
                        <td className="px-2 py-1"><Input key={`n${r.id}-${r.note}`} defaultValue={r.note ?? ""} disabled={!canEdit || closed} className="h-8 min-w-36 text-sm" onBlur={(e) => (e.target.value || null) !== r.note && saveRes(r, { note: e.target.value || null })} /></td>
                        <td className="num whitespace-nowrap px-2 py-1.5 text-xs">{r.acknowledged_at ? thDate(r.acknowledged_at) : <span className="text-ink-mute">-</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
          <div className="flex flex-col gap-4">
            <Panel title="การกระจายเกรด">
              <BarList data={dist} />
              <p className="mt-3 text-xs text-ink-mute">นับจากเกรดหลังปรับเทียบ (ถ้ามี)</p>
            </Panel>
            <Panel title="เกณฑ์เกรด">
              <ul className="flex flex-col gap-1 text-sm">
                {(c.grade_scale ?? []).map((g, i, a) => (
                  <li key={g.grade} className="flex justify-between"><span className="font-medium">{g.grade}</span><span className="num text-ink-soft">{g.min}{i > 0 ? ` – ${a[i - 1].min - 0.01}` : " ขึ้นไป"}</span></li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-ink-mute">ตัวอย่าง: สมรรถนะ 85 KPI 90 → รวม {(85 * (1 - kpiWeight / 100) + 90 * (kpiWeight / 100)).toFixed(1)} = เกรด {gradeOf(85 * (1 - kpiWeight / 100) + 90 * (kpiWeight / 100), c.grade_scale)}</p>
            </Panel>
          </div>
        </div>
      )}
      <EvaluateModal target={target} onClose={() => setTarget(null)} onDone={load} />
      {dialog}
    </div>
  );
}
