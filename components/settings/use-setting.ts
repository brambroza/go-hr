"use client";
import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { toast } from "@/components/ui";

/** Load a settings row merged over defaults; save() upserts it (RLS: settings edit). */
export function useSetting<T extends object>(key: string, defaults: T, opts: { isPublic?: boolean } = {}) {
  const sb = supabaseBrowser();
  const [value, setValue] = useState<T | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await sb.from("settings").select("value").eq("key", key).maybeSingle();
    if (error) toast.error(error.message);
    setValue({ ...defaults, ...((data?.value as Partial<T>) ?? {}) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sb, key]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (v: T, msg = "บันทึกการตั้งค่าแล้ว") => {
    setSaving(true);
    const { data: auth } = await sb.auth.getUser();
    const row: Record<string, unknown> = { key, value: v, updated_at: new Date().toISOString(), updated_by: auth.user?.id ?? null };
    if (opts.isPublic !== undefined) row.is_public = opts.isPublic;
    const { error } = await sb.from("settings").upsert(row);
    setSaving(false);
    if (error) {
      toast.error(`บันทึกไม่ได้: ${error.message}`);
      return false;
    }
    setValue(v);
    toast.ok(msg);
    return true;
  };

  return { value, setValue, save, saving, reload: load };
}
