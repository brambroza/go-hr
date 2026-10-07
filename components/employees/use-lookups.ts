"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

export type LookupRow = { id: number; code: string; name: string; level?: number };
export interface Lookups {
  branches: LookupRow[];
  orgs: LookupRow[];
  positions: LookupRow[];
  shifts: LookupRow[];
  locations: LookupRow[];
  loaded: boolean;
}

const EMPTY: Lookups = { branches: [], orgs: [], positions: [], shifts: [], locations: [], loaded: false };
let cache: Lookups | null = null;

/** master lists used by employee screens (cached per page load) */
export function useLookups(): Lookups {
  const [v, setV] = useState<Lookups>(cache ?? EMPTY);
  useEffect(() => {
    if (cache) return;
    const sb = supabaseBrowser();
    Promise.all([
      sb.from("branches").select("id, code, name").order("code"),
      sb.from("org_units").select("id, code, name, level").order("level").order("sort_order").order("name"),
      sb.from("positions").select("id, code, name").order("code"),
      sb.from("shifts").select("id, code, name").order("code"),
      sb.from("work_locations").select("id, name").order("name"),
    ]).then(([b, o, p, s, l]) => {
      cache = {
        branches: (b.data as LookupRow[]) ?? [],
        orgs: (o.data as LookupRow[]) ?? [],
        positions: (p.data as LookupRow[]) ?? [],
        shifts: (s.data as LookupRow[]) ?? [],
        locations: ((l.data as { id: number; name: string }[]) ?? []).map((x) => ({ ...x, code: String(x.id) })),
        loaded: true,
      };
      setV(cache);
    });
  }, []);
  return v;
}

export function invalidateLookups() {
  cache = null;
}
