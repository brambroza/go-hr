"use server";
// ตกเบิก — find late changes to approved periods, preview the difference, send it to the pending inbox.

import { revalidatePath } from "next/cache";
import { requirePerm, safeAction, type ActionResult } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { calculatePeriodUnchecked, type SimulatedEntry } from "./server";
import { priorRetroLines, retroDiff, retroNet, type RetroDiff, type RetroItem, type RetroLine } from "./retro";

const DONE = ["approved", "paid", "closed"];
const LATE_TYPES = ["leave", "ot", "time_add", "shift_change", "dayoff_change"];
const TYPE_LABEL: Record<string, string> = { leave: "ใบลา", ot: "OT", time_add: "ขอเพิ่มเวลา", shift_change: "เปลี่ยนกะ", dayoff_change: "เปลี่ยนวันหยุด" };

export interface RetroCandidate {
  period_id: number;
  period_name: string;
  pay_date: string;
  employee_id: number;
  code: string;
  name: string;
  reasons: string[];
  last_run_at: string | null;
}

export interface RetroPreview {
  period: { id: number; name: string; status: string };
  employee: { id: number; code: string; name: string };
  diff: RetroDiff[];
  net: number;
  warnings: string[];
  /** latest earlier run of this period + person; confirm must send it back (stops double confirms) */
  last_run_id: number | null;
}

type Period = { id: number; name: string; status: string; pay_date: string; start_date: string; end_date: string; att_start_date: string | null; att_end_date: string | null; approved_at: string | null; calculated_at: string | null };

function must<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
}
const checkId = (n: number) => {
  if (!Number.isInteger(n) || n <= 0) throw new Error("ข้อมูลไม่ถูกต้อง");
};

/** approved / paid / closed periods of the last 13 months with changes made after their approval */
export async function listRetroCandidatesAction(): Promise<ActionResult<RetroCandidate[]>> {
  return safeAction(async () => {
    await requirePerm("payroll");
    const sb = supabaseAdmin();
    const since = new Date(Date.now() - 400 * 86_400_000).toISOString().slice(0, 10);
    const periods = (must(
      await sb.from("payroll_periods").select("id, name, status, pay_date, start_date, end_date, att_start_date, att_end_date, approved_at, calculated_at").in("status", DONE).gte("pay_date", since).order("pay_date", { ascending: false }),
    ) ?? []) as Period[];
    if (!periods.length) return [];
    const stamp = (p: Period) => p.approved_at ?? p.calculated_at ?? `${p.pay_date}T00:00:00Z`;
    const minStamp = periods.map(stamp).sort()[0];

    const [reqs, sal] = await Promise.all([
      sb.from("requests").select("id, doc_no, employee_id, request_type, status, start_date, end_date, completed_at, cancelled_at")
        .in("request_type", LATE_TYPES).in("status", ["approved", "cancelled"]).or(`completed_at.gte.${minStamp},cancelled_at.gte.${minStamp}`).limit(5000),
      sb.from("salary_history").select("id, employee_id, effective_date, new_salary, created_at").gte("created_at", minStamp).limit(5000),
    ]);
    type Req = { id: number; doc_no: string | null; employee_id: number; request_type: string; status: string; start_date: string | null; end_date: string | null; completed_at: string | null; cancelled_at: string | null };
    type Sal = { id: number; employee_id: number; effective_date: string; new_salary: number; created_at: string };
    const requests = (must(reqs) ?? []) as Req[];
    const salaries = (must(sal) ?? []) as Sal[];
    const empIds = [...new Set([...requests.map((r) => Number(r.employee_id)), ...salaries.map((s) => Number(s.employee_id))])];
    if (!empIds.length) return [];

    const pids = periods.map((p) => p.id);
    const [entries, runs, emps] = await Promise.all([
      sb.from("payroll_entries").select("period_id, employee_id").in("period_id", pids).in("employee_id", empIds).limit(20000),
      sb.from("payroll_retro_runs").select("period_id, employee_id, created_at").in("period_id", pids).in("employee_id", empIds).order("created_at", { ascending: false }).limit(20000),
      sb.from("employees").select("id, code, prefix, first_name, last_name").in("id", empIds),
    ]);
    const inPeriod = new Set(((must(entries) ?? []) as { period_id: number; employee_id: number }[]).map((e) => `${e.period_id}|${e.employee_id}`));
    const lastRun = new Map<string, string>();
    for (const r of (must(runs) ?? []) as { period_id: number; employee_id: number; created_at: string }[]) {
      const k = `${r.period_id}|${r.employee_id}`;
      if (!lastRun.has(k)) lastRun.set(k, r.created_at);
    }
    const empBy = new Map(((must(emps) ?? []) as { id: number; code: string; prefix: string | null; first_name: string; last_name: string }[]).map((e) => [e.id, e]));

    const out: RetroCandidate[] = [];
    for (const p of periods) {
      const from = p.att_start_date ?? p.start_date;
      const to = p.att_end_date ?? p.end_date;
      const base = stamp(p);
      const by = new Map<number, string[]>();
      const note = (emp: number, why: string, at: string) => {
        const k = `${p.id}|${emp}`;
        if (!inPeriod.has(k)) return;
        const after = lastRun.get(k);
        if (after && at <= after) return; // already compared after this change
        by.set(emp, [...(by.get(emp) ?? []), why]);
      };
      for (const r of requests) {
        const at = r.status === "approved" ? r.completed_at : r.cancelled_at;
        if (!at || at <= base || !r.start_date) continue;
        if (r.start_date > to || (r.end_date ?? r.start_date) < from) continue;
        note(Number(r.employee_id), `${TYPE_LABEL[r.request_type] ?? r.request_type} ${r.doc_no ?? ""} ${r.status === "approved" ? "อนุมัติ" : "ยกเลิก"}หลังอนุมัติงวด`.trim(), at);
      }
      for (const s of salaries) {
        if (s.created_at <= base || s.effective_date > p.end_date) continue;
        note(Number(s.employee_id), `ปรับเงินเดือนย้อนหลัง มีผล ${s.effective_date} (${Number(s.new_salary).toLocaleString("th-TH")})`, s.created_at);
      }
      for (const [emp, reasons] of by) {
        const e = empBy.get(emp);
        out.push({ period_id: p.id, period_name: p.name, pay_date: p.pay_date, employee_id: emp, code: e?.code ?? "", name: e ? `${e.prefix ?? ""}${e.first_name} ${e.last_name}` : String(emp), reasons, last_run_at: lastRun.get(`${p.id}|${emp}`) ?? null });
      }
    }
    return out;
  });
}

