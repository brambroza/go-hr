import "server-only";
import { cache } from "react";
import { supabaseServer } from "./supabase/server";

export interface CompanySettings {
  name: string;
  name_en?: string;
  tax_id?: string;
  branch_no?: string;
  address?: string;
  phone?: string;
  email?: string;
  logo_url?: string | null;
  primary_color?: string;
}

export const getCompany = cache(async (): Promise<CompanySettings> => {
  const sb = await supabaseServer();
  const { data } = await sb.from("settings").select("value").eq("key", "company").maybeSingle();
  const v = (data?.value as Partial<CompanySettings>) ?? {};
  return { ...v, name: v.name || "GO HR" };
});

export async function getSetting<T = Record<string, unknown>>(key: string, fallback: T): Promise<T> {
  const sb = await supabaseServer();
  const { data } = await sb.from("settings").select("value").eq("key", key).maybeSingle();
  return { ...fallback, ...((data?.value as T) ?? {}) };
}
