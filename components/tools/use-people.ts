"use client";
import { useCallback, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

export type Person = { userId: string; employeeId: number | null; name: string; photo: string | null; position: string | null };
export type DirRow = { id: number; code: string; first_name: string; last_name: string; nickname: string | null; photo_url: string | null; position_name: string | null; org_unit_name: string | null };

/** Resolve auth user ids → display name / photo (profiles → v_directory), cached per component */
export function usePeople() {
  const cache = useRef(new Map<string, Person>());
  const [, bump] = useState(0);
  const load = useCallback(async (userIds: string[]) => {
    const missing = [...new Set(userIds)].filter((u) => u && !cache.current.has(u));
    if (!missing.length) return;
    const sb = supabaseBrowser();
    const { data: profData } = await sb.from("profiles").select("id, display_name, username, employee_id").in("id", missing);
    const profs = (profData ?? []) as { id: string; display_name: string | null; username: string | null; employee_id: number | null }[];
    const empIds = profs.map((p) => p.employee_id).filter(Boolean) as number[];
    const { data: empData } = empIds.length ? await sb.from("v_directory").select("id, first_name, last_name, nickname, photo_url, position_name").in("id", empIds) : { data: [] };
    const emps = (empData ?? []) as { id: number; first_name: string; last_name: string; nickname: string | null; photo_url: string | null; position_name: string | null }[];
    const byEmp = new Map(emps.map((e) => [e.id, e]));
    for (const p of profs) {
      const e = p.employee_id ? byEmp.get(p.employee_id) : undefined;
      cache.current.set(p.id, {
        userId: p.id,
        employeeId: p.employee_id ?? null,
        name: e ? `${e.first_name} ${e.last_name}${e.nickname ? ` (${e.nickname})` : ""}` : p.display_name || p.username || "ผู้ใช้",
        photo: e?.photo_url ?? null,
        position: e?.position_name ?? null,
      });
    }
    for (const u of missing) if (!cache.current.has(u)) cache.current.set(u, { userId: u, employeeId: null, name: "ผู้ใช้", photo: null, position: null });
    bump((n) => n + 1);
  }, []);
  const get = useCallback((u: string | null | undefined): Person => (u && cache.current.get(u)) || { userId: u ?? "", employeeId: null, name: "…", photo: null, position: null }, []);
  return { load, get };
}

/** Whole active directory (small: SME factories) — for pickers */
export function useDirectory() {
  const [rows, setRows] = useState<DirRow[] | null>(null);
  const loading = useRef(false);
  const ensure = useCallback(async () => {
    if (rows || loading.current) return;
    loading.current = true;
    const { data } = await supabaseBrowser().from("v_directory").select("id, code, first_name, last_name, nickname, photo_url, position_name, org_unit_name").order("code").limit(5000);
    setRows((data ?? []) as DirRow[]);
  }, [rows]);
  return { rows, ensure };
}

/** "5 นาทีที่แล้ว" */
export function timeAgo(ts: string): string {
  const s = (Date.now() - Date.parse(ts)) / 1000;
  if (s < 60) return "เมื่อสักครู่";
  if (s < 3600) return `${Math.floor(s / 60)} นาทีที่แล้ว`;
  if (s < 86400) return `${Math.floor(s / 3600)} ชั่วโมงที่แล้ว`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} วันที่แล้ว`;
  const d = new Date(ts);
  return d.toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", year: "numeric" });
}