async function compute(periodId: number, employeeId: number): Promise<RetroPreview> {
  const sb = supabaseAdmin();
  const period = must(await sb.from("payroll_periods").select("id, name, status").eq("id", periodId).maybeSingle()) as { id: number; name: string; status: string } | null;
  if (!period) throw new Error("ไม่พบงวดเงินเดือน");
  if (!DONE.includes(period.status)) throw new Error("งวดนี้ยังไม่อนุมัติ — คำนวณใหม่ที่งวดได้เลย ไม่ต้องตกเบิก");
  const entry = must(await sb.from("payroll_entries").select("id, emp_code, emp_name").eq("period_id", periodId).eq("employee_id", employeeId).maybeSingle()) as { id: number; emp_code: string; emp_name: string } | null;
  if (!entry) throw new Error("พนักงานคนนี้ไม่มีรายการในงวดนี้");
  const before = (must(await sb.from("payroll_entry_items").select("pay_item_id, code, name, direction, amount, source").eq("entry_id", entry.id)) ?? []) as RetroLine[];

  const sink: { result?: SimulatedEntry[] } = {};
  await calculatePeriodUnchecked(periodId, { employeeIds: [employeeId], simulate: sink });
  const sim = sink.result?.find((r) => r.employee_id === employeeId);
  if (!sim) throw new Error("คำนวณงวดนี้ใหม่ไม่ได้ (พนักงานไม่อยู่ในเงื่อนไขของงวดแล้ว)");

  const items = (must(await sb.from("pay_items").select("id, direction, system_key")) ?? []) as { id: number; direction: 1 | -1; system_key: string | null }[];
  const itemMap = new Map<number, RetroItem>(items.map((i) => [i.id, { direction: Number(i.direction) as 1 | -1, system_key: i.system_key }]));
  // earlier runs: what they queued (and was not cancelled) counts as already paid
  const runs = (must(await sb.from("payroll_retro_runs").select("id").eq("period_id", periodId).eq("employee_id", employeeId).order("id", { ascending: false })) ?? []) as { id: number }[];
  const prior = runs.length
    ? ((must(await sb.from("payroll_pending_items").select("pay_item_id, amount").in("retro_run_id", runs.map((r) => r.id)).neq("status", "cancelled")) ?? []) as { pay_item_id: number; amount: number }[])
    : [];
  const diff = retroDiff(
    [...before.map((l) => ({ ...l, amount: Number(l.amount), direction: Number(l.direction) as 1 | -1 })), ...priorRetroLines(prior, itemMap)],
    sim.lines.map((l) => ({ pay_item_id: l.pay_item_id, code: l.code, name: l.name, direction: l.direction, amount: l.amount, source: l.source })),
    itemMap,
  );
  const warnings = sim.warnings.filter((w) => !w.startsWith("ไม่พบข้อมูลเวลาทำงาน"));
  return { period, employee: { id: employeeId, code: entry.emp_code, name: entry.emp_name }, diff, net: retroNet(diff), warnings, last_run_id: runs[0]?.id ?? null };
}

