"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

export interface ReqLookups {
  types: { code: string; name: string; name_en: string | null; category: string; is_active: boolean; sort_order: number }[];
  orgUnits: { id: number; name: string; level: number; parent_id: number | null }[];
  branches: { id: number; name: string }[];
  leaveTypes: { id: number; name: string; color: string | null }[];
  roles: { code: string; name: string }[];
}

const EMPTY: ReqLookups = { types: [], orgUnits: [], branches: [], leaveTypes: [], roles: [] };
let cache: Promise<ReqLookups> | null = null;

export function loadReqLookups(force = false): Promise<ReqLookups> {
  if (!cache || force) {
    const sb = supabaseBrowser();
    cache = Promise.all([
      sb.from("request_types").select("code, name, name_en, category, is_active, sort_order").order("sort_order"),
      sb.from("org_units").select("id, name, level, parent_id").eq("is_active", true).order("level").order("sort_order").order("name"),
      sb.from("branches").select("id, name").order("code"),
      sb.from("leave_types").select("id, name, color").order("sort_order"),
      sb.from("role_groups").select("code, name").order("name"),
    ]).then(([t, o, b, l, r]) => ({
      types: (t.data ?? []) as ReqLookups["types"],
      orgUnits: (o.data ?? []) as ReqLookups["orgUnits"],
      branches: (b.data ?? []) as ReqLookups["branches"],
      leaveTypes: (l.data ?? []) as ReqLookups["leaveTypes"],
      roles: (r.data ?? []) as ReqLookups["roles"],
    }));
    cache.catch(() => (cache = null));
  }
  return cache;
}

export function useReqLookups(): ReqLookups {
  const [v, setV] = useState<ReqLookups>(EMPTY);
  useEffect(() => {
    let alive = true;
    loadReqLookups().then((x) => alive && setV(x));
    return () => {
      alive = false;
    };
  }, []);
  return v;
}

/** org unit options indented by level */
export function orgOptions(units: ReqLookups["orgUnits"]): { value: string; label: string }[] {
  const byParent = new Map<number | null, ReqLookups["orgUnits"]>();
  for (const u of units) {
    const k = u.parent_id && units.some((x) => x.id === u.parent_id) ? u.parent_id : null;
    byParent.set(k, [...(byParent.get(k) ?? []), u]);
  }
  const out: { value: string; label: string }[] = [];
  const walk = (p: number | null, depth: number) => {
    for (const u of byParent.get(p) ?? []) {
      out.push({ value: String(u.id), label: `${"  ".repeat(depth)}${u.name}` });
      walk(u.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}
