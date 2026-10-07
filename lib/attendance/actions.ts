"use server";

import { randomBytes } from "node:crypto";
import { requirePerm, safeAction, type ActionResult } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { recalcAttendance } from "./server";
import { generateLeaveQuotas } from "@/lib/leave/server";
import { bkkDate, normalizeDirection } from "./parse";
import { eachDate, isIsoDate, plusDays } from "./schedule";

const ids = (a: unknown): number[] | undefined =>
  Array.isArray(a) ? [...new Set(a.map(Number).filter((n) => Number.isInteger(n) && n > 0))] : undefined;

function checkRange(from: string, to: string, maxDays = 400) {
  if (!isIsoDate(from) || !isIsoDate(to) || from > to) throw new Error("ช่วงวันที่ไม่ถูกต้อง");
  if (eachDate(from, to).length > maxDays) throw new Error(`เลือกช่วงวันที่ได้ไม่เกิน ${maxDays} วัน`);
}

/** "คำนวณใหม่" — recalculates the shown range */
export async function recalcAction(input: { from: string; to: string; employeeIds?: number[]; force?: boolean }): Promise<ActionResult<{ days: number; employees: number }>> {
  return safeAction(async () => {
    await requirePerm("attendance", "edit");
    checkRange(input.from, input.to);
    return recalcAttendance({ from: input.from, to: input.to, employeeIds: ids(input.employeeIds), force: !!input.force });
  });
}

/** HR adds a scan by hand (with reason) and recalculates the affected days */
export async function addManualLogAction(input: { employee_id: number; log_time: string; direction?: string; note: string }): Promise<ActionResult> {
  return safeAction(async () => {
    const me = await requirePerm("attendance", "edit");
    const t = new Date(input.log_time);
    if (!input.employee_id || isNaN(t.getTime())) throw new Error("กรุณาระบุพนักงานและวันเวลาให้ถูกต้อง");
    if (!input.note?.trim()) throw new Error("กรุณาระบุเหตุผลการเพิ่มเวลา");
    if (t.getTime() > Date.now() + 5 * 60_000) throw new Error("เพิ่มเวลาล่วงหน้าไม่ได้");
    const sb = supabaseAdmin();
    const { error } = await sb.from("time_logs").insert({
      employee_id: Number(input.employee_id),
      log_time: t.toISOString(),
      direction: normalizeDirection(input.direction),
      source: "manual",
      recorded_by: me.userId,
      note: input.note.trim(),
    });
    if (error) throw new Error(error.message);
    const d = bkkDate(t);
    await recalcAttendance({ from: plusDays(d, -1), to: d, employeeIds: [Number(input.employee_id)] });
  }, "เพิ่มเวลาและคำนวณใหม่แล้ว");
}

/** Void (not delete) a scan — keeps the audit trail */
export async function voidLogAction(input: { id: number; reason: string; restore?: boolean }): Promise<ActionResult> {
  return safeAction(async () => {
    await requirePerm("attendance", "edit");
    if (!input.restore && !input.reason?.trim()) throw new Error("กรุณาระบุเหตุผลการยกเลิกเวลา");
    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from("time_logs")
      .update(input.restore ? { is_void: false, void_reason: null } : { is_void: true, void_reason: input.reason.trim() })
      .eq("id", Number(input.id))
      .select("employee_id, log_time")
      .single();
    if (error) throw new Error(error.message);
    const d = bkkDate(data.log_time);
    await recalcAttendance({ from: plusDays(d, -1), to: d, employeeIds: [Number(data.employee_id)] });
  }, input.restore ? "คืนค่าเวลาแล้ว" : "ยกเลิกเวลาและคำนวณใหม่แล้ว");
}

/** Lock / unlock attendance days (e.g. after closing a payroll period) */
export async function lockDaysAction(input: { from: string; to: string; lock: boolean; employeeIds?: number[] }): Promise<ActionResult<number>> {
  return safeAction(async () => {
    await requirePerm("attendance", "edit");
    checkRange(input.from, input.to);
    let q = supabaseAdmin().from("attendance_days").update({ is_locked: input.lock }, { count: "exact" }).gte("work_date", input.from).lte("work_date", input.to);
    const e = ids(input.employeeIds);
    if (e?.length) q = q.in("employee_id", e);
    const { error, count } = await q;
    if (error) throw new Error(error.message);
    return count ?? 0;
  }, input.lock ? "ล็อกข้อมูลแล้ว" : "ปลดล็อกแล้ว");
}