/** recalculates attendance of the period's range for this person (forced) — the preview is not read-only */
export async function previewRetroAction(periodId: number, employeeId: number): Promise<ActionResult<RetroPreview>> {
  return safeAction(async () => {
    await requirePerm("payroll", "edit");
    checkId(periodId);
    checkId(employeeId);
    return compute(periodId, employeeId);
  });
}

export async function confirmRetroAction(periodId: number, employeeId: number, reasons: string[], note: string, lastRunId: number | null): Promise<ActionResult<number>> {
  return safeAction(async () => {
    const me = await requirePerm("payroll", "edit");
    checkId(periodId);
    checkId(employeeId);
    const cleanNote = String(note ?? "").trim().slice(0, 500);
    const why = (Array.isArray(reasons) ? reasons : []).map((r) => String(r).slice(0, 200)).slice(0, 50);
    const c = await compute(periodId, employeeId);
    if ((c.last_run_id ?? null) !== (lastRunId ?? null)) throw new Error("มีการบันทึกตกเบิกของคนนี้ในงวดนี้ไปแล้วระหว่างที่เปิดหน้าจอ — ปิดแล้วกด “คำนวณ” ใหม่");
    const sb = supabaseAdmin();
    const ins0 = await sb
      .from("payroll_retro_runs")
      .insert({ period_id: periodId, employee_id: employeeId, reasons: why, lines: c.diff, net: c.net, note: cleanNote || null, prev_run_id: c.last_run_id, created_by: me.userId })
      .select("id")
      .single();
    if (ins0.error?.code === "23505") throw new Error("ตกเบิกรายการนี้ถูกบันทึกไปแล้ว (กดซ้ำ) — ไม่ได้บันทึกซ้ำ");
    const run = must(ins0) as { id: number };
    // a run without differences is still recorded, so the same change is not offered again
    if (c.diff.length) {
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
      const ins = await sb.from("payroll_pending_items").insert(
        c.diff.map((d) => ({
          employee_id: employeeId,
          pay_item_id: d.pay_item_id,
          amount: d.amount,
          note: `ตกเบิก ${c.period.name}`,
          source: "retro",
          source_id: null,
          retro_run_id: run.id,
          effective_date: today,
          status: "pending",
          created_by: me.userId,
        })),
      );
      if (ins.error) {
        await sb.from("payroll_retro_runs").delete().eq("id", run.id);
        throw new Error(ins.error.message);
      }
    }
    await sb.from("audit_logs").insert({ user_id: me.userId, user_name: me.displayName, action: "RETRO_CONFIRM", table_name: "payroll_retro_runs", record_id: String(run.id), note: `${c.employee.code} ${c.period.name} สุทธิก่อนภาษี ${c.net.toFixed(2)}` });
    revalidatePath("/payroll/retro");
    return run.id;
  }, "บันทึกแล้ว — ยอดตกเบิกเข้าคิวรอเข้างวดถัดไป");
}
