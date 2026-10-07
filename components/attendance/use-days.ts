"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { AttDay } from "./day-detail";

export const DAY_COLS =
  "id, employee_id, work_date, shift_id, day_type, sched_in, sched_out, actual_in, actual_out, break_out, break_in, work_minutes, late_minutes, early_minutes, break_over_minutes, early_in_minutes, late_out_minutes, ot_before_minutes, ot_after_minutes, ot_holiday_minutes, ot_approved_minutes, absent, missing_scan, leave_minutes, leave_type_ids, status, is_locked, note, calculated_at";

/** Page through PostgREST (max-rows) from the browser */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchAllRows<T>(build: () => any, page = 1000): Promise<{ rows: T[]; error: string | null }> {
  const rows: T[] = [];
  for (let from = 0; from < 200_000; from += page) {
    const { data, error } = await build().range(from, from + page - 1);
    if (error) return { rows, error: error.message };
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < page) break;
  }
  return { rows, error: null };
}

/** attendance_days in a range (RLS limits supervisors to their team) */
export function useAttendanceDays(from: string, to: string, employeeId?: number | null) {
  const key = `${from}|${to}|${employeeId ?? ""}`;
  const [state, setState] = useState<{ key: string; days: AttDay[]; error: string | null } | null>(null);
  const load = useCallback(async () => {
    const sb = supabaseBrowser();
    const { rows, error } = await fetchAllRows<AttDay>(() => {
      let q = sb.from("attendance_days").select(DAY_COLS).gte("work_date", from).lte("work_date", to).order("work_date").order("employee_id").order("id");
      if (employeeId) q = q.eq("employee_id", employeeId);
      return q;
    });
    setState({ key: `${from}|${to}|${employeeId ?? ""}`, days: rows, error });
  }, [from, to, employeeId]);
  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);
  // stale data from another range is never shown: null = loading
  const cur = state?.key === key ? state : null;
  return { days: cur?.days ?? null, error: cur?.error ?? null, reload: load };
}

export function useHolidayNames(from: string, to: string) {
  const [map, setMap] = useState<Record<string, string>>({});
  useEffect(() => {
    supabaseBrowser()
      .from("holidays")
      .select("holiday_date, name")
      .gte("holiday_date", from)
      .lte("holiday_date", to)
      .then(({ data }: { data: unknown }) => setMap(Object.fromEntries(((data as { holiday_date: string; name: string }[]) ?? []).map((h) => [h.holiday_date, h.name]))));
  }, [from, to]);
  return map;
}

export function useLeaveTypes() {
  const [map, setMap] = useState<Record<number, { name: string; color: string | null; code: string }>>({});
  useEffect(() => {
    supabaseBrowser()
      .from("leave_types")
      .select("id, code, name, color")
      .then(({ data }: { data: unknown }) => setMap(Object.fromEntries(((data as { id: number; code: string; name: string; color: string | null }[]) ?? []).map((t) => [t.id, t]))));
  }, []);
  return map;
}
