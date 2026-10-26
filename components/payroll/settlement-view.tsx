"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, Printer } from "lucide-react";
import { useCan } from "@/components/app/me-context";
import { Badge, Button, Empty, Field, Input, Modal, PageHeader, Panel, Select, Spinner, Stat, Textarea, toast } from "@/components/ui";
import { money, thDate } from "@/lib/format";
import { PENDING_STATUS_LABEL, pendingSourceLabel, type PendingStatus } from "@/lib/payroll/pending";
import { cancelSettlementAction, confirmSettlementAction, previewSettlementAction, type SettlementOverride, type SettlementPreview } from "@/lib/payroll/settlement-actions";

const STATUS_COLOR: Record<string, string> = { pending: "amber", applied: "blue", paid: "green", cancelled: "gray" };

type Form = { eligible: "" | "yes" | "no"; severance_days: string; leave_days: string; notice_days: string; guarantee_refund: string };
const EMPTY: Form = { eligible: "", severance_days: "", leave_days: "", notice_days: "", guarantee_refund: "" };

function toOverride(f: Form): SettlementOverride {
  const o: SettlementOverride = {};
  if (f.eligible) o.severance_eligible = f.eligible === "yes";
  if (f.severance_days !== "") o.severance_days = Number(f.severance_days);
  if (f.leave_days !== "") o.leave_days = Number(f.leave_days);
  if (f.notice_days !== "") o.notice_days = Number(f.notice_days);
  if (f.guarantee_refund !== "") o.guarantee_refund = Number(f.guarantee_refund);
  return o;
}

