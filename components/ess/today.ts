"use client";
import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

export interface TodayScan { id: number; log_time: string; direction: string; source: string; location: string | null; distance: number | null }
export interface TodayInfo {
  date: string;
  employee_id: number;
  day_type: "work" | "off" | "holiday" | "special";
  holiday: string | null;
  attendance_exempt: boolean;
  shift: { id: number; code: string; name: string; color: string | null; start_time: string; end_time: string; break_start: string | null; break_end: string | null; is_overnight: boolean; late_grace_min: number } | null;
  scans: TodayScan[];
  first_scan: string | null;
  late_minutes: number;
  leave: { id: number; doc_no: string; status: string; unit: string; leave_type: string | null; color: string | null; start_date: string; end_date: string }[];
}

/** public.my_today() — shift, day type, scans, leave for the signed-in employee */
export function useToday() {
  const [data, setData] = useState<TodayInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    const { data, error } = await supabaseBrowser().rpc("my_today");
    if (!error) setData(data as TodayInfo);
    setLoading(false);
  }, []);
  useEffect(() => {
    reload();
  }, [reload]);
  return { data, loading, reload };
}
