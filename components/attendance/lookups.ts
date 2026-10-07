"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { ShiftDef } from "@/lib/attendance/engine";

export type Opt = { id: number; code: string; name: string };
export type ShiftOpt = ShiftDef & { id: number; code: string; name: string; color: string | null; is_active: boolean };
export type EmpOpt = { id: number; code: string; first_name: string; last_name: string; nickname: string | null; org_unit_id: number | null; branch_id: number | null; position_name: string | null; org_unit_name: string | null; supervisor_id: number | null };

export interface AttLookups {
  branches: Opt[];
  orgs: (Opt & { parent_id: number | null })[];
  shifts: ShiftOpt[];
  locations: { id: number; name: string; branch_id: number | null }[];
  loaded: boolean;
}

const EMPTY: AttLookups = { branches: [], orgs: [], shifts: [], locations: [], loaded: false };
let cache: AttLookups | null = null;
let pending: Promise<AttLookups> | null = null;

async function load(): Promise<AttLookups> {
  const sb = supabaseBrowser();
  const [b, o, s, l] = await Promise.all([
    sb.from("branches").select("id, code, name").order("code"),
    sb.from("org_units").select("id, code, name, parent_id").order("level").order("sort_order").order("name"),
    sb.from("shifts").select("*").order("code"),
    sb.from("work_locations").select("id, name, branch_id").order("name"),
  ]);
  return {
    branches: (b.data as Opt[]) ?? [],
    orgs: (o.data as AttLookups["orgs"]) ?? [],
    shifts: (s.data as ShiftOpt[]) ?? [],
    locations: (l.data as AttLookups["locations"]) ?? [],
    loaded: true,
  };
}

/** master data for attendance screens (cached per page load; call invalidateAttLookups() after edits) */
export function useAttLookups(): AttLookups {
  const [v, setV] = useState<AttLookups>(cache ?? EMPTY);
  useEffect(() => {
    if (cache) return;
    pending ??= load();
    pending.then((x) => {
      cache = x;
      setV(x);
    });
  }, []);
  return v;
}

export function invalidateAttLookups() {
  cache = null;
  pending = null;
}

/** employees visible to the current user (RLS: HR scope, or self + subordinates for supervisors) */
export function useEmployees(): { list: EmpOpt[]; loaded: boolean } {
  const [v, setV] = useState<{ list: EmpOpt[]; loaded: boolean }>({ list: [], loaded: false });
  useEffect(() => {
    let alive = true;
    supabaseBrowser()
      .from("v_directory")
      .select("id, code, first_name, last_name, nickname, org_unit_id, branch_id, position_name, org_unit_name, supervisor_id")
      .order("code")
      .limit(5000)
      .then(({ data }: { data: unknown }) => alive && setV({ list: (data as EmpOpt[]) ?? [], loaded: true }));
    return () => {
      alive = false;
    };
  }, []);
  return v;
}

export const empName = (e: Pick<EmpOpt, "first_name" | "last_name" | "nickname"> | null | undefined) =>
  e ? `${e.first_name} ${e.last_name}${e.nickname ? ` (${e.nickname})` : ""}` : "-";

/** org unit + all descendants */
export function orgSubtree(orgs: { id: number; parent_id: number | null }[], root: number): Set<number> {
  const out = new Set<number>([root]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const o of orgs) if (o.parent_id != null && out.has(o.parent_id) && !out.has(o.id)) {
      out.add(o.id);
      grew = true;
    }
  }
  return out;
}

/** readable text color for a background hex */
export function textOn(hex: string | null | undefined): string {
  const h = (hex ?? "#10b981").replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? "#111827" : "#ffffff";
}
