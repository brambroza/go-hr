"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDownToLine, Plus, Undo2, XCircle } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useCan } from "@/components/app/me-context";
import {
  Badge,
  Button,
  Empty,
  Field,
  Input,
  Modal,
  Select,
  Spinner,
  toast,
  useConfirm,
} from "@/components/ui";
import { EmployeePicker } from "@/components/crud/employee-picker";
import { humanError } from "@/components/crud/crud-page";
import { money, thDate } from "@/lib/format";
import { CATEGORY_LABEL } from "@/lib/payroll/labels";
import { fetchRows, fetchRowsIn } from "@/lib/payroll/fetch";
import {
  PENDING_STATUS_LABEL,
  pendingSourceLabel,
  type PendingItem,
} from "@/lib/payroll/pending";
import { usePayrollLookups } from "./use-payroll-lookups";

type EmpLite = {
  id: number;
  code: string;
  first_name: string;
  last_name: string;
};
type Period = {
  id: number;
  period_type: string;
  end_date: string;
  status: string;
};

const STATUS_COLOR: Record<PendingItem["status"], string> = {
  pending: "amber",
  applied: "blue",
  paid: "green",
  cancelled: "gray",
};

/**
 * เงินค้างจ่ายรอเข้างวด — welfare / petty-cash requests approved through the workflow, retro pay, final settlement.
 * Shows what will ride along when this period is calculated (unassigned rows up to the period end + rows already in it).
 */
