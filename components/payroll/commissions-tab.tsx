"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Calculator, Pencil, Plus, Trash2 } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useCan } from "@/components/app/me-context";
import { Button, Empty, Field, Input, Modal, Select, Spinner, toast, useConfirm } from "@/components/ui";
import { EmployeePicker } from "@/components/crud/employee-picker";
import { humanError } from "@/components/crud/crud-page";
import { money } from "@/lib/format";
import { computeCommission, type CommissionTier } from "@/lib/payroll/commission";
import { recomputeCommissionsAction } from "@/app/(admin)/payroll/actions";
import { usePayrollLookups } from "./use-payroll-lookups";

type Plan = { id: number; name: string; basis: string; tiers: CommissionTier[]; tier_mode: "step" | "flat"; is_active: boolean };
type Row = { id: number; employee_id: number; plan_id: number | null; base_amount: number; commission: number; note: string | null };

export function CommissionsTab({ periodId, editable, onChanged }: { periodId: number; editable: boolean; onChanged: () => void }) {
  const sb = supabaseBrowser();
  const can = useCan();
  const lk = usePayrollLookups();
  const { confirm, dialog } = useConfirm();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [form, setForm] = useState<Partial<Row> | null>(null);
  const [saving, setSaving] = useState(false);
  const canEdit = editable && can("payroll", "edit");

  const load = useCallback(async () => {
    const [p, r] = await Promise.all([
      sb.from("commission_plans").select("id, name, basis, tiers, tier_mode, is_active").order("name"),
      sb.from("commission_entries").select("id, employee_id, plan_id, base_amount, commission, note").eq("period_id", periodId).order("id"),
    ]);
    setPlans((p.data as Plan[]) ?? []);
    setRows((r.data as Row[]) ?? []);
  }, [sb, periodId]);
  useEffect(() => {
    load();
  }, [load]);

  const planBy = useMemo(() => new Map(plans.map((p) => [p.id, p])), [plans]);
  const empBy = useMemo(() => new Map(lk.emps.map((e) => [Number(e.value), e])), [lk.emps]);
  const preview = form?.plan_id && planBy.get(Number(form.plan_id)) ? computeCommission(Number(form.base_amount ?? 0), planBy.get(Number(form.plan_id))!.tiers, planBy.get(Number(form.plan_id))!.tier_mode) : null;

  async function save() {
    if (!form?.employee_id || !form.plan_id) return toast.error("กรุณาเลือกพนักงานและแผนค่าคอมมิชชั่น");
    const plan = planBy.get(Number(form.plan_id))!;
    setSaving(true);
    const payload = { period_id: periodId, employee_id: form.employee_id, plan_id: plan.id, base_amount: Number(form.base_amount ?? 0), commission: computeCommission(Number(form.base_amount ?? 0), plan.tiers, plan.tier_mode), note: form.note || null };
    const res = form.id ? await sb.from("commission_entries").update(payload).eq("id", form.id) : await sb.from("commission_entries").insert(payload);
    setSaving(false);
    if (res.error) return toast.error(humanError(res.error));
    toast.ok("บันทึกแล้ว — กด “คำนวณใหม่” เพื่อรวมเข้าเงินเดือน");
    setForm(null);
    load();
    onChanged();
  }

  async function recompute() {
    const r = await recomputeCommissionsAction(periodId);
    if (!r.ok) return toast.error(r.error);
    toast.ok(r.message ?? "คำนวณแล้ว");
    load();
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-soft">
          บันทึกยอดขาย/ยอดฐานของพนักงาน ระบบคำนวณค่าคอมตามขั้นของแผน · รวม <b className="num text-ink">{money((rows ?? []).reduce((s, r) => s + Number(r.commission), 0))}</b> บาท
        </p>
        {canEdit && (
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" icon={<Calculator className="size-4" />} onClick={recompute} disabled={!rows?.length}>
              คำนวณตามแผนอีกครั้ง
            </Button>
            <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setForm({ plan_id: plans.find((p) => p.is_active)?.id })} disabled={!plans.length}>
              เพิ่มยอดขาย
            </Button>
          </div>
        )}
      </div>
      {!plans.length && <p className="mb-3 text-sm text-amber-ink">ยังไม่มีแผนค่าคอมมิชชั่น — สร้างที่เมนู “ค่าคอมมิชชั่น” ก่อน</p>}
      {rows === null ? (
        <Spinner className="mx-auto my-8" />
      ) : rows.length === 0 ? (
        <Empty title="ยังไม่มีค่าคอมมิชชั่นในงวดนี้" />
      ) : (
        <div className="thin-scroll overflow-x-auto rounded-[var(--radius-ctl)] border border-line">
          <table className="w-full text-[14px]">
            <thead>
              <tr className="border-b border-line bg-paper/60 text-left text-[13px] text-ink-soft">
                <th className="px-3 py-2 font-medium">พนักงาน</th>
                <th className="px-3 py-2 font-medium">แผน</th>
                <th className="px-3 py-2 text-right font-medium">ยอดฐาน</th>
                <th className="px-3 py-2 text-right font-medium">ค่าคอมมิชชั่น</th>
                <th className="px-3 py-2 font-medium">หมายเหตุ</th>
                {canEdit && <th className="w-px" />}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-line-soft last:border-0">
                  <td className="px-3 py-2">
                    <span className="text-ink-mute">{String(empBy.get(r.employee_id)?.raw?.code ?? "")}</span> {empBy.get(r.employee_id)?.label}
                  </td>
                  <td className="px-3 py-2">{r.plan_id ? planBy.get(r.plan_id)?.name : "-"}</td>
                  <td className="num px-3 py-2 text-right">{money(r.base_amount)}</td>
                  <td className="num px-3 py-2 text-right font-medium">{money(r.commission)}</td>
                  <td className="px-3 py-2 text-ink-soft">{r.note ?? "-"}</td>
                  {canEdit && (
                    <td className="whitespace-nowrap px-2 text-right">
                      <button className="rounded p-1.5 text-ink-mute hover:bg-jade-50" onClick={() => setForm(r)} aria-label="แก้ไข">
                        <Pencil className="size-4" />
                      </button>
                      <button
                        className="rounded p-1.5 text-ink-mute hover:bg-rust-soft hover:text-rust"
                        aria-label="ลบ"
                        onClick={async () => {
                          if (!(await confirm("ลบรายการนี้ใช่หรือไม่?", { danger: true, confirmText: "ลบ" }))) return;
                          const { error } = await sb.from("commission_entries").delete().eq("id", r.id);
                          if (error) return toast.error(humanError(error));
                          load();
                          onChanged();
                        }}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Modal
        open={!!form}
        onClose={() => setForm(null)}
        title="ค่าคอมมิชชั่น"
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
            <Field label="แผนค่าคอมมิชชั่น" required>
              <Select value={form.plan_id ?? ""} onChange={(e) => setForm({ ...form, plan_id: Number(e.target.value) })} placeholder="— เลือก —">
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="ยอดฐาน (ยอดขาย/กำไร/จำนวน)">
              <Input type="number" step="0.01" className="num" value={form.base_amount ?? ""} onChange={(e) => setForm({ ...form, base_amount: e.target.value as unknown as number })} />
            </Field>
            <Field label="หมายเหตุ" className="sm:col-span-2">
              <Input value={form.note ?? ""} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </Field>
            {preview != null && (
              <div className="rounded-[var(--radius-ctl)] bg-jade-50 px-3 py-2 text-sm sm:col-span-2">
                ค่าคอมมิชชั่นที่คำนวณได้ <b className="num">{money(preview)}</b> บาท
              </div>
            )}
          </div>
        )}
      </Modal>
      {dialog}
    </div>
  );
}
