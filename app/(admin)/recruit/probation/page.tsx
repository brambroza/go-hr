"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ClipboardCheck, ClipboardPen, Eye, Plus } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useCan, useMe } from "@/components/app/me-context";
import { Badge, Button, Checkbox, Empty, Field, Input, Modal, PageHeader, Panel, Select, Spinner, Stat, Tabs, clsx, toast } from "@/components/ui";
import { EmployeePicker } from "@/components/crud/employee-picker";
import { humanError } from "@/components/crud/crud-page";
import { Avatar } from "@/components/employees/avatar";
import { EvaluateModal, type EvalTarget } from "@/components/performance/evaluate-modal";
import { PROB_RESULT, PROB_RESULT_COLOR, PROB_STATUS, PROB_STATUS_COLOR } from "@/components/performance/labels";
import { useDirectory } from "@/components/recruit/use-directory";
import { addDays, isoDate, thDate } from "@/lib/format";

type Emp = { id: number; code: string; first_name: string; last_name: string; nickname: string | null; photo_url: string | null; hire_date: string; probation_end_date: string | null; supervisor_id: number | null; position_id: number | null; org_unit_id: number | null; positions: { name: string } | null; org_units: { name: string } | null };
type Ev = { id: number; employee_id: number; form_id: number | null; round: number; evaluator_employee_id: number | null; due_date: string | null; status: string; total_score: number | null; result: string | null; extend_days: number | null; comment: string | null; submitted_at: string | null; approved_at: string | null; created_at: string };
type Form = { id: number; name: string };

function daysLeft(d: string | null) {
  if (!d) return null;
  return Math.round((new Date(d + "T00:00:00").getTime() - new Date(isoDate() + "T00:00:00").getTime()) / 86400000);
}

