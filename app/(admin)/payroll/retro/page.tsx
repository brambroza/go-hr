"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, History } from "lucide-react";
import { useCan } from "@/components/app/me-context";
import { Button, Empty, Field, Modal, PageHeader, Panel, Spinner, Textarea, toast } from "@/components/ui";
import { money, thDate } from "@/lib/format";
import { confirmRetroAction, listRetroCandidatesAction, previewRetroAction, type RetroCandidate, type RetroPreview } from "@/lib/payroll/retro-actions";

/** ตกเบิก — changes approved after a period was approved; recalculate in memory and send the difference to the next period */
export default function RetroPage() {
  const can = useCan();
  const [rows, setRows] = useState<RetroCandidate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<RetroCandidate | null>(null);
  const [preview, setPreview] = useState<RetroPreview | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setRows(null);
    listRetroCandidatesAction().then((r) => {
      if (r.ok) {
        setRows(r.data ?? []);
        setError(null);
      } else setError(r.error);
    });
  }, []);
  useEffect(load, [load]);

  const start = async (c: RetroCandidate) => {
    setOpen(c);
    setPreview(null);
    setNote("");
    const r = await previewRetroAction(c.period_id, c.employee_id);
    if (r.ok && r.data) setPreview(r.data);
    else if (!r.ok) {
      toast.error(r.error);
      setOpen(null);
    }
  };

  const confirm = async () => {
    if (!open) return;
    setBusy(true);
    const r = await confirmRetroAction(open.period_id, open.employee_id, open.reasons, note, preview?.last_run_id ?? null);
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    toast.ok(r.message ?? "บันทึกแล้ว");
    setOpen(null);
    load();
  };

  return (
    <div>
      <PageHeader
        title="ตกเบิก"
        description="ใบลา / OT / แก้เวลา ที่อนุมัติหรือยกเลิกหลังอนุมัติงวด และการปรับเงินเดือนย้อนหลัง — ระบบคำนวณงวดเดิมใหม่เฉพาะคนนั้น (ไม่แก้งวดเดิม) แล้วส่งผลต่างเข้าคิว “รอเข้างวด” ของงวดรายเดือนถัดไป ภาษีและประกันสังคมคิดในงวดที่จ่าย"
      />
      <Panel title={rows ? `รายการที่อาจต้องตกเบิก ${rows.length} รายการ` : "รายการที่อาจต้องตกเบิก"}>
        {error ? (
          <Empty title="โหลดข้อมูลไม่สำเร็จ" description={error} />
        ) : rows === null ? (
          <Spinner className="mx-auto my-10" />
        ) : rows.length === 0 ? (
          <Empty icon={<History className="size-8" />} title="ไม่มีรายการตกเบิก" description="ไม่พบการเปลี่ยนแปลงหลังอนุมัติงวดในช่วง 13 เดือนล่าสุด" />
        ) : (
          <div className="thin-scroll overflow-x-auto rounded-[var(--radius-ctl)] border border-line">
            <table className="w-full text-[14px]">
              <thead>
                <tr className="border-b border-line bg-paper/60 text-left text-[13px] text-ink-soft">
                  <th className="px-3 py-2 font-medium">งวด</th>
                  <th className="px-3 py-2 font-medium">พนักงาน</th>
                  <th className="px-3 py-2 font-medium">สาเหตุ</th>
                  <th className="w-px" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.period_id}-${r.employee_id}`} className="border-b border-line-soft align-top last:border-0">
                    <td className="px-3 py-2">
                      {r.period_name}
                      <span className="block text-xs text-ink-mute">จ่าย {thDate(r.pay_date)}</span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="text-ink-mute">{r.code}</span> {r.name}
                    </td>
                    <td className="px-3 py-2 text-ink-soft">
                      {r.reasons.map((x) => (
                        <div key={x}>{x}</div>
                      ))}
                      {r.last_run_at && <div className="text-xs text-ink-mute">ตกเบิกล่าสุด {thDate(r.last_run_at)}</div>}
                    </td>
                    <td className="px-2 py-2 text-right">
                      {can("payroll", "edit") && (
                        <Button size="sm" variant="secondary" onClick={() => start(r)}>
                          คำนวณ
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Modal
        open={!!open}
        onClose={() => setOpen(null)}
        title={open ? `ตกเบิก ${open.period_name} · ${open.code} ${open.name}` : ""}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(null)}>
              ปิด
            </Button>
            <Button loading={busy} disabled={!preview} onClick={confirm}>
              {preview?.diff.length ? "ส่งเข้าคิวงวดถัดไป" : "บันทึกว่าไม่มีผลต่าง"}
            </Button>
          </>
        }
      >
        {!preview ? (
          <Spinner className="mx-auto my-8" />
        ) : (
          <div className="flex flex-col gap-3">
            {preview.warnings.length > 0 && (
              <div className="rounded-[var(--radius-ctl)] border border-amber-100 bg-amber-50 px-3 py-2 text-sm text-amber-ink">
                {preview.warnings.map((w) => (
                  <div key={w} className="flex gap-2">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                    {w}
                  </div>
                ))}
              </div>
            )}
            {preview.diff.length === 0 ? (
              <p className="text-ink-soft">คำนวณใหม่แล้วยอดเท่าเดิม ไม่ต้องตกเบิก</p>
            ) : (
              <table className="w-full text-[14px]">
                <thead>
                  <tr className="border-b border-line text-left text-[13px] text-ink-soft">
                    <th className="py-1 font-medium">รายการ</th>
                    <th className="py-1 text-right font-medium">จ่ายไปแล้ว</th>
                    <th className="py-1 text-right font-medium">คำนวณใหม่</th>
                    <th className="py-1 text-right font-medium">ผลต่าง</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.diff.map((d) => (
                    <tr key={d.pay_item_id} className="border-b border-line-soft">
                      <td className="py-1.5">{d.name}</td>
                      <td className="num py-1.5 text-right">{money(d.before)}</td>
                      <td className="num py-1.5 text-right">{money(d.after)}</td>
                      <td className={`num py-1.5 text-right ${d.after - d.before < 0 ? "text-rust" : ""}`}>{money(d.after - d.before)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td className="pt-2 font-semibold" colSpan={3}>
                      รวมก่อนภาษี / ประกันสังคม
                    </td>
                    <td className={`num pt-2 text-right font-semibold ${preview.net < 0 ? "text-rust" : ""}`}>{money(preview.net)}</td>
                  </tr>
                </tbody>
              </table>
            )}
            <p className="text-xs text-ink-mute">ยอดติดลบ = เรียกคืนในงวดถัดไป · ข้อมูลเวลาของช่วงตัดรอบนี้ถูกคำนวณใหม่ตามใบขอที่อนุมัติแล้ว</p>
            <Field label="หมายเหตุ">
              <Textarea rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
          </div>
        )}
      </Modal>
    </div>
  );
}
