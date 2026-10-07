"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { HolidayRow, ScheduleRow, SpecialWorkdayRow } from "@/lib/attendance/schedule";
import type { PlanRow } from "@/lib/attendance/manpower";
import { fetchAllRows } from "./use-days";

export type RosterEmp = {
  id: number; code: string; first_name: string; last_name: string; nickname: string | null; org_unit_id: number | null; branch_id: number | null;
  position_id: number | null; default_shift_id: number | null; weekly_off_days: number[] | null; hire_date: string; resign_date: string | null; attendance_exempt: boolean;
};

export interface RosterData {
  emps: RosterEmp[];
  holidays: HolidayRow[];
  specials: SpecialWorkdayRow[];
  schedules: ScheduleRow[];
  plans: PlanRow[];
}

/** everything the roster / manpower screens need for a date range (RLS-scoped) */
export function useRosterData(from: string, to: string) {
  const key = `${from}|${to}`;
  const [state, setState] = useState<{ key: string; data: RosterData; error: string | null } | null>(null);
  const load = useCallback(async () => {
    const sb = supabaseBrowser();
    const [emps, hol, sp, ws, plans] = await Promise.all([
      fetchAllRows<RosterEmp>(() =>
        sb.from("employees").select("id, code, first_name, last_name, nickname, org_unit_id, branch_id, position_id, default_shift_id, weekly_off_days, hire_date, resign_date, attendance_exempt")
          .lte("hire_date", to).or(`resign_date.is.null,resign_date.gte.${from}`).order("code"),
      ),
      fetchAllRows<HolidayRow>(() => sb.from("holidays").select("id, holiday_date, name, branch_id, org_unit_id, employee_ids").gte("holiday_date", from).lte("holiday_date", to).order("id")),
      fetchAllRows<SpecialWorkdayRow>(() => sb.from("special_workdays").select("id, work_date, name, branch_id, org_unit_id, shift_id").gte("work_date", from).lte("work_date", to).order("id")),
      fetchAllRows<ScheduleRow>(() => sb.from("work_schedules").select("id, employee_id, work_date, shift_id, is_day_off, source, note").gte("work_date", from).lte("work_date", to).order("id")),
      fetchAllRows<PlanRow>(() => sb.from("manpower_plans").select("id, org_unit_id, branch_id, position_id, shift_id, weekday, plan_date, required_count").order("id")),
    ]);
    const err = emps.error ?? hol.error ?? sp.error ?? ws.error ?? plans.error;
    setState({ key: `${from}|${to}`, data: { emps: emps.rows, holidays: hol.rows, specials: sp.rows, schedules: ws.rows, plans: plans.rows }, error: err });
  }, [from, to]);
  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);
  const cur = state?.key === key ? state : null;
  return { data: cur?.data ?? null, error: cur?.error ?? null, reload: load };
}
