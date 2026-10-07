"use server";

import { revalidatePath } from "next/cache";
import { safeAction, requirePerm } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { approvePeriod, calculatePeriod, closePeriod, createPeriod, deletePeriod, markPaid, publishPayslips, reopenPeriod, type PeriodRow } from "@/lib/payroll/server";
import { computeCommission, type CommissionTier } from "@/lib/payroll/commission";

const done = (id?: number) => {
  revalidatePath("/payroll");
  if (id) revalidatePath(`/payroll/${id}`);
};

export async function createPeriodAction(input: Parameters<typeof createPeriod>[0]) {
  return safeAction(async () => {
    const id = await createPeriod(input as Partial<PeriodRow> & typeof input);
    done();
    return id;
  }, "สร้างงวดแล้ว");
}

export async function calculateAction(id: number, employeeIds?: number[]) {
  return safeAction(async () => {
    const r = await calculatePeriod(id, { employeeIds });
    done(id);
    return r;
  });
}

export async function workflowAction(id: number, action: "approve" | "reopen" | "paid" | "close" | "publish" | "unpublish" | "delete") {
  return safeAction(async () => {
    let msg = "";
    if (action === "approve") (await approvePeriod(id), (msg = "อนุมัติงวดแล้ว"));
    else if (action === "reopen") (await reopenPeriod(id), (msg = "เปิดแก้ไขงวดแล้ว"));
    else if (action === "paid") (await markPaid(id), (msg = "บันทึกว่าจ่ายแล้ว"));
    else if (action === "close") (await closePeriod(id), (msg = "ปิดงวดแล้ว"));
    else if (action === "publish") {
      const r = await publishPayslips(id, true);
      msg = `เผยแพร่สลิปแล้ว แจ้งเตือนพนักงาน ${r.notified} คน`;
    } else if (action === "unpublish") (await publishPayslips(id, false), (msg = "ยกเลิกการเผยแพร่สลิปแล้ว"));
    else if (action === "delete") (await deletePeriod(id), (msg = "ลบงวดแล้ว"));
    done(id);
    return msg;
  });
}

/** recompute commission for every commission_entry of a period from its plan's tiers */
export async function recomputeCommissionsAction(periodId: number) {
  return safeAction(async () => {
    await requirePerm("payroll", "edit");
    const sb = supabaseAdmin();
    const { data: rows, error } = await sb.from("commission_entries").select("id, base_amount, plan_id").eq("period_id", periodId);
    if (error) throw new Error(error.message);
    const { data: plans } = await sb.from("commission_plans").select("id, tiers, tier_mode");
    const planBy = new Map((plans ?? []).map((p) => [p.id as number, p as { tiers: CommissionTier[]; tier_mode: "step" | "flat" }]));
    for (const r of rows ?? []) {
      const p = r.plan_id ? planBy.get(r.plan_id) : undefined;
      if (!p) continue;
      const { error: e2 } = await sb.from("commission_entries").update({ commission: computeCommission(Number(r.base_amount), p.tiers, p.tier_mode) }).eq("id", r.id);
      if (e2) throw new Error(e2.message);
    }
    done(periodId);
    return rows?.length ?? 0;
  }, "คำนวณค่าคอมมิชชั่นใหม่แล้ว");
}
