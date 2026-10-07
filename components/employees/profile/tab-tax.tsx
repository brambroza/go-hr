"use client";

import type { Res } from "@/lib/employees/labels";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useCan } from "@/components/app/me-context";
import { Button, Empty, Input, Panel, Select, Spinner, toast } from "@/components/ui";
import { humanError } from "@/components/crud/crud-page";
import { money } from "@/lib/format";
import type { TabProps } from "./types";

type Deduction = { code: string; name: string; max?: number; per_unit?: number; multiplier?: number; group?: string; retirement?: boolean; donation?: boolean };
type Row = { id?: number; deduction_code: string; amount: string; note: string };

export function TaxTab({ emp, isSelf }: TabProps) {
  const can = useCan();
  const sb = supabaseBrowser();
  const canEdit = can("employee_private", "edit") || isSelf;
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [defs, setDefs] = useState<Deduction[]>([]);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [orig, setOrig] = useState<Row[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    sb.from("settings").select("value").eq("key", "tax_config").maybeSingle().then(({ data }: Res) => setDefs(((data?.value as { deductions?: Deduction[] })?.deductions) ?? []));
  }, [sb]);

  const load = useCallback(async () => {
    setRows(null);
    const { data, error } = await sb.from("employee_tax_deductions").select("id, deduction_code, amount, note").eq("employee_id", emp.id).eq("tax_year", year).order("id");
    if (error) toast.error(error.message);
    const r = ((data as { id: number; deduction_code: string; amount: number; note: string | null }[]) ?? []).map((x) => ({ id: x.id, deduction_code: x.deduction_code, amount: String(x.amount), note: x.note ?? "" }));
    setRows(r);
    setOrig(r);
  }, [sb, emp.id, year]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount / reset form when opened
    load();
  }, [load]);

  const defBy = useMemo(() => new Map(defs.map((d) => [d.code, d])), [defs]);
  const used = new Set(rows?.map((r) => r.deduction_code));
  const dirty = JSON.stringify(rows) !== JSON.stringify(orig);

  function err(r: Row): string | null {
    const a = Number(r.amount);
    if (!r.deduction_code) return "เลือกรายการ";
    if (r.amount === "" || isNaN(a) || a < 0) return "จำนวนเงินไม่ถูกต้อง";
    const d = defBy.get(r.deduction_code);
    if (d?.max && !d.per_unit && a > d.max) return `ไม่เกิน ${money(d.max, 0)}`;
    if (d?.per_unit && d.max && a > d.max) return `ไม่เกิน ${money(d.max, 0)}`;
    return null;
  }

  async function save() {
    if (!rows) return;
    const bad = rows.map(err).find(Boolean);
    if (bad) return toast.error(`ตรวจสอบข้อมูล: ${bad}`);
    setSaving(true);
    try {
      const removed = orig.filter((o) => o.id && !rows.some((r) => r.id === o.id)).map((o) => o.id!);
      if (removed.length) {
        const { error } = await sb.from("employee_tax_deductions").delete().in("id", removed);
        if (error) throw error;
      }
      if (rows.length) {
        const { error } = await sb.from("employee_tax_deductions").upsert(
          rows.map((r) => ({ employee_id: emp.id, tax_year: year, deduction_code: r.deduction_code, amount: Number(r.amount), note: r.note.trim() || null })),
          { onConflict: "employee_id,tax_year,deduction_code" },
        );
        if (error) throw error;
      }
      toast.ok("บันทึกค่าลดหย่อนแล้ว");
      await load();
    } catch (e) {
      toast.error(humanError(e));
    } finally {
      setSaving(false);
    }
  }

  const total = (rows ?? []).reduce((a, r) => a + (Number(r.amount) || 0) * (defBy.get(r.deduction_code)?.multiplier ?? 1), 0);
  const upd = (i: number, p: Partial<Row>) => setRows((x) => x!.map((r, j) => (j === i ? { ...r, ...p } : r)));

  return (
    <Panel
      title="ข้อมูลลดหย่อนภาษี (ล.ย.01)"
      actions={
        <Select className="h-8 sm:w-auto text-sm" value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="ปีภาษี">
          {[thisYear + 1, thisYear, thisYear - 1, thisYear - 2].map((y) => <option key={y} value={y}>ปีภาษี {y + 543}</option>)}
        </Select>
      }
      footer={
        canEdit && rows ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button size="sm" variant="secondary" icon={<Plus className="size-4" />} disabled={used.size >= defs.length} onClick={() => setRows((x) => [...(x ?? []), { deduction_code: defs.find((d) => !used.has(d.code))?.code ?? "", amount: "", note: "" }])}>
              เพิ่มรายการ
            </Button>
            <div className="flex gap-2">
              {dirty && <Button variant="secondary" onClick={() => setRows(orig)}>ยกเลิก</Button>}
              <Button onClick={save} loading={saving} disabled={!dirty}>บันทึก</Button>
            </div>
          </div>
        ) : undefined
      }
    >
      <p className="mb-3 text-sm text-ink-soft">ค่าลดหย่อนส่วนตัว 60,000 บาท และค่าลดหย่อนบุตร/คู่สมรส/บิดามารดาจากแท็บครอบครัวคำนวณให้อัตโนมัติ ใส่เฉพาะรายการที่พนักงานแจ้ง เช่น ประกันชีวิต กองทุน ดอกเบี้ยบ้าน</p>
      {!rows ? (
        <div className="py-10"><Spinner className="mx-auto" /></div>
      ) : rows.length === 0 ? (
        <Empty title={`ยังไม่มีข้อมูลลดหย่อนปีภาษี ${year + 543}`} />
      ) : (
        <div className="thin-scroll overflow-x-auto">
          <table className="w-full min-w-[560px] text-[14px]">
            <thead>
              <tr className="border-b border-line text-left text-[13px] text-ink-soft">
                <th className="py-2 pr-3 font-medium">รายการ</th>
                <th className="w-40 py-2 pr-3 text-right font-medium">จำนวนเงิน</th>
                <th className="py-2 pr-3 font-medium">หมายเหตุ</th>
                {canEdit && <th className="w-10" />}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const d = defBy.get(r.deduction_code);
                const e = r.amount !== "" ? err(r) : null;
                return (
                  <tr key={i} className="border-b border-line-soft align-top last:border-0">
                    <td className="py-2 pr-3">
                      {canEdit ? (
                        <Select value={r.deduction_code} onChange={(x) => upd(i, { deduction_code: x.target.value })} aria-label="รายการลดหย่อน">
                          {defs.filter((x) => x.code === r.deduction_code || !used.has(x.code)).map((x) => <option key={x.code} value={x.code}>{x.name}</option>)}
                        </Select>
                      ) : (
                        d?.name ?? r.deduction_code
                      )}
                      {d && (d.max || d.per_unit) ? <div className="mt-0.5 text-xs text-ink-mute">{d.per_unit ? `${money(d.per_unit, 0)} ต่อคน` : ""}{d.per_unit && d.max ? " · " : ""}{d.max ? `สูงสุด ${money(d.max, 0)}` : ""}</div> : null}
                    </td>
                    <td className="py-2 pr-3 text-right">
                      {canEdit ? (
                        <>
                          <Input type="number" inputMode="decimal" min={0} step="0.01" className="num text-right" value={r.amount} onChange={(x) => upd(i, { amount: x.target.value })} aria-label="จำนวนเงิน" aria-invalid={!!e} />
                          {e && <div className="mt-0.5 text-xs text-rust">{e}</div>}
                        </>
                      ) : (
                        <span className="num">{money(r.amount)}</span>
                      )}
                    </td>
                    <td className="py-2 pr-3">{canEdit ? <Input value={r.note} onChange={(x) => upd(i, { note: x.target.value })} aria-label="หมายเหตุ" /> : r.note || "-"}</td>
                    {canEdit && (
                      <td className="py-2">
                        <button type="button" className="mt-1.5 rounded p-1.5 text-ink-mute hover:bg-rust-soft hover:text-rust" aria-label="ลบรายการ" onClick={() => setRows((x) => x!.filter((_, j) => j !== i))}>
                          <Trash2 className="size-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td className="pt-3 text-right font-medium">รวม</td>
                <td className="num pt-3 pr-3 text-right font-semibold">{money(total)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Panel>
  );
}
