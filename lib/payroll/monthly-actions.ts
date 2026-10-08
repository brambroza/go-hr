"use server";

import { revalidatePath } from "next/cache";
import { requirePerm, safeAction, type ActionResult } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { FilingKind, FlowFiling, FlowPeriod, FlowReadiness } from "./monthly-flow";

export interface MonthlyData {
  period: FlowPeriod | null;
  others: { id: number; code: string; name: string; period_type: string; status: string; pay_date: string }[];
  readiness: FlowReadiness;
  filings: FlowFiling[];
  today: string;
}

const KINDS: FilingKind[] = ["bank", "sso", "pnd1", "pnd1a", "pvd"];
const bkkToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());

function checkYm(year: number, month: number) {
  if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) throw new Error("เดือน/ปีไม่ถูกต้อง");
}

export async function monthlyFlowAction(year: number, month: number): Promise<ActionResult<MonthlyData>> {
  return safeAction(async () => {
    await requirePerm("payroll");
    checkYm(year, month);
    const sb = supabaseAdmin();
    const { data: periods, error } = await sb
      .from("payroll_periods")
      .select("id, code, name, period_type, status, pay_date, att_start_date, att_end_date, start_date, end_date, payslip_published")
      .eq("pay_year", year).eq("pay_month", month).order("pay_date").order("id");
    if (error) throw new Error(error.message);
    const main = (periods ?? []).find((p) => p.period_type === "monthly") ?? (periods ?? []).find((p) => p.period_type === "semi_monthly") ?? null;

    let period: FlowPeriod | null = null;
    if (main) {
      let net = 0, tax = 0, sso = 0, n = 0;
      for (let from = 0; ; from += 1000) {
        const { data, error: e } = await sb.from("payroll_entries").select("net_pay, tax, sso_employee").eq("period_id", main.id).order("id").range(from, from + 999);
        if (e) throw new Error(e.message);
        for (const r of data ?? []) {
          net += Number(r.net_pay) || 0;
          tax += Number(r.tax) || 0;
          sso += Number(r.sso_employee) || 0;
        }
        n += data?.length ?? 0;
        if (!data || data.length < 1000) break;
      }
      period = { ...(main as unknown as FlowPeriod), entries: n, net_total: Math.round(net * 100) / 100, tax_total: Math.round(tax * 100) / 100, sso_total: Math.round(sso * 100) / 100 };
    }

    const from = main?.att_start_date ?? main?.start_date ?? `${year}-${String(month).padStart(2, "0")}-01`;
    const to = main?.att_end_date ?? main?.end_date ?? new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
    const head = { count: "exact" as const, head: true };
    const [pending, missing, absent, filings] = await Promise.all([
      sb.from("requests").select("id", head).eq("status", "pending").in("request_type", ["leave", "ot", "time_add", "shift_change", "dayoff_change"]).lte("start_date", to).gte("end_date", from),
      sb.from("attendance_days").select("id", head).gte("work_date", from).lte("work_date", to).eq("missing_scan", true),
      sb.from("attendance_days").select("id", head).gte("work_date", from).lte("work_date", to).eq("absent", true),
      sb.from("payroll_filings").select("id, kind, submitted_on, ref_no, amount, note").eq("pay_year", year).eq("pay_month", month),
    ]);
    for (const r of [pending, missing, absent, filings]) if (r.error) throw new Error(r.error.message);

    return {
      period,
      others: (periods ?? []).filter((p) => p.id !== main?.id).map((p) => ({ id: p.id, code: p.code, name: p.name, period_type: p.period_type, status: p.status, pay_date: p.pay_date })),
      readiness: { pendingRequests: pending.count ?? 0, missingScans: missing.count ?? 0, absentDays: absent.count ?? 0 },
      filings: (filings.data ?? []) as FlowFiling[],
      today: bkkToday(),
    };
  });
}

export async function saveFilingAction(input: { year: number; month: number; kind: FilingKind; submitted_on: string; ref_no?: string; amount?: number | null; note?: string }): Promise<ActionResult<void>> {
  return safeAction(async () => {
    await requirePerm("payroll", "edit");
    checkYm(input.year, input.month);
    if (!KINDS.includes(input.kind)) throw new Error("ประเภทการยื่นไม่ถูกต้อง");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.submitted_on ?? "")) throw new Error("กรุณาระบุวันที่ส่ง / ยื่น");
    if (input.amount != null && (!Number.isFinite(input.amount) || input.amount < 0)) throw new Error("ยอดเงินไม่ถูกต้อง");
    const { error } = await supabaseAdmin().from("payroll_filings").upsert(
      { pay_year: input.year, pay_month: input.month, kind: input.kind, submitted_on: input.submitted_on, ref_no: input.ref_no?.trim() || null, amount: input.amount ?? null, note: input.note?.trim() || null },
      { onConflict: "pay_year,pay_month,kind" },
    );
    if (error) throw new Error(error.message);
    revalidatePath("/payroll/monthly");
  }, "บันทึกการส่ง / ยื่นแล้ว");
}

export async function deleteFilingAction(id: number): Promise<ActionResult<void>> {
  return safeAction(async () => {
    await requirePerm("payroll", "edit");
    const { error } = await supabaseAdmin().from("payroll_filings").delete().eq("id", Number(id));
    if (error) throw new Error(error.message);
    revalidatePath("/payroll/monthly");
  }, "ยกเลิกบันทึกการยื่นแล้ว");
}