export default function ProbationPage() {
  const sb = supabaseBrowser();
  const me = useMe();
  const can = useCan();
  const dir = useDirectory();
  const isHr = can("recruit", "edit");
  const canApprove = isHr && can("employee", "edit");
  const [emps, setEmps] = useState<Emp[] | null>(null);
  const [evs, setEvs] = useState<Ev[]>([]);
  const [forms, setForms] = useState<Form[]>([]);
  const [tab, setTab] = useState<"todo" | "submitted" | "all">("todo");
  const [creating, setCreating] = useState<{ employee_id: number | null; round: number; evaluator: number | null; form_id: string; due_date: string } | null>(null);
  const [target, setTarget] = useState<EvalTarget | null>(null);
  const [approve, setApprove] = useState<{ ev: Ev; effective: string; now: boolean; note: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [e, v, f] = await Promise.all([
      sb.from("employees").select("id, code, first_name, last_name, nickname, photo_url, hire_date, probation_end_date, supervisor_id, position_id, org_unit_id, positions!employees_position_id_fkey(name), org_units!employees_org_unit_id_fkey(name)").eq("status", "probation").order("probation_end_date"),
      sb.from("probation_evaluations").select("*").order("created_at", { ascending: false }).limit(500),
      sb.from("eval_forms").select("id, name").eq("form_type", "probation").eq("is_active", true).order("id"),
    ]);
    if (e.error) toast.error(e.error.message);
    setEmps((e.data as unknown as Emp[]) ?? []);
    setEvs((v.data as Ev[]) ?? []);
    setForms((f.data as Form[]) ?? []);
  }, [sb]);
  useEffect(() => {
    load();
  }, [load]);

  const empMap = useMemo(() => new Map((emps ?? []).map((e) => [e.id, e])), [emps]);
  const evByEmp = useMemo(() => {
    const m = new Map<number, Ev[]>();
    for (const e of evs) m.set(e.employee_id, [...(m.get(e.employee_id) ?? []), e]);
    return m;
  }, [evs]);

  const filtered = evs.filter((e) => (tab === "todo" ? e.status === "pending" : tab === "submitted" ? e.status === "submitted" : true));
  const empName = (id: number) => {
    const e = empMap.get(id) ?? dir.byId.get(id);
    return e ? `${e.first_name} ${e.last_name}` : "-";
  };

  function openCreate(emp?: Emp) {
    const prior = emp ? evByEmp.get(emp.id) ?? [] : [];
    setCreating({
      employee_id: emp?.id ?? null,
      round: (prior.reduce((m, x) => Math.max(m, x.round), 0) || 0) + 1,
      evaluator: emp?.supervisor_id ?? null,
      form_id: forms[0] ? String(forms[0].id) : "",
      due_date: emp?.probation_end_date ? addDays(emp.probation_end_date, -7) : addDays(isoDate(), 14),
    });
  }

  async function create() {
    if (!creating?.employee_id) return toast.error("กรุณาเลือกพนักงาน");
    if (!creating.evaluator) return toast.error("กรุณาเลือกผู้ประเมิน");
    setBusy(true);
    const { error } = await sb.from("probation_evaluations").insert({
      employee_id: creating.employee_id, round: creating.round, evaluator_employee_id: creating.evaluator, form_id: creating.form_id ? Number(creating.form_id) : null, due_date: creating.due_date || null, status: "pending",
    });
    setBusy(false);
    if (error) return toast.error(humanError(error));
    toast.ok("สร้างแบบประเมินทดลองงานแล้ว ผู้ประเมินจะเห็นในเมนู “แบบประเมินที่ต้องทำ”");
    setCreating(null);
    load();
  }

  async function doApprove() {
    if (!approve) return;
    setBusy(true);
    const { data, error } = await sb.rpc("probation_approve", { p_id: approve.ev.id, p_effective: approve.effective || null, p_apply_now: approve.now, p_note: approve.note || null });
    setBusy(false);
    if (error) return toast.error(humanError(error));
    const r = data as { movement_id: number | null; new_probation_end: string | null };
    toast.ok(
      approve.ev.result === "extend"
        ? `ขยายทดลองงานถึง ${thDate(r.new_probation_end)} แล้ว`
        : approve.now
          ? "อนุมัติและปรับสถานะพนักงานแล้ว"
          : `อนุมัติแล้ว ระบบจะปรับสถานะในวันที่ ${thDate(approve.effective)} (ดูได้ที่เมนูโอนย้าย / แต่งตั้ง)`,
    );
    setApprove(null);
    load();
  }

  const dueSoon = (emps ?? []).filter((e) => (daysLeft(e.probation_end_date) ?? 999) <= 30).length;

  return (
    <div>
      <PageHeader
        title="ประเมินทดลองงาน"
        description="หัวหน้างานประเมินพนักงานทดลองงานตามแบบฟอร์ม แล้ว HR อนุมัติผล — ผ่าน: บรรจุเป็นพนักงานประจำในวันครบทดลองงาน, ขยาย: เลื่อนวันครบทดลองงาน, ไม่ผ่าน: บันทึกพ้นสภาพ"
        actions={
          (isHr || me.isSupervisor) && (
            <Button icon={<Plus className="size-4" />} onClick={() => openCreate()}>
              สร้างแบบประเมิน
            </Button>
          )
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="พนักงานทดลองงาน" value={emps?.length ?? "-"} />
        <Stat label="ครบกำหนดใน 30 วัน" value={dueSoon} tone={dueSoon ? "amber" : undefined} />
        <Stat label="รอหัวหน้าประเมิน" value={evs.filter((e) => e.status === "pending").length} />
        <Stat label="รอ HR อนุมัติ" value={evs.filter((e) => e.status === "submitted").length} tone={evs.some((e) => e.status === "submitted") ? "amber" : undefined} />
      </div>

      <Panel title="พนักงานที่อยู่ระหว่างทดลองงาน" bodyClass="p-0" className="mb-4">
        {emps === null ? (
          <Spinner className="mx-auto my-10" />
        ) : emps.length === 0 ? (
          <Empty title="ไม่มีพนักงานที่อยู่ระหว่างทดลองงาน" />
        ) : (
          <div className="thin-scroll overflow-x-auto">
            <table className="w-full text-[14px]">
              <thead>
                <tr className="border-b border-line bg-paper/60 text-left text-[13px] text-ink-soft">
                  <th className="px-3 py-2 font-medium">พนักงาน</th>
                  <th className="px-3 py-2 font-medium">ตำแหน่ง / หน่วยงาน</th>
                  <th className="px-3 py-2 font-medium">หัวหน้า</th>
                  <th className="px-3 py-2 font-medium">เริ่มงาน</th>
                  <th className="px-3 py-2 font-medium">ครบทดลองงาน</th>
                  <th className="px-3 py-2 text-right font-medium">เหลือ</th>
                  <th className="px-3 py-2 font-medium">การประเมิน</th>
                  <th className="w-px px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {emps.map((e) => {
                  const left = daysLeft(e.probation_end_date);
                  const last = evByEmp.get(e.id)?.[0];
                  return (
                    <tr key={e.id} className="border-b border-line-soft last:border-0">
                      <td className="px-3 py-2">
                        <Link href={`/employees/${e.id}`} className="flex items-center gap-2 hover:text-jade-700">
                          <Avatar src={e.photo_url} name={`${e.first_name} ${e.last_name}`} size={32} />
                          <span>
                            <span className="block font-medium">{e.first_name} {e.last_name}</span>
                            <span className="num block text-xs text-ink-mute">{e.code}</span>
                          </span>
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-ink-soft">{e.positions?.name ?? "-"}<div className="text-xs text-ink-mute">{e.org_units?.name}</div></td>
                      <td className="px-3 py-2 text-ink-soft">{dir.name(e.supervisor_id)}</td>
                      <td className="num whitespace-nowrap px-3 py-2">{thDate(e.hire_date)}</td>
                      <td className="num whitespace-nowrap px-3 py-2">{thDate(e.probation_end_date)}</td>
                      <td className={clsx("num px-3 py-2 text-right font-medium", left == null ? "" : left < 0 ? "text-rust" : left <= 30 ? "text-amber-ink" : "text-ink")}>
                        {left == null ? "-" : left < 0 ? `เกิน ${-left} วัน` : `${left} วัน`}
                      </td>
                      <td className="px-3 py-2">
                        {last ? (
                          <span className="flex flex-wrap gap-1">
                            <Badge color={PROB_STATUS_COLOR[last.status]}>รอบ {last.round}: {PROB_STATUS[last.status]}</Badge>
                            {last.result && <Badge color={PROB_RESULT_COLOR[last.result]}>{PROB_RESULT[last.result]}</Badge>}
                          </span>
                        ) : (
                          <span className="text-ink-mute">ยังไม่สร้าง</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {(isHr || e.supervisor_id === me.employeeId) && (
                          <Button size="sm" variant="secondary" onClick={() => openCreate(e)}>
                            สร้างแบบประเมิน
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel bodyClass="p-0">
        <div className="px-3 pt-2">
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              { value: "todo", label: "รอหัวหน้าประเมิน", count: evs.filter((e) => e.status === "pending").length },
              { value: "submitted", label: "รอ HR อนุมัติ", count: evs.filter((e) => e.status === "submitted").length },
              { value: "all", label: "ทั้งหมด", count: evs.length },
            ]}
          />
        </div>
        {filtered.length === 0 ? (
          <Empty title="ไม่มีรายการ" />
        ) : (
          <div className="thin-scroll overflow-x-auto">
            <table className="w-full text-[14px]">
              <thead>
                <tr className="border-b border-line bg-paper/60 text-left text-[13px] text-ink-soft">
                  <th className="px-3 py-2 font-medium">พนักงาน</th>
                  <th className="px-3 py-2 font-medium">รอบ</th>
                  <th className="px-3 py-2 font-medium">ผู้ประเมิน</th>
                  <th className="px-3 py-2 font-medium">กำหนดส่ง</th>
                  <th className="px-3 py-2 font-medium">สถานะ</th>
                  <th className="px-3 py-2 text-right font-medium">คะแนน</th>
                  <th className="px-3 py-2 font-medium">ผล</th>
                  <th className="w-px px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((ev) => {
                  const mine = ev.evaluator_employee_id === me.employeeId && ev.status === "pending";
                  const overdue = ev.status === "pending" && ev.due_date && ev.due_date < isoDate();
                  return (
                    <tr key={ev.id} className="border-b border-line-soft last:border-0">
                      <td className="px-3 py-2 font-medium">{empName(ev.employee_id)}</td>
                      <td className="num px-3 py-2">{ev.round}</td>
                      <td className="px-3 py-2 text-ink-soft">{dir.name(ev.evaluator_employee_id)}</td>
                      <td className={clsx("num whitespace-nowrap px-3 py-2", overdue && "text-rust")}>{thDate(ev.due_date)}{overdue && " (เลยกำหนด)"}</td>
                      <td className="px-3 py-2"><Badge color={PROB_STATUS_COLOR[ev.status]}>{PROB_STATUS[ev.status]}</Badge></td>
                      <td className="num px-3 py-2 text-right">{ev.total_score != null ? `${Number(ev.total_score).toFixed(1)}%` : "-"}</td>
                      <td className="px-3 py-2">
                        {ev.result ? <Badge color={PROB_RESULT_COLOR[ev.result]}>{PROB_RESULT[ev.result]}{ev.result === "extend" && ev.extend_days ? ` ${ev.extend_days} วัน` : ""}</Badge> : "-"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right">
                        <div className="flex justify-end gap-1">
                          {mine ? (
                            <Button size="sm" icon={<ClipboardPen className="size-4" />} onClick={() => setTarget({ kind: "probation", id: ev.id, formId: ev.form_id, title: `ประเมินทดลองงาน ${empName(ev.employee_id)}`, subtitle: `รอบที่ ${ev.round}` })}>
                              ประเมิน
                            </Button>
                          ) : (
                            <Button size="sm" variant="ghost" icon={<Eye className="size-4" />} onClick={() => setTarget({ kind: "probation", id: ev.id, formId: ev.form_id, title: `ผลประเมินทดลองงาน ${empName(ev.employee_id)}`, subtitle: `รอบที่ ${ev.round} · ผู้ประเมิน ${dir.name(ev.evaluator_employee_id)}`, readOnly: true })}>
                              ดู
                            </Button>
                          )}
                          {canApprove && ev.status === "submitted" && (
                            <Button size="sm" icon={<ClipboardCheck className="size-4" />} onClick={() => setApprove({ ev, effective: empMap.get(ev.employee_id)?.probation_end_date ?? isoDate(), now: false, note: "" })}>
                              อนุมัติผล
                            </Button>
                          )}
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

      <Modal
        open={!!creating}
        onClose={() => setCreating(null)}
        title="สร้างแบบประเมินทดลองงาน"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreating(null)}>ยกเลิก</Button>
            <Button loading={busy} onClick={create}>สร้างแบบประเมิน</Button>
          </>
        }
      >
        {creating && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="พนักงานทดลองงาน" required className="sm:col-span-2">
              <Select
                value={creating.employee_id ?? ""}
                onChange={(e) => {
                  const emp = empMap.get(Number(e.target.value));
                  const prior = emp ? evByEmp.get(emp.id) ?? [] : [];
                  setCreating({ ...creating, employee_id: emp?.id ?? null, evaluator: emp?.supervisor_id ?? creating.evaluator, round: prior.reduce((m, x) => Math.max(m, x.round), 0) + 1, due_date: emp?.probation_end_date ? addDays(emp.probation_end_date, -7) : creating.due_date });
                }}
                placeholder="— เลือก —"
              >
                {(emps ?? []).filter((e) => isHr || e.supervisor_id === me.employeeId).map((e) => (
                  <option key={e.id} value={e.id}>{e.code} {e.first_name} {e.last_name} (ครบ {thDate(e.probation_end_date)})</option>
                ))}
              </Select>
            </Field>
            <Field label="รอบที่">
              <Input type="number" min={1} value={creating.round} onChange={(e) => setCreating({ ...creating, round: Number(e.target.value) })} className="num" />
            </Field>
            <Field label="กำหนดส่ง" hint="ค่าเริ่มต้น 7 วันก่อนครบทดลองงาน">
              <Input type="date" value={creating.due_date} onChange={(e) => setCreating({ ...creating, due_date: e.target.value })} />
            </Field>
            <Field label="ผู้ประเมิน" required hint="ค่าเริ่มต้นคือหัวหน้างานโดยตรง">
              <EmployeePicker value={creating.evaluator} onChange={(v) => setCreating({ ...creating, evaluator: v })} options={dir.options} />
            </Field>
            <Field label="แบบประเมิน">
              <Select value={creating.form_id} onChange={(e) => setCreating({ ...creating, form_id: e.target.value })}>
                {forms.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </Select>
            </Field>
          </div>
        )}
      </Modal>

      <Modal
        open={!!approve}
        onClose={() => setApprove(null)}
        title="อนุมัติผลการทดลองงาน"
        footer={
          <>
            <Button variant="secondary" onClick={() => setApprove(null)}>ยกเลิก</Button>
            <Button variant={approve?.ev.result === "fail" ? "danger" : "primary"} loading={busy} onClick={doApprove}>
              อนุมัติผล “{approve ? PROB_RESULT[approve.ev.result ?? ""] : ""}”
            </Button>
          </>
        }
      >
        {approve && (
          <div className="flex flex-col gap-3">
            <div className="rounded-[var(--radius-ctl)] bg-paper p-3 text-[15px]">
              <div className="font-medium">{empName(approve.ev.employee_id)}</div>
              <div className="text-ink-soft">
                คะแนน <b className="num text-ink">{approve.ev.total_score != null ? Number(approve.ev.total_score).toFixed(1) : "-"}%</b> · ผู้ประเมิน {dir.name(approve.ev.evaluator_employee_id)}
              </div>
              {approve.ev.comment && <p className="mt-1 text-ink-soft">“{approve.ev.comment}”</p>}
            </div>
            {approve.ev.result === "extend" ? (
              <p className="text-[15px]">
                ขยายเวลาทดลองงาน <b>{approve.ev.extend_days} วัน</b> — วันครบทดลองงานใหม่:{" "}
                <b className="num">{thDate(addDays(empMap.get(approve.ev.employee_id)?.probation_end_date ?? isoDate(), approve.ev.extend_days ?? 30), "long")}</b>
              </p>
            ) : (
              <>
                <p className="text-[15px]">
                  {approve.ev.result === "pass" ? "ระบบจะสร้างรายการ “ผ่านทดลองงาน” และเปลี่ยนสถานะเป็นพนักงานประจำ" : "ระบบจะสร้างรายการ “พ้นสภาพ” เหตุผล ไม่ผ่านทดลองงาน และปิดบัญชีผู้ใช้เมื่อมีผล"}
                </p>
                <Field label="วันที่มีผล" hint="ค่าเริ่มต้น = วันครบทดลองงาน ระบบปรับสถานะให้อัตโนมัติเมื่อถึงวัน">
                  <Input type="date" value={approve.effective} onChange={(e) => setApprove({ ...approve, effective: e.target.value })} disabled={approve.now} />
                </Field>
                <Checkbox label="นำไปใช้ตอนนี้ (ปรับสถานะพนักงานทันที)" checked={approve.now} onChange={(v) => setApprove({ ...approve, now: v })} />
                <Field label="หมายเหตุ">
                  <Input value={approve.note} onChange={(e) => setApprove({ ...approve, note: e.target.value })} placeholder={approve.ev.result === "pass" ? "ผ่านการทดลองงาน" : "ไม่ผ่านการทดลองงาน"} />
                </Field>
              </>
            )}
          </div>
        )}
      </Modal>

      <EvaluateModal target={target} onClose={() => setTarget(null)} onDone={load} />
    </div>
  );
}
