"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useCan } from "@/components/app/me-context";
import { Badge, Button, Empty, Field, Input, Modal, Select, Spinner, toast, useConfirm } from "@/components/ui";
import { EmployeePicker } from "@/components/crud/employee-picker";
import { humanError } from "@/components/crud/crud-page";
import { downloadCsv, parseCsv } from "@/lib/csv";
import { money } from "@/lib/format";
import { CATEGORY_LABEL } from "@/lib/payroll/labels";
import { fetchRows } from "@/lib/payroll/fetch";
import { usePayrollLookups } from "./use-payroll-lookups";

type Adj = { id: number; employee_id: number; pay_item_id: number; amount: number; qty: number | null; note: string | null; source: string };

/** รายรับรายจ่ายงวดนี้ — payroll_adjustments CRUD + CSV import (employee_code,item_code,amount,note) */
export function AdjustmentsTab({ periodId, editable, onChanged }: { periodId: number; editable: boolean; onChanged: () => void }) {
  const sb = supabaseBrowser();
  const can = useCan();
  const lk = usePayrollLookups();
  const { confirm, dialog } = useConfirm();
  const [rows, setRows] = useState<Adj[] | null>(null);
  const [form, setForm] = useState<Partial<Adj> | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const canEdit = editable && can("payroll", "edit");

  const load = useCallback(async () => {
    const data = await fetchRows<Adj>(() => sb.from("payroll_adjustments").select("id, employee_id, pay_item_id, amount, qty, note, source").eq("period_id", periodId).order("id"));
    setRows(data);
  }, [sb, periodId]);
  useEffect(() => {
    load().catch((e) => toast.error(String(e.message ?? e)));
  }, [load]);

  const empBy = useMemo(() => new Map(lk.emps.map((e) => [Number(e.value), e])), [lk.emps]);
  const itemBy = useMemo(() => new Map(lk.items.map((i) => [i.id, i])), [lk.items]);
  const selectable = lk.items.filter((i) => i.is_active && !["salary", "sso", "tax", "pvd", "absent", "late", "early", "unpaid_leave"].includes(i.system_key ?? ""));

  async function save() {
    if (!form?.employee_id || !form.pay_item_id || !form.amount) return toast.error("กรุณาเลือกพนักงาน รายการ และระบุจำนวนเงิน");
    setSaving(true);
    const payload = { period_id: periodId, employee_id: form.employee_id, pay_item_id: Number(form.pay_item_id), amount: Number(form.amount), note: form.note || null };
    const res = form.id ? await sb.from("payroll_adjustments").update(payload).eq("id", form.id) : await sb.from("payroll_adjustments").insert(payload);
    setSaving(false);
    if (res.error) return toast.error(humanError(res.error));
    toast.ok("บันทึกแล้ว — กด “คำนวณใหม่” เพื่อให้ยอดเงินเดือนเปลี่ยน");
    setForm(null);
    load();
    onChanged();
  }

  async function remove(r: Adj) {
    if (!(await confirm("ลบรายการนี้ใช่หรือไม่?", { danger: true, confirmText: "ลบ" }))) return;
    const { error } = await sb.from("payroll_adjustments").delete().eq("id", r.id);
    if (error) return toast.error(humanError(error));
    load();
    onChanged();
  }

  async function importCsv(file: File) {
    const text = await file.text();
    const data = parseCsv(text);
    if (!data.length) return toast.error("ไฟล์ว่าง");
    const head = data[0].map((h) => h.trim().toLowerCase());
    const hasHeader = head.includes("employee_code") || head.includes("item_code");
    const body = hasHeader ? data.slice(1) : data;
    const idx = (n: string, d: number) => (hasHeader ? Math.max(0, head.indexOf(n)) : d);
    const [ci, ii, ai, ni] = [idx("employee_code", 0), idx("item_code", 1), idx("amount", 2), idx("note", 3)];
    const empByCode = new Map(lk.emps.map((e) => [String(e.raw?.code ?? "").toUpperCase(), Number(e.value)]));
    const itemByCode = new Map(selectable.map((i) => [i.code.toUpperCase(), i.id]));
    const ok: Record<string, unknown>[] = [];
    const errors: string[] = [];
    body.forEach((r, n) => {
      const line = n + (hasHeader ? 2 : 1);
      const emp = empByCode.get((r[ci] ?? "").trim().toUpperCase());
      const item = itemByCode.get((r[ii] ?? "").trim().toUpperCase());
      const amount = Number(String(r[ai] ?? "").replace(/,/g, ""));
      if (!emp) return errors.push(`แถว ${line}: ไม่พบรหัสพนักงาน ${r[ci]}`);
      if (!item) return errors.push(`แถว ${line}: ไม่พบรหัสรายการ ${r[ii]}`);
      if (!(amount > 0)) return errors.push(`แถว ${line}: จำนวนเงินไม่ถูกต้อง`);
      ok.push({ period_id: periodId, employee_id: emp, pay_item_id: item, amount, note: (r[ni] ?? "").trim() || null, source: "import" });
    });
    if (errors.length) {
      toast.error(`นำเข้าไม่ได้ ${errors.length} แถว: ${errors.slice(0, 3).join(" · ")}${errors.length > 3 ? " …" : ""}`);
      if (!ok.length) return;
    }
    const { error } = await sb.from("payroll_adjustments").insert(ok, { defaultToNull: false });
    if (error) return toast.error(humanError(error));
    toast.ok(`นำเข้า ${ok.length} รายการแล้ว`);
    load();
    onChanged();
  }

  const total = (dir: number) => (rows ?? []).filter((r) => itemBy.get(r.pay_item_id)?.direction === dir).reduce((s, r) => s + Number(r.amount), 0);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-soft">
          รายรับ/รายหักเฉพาะงวดนี้ เช่น โบนัส เงินจูงใจ หักค่าเสียหาย · รวมรายรับ <b className="num text-ink">{money(total(1))}</b> · รวมรายหัก <b className="num text-ink">{money(total(-1))}</b>
        </p>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" icon={<Download className="size-4" />} onClick={() => downloadCsv("adjustments-template.csv", [["employee_code", "item_code", "amount", "note"], ["E0010", "INCENTIVE", "1500", "ยอดผลิตเกินเป้า"]])}>
            แบบฟอร์ม CSV
          </Button>
          {canEdit && (
            <>
              <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => e.target.files?.[0] && importCsv(e.target.files[0]).finally(() => (e.target.value = ""))} />
              <Button variant="secondary" size="sm" icon={<Upload className="size-4" />} onClick={() => fileRef.current?.click()}>
                นำเข้า CSV
              </Button>
              <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setForm({})}>
                เพิ่มรายการ
              </Button>
            </>
          )}
        </div>
      </div>
      {rows === null ? (
        <Spinner className="mx-auto my-8" />
      ) : rows.length === 0 ? (
        <Empty title="ยังไม่มีรายรับรายจ่ายในงวดนี้" description="เพิ่มทีละรายการ หรือนำเข้าจากไฟล์ CSV (employee_code, item_code, amount, note)" />
      ) : (
        <div className="thin-scroll overflow-x-auto rounded-[var(--radius-ctl)] border border-line">
          <table className="w-full text-[14px]">
            <thead>
              <tr className="border-b border-line bg-paper/60 text-left text-[13px] text-ink-soft">
                <th className="px-3 py-2 font-medium">พนักงาน</th>
                <th className="px-3 py-2 font-medium">รายการ</th>
                <th className="px-3 py-2 font-medium">หมายเหตุ</th>
                <th className="px-3 py-2 font-medium">ที่มา</th>
                <th className="px-3 py-2 text-right font-medium">จำนวนเงิน</th>
                {canEdit && <th className="w-px" />}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const e = empBy.get(r.employee_id);
                const it = itemBy.get(r.pay_item_id);
                return (
                  <tr key={r.id} className="border-b border-line-soft last:border-0">
                    <td className="px-3 py-2">
                      <span className="text-ink-mute">{String(e?.raw?.code ?? "")}</span> {e?.label ?? r.employee_id}
                    </td>
                    <td className="px-3 py-2">
                      {it?.name} <Badge color={it?.direction === 1 ? "green" : "red"}>{it?.direction === 1 ? "รายรับ" : "รายหัก"}</Badge>
                    </td>
                    <td className="px-3 py-2 text-ink-soft">{r.note ?? "-"}</td>
                    <td className="px-3 py-2 text-ink-soft">{r.source === "import" ? "นำเข้า" : r.source === "manual" ? "บันทึกเอง" : r.source}</td>
                    <td className="num px-3 py-2 text-right">{money(r.amount)}</td>
                    {canEdit && (
                      <td className="whitespace-nowrap px-2 text-right">
                        <button className="rounded p-1.5 text-ink-mute hover:bg-jade-50 hover:text-jade-700" onClick={() => setForm(r)} aria-label="แก้ไข">
                          <Pencil className="size-4" />
                        </button>
                        <button className="rounded p-1.5 text-ink-mute hover:bg-rust-soft hover:text-rust" onClick={() => remove(r)} aria-label="ลบ">
                          <Trash2 className="size-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Modal
        open={!!form}
        onClose={() => setForm(null)}
        title={form?.id ? "แก้ไขรายรับรายจ่าย" : "เพิ่มรายรับรายจ่าย"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setForm(null)}>
              ยกเลิก
            </Button>
            <Button loading={saving} onClick={save}>
              บันทึก
            </Button>
          </>
        }
      >
        {form && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="พนักงาน" required className="sm:col-span-2">
              <EmployeePicker value={form.employee_id ?? null} onChange={(v) => setForm({ ...form, employee_id: v ?? undefined })} options={lk.emps} />
            </Field>
            <Field label="รายการ" required>
              <Select value={form.pay_item_id ?? ""} onChange={(e) => setForm({ ...form, pay_item_id: Number(e.target.value) })} placeholder="— เลือก —">
                {selectable.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.direction === 1 ? "+" : "−"} {i.name} ({CATEGORY_LABEL[i.category] ?? i.category})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="จำนวนเงิน (บาท)" required>
              <Input type="number" step="0.01" min={0} className="num" value={form.amount ?? ""} onChange={(e) => setForm({ ...form, amount: e.target.value as unknown as number })} />
            </Field>
            <Field label="หมายเหตุ (แสดงในสลิป)" className="sm:col-span-2">
              <Input value={form.note ?? ""} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </Field>
          </div>
        )}
      </Modal>
      {dialog}
    </div>
  );
}