export function PendingTab({
  period,
  editable,
  onChanged,
}: {
  period: Period;
  editable: boolean;
  onChanged: () => void;
}) {
  const sb = supabaseBrowser();
  const can = useCan();
  const lk = usePayrollLookups();
  const { confirm, dialog } = useConfirm();
  const [rows, setRows] = useState<PendingItem[] | null>(null);
  const [emps, setEmps] = useState<Map<number, EmpLite>>(new Map());
  const [form, setForm] = useState<{
    employee_id?: number;
    pay_item_id?: number;
    amount?: string;
    note?: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const canEdit = can("payroll", "edit");

  const load = useCallback(async () => {
    const data = await fetchRows<PendingItem>(() =>
      sb
        .from("payroll_pending_items")
        .select(
          "id, employee_id, pay_item_id, amount, qty, note, source, source_id, effective_date, status, period_id",
        )
        .or(
          `period_id.eq.${period.id},and(period_id.is.null,status.eq.pending,effective_date.lte.${period.end_date})`,
        )
        .order("status")
        .order("effective_date")
        .order("id"),
    );
    setRows(data);
    const ids = [...new Set(data.map((r) => r.employee_id))];
    if (ids.length) {
      const e = await fetchRowsIn<EmpLite>(ids, (part) =>
        sb
          .from("employees")
          .select("id, code, first_name, last_name")
          .in("id", part)
          .order("id"),
      );
      setEmps(new Map(e.map((x) => [x.id, x])));
    }
  }, [sb, period.id, period.end_date]);
  useEffect(() => {
    load().catch((e) => toast.error(String(e.message ?? e)));
  }, [load]);

  const itemBy = useMemo(
    () => new Map(lk.items.map((i) => [i.id, i])),
    [lk.items],
  );
  const selectable = lk.items.filter(
    (i) =>
      i.is_active &&
      ![
        "salary",
        "sso",
        "tax",
        "pvd",
        "absent",
        "late",
        "early",
        "unpaid_leave",
      ].includes(i.system_key ?? ""),
  );
  const empName = (id: number) => {
    const e = emps.get(id);
    return e ? (
      <>
        <span className="text-ink-mute">{e.code}</span> {e.first_name}{" "}
        {e.last_name}
      </>
    ) : (
      `#${id}`
    );
  };

  async function patch(
    r: PendingItem,
    values: Partial<PendingItem>,
    okMsg: string,
  ) {
    setBusyId(r.id);
    const { error } = await sb
      .from("payroll_pending_items")
      .update(values)
      .eq("id", r.id);
    setBusyId(null);
    if (error) return toast.error(humanError(error));
    toast.ok(okMsg);
    load();
    onChanged();
  }

  async function cancel(r: PendingItem) {
    if (
      !(await confirm(
        `ยกเลิกรายการ “${r.note ?? pendingSourceLabel(r.source)}” ${money(r.amount)} บาท? เงินนี้จะไม่เข้าเงินเดือน`,
        { danger: true, confirmText: "ยกเลิกรายการ" },
      ))
    )
      return;
    await patch(
      r,
      { status: "cancelled", period_id: null },
      "ยกเลิกรายการแล้ว — กด “คำนวณใหม่” เพื่ออัปเดตยอด",
    );
  }

  async function add() {
    if (!form?.employee_id || !form.pay_item_id || !(Number(form.amount) !== 0))
      return toast.error("กรุณาเลือกพนักงาน รายการ และระบุจำนวนเงิน");
    setSaving(true);
    const { error } = await sb.from("payroll_pending_items").insert({
      employee_id: form.employee_id,
      pay_item_id: form.pay_item_id,
      amount: Number(form.amount),
      note: form.note || null,
      source: "manual",
      effective_date: period.end_date,
      period_id: period.id,
      status: "applied",
    });
    setSaving(false);
    if (error) return toast.error(humanError(error));
    toast.ok("เพิ่มรายการแล้ว — กด “คำนวณใหม่” เพื่อให้ยอดเงินเดือนเปลี่ยน");
    setForm(null);
    load();
    onChanged();
  }

  const inPeriod = (rows ?? []).filter(
    (r) => Number(r.period_id) === period.id && r.status !== "cancelled",
  );
  const waiting = (rows ?? []).filter(
    (r) => r.period_id == null && r.status === "pending",
  );
  const monthly = period.period_type === "monthly";
  const sum = (list: PendingItem[]) =>
    list.reduce((s, r) => s + Number(r.amount), 0);

  // plain render helper (not a nested component → no remount on every render)
  const renderTable = (list: PendingItem[], kind: "waiting" | "in") => (
    <div className="thin-scroll overflow-x-auto rounded-[var(--radius-ctl)] border border-line">
      <table className="w-full text-[14px]">
        <thead>
          <tr className="border-b border-line bg-paper/60 text-left text-[13px] text-ink-soft">
            <th className="px-3 py-2 font-medium">พนักงาน</th>
            <th className="px-3 py-2 font-medium">รายการ</th>
            <th className="px-3 py-2 font-medium">ที่มา</th>
            <th className="px-3 py-2 font-medium">วันที่มีผล</th>
            <th className="px-3 py-2 font-medium">สถานะ</th>
            <th className="px-3 py-2 text-right font-medium">จำนวนเงิน</th>
            {canEdit && <th className="w-px" />}
          </tr>
        </thead>
        <tbody>
          {list.map((r) => {
            const it = itemBy.get(r.pay_item_id);
            const removable = editable && canEdit && r.status !== "paid";
            return (
              <tr
                key={r.id}
                className="border-b border-line-soft last:border-0"
              >
                <td className="px-3 py-2">{empName(r.employee_id)}</td>
                <td className="px-3 py-2">
                  {it?.name ?? r.pay_item_id}
                  {r.note && (
                    <span className="block text-xs text-ink-mute">
                      {r.note}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-ink-soft">
                  {pendingSourceLabel(r.source)}
                </td>
                <td className="px-3 py-2 text-ink-soft">
                  {thDate(r.effective_date)}
                </td>
                <td className="px-3 py-2">
                  <Badge color={STATUS_COLOR[r.status]}>
                    {PENDING_STATUS_LABEL[r.status]}
                  </Badge>
                </td>
                <td
                  className={`num px-3 py-2 text-right ${Number(r.amount) < 0 ? "text-rust" : ""}`}
                >
                  {money(r.amount)}
                </td>
                {canEdit && (
                  <td className="whitespace-nowrap px-2 text-right">
                    {kind === "waiting" && editable && !monthly && (
                      <button
                        className="rounded p-1.5 text-ink-mute hover:bg-jade-50 hover:text-jade-700"
                        disabled={busyId === r.id}
                        title="ดึงเข้างวดนี้"
                        aria-label="ดึงเข้างวดนี้"
                        onClick={() =>
                          patch(
                            r,
                            { period_id: period.id, status: "applied" },
                            "ดึงเข้างวดนี้แล้ว — กด “คำนวณใหม่”",
                          )
                        }
                      >
                        <ArrowDownToLine className="size-4" />
                      </button>
                    )}
                    {kind === "in" && editable && r.status === "applied" && (
                      <button
                        className="rounded p-1.5 text-ink-mute hover:bg-jade-50 hover:text-jade-700"
                        disabled={busyId === r.id}
                        title="ปล่อยไปงวดถัดไป"
                        aria-label="ปล่อยไปงวดถัดไป"
                        onClick={() =>
                          patch(
                            r,
                            {
                              period_id: null,
                              status: "pending",
                              effective_date: nextDay(period.end_date),
                            },
                            "ปล่อยไปงวดถัดไปแล้ว — กด “คำนวณใหม่”",
                          )
                        }
                      >
                        <Undo2 className="size-4" />
                      </button>
                    )}
                    {removable && (
                      <button
                        className="rounded p-1.5 text-ink-mute hover:bg-rust-soft hover:text-rust"
                        disabled={busyId === r.id}
                        title="ยกเลิกรายการ"
                        aria-label="ยกเลิกรายการ"
                        onClick={() => cancel(r)}
                      >
                        <XCircle className="size-4" />
                      </button>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-soft">
          เงินที่อนุมัติผ่านเอกสาร (สวัสดิการ เงินสดย่อย) และรายการตกเบิก
          จะเข้าเงินเดือนงวดรายเดือนงวดถัดไปที่ยังไม่อนุมัติโดยอัตโนมัติเมื่อกด
          “คำนวณ”
          {!monthly && (
            <> · งวดประเภทนี้จะรับเฉพาะรายการที่ “ดึงเข้างวดนี้” เท่านั้น</>
          )}
        </p>
        {editable && canEdit && (
          <Button
            size="sm"
            icon={<Plus className="size-4" />}
            onClick={() => setForm({})}
          >
            เพิ่มรายการเข้างวดนี้
          </Button>
        )}
      </div>

      {rows === null ? (
        <Spinner className="mx-auto my-8" />
      ) : (
        <>
          <section>
            <h3 className="mb-2 text-[15px] font-medium">
              อยู่ในงวดนี้{" "}
              <span className="text-ink-mute">
                ({inPeriod.length} รายการ · {money(sum(inPeriod))} บาท)
              </span>
            </h3>
            {inPeriod.length ? (
              renderTable(inPeriod, "in")
            ) : (
              <Empty
                title="ยังไม่มีรายการในงวดนี้"
                description={
                  monthly
                    ? "กด “คำนวณ” แล้วรายการที่รออยู่ด้านล่างจะถูกดึงเข้างวด"
                    : "ใช้ปุ่มดึงเข้างวดนี้จากรายการที่รออยู่"
                }
              />
            )}
          </section>
          <section>
            <h3 className="mb-2 text-[15px] font-medium">
              รอเข้างวด (มีผลไม่เกิน {thDate(period.end_date)}){" "}
              <span className="text-ink-mute">
                ({waiting.length} รายการ · {money(sum(waiting))} บาท)
              </span>
            </h3>
            {waiting.length ? (
              renderTable(waiting, "waiting")
            ) : (
              <Empty title="ไม่มีรายการรอเข้างวด" />
            )}
          </section>
        </>
      )}

      <Modal
        open={!!form}
        onClose={() => setForm(null)}
        title="เพิ่มรายการเข้างวดนี้"
        footer={
          <>
            <Button variant="secondary" onClick={() => setForm(null)}>
              ยกเลิก
            </Button>
            <Button loading={saving} onClick={add}>
              บันทึก
            </Button>
          </>
        }
      >
        {form && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="พนักงาน" required className="sm:col-span-2">
              <EmployeePicker
                value={form.employee_id ?? null}
                onChange={(v) =>
                  setForm({ ...form, employee_id: v ?? undefined })
                }
                options={lk.emps}
              />
            </Field>
            <Field label="รายการ" required>
              <Select
                value={form.pay_item_id ?? ""}
                onChange={(e) =>
                  setForm({ ...form, pay_item_id: Number(e.target.value) })
                }
                placeholder="— เลือก —"
              >
                {selectable.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.direction === 1 ? "+" : "−"} {i.name} (
                    {CATEGORY_LABEL[i.category] ?? i.category})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="จำนวนเงิน (บาท)" required hint="ติดลบ = หักคืน">
              <Input
                type="money"
                step="0.01"
                className="num"
                value={form.amount ?? ""}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </Field>
            <Field label="หมายเหตุ (แสดงในสลิป)" className="sm:col-span-2">
              <Input
                value={form.note ?? ""}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
              />
            </Field>
          </div>
        )}
      </Modal>
      {dialog}
    </div>
  );
}

function nextDay(d: string): string {
  const x = new Date(d + "T00:00:00Z");
  x.setUTCDate(x.getUTCDate() + 1);
  return x.toISOString().slice(0, 10);
}
