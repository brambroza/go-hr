"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { EmpOption } from "@/components/crud/employee-picker";

export interface DirRow { id: number; code: string; first_name: string; last_name: string; nickname: string | null; photo_url: string | null; position_id: number | null; org_unit_id: number | null; branch_id: number | null; supervisor_id: number | null; status: string; position_name: string | null; org_unit_name: string | null }

let cache: DirRow[] | null = null;
let inflight: Promise<DirRow[]> | null = null;

function load(): Promise<DirRow[]> {
  if (cache) return Promise.resolve(cache);
  inflight ??= Promise.resolve(
    supabaseBrowser()
      .from("v_directory")
      .select("id, code, first_name, last_name, nickname, photo_url, position_id, org_unit_id, branch_id, supervisor_id, status, position_name, org_unit_name")
      .order("code")
      .limit(10000),
  ).then(({ data }) => (cache = (data as DirRow[]) ?? []));
  return inflight;
}

/** employee directory (safe columns) cached per page load + picker options */
export function useDirectory() {
  const [rows, setRows] = useState<DirRow[]>(cache ?? []);
  useEffect(() => {
    let alive = true;
    load().then((r) => alive && setRows(r));
    return () => {
      alive = false;
    };
  }, []);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const options: EmpOption[] = rows.filter((r) => r.status !== "resigned").map((r) => ({ value: r.id, label: `${r.first_name} ${r.last_name}${r.nickname ? ` (${r.nickname})` : ""}`, raw: r as unknown as Record<string, unknown> }));
  const name = (id: number | null | undefined) => {
    const r = id != null ? byId.get(id) : undefined;
    return r ? `${r.first_name} ${r.last_name}` : "-";
  };
  return { rows, byId, options, name, loaded: rows.length > 0 };
}

export function invalidateDirectory() {
  cache = null;
  inflight = null;
}
