"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, CalendarClock, Check, ChevronLeft, ChevronRight, FileCheck2, Undo2 } from "lucide-react";
import { useCan } from "@/components/app/me-context";
import { Badge, Button, Empty, Field, Input, Modal, PageHeader, Panel, Spinner, Textarea, clsx, runAction, toast, useConfirm } from "@/components/ui";
import { money, num, thDate, thMonthYear } from "@/lib/format";
import { STATUS_COLOR, STATUS_TEXT, PERIOD_TYPE_LABEL } from "@/lib/payroll/labels";
import { buildMonthlyFlow, type FilingKind, type FlowStep } from "@/lib/payroll/monthly-flow";
import { deleteFilingAction, monthlyFlowAction, saveFilingAction, type MonthlyData } from "@/lib/payroll/monthly-actions";

const FILING_LABEL: Record<FilingKind, string> = { bank: "ส่งไฟล์ธนาคาร", sso: "ยื่น สปส.1-10", pnd1: "ยื่น ภ.ง.ด.1", pnd1a: "ยื่น ภ.ง.ด.1ก", pvd: "ส่งกองทุนสำรองเลี้ยงชีพ" };

function defaultMonth() {
  const d = new Date();
  // early in the month the previous month still has SSO / tax filings open
  if (d.getDate() <= 15) d.setMonth(d.getMonth() - 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

export function MonthlyFlow() {
  const can = useCan();
  const { confirm, dialog } = useConfirm();
  const [ym, setYm] = useState(defaultMonth);
  const [data, setData] = useState<MonthlyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [filingStep, setFilingStep] = useState<FlowStep | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await monthlyFlowAction(ym.year, ym.month);
    setLoading(false);
    if (!r.ok) return toast.error(r.error);
    setData(r.data!);
  }, [ym]);
  useEffect(() => {
    load();
  }, [load]);

  const steps = useMemo(() => (data ? buildMonthlyFlow({ year: ym.year, month: ym.month, today: data.today, period: data.period, readiness: data.readiness, filings: data.filings }) : []), [data, ym]);
  const shift = (n: number) => setYm(({ year, month }) => {
    const m = month + n;
    return m < 1 ? { year: year - 1, month: 12 } : m > 12 ? { year: year + 1, month: 1 } : { year, month: m };
  });

  const p = data?.period;
  const done = steps.filter((s) => s.done).length;
  const late = steps.filter((s) => s.state === "late").length;
  const q = `year=${ym.year}&month=${ym.month}`;

  function links(s: FlowStep): { href: string; label: string }[] {
    const per = p ? `/payroll/${p.id}` : "/payroll";
    switch (s.key) {
      case "time": return [{ href: "/attendance", label: "สรุปเวลารายวัน" }, { href: "/approvals", label: "เอกสารรออนุมัติ" }];
      case "calc": case "approve": case "close": return [{ href: per, label: p ? "เปิดงวดเงินเดือน" : "สร้างงวดเงินเดือน" }];
      case "bank": return [{ href: per, label: "ไฟล์โอนเงิน (หน้างวด)" }];
      case "payslip": return [{ href: p ? `/payroll/${p.id}/payslips` : "/payroll", label: "สลิปเงินเดือน" }];
      case "sso": return [{ href: `/reports/sso?${q}`, label: "สปส.1-10 และไฟล์ e-Service" }];
      case "pnd1": return [{ href: `/reports/pnd1?${q}`, label: "ภ.ง.ด.1 และไฟล์ e-Filing" }];
      case "pvd": return [{ href: `/reports/pvd?${q}`, label: "รายการและไฟล์นำส่งกองทุน" }];
      case "pnd1a": return [{ href: `/reports/pnd1?mode=pnd1a&year=${ym.year}`, label: "ภ.ง.ด.1ก" }, { href: `/reports/tawi50?year=${ym.year}`, label: "50 ทวิ" }];
      default: return [];
    }
  }

  const undo = async (s: FlowStep) => {
    if (!s.filing) return;
    await runAction(() => deleteFilingAction(s.filing!.id), { success: "ยกเลิกบันทึกการยื่นแล้ว", confirm: () => confirm(`ยกเลิกบันทึก “${FILING_LABEL[s.filingKind!]}” ของเดือนนี้?`, { danger: true, confirmText: "ยกเลิกบันทึก" }) });
    load();
  };

  return (
    <div>
      {dialog}
      <PageHeader
        title="งานเงินเดือนประจำเดือน"
        description="ทุกขั้นตอนของเดือนในหน้าเดียว ตั้งแต่ปิดเวลา คำนวณ อนุมัติ โอนเงิน ไปจนยื่นประกันสังคมและภาษี พร้อมกำหนดส่ง"
        actions={
          <div className="flex items-center gap-1 rounded-[var(--radius-ctl)] border border-line bg-white p-1">
            <Button size="sm" variant="ghost" aria-label="เดือนก่อน" icon={<ChevronLeft className="size-4" />} onClick={() => shift(-1)} />
            <span className="min-w-36 text-center font-medium">{thMonthYear(ym.year, ym.month)}</span>
            <Button size="sm" variant="ghost" aria-label="เดือนถัดไป" icon={<ChevronRight className="size-4" />} onClick={() => shift(1)} />
          </div>
        }
      />

      {!data || loading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
          <Panel bodyClass="p-0" title={<span>ลำดับงาน <span className="num text-sm font-normal text-ink-soft">เสร็จ {done} / {steps.length}{late ? ` · เลยกำหนด ${late}` : ""}</span></span>}>
            <ol className="relative">
              {steps.map((s, i) => (
                <li key={s.key} className={clsx("relative flex gap-4 px-5 py-4", i < steps.length - 1 && "border-b border-line-soft", s.state === "current" && "bg-jade-50/40", s.state === "late" && "bg-rust-soft/40")}>
                  <div className="flex flex-col items-center">
                    <span className={clsx("grid size-8 shrink-0 place-items-center rounded-full text-sm font-semibold",
                      s.done ? "bg-jade-600 text-white" : s.state === "late" ? "bg-rust text-white" : s.state === "current" ? "bg-white text-jade-700 ring-2 ring-jade-500" : "bg-paper text-ink-mute ring-1 ring-line")}>
                      {s.done ? <Check className="size-4" /> : i + 1}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-[15.5px] font-semibold">{s.title}</h3>
                      {s.done ? <Badge color="green">เสร็จแล้ว</Badge> : s.state === "late" ? <Badge color="red">เลยกำหนด</Badge> : s.state === "current" ? <Badge color="blue">ทำต่อ</Badge> : null}
                      {s.due && (
                        <span className={clsx("inline-flex items-center gap-1 text-[13px]", s.state === "late" ? "text-rust" : "text-ink-mute")}>
                          <CalendarClock className="size-3.5" /> ภายใน {thDate(s.due)}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-[14px] leading-relaxed text-ink-soft">{s.description}</p>
                    {s.dueNote && <p className="mt-0.5 text-[13px] text-ink-mute">{s.dueNote}</p>}
                    {!s.done && !!s.issues?.length && (
                      <ul className="mt-2 flex flex-col gap-0.5 text-[13.5px] text-amber-ink">
                        {s.issues.map((x) => <li key={x}>• {x}</li>)}
                      </ul>
                    )}
                    {s.filing && (
                      <p className="num mt-2 text-[13.5px] text-jade-800">
                        {FILING_LABEL[s.filing.kind]} เมื่อ {thDate(s.filing.submitted_on)}
                        {s.filing.ref_no && ` · เลขอ้างอิง ${s.filing.ref_no}`}
                        {s.filing.amount != null && ` · ${money(s.filing.amount)} บาท`}
                        {s.filing.note && ` · ${s.filing.note}`}
                      </p>
                    )}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {links(s).map((l) => (
                        <Link key={l.href + l.label} href={l.href} className="inline-flex h-8 items-center gap-1 rounded-[var(--radius-ctl)] border border-line bg-white px-3 text-sm text-ink-soft hover:border-jade-300 hover:text-jade-700">
                          {l.label} <ArrowUpRight className="size-3.5" />
                        </Link>
                      ))}
                      {s.filingKind && can("payroll", "edit") && !s.filing && (
                        <Button size="sm" variant={s.state === "current" || s.state === "late" ? "primary" : "secondary"} icon={<FileCheck2 className="size-4" />} onClick={() => setFilingStep(s)}>
                          บันทึกว่า{FILING_LABEL[s.filingKind]}แล้ว
                        </Button>
                      )}
                      {s.filing && can("payroll", "edit") && <Button size="sm" variant="ghost" icon={<Undo2 className="size-4" />} onClick={() => undo(s)}>ยกเลิกบันทึก</Button>}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </Panel>

          <div className="flex flex-col gap-4">
            <Panel title="งวดหลักของเดือน">
              {p ? (
                <div className="flex flex-col gap-2 text-[14px]">
                  <Link href={`/payroll/${p.id}`} className="font-semibold text-jade-700 hover:underline">{p.name}</Link>
                  <div className="flex flex-wrap gap-2"><Badge color={STATUS_COLOR[p.status]}>{STATUS_TEXT[p.status]}</Badge>{p.payslip_published && <Badge color="green">เผยแพร่สลิปแล้ว</Badge>}</div>
                  <dl className="num mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                    <dt className="text-ink-mute">วันจ่าย</dt><dd className="text-right">{thDate(p.pay_date)}</dd>
                    <dt className="text-ink-mute">รอบตัดเวลา</dt><dd className="text-right">{thDate(p.att_start_date ?? p.start_date)} – {thDate(p.att_end_date ?? p.end_date)}</dd>
                    <dt className="text-ink-mute">พนักงาน</dt><dd className="text-right">{num(p.entries)} คน</dd>
                    <dt className="text-ink-mute">จ่ายสุทธิ</dt><dd className="text-right font-semibold">{money(p.net_total)}</dd>
                    <dt className="text-ink-mute">ภาษีหัก ณ ที่จ่าย</dt><dd className="text-right">{money(p.tax_total)}</dd>
                    <dt className="text-ink-mute">ประกันสังคม (ลูกจ้าง)</dt><dd className="text-right">{money(p.sso_total)}</dd>
                  </dl>
                </div>
              ) : (
                <Empty title="ยังไม่มีงวดเงินเดือนของเดือนนี้" description="สร้างงวดรายเดือนก่อน แล้วลำดับงานจะติดตามให้" action={<Link href="/payroll" className="text-sm font-medium text-jade-700 hover:underline">ไปหน้างวดเงินเดือน</Link>} />
              )}
            </Panel>
            {data.others.length > 0 && (
              <Panel title="งวดอื่นในเดือนนี้">
                <ul className="flex flex-col gap-2 text-[14px]">
                  {data.others.map((o) => (
                    <li key={o.id} className="flex items-center justify-between gap-2">
                      <Link href={`/payroll/${o.id}`} className="truncate hover:text-jade-700">{o.name} <span className="text-ink-mute">({PERIOD_TYPE_LABEL[o.period_type] ?? o.period_type})</span></Link>
                      <Badge color={STATUS_COLOR[o.status]}>{STATUS_TEXT[o.status]}</Badge>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[13px] text-ink-mute">ไฟล์ สปส. และ ภ.ง.ด.1 ของเดือนรวมทุกงวดที่จ่ายในเดือนนี้ให้อัตโนมัติ</p>
              </Panel>
            )}
            <Panel title="กำหนดส่งตามกฎหมาย">
              <ul className="flex flex-col gap-2 text-[13.5px] text-ink-soft">
                <li><b className="text-ink">ประกันสังคม สปส.1-10</b> ภายในวันที่ 15 ของเดือนถัดไป</li>
                <li><b className="text-ink">ภ.ง.ด.1</b> ยื่นออนไลน์ภายในวันที่ 15 ยื่นกระดาษภายในวันที่ 7 ของเดือนถัดไป</li>
                <li><b className="text-ink">ภ.ง.ด.1ก และ 50 ทวิ</b> ภายในเดือนกุมภาพันธ์ของปีถัดไป</li>
              </ul>
              <p className="mt-2 text-[12.5px] text-ink-mute">ถ้าวันครบกำหนดตรงกับวันหยุด ให้ยึดตามประกาศของหน่วยงาน</p>
            </Panel>
          </div>
        </div>
      )}

      {filingStep && data && (
        <FilingModal
          step={filingStep}
          year={ym.year}
          month={ym.month}
          today={data.today}
          suggested={filingStep.filingKind === "bank" ? p?.net_total : filingStep.filingKind === "pnd1" ? p?.tax_total : filingStep.filingKind === "sso" && p ? p.sso_total * 2 : filingStep.filingKind === "pvd" ? p?.pvd_total : undefined}
          onClose={() => setFilingStep(null)}
          onSaved={() => {
            setFilingStep(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function FilingModal({ step, year, month, today, suggested, onClose, onSaved }: { step: FlowStep; year: number; month: number; today: string; suggested?: number; onClose: () => void; onSaved: () => void }) {
  const [date, setDate] = useState(today);
  const [ref, setRef] = useState("");
  const [amount, setAmount] = useState(suggested != null ? String(suggested) : "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const kind = step.filingKind!;
  const save = async () => {
    const amt = amount.trim() === "" ? null : Number(amount.replace(/,/g, ""));
    if (amt !== null && !Number.isFinite(amt)) return toast.error("ยอดเงินต้องเป็นตัวเลข");
    const r = await runAction(() => saveFilingAction({ year, month, kind, submitted_on: date, ref_no: ref, amount: amt, note }), { success: `บันทึกว่า${FILING_LABEL[kind]}แล้ว`, setBusy });
    if (r) onSaved();
  };
  return (
    <Modal open onClose={onClose} title={`บันทึกว่า${FILING_LABEL[kind]}แล้ว`} footer={<><Button variant="secondary" onClick={onClose}>ยกเลิก</Button><Button loading={busy} onClick={save}>บันทึก</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="วันที่ส่ง / ยื่น" required><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="ยอดเงิน (บาท)" hint={suggested != null ? "ค่าเริ่มต้นจากงวดหลัก ตรวจให้ตรงกับใบเสร็จ" : undefined}><Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="เลขอ้างอิง / เลขที่ใบเสร็จ" className="sm:col-span-2"><Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder={kind === "bank" ? "เลขอ้างอิงรายการของธนาคาร" : "เลขที่อ้างอิงจากระบบ e-Service / e-Filing"} /></Field>
        <Field label="หมายเหตุ" className="sm:col-span-2"><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
