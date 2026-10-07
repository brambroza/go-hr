"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { EmpOption } from "@/components/crud/employee-picker";

export type PayItemLite = { id: number; code: string; name: string; category: string; direction: number; system_key: string | null; is_active: boolean; calc_type: string };

/** employees (v_directory incl. resigned is not available, so active only) + pay items + org units + branches */
export function usePayrollLookups() {
  const [state, setState] = useState<{
    emps: EmpOption[];
    items: PayItemLite[];
    orgs: { id: number; name: string }[];
    branches: { id: number; name: string }[];
    loaded: boolean;
  }>({ emps: [], items: [], orgs: [], branches: [], loaded: false });
  useEffect(() => {
    const sb = supabaseBrowser();
    Promise.all([
      sb.from("v_directory").select("id, code, first_name, last_name, nickname, org_unit_id, position_id, branch_id").order("code").limit(5000),
      sb.from("pay_items").select("id, code, name, category, direction, system_key, is_active, calc_type").order("sort_order"),
      sb.from("org_units").select("id, name").order("sort_order").order("name"),
      sb.from("branches").select("id, name").order("code"),
    ]).then(([e, i, o, b]) => {
      setState({
        emps: ((e.data ?? []) as { id: number; code: string; first_name: string; last_name: string; nickname: string | null }[]).map((r) => ({ value: r.id, label: `${r.first_name} ${r.last_name}${r.nickname ? ` (${r.nickname})` : ""}`, raw: r })),
        items: (i.data as PayItemLite[]) ?? [],
        orgs: (o.data as { id: number; name: string }[]) ?? [],
        branches: (b.data as { id: number; name: string }[]) ?? [],
        loaded: true,
      });
    });
  }, []);
  return state;
}