/** One resigned employee: computed final settlement, HR overrides, confirm / cancel, print 50 ทวิ */
export function SettlementView({ employeeId }: { employeeId: number }) {
  const can = useCan();
  const [data, setData] = useState<SettlementPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");

  const load = useCallback(
    async (f: Form) => {
      const r = await previewSettlementAction(employeeId, toOverride(f));
      if (r.ok && r.data) {
        setData(r.data);
        setError(null);
      } else if (!r.ok) setError(r.error);
    },
    [employeeId],
  );

  useEffect(() => {
    const t = setTimeout(() => void load(form), 300);
    return () => clearTimeout(t);
  }, [form, load]);

  const set = (p: Partial<Form>) => setForm((f) => ({ ...f, ...p }));
  const overridden = Object.keys(toOverride(form)).length > 0;

  const confirm = async () => {
    setBusy(true);
    const r = await confirmSettlementAction(employeeId, toOverride(form), note);
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    toast.ok(r.message ?? "ยืนยันแล้ว");
    setForm(EMPTY);
    void load(EMPTY);
  };

  const cancel = async () => {
    if (!data?.existing) return;
    setBusy(true);
    const r = await cancelSettlementAction(data.existing.id, reason);
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    toast.ok(r.message ?? "ยกเลิกแล้ว");
    setCancelOpen(false);
    setReason("");
    void load(form);
  };

  const back = (
    <Link href="/payroll/settlements" className="mb-2 inline-flex items-center gap-1 text-sm text-ink-soft hover:text-jade-700">
      <ArrowLeft className="size-4" /> รายชื่อพนักงานพ้นสภาพ
    </Link>
  );

  if (error && !data)
    return (
      <div>
        <PageHeader title="เคลียร์เงินพนักงานพ้นสภาพ" back={back} />
        <Panel>
          <Empty title="คำนวณไม่ได้" description={error} />
        </Panel>
      </div>
    );
  if (!data) return <Spinner className="mx-auto my-16" />;

  const { employee: e, result: r, existing } = data;
  const locked = !!existing;
  const year = Number(e.resign_date.slice(0, 4));
  const paidAll = !!existing && existing.items.length > 0 && existing.items.every((i) => i.status === "paid");

  return (
    <div>
      <PageHeader
        back={back}
        title={`${e.code} ${e.name}`}
        description={`เริ่มงาน ${thDate(e.hire_date)} · ทำงานวันสุดท้าย ${thDate(e.resign_date)} · อายุงาน ${r.service.years} ปี (${r.service.days.toLocaleString("th-TH")} วัน) · ${e.resign_type || "ยังไม่ระบุประเภทการพ้นสภาพ"}`}
        actions={
          <Link href={`/reports/tawi50?year=${year}&emp=${e.id}`} target="_blank">
            <Button variant="secondary" icon={<Printer className="size-4" />}>
              พิมพ์ 50 ทวิ ปี {year + 543}
            </Button>
          </Link>
        }
      />

      {existing && Math.abs(existing.total - r.total) > 0.005 && (
        <div className="mb-4 rounded-[var(--radius-panel)] border border-red-100 bg-rust-soft px-4 py-3 text-[14px] text-rust">
          ข้อมูลพนักงานเปลี่ยนหลังยืนยัน: ยอดที่ยืนยันไว้ {money(existing.total)} แต่คำนวณตอนนี้ได้ {money(r.total)} — ถ้ายังไม่จ่าย ให้ยกเลิกแล้วยืนยันใหม่
        </div>
      )}
      {r.warnings.length > 0 && (
        <div className="mb-4 rounded-[var(--radius-panel)] border border-amber-100 bg-amber-50 px-4 py-3 text-[14px] text-amber-ink">
          {r.warnings.map((w) => (
            <div key={w} className="flex gap-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              {w}
            </div>
          ))}
        </div>
      )}

      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <Stat label="ค่าจ้างอัตราสุดท้ายต่อวัน" value={money(r.daily_rate)} sub={data.allowances.length ? "(เงินเดือน + ค่าตอบแทนประจำ) ÷ 30" : "เงินเดือน ÷ 30"} />
        <Stat label="ค่าชดเชย" value={money(r.severance_amount)} sub={r.severance_eligible ? `${r.severance_days} วัน · ยกเว้นภาษี ${money(r.exempt_amount)}` : "ไม่มีสิทธิ์"} />
        <Stat label="วันลาพักร้อนคงเหลือ" value={money(r.leave_amount)} sub={`${r.leave_days} วัน`} />
        <Stat label="รวมเคลียร์" value={money(r.total)} tone="jade" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <Panel title={existing ? "รายการที่คำนวณได้ตอนนี้" : "รายการที่จะจ่าย"}>
          {r.lines.length === 0 ? (
            <Empty title="ไม่มียอดที่ต้องจ่าย" />
          ) : (
            <table className="w-full text-[14px]">
              <tbody>
                {r.lines.map((l) => (
                  <tr key={l.key} className="border-b border-line-soft last:border-0">
                    <td className="py-2 pr-3">
                      {pendingSourceLabel(l.key)}
                      <span className="block text-xs text-ink-mute">{l.note}</span>
                    </td>
                    <td className="py-2 text-right text-xs text-ink-mute">{l.key === "severance" || l.key === "leave_payout" || l.key === "notice_pay" ? "คิดภาษี" : "ไม่คิดภาษี"}</td>
                    <td className="num py-2 pl-3 text-right">{money(l.amount)}</td>
                  </tr>
                ))}
                <tr>
                  <td className="pt-3 font-semibold" colSpan={2}>
                    รวม
                  </td>
                  <td className="num pt-3 text-right font-semibold">{money(r.total)}</td>
                </tr>
              </tbody>
            </table>
          )}
          <p className="mt-4 text-xs text-ink-mute">
            ภาษีหัก ณ ที่จ่ายของส่วนที่คิดภาษีจะคำนวณในงวดเงินเดือนที่จ่ายจริง (รวมกับเงินได้ปกติ) · ค่าจ้างวันหยุดพักผ่อนนับเป็นค่าจ้างประกันสังคม · ค่าชดเชยและค่าบอกกล่าวล่วงหน้าไม่นับ
          </p>

          {existing && (
            <div className="mt-5 border-t border-line pt-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm text-ink-soft">
                  ยืนยันแล้วเมื่อ {thDate(existing.created_at)} · {paidAll ? "จ่ายครบแล้ว" : "รอเข้างวดเงินเดือน — ดูที่แท็บ “รอเข้างวด” ของงวด"}
                </div>
                {can("payroll", "edit") && !existing.items.some((i) => i.status === "paid") && (
                  <Button variant="secondary" size="sm" onClick={() => setCancelOpen(true)}>
                    ยกเลิกรายการนี้
                  </Button>
                )}
              </div>
              <ul className="text-[14px]">
                {existing.items.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-2 py-1">
                    <span>
                      {pendingSourceLabel(i.source)} <span className="text-ink-mute">{i.period_name ? `· ${i.period_name}` : ""}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <Badge color={STATUS_COLOR[i.status]}>{PENDING_STATUS_LABEL[i.status as PendingStatus] ?? i.status}</Badge>
                      <span className="num">{money(i.amount)}</span>
                    </span>
                  </li>
                ))}
              </ul>
              {existing.note && <p className="mt-2 whitespace-pre-line text-sm text-ink-soft">หมายเหตุ: {existing.note}</p>}
            </div>
          )}
        </Panel>

        <div className="flex flex-col gap-4">
          <Panel title={locked ? "ค่าที่ใช้ (ยืนยันแล้ว)" : "ตรวจและแก้ไข"}>
            <fieldset disabled={locked || busy || !can("payroll", "create")} className="flex flex-col gap-3">
              <Field label="สิทธิ์ค่าชดเชย" hint="ค่าเริ่มต้นตามประเภทการพ้นสภาพ: เลิกจ้าง / เกษียณ / หมดสัญญา = มีสิทธิ์">
                <Select value={form.eligible} onChange={(ev) => set({ eligible: ev.target.value as Form["eligible"] })}>
                  <option value="">ตามประเภทการพ้นสภาพ</option>
                  <option value="yes">มีสิทธิ์</option>
                  <option value="no">ไม่มีสิทธิ์</option>
                </Select>
              </Field>
              <Field label="จำนวนวันค่าชดเชย" hint={`ตาม ม.118: ${r.severance_eligible ? r.severance_days : 0} วัน`}>
                <Input type="number" inputMode="decimal" min={0} max={1000} step="0.5" className="num" placeholder="ตามกฎหมาย" value={form.severance_days} onChange={(ev) => set({ severance_days: ev.target.value })} />
              </Field>
              <Field
                label="วันหยุดพักผ่อนที่จ่าย"
                hint={
                  data.leave
                    ? `โควต้าปีนี้ ${data.leave.quota_days} · ยกมา ${data.leave.carried_days} · ใช้แล้ว ${data.leave.used_days} → ตามสัดส่วน ${r.leave_detail?.current ?? 0} + ยกมาคงเหลือ ${r.leave_detail?.carried ?? 0}`
                    : "ไม่พบโควต้าลาพักร้อน"
                }
              >
                <Input type="number" inputMode="decimal" min={0} max={1000} step="0.5" className="num" placeholder="ตามที่คำนวณ" value={form.leave_days} onChange={(ev) => set({ leave_days: ev.target.value })} />
              </Field>
              <Field label="ค่าบอกกล่าวล่วงหน้า (วัน)" hint="กรณีเลิกจ้างโดยไม่บอกล่วงหน้าอย่างน้อย 1 งวดค่าจ้าง (ม.17/1)">
                <Input type="number" inputMode="decimal" min={0} max={1000} step="0.5" className="num" placeholder="0" value={form.notice_days} onChange={(ev) => set({ notice_days: ev.target.value })} />
              </Field>
              <Field label="คืนเงินประกันการทำงาน (บาท)" hint={`เงินประกันที่เก็บไว้ ${money(data.result.guarantee_refund)} — ต้องคืนภายใน 7 วันนับจากวันพ้นสภาพ (ม.10)`}>
                <Input type="number" inputMode="decimal" min={0} step="0.01" className="num" placeholder="คืนเต็มจำนวน" value={form.guarantee_refund} onChange={(ev) => set({ guarantee_refund: ev.target.value })} />
              </Field>
              <Field label="หมายเหตุ" hint={overridden ? "ต้องระบุเหตุผลเมื่อแก้ค่าที่ระบบคำนวณ" : undefined} required={overridden}>
                <Textarea rows={3} maxLength={500} value={note} onChange={(ev) => setNote(ev.target.value)} />
              </Field>
              {!locked && (
                <Button loading={busy} disabled={!r.lines.length || (overridden && !note.trim())} onClick={confirm}>
                  ยืนยันและส่งเข้าคิวงวดเงินเดือน
                </Button>
              )}
            </fieldset>
          </Panel>

          {data.debts.length > 0 && (
            <Panel title="หนี้คงค้างของพนักงาน">
              <ul className="text-[14px]">
                {data.debts.map((d) => (
                  <li key={d.label} className="flex justify-between gap-2 py-1">
                    <span>{d.label}</span>
                    <span className="num">{money(d.remaining)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-ink-mute">หักจากเงินที่ต้องจ่ายได้เฉพาะเมื่อพนักงานยินยอมเป็นหนังสือ (ม.76) — บันทึกเป็นรายการหักในแท็บ “รอเข้างวด” หรือ “ปรับปรุง” ของงวด</p>
            </Panel>
          )}
        </div>
      </div>

      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="ยกเลิกรายการเคลียร์เงิน"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCancelOpen(false)}>
              ปิด
            </Button>
            <Button variant="danger" loading={busy} disabled={!reason.trim()} onClick={cancel}>
              ยกเลิกรายการ
            </Button>
          </>
        }
      >
        <p className="mb-3 text-[15px] text-ink-soft">ยอดที่อยู่ในคิวจะถูกยกเลิก ถ้าดึงเข้างวดที่ยังไม่อนุมัติแล้ว ต้องกด “คำนวณใหม่” ที่งวดนั้น</p>
        <Field label="เหตุผล" required>
          <Textarea rows={3} maxLength={500} value={reason} onChange={(ev) => setReason(ev.target.value)} />
        </Field>
      </Modal>
    </div>
  );
}
