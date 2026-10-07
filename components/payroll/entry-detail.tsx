"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Badge, Modal, Spinner } from "@/components/ui";
import { minutesToHM, money, thDate } from "@/lib/format";
import { UNIT_LABEL } from "@/lib/payroll/labels";
import type { Entry, EntryItem } from "./types";

export function EntryDetailModal({ entry, onClose }: { entry: Entry | null; onClose: () => void }) {
  const sb = supabaseBrowser();
  const [items, setItems] = useState<EntryItem[] | null>(null);
  useEffect(() => {
    if (!entry) return;
    setItems(null);
    sb.from("payroll_entry_items").select("*").eq("entry_id", entry.id).order("sort_order").then(({ data }: { data: unknown }) => setItems((data as EntryItem[]) ?? []));
  }, [entry, sb]);
  if (!entry) return null;
  const d = entry.calc_detail ?? {};
  const inc = (items ?? []).filter((i) => i.direction === 1);
  const ded = (items ?? []).filter((i) => i.direction === -1);
  const att = d.attendance;
  const ot = Object.entries(entry.ot_minutes ?? {}).filter(([, v]) => v);
  return (
    <Modal open onClose={onClose} size="xl" title={`${entry.emp_code} · ${entry.emp_name}`}>
      <div className="mb-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-ink-soft">
        <span>{entry.position_name ?? "-"}</span>
        <span className="num">
          ฐาน {money(entry.base_salary)} / {UNIT_LABEL[entry.salary_unit] ?? entry.salary_unit}
        </span>
        {d.rates && (
          <span className="num">
            ค่าจ้างต่อวัน {money(d.rates.daily)} · ต่อชั่วโมง {money(d.rates.hourly)}
          </span>
        )}
        <span>{entry.pay_method === "bank" ? `โอนเข้าบัญชี ${entry.bank_code ?? ""}` : entry.pay_method === "cash" ? "จ่ายเงินสด" : "เช็ค"}</span>
      </div>
      {!!d.warnings?.length && (
        <div className="mb-4 rounded-[var(--radius-ctl)] border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-ink">
          {d.warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-1.5">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {w}
            </div>
          ))}
        </div>
      )}
      {items === null ? (
        <Spinner className="mx-auto my-8" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <ItemTable title="รายได้" rows={inc} total={entry.total_income} />
          <ItemTable title="รายการหัก" rows={ded} total={entry.total_deduction} />
        </div>
      )}
      <div className="mt-4 flex items-center justify-between rounded-[var(--radius-ctl)] bg-jade-50 px-4 py-3">
        <span className="font-medium text-jade-900">เงินได้สุทธิ</span>
        <span className="num text-xl font-semibold text-jade-900">{money(entry.net_pay)}</span>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <section>
          <h4 className="mb-2 border-b border-line-soft pb-1 text-sm font-semibold text-jade-800">เวลาทำงาน {att?.range && <span className="font-normal text-ink-mute">({thDate(att.range[0])} – {thDate(att.range[1])})</span>}</h4>
          <dl className="grid grid-cols-[1fr_auto] gap-y-1 text-sm">
            <Row k="วันทำงาน" v={`${entry.work_days} วัน`} />
            <Row k="วันที่ได้รับค่าจ้าง" v={`${entry.paid_days} วัน`} />
            {!!att?.paid_holiday_days && <Row k="วันหยุดนักขัตฤกษ์ (จ่าย)" v={`${att.paid_holiday_days} วัน`} />}
            {!!att?.paid_leave_days && <Row k="ลาได้รับค่าจ้าง" v={`${att.paid_leave_days} วัน`} />}
            <Row k="ขาดงาน" v={`${entry.absent_days} วัน`} warn={entry.absent_days > 0} />
            <Row k="ลาไม่ได้รับค่าจ้าง" v={`${entry.unpaid_leave_days} วัน`} warn={entry.unpaid_leave_days > 0} />
            <Row k="มาสาย" v={`${minutesToHM(entry.late_minutes)} ชม. (${att?.summary?.late_count ?? 0} ครั้ง)`} warn={entry.late_minutes > 0} />
            <Row k="กลับก่อน" v={`${minutesToHM(entry.early_minutes)} ชม.`} />
            {!!att?.summary?.missing_scan_days && <Row k="ลืมสแกน" v={`${att.summary.missing_scan_days} วัน`} warn />}
            {ot.map(([r, m]) => (
              <Row key={r} k={`OT ${r} เท่า`} v={`${minutesToHM(m)} ชม.`} />
            ))}
            {d.diligence_step ? <Row k="เบี้ยขยันขั้นที่" v={String(d.diligence_step)} /> : null}
          </dl>
          {att?.leave && Object.keys(att.leave.by_type).length > 0 && (
            <div className="mt-2 text-sm">
              <div className="mb-1 text-ink-soft">การลาในรอบ</div>
              {Object.values(att.leave.by_type).map((t, i) => (
                <div key={i} className="num flex justify-between">
                  <span>{t.name}</span>
                  <span>
                    {t.days} วัน{t.unpaid ? <Badge color="amber" className="ml-1">ไม่จ่าย {t.unpaid}</Badge> : null}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
        <section>
          <h4 className="mb-2 border-b border-line-soft pb-1 text-sm font-semibold text-jade-800">ภาษีเงินได้</h4>
          <dl className="grid grid-cols-[1fr_auto] gap-y-1 text-sm">
            <Row k="เงินได้ที่ต้องเสียภาษีงวดนี้" v={money(entry.taxable_income)} />
            {d.tax && (
              <>
                <Row k="ประมาณการเงินได้ทั้งปี" v={money(d.tax.projected_income)} />
                {d.tax.allowances.map((a) => (
                  <Row key={a.code} k={`หัก ${a.name}`} v={money(a.amount)} />
                ))}
                <Row k="เงินได้สุทธิทั้งปี" v={money(d.tax.net_income)} />
                <Row k="ภาษีทั้งปี (ประมาณการ)" v={money(d.tax.annual_tax)} />
              </>
            )}
            <Row k="ภาษีหักงวดนี้" v={money(entry.tax)} strong />
          </dl>
        </section>
        <section>
          <h4 className="mb-2 border-b border-line-soft pb-1 text-sm font-semibold text-jade-800">ประกันสังคม / กองทุน / สะสม</h4>
          <dl className="grid grid-cols-[1fr_auto] gap-y-1 text-sm">
            <Row k="ค่าจ้างที่ใช้คำนวณ สปส." v={money(entry.sso_wage)} />
            <Row k="ลูกจ้างสมทบ" v={money(entry.sso_employee)} />
            <Row k="นายจ้างสมทบ" v={money(entry.sso_employer)} />
            <Row k="PVD ลูกจ้าง / นายจ้าง" v={`${money(entry.pvd_employee)} / ${money(entry.pvd_employer)}`} />
            <Row k="เงินได้สะสม" v={money(entry.ytd_income)} />
            <Row k="ภาษีสะสม" v={money(entry.ytd_tax)} />
            <Row k="ประกันสังคมสะสม" v={money(entry.ytd_sso)} />
            <Row k="PVD สะสม" v={money(entry.ytd_pvd)} />
          </dl>
        </section>
      </div>
    </Modal>
  );
}

function Row({ k, v, warn, strong }: { k: string; v: string; warn?: boolean; strong?: boolean }) {
  return (
    <>
      <dt className="text-ink-soft">{k}</dt>
      <dd className={`num text-right ${warn ? "text-rust" : ""} ${strong ? "font-semibold" : ""}`}>{v}</dd>
    </>
  );
}

function ItemTable({ title, rows, total }: { title: string; rows: EntryItem[]; total: number }) {
  return (
    <div className="rounded-[var(--radius-ctl)] border border-line">
      <div className="border-b border-line-soft bg-paper/60 px-3 py-1.5 text-sm font-semibold">{title}</div>
      <table className="w-full text-sm">
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td className="px-3 py-2 text-ink-mute">-</td>
            </tr>
          )}
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-line-soft last:border-0">
              <td className="px-3 py-1.5">
                {r.name}
                {r.qty != null && r.rate != null && (
                  <span className="num ml-1 text-xs text-ink-mute">
                    ({Number(r.qty)} × {money(r.rate)})
                  </span>
                )}
              </td>
              <td className="num px-3 py-1.5 text-right">{money(r.amount)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-line font-semibold">
            <td className="px-3 py-1.5">รวม{title}</td>
            <td className="num px-3 py-1.5 text-right">{money(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
