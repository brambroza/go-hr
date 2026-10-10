// เงินค้างจ่ายรอเข้างวด (payroll_pending_items) — pure helpers shared by the payroll calculation and the UI.
// Unit tested in tests/payroll-pending.test.ts.
//
// Life cycle: pending → applied (claimed by a period when it is calculated) → paid (period marked paid);
// any state → cancelled. A row without a period that is still "applied" (period deleted) counts as pending.

export type PendingStatus = "pending" | "applied" | "paid" | "cancelled";

export interface PendingItem {
  id: number;
  employee_id: number;
  pay_item_id: number;
  amount: number;
  qty: number | null;
  note: string | null;
  source: string;
  source_id: number | null;
  effective_date: string; // YYYY-MM-DD
  status: PendingStatus;
  period_id: number | null;
}

export interface PendingPeriod {
  id: number;
  period_type: string;
  end_date: string; // YYYY-MM-DD
}

/** Thai label of a pending-item source (also handles the "<source>_revert" rows created when a request is cancelled) */
export const PENDING_SOURCE_LABEL: Record<string, string> = {
  welfare: "สวัสดิการ",
  petty_cash: "เงินสดย่อย",
  retro: "ตกเบิก",
  severance: "ค่าชดเชย",
  leave_payout: "จ่ายคืนวันลา",
  final_settlement: "เคลียร์เงินพ้นสภาพ",
  manual: "บันทึกเอง",
};

export function pendingSourceLabel(source: string): string {
  if (source.endsWith("_revert")) return `ยกเลิก${PENDING_SOURCE_LABEL[source.slice(0, -"_revert".length)] ?? source}`;
  return PENDING_SOURCE_LABEL[source] ?? source;
}

export const PENDING_STATUS_LABEL: Record<PendingStatus, string> = { pending: "รอเข้างวด", applied: "อยู่ในงวด", paid: "จ่ายแล้ว", cancelled: "ยกเลิก" };

/**
 * Which pending rows belong in a period's calculation.
 *   * rows already assigned to this period (status applied / paid) — always
 *   * unassigned rows (pending, or applied with no period) whose effective_date is on or before the period end —
 *     only for *monthly* periods: a bonus / OT / special run must not swallow welfare money by accident
 *   * only employees that are part of this calculation
 */
export function selectPendingForPeriod(items: PendingItem[], period: PendingPeriod, employeeIds: Iterable<number>): PendingItem[] {
  const emps = new Set([...employeeIds].map(Number));
  return items.filter((it) => {
    if (!emps.has(Number(it.employee_id))) return false;
    if (it.status === "cancelled") return false;
    if (it.period_id != null) return Number(it.period_id) === period.id && it.status !== "pending";
    if (it.status === "paid") return false; // paid rows always carry a period; defensive
    return period.period_type === "monthly" && it.effective_date <= period.end_date;
  });
}

/** rows claimed by this period that are NOT in the new selection → must be released back to the inbox */
export function pendingToRelease(items: PendingItem[], periodId: number, selected: PendingItem[]): PendingItem[] {
  const keep = new Set(selected.map((s) => s.id));
  return items.filter((it) => Number(it.period_id) === periodId && it.status === "applied" && !keep.has(it.id));
}