// ---------------------------------------------------------------------------- secrets
export async function getQrSecretAction(locationId: number): Promise<ActionResult<string>> {
  return safeAction(async () => {
    await requirePerm("attendance", "edit");
    const { data, error } = await supabaseAdmin().from("work_locations").select("qr_secret").eq("id", Number(locationId)).single();
    if (error) throw new Error(error.message);
    return data.qr_secret as string;
  });
}

export async function regenerateQrSecretAction(locationId: number): Promise<ActionResult<string>> {
  return safeAction(async () => {
    await requirePerm("attendance", "edit");
    const secret = randomBytes(16).toString("hex");
    const { error } = await supabaseAdmin().from("work_locations").update({ qr_secret: secret }).eq("id", Number(locationId));
    if (error) throw new Error(error.message);
    return secret;
  }, "สร้างรหัส QR ใหม่แล้ว — QR เดิมที่พิมพ์ไว้จะใช้ไม่ได้");
}

export async function getDeviceKeyAction(deviceId: number): Promise<ActionResult<string>> {
  return safeAction(async () => {
    await requirePerm("attendance", "edit");
    const { data, error } = await supabaseAdmin().from("time_devices").select("api_key").eq("id", Number(deviceId)).single();
    if (error) throw new Error(error.message);
    return data.api_key as string;
  });
}

export async function regenerateDeviceKeyAction(deviceId: number): Promise<ActionResult<string>> {
  return safeAction(async () => {
    await requirePerm("attendance", "edit");
    const key = randomBytes(24).toString("hex");
    const { error } = await supabaseAdmin().from("time_devices").update({ api_key: key }).eq("id", Number(deviceId));
    if (error) throw new Error(error.message);
    return key;
  }, "สร้าง API key ใหม่แล้ว — ต้องตั้งค่าที่เครื่องใหม่");
}

// ---------------------------------------------------------------------------- import
export interface ImportRow {
  employee_id: number;
  time: string; // ISO
  direction?: string;
}

/** Import time logs (CSV / ZKTeco attlog). Idempotent: the same employee+time is never inserted twice. */
export async function importLogsAction(input: { rows: ImportRow[]; fileName?: string; mappings?: { device_user_id: string; employee_id: number }[] }): Promise<ActionResult<{ inserted: number; skipped: number; from: string | null; to: string | null }>> {
  return safeAction(async () => {
    const me = await requirePerm("attendance", "create");
    if (!Array.isArray(input.rows) || !input.rows.length) throw new Error("ไม่มีข้อมูลที่จะนำเข้า");
    if (input.rows.length > 50_000) throw new Error("นำเข้าได้ครั้งละไม่เกิน 50,000 รายการ");
    const sb = supabaseAdmin();
    const note = input.fileName ? `นำเข้าจากไฟล์ ${String(input.fileName).slice(0, 120)}` : "นำเข้าจากไฟล์";
    const rows = [] as Record<string, unknown>[];
    const seen = new Set<string>();
    for (const r of input.rows) {
      const t = new Date(r.time);
      const emp = Number(r.employee_id);
      if (!emp || isNaN(t.getTime())) continue;
      const ref = `import:${emp}:${t.toISOString()}`;
      if (seen.has(ref)) continue;
      seen.add(ref);
      rows.push({ employee_id: emp, log_time: t.toISOString(), direction: normalizeDirection(r.direction), source: "import", recorded_by: me.userId, note, client_ref: ref });
    }
    let inserted = 0;
    for (let i = 0; i < rows.length; i += 1000) {
      const { data, error } = await sb.from("time_logs").upsert(rows.slice(i, i + 1000), { onConflict: "client_ref", ignoreDuplicates: true }).select("id");
      if (error) throw new Error(error.message);
      inserted += data?.length ?? 0;
    }
    if (input.mappings?.length) {
      const maps = input.mappings.filter((m) => m.device_user_id && m.employee_id).map((m) => ({ device_user_id: String(m.device_user_id), employee_id: Number(m.employee_id), device_id: null }));
      if (maps.length) await sb.from("device_user_maps").upsert(maps, { onConflict: "device_user_id,employee_id", ignoreDuplicates: true });
    }
    const dates = rows.map((r) => bkkDate(String(r.log_time))).sort();
    return { inserted, skipped: input.rows.length - inserted, from: dates[0] ?? null, to: dates[dates.length - 1] ?? null };
  });
}

// ---------------------------------------------------------------------------- leave quotas
export async function generateQuotasAction(input: { year: number; carryOver?: boolean; employeeIds?: number[] }): Promise<ActionResult<number>> {
  return safeAction(async () => {
    await requirePerm("attendance", "edit");
    return generateLeaveQuotas(Number(input.year), { carryOver: input.carryOver ?? true, employeeIds: ids(input.employeeIds) });
  });
}
