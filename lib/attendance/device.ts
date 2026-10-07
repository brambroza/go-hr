import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { fetchAll } from "./server";

export interface DeviceRow {
  id: number;
  name: string;
  device_type: string;
  branch_id: number | null;
  location_id: number | null;
  is_active: boolean;
}

/** Find an active device by api key (constant-time comparison is done by the DB index lookup on a random 48-hex key). */
export async function deviceByKey(key: string | null | undefined): Promise<DeviceRow | null> {
  const k = String(key ?? "").trim();
  if (!/^[0-9a-f]{16,128}$/i.test(k)) return null;
  const { data } = await supabaseAdmin().from("time_devices").select("id, name, device_type, branch_id, location_id, is_active").eq("api_key", k).eq("is_active", true).maybeSingle();
  return (data as DeviceRow) ?? null;
}

/** map device user id / employee code → employee id (device-specific maps win over global maps over codes) */
export async function resolveDeviceUsers(deviceId: number, users: string[]): Promise<Map<string, number>> {
  const sb = supabaseAdmin();
  const uniq = [...new Set(users.filter(Boolean))];
  const out = new Map<string, number>();
  if (!uniq.length) return out;
  for (let i = 0; i < uniq.length; i += 200) {
    const part = uniq.slice(i, i + 200);
    const [maps, emps] = await Promise.all([
      fetchAll<{ device_user_id: string; employee_id: number; device_id: number | null }>(() =>
        sb.from("device_user_maps").select("device_user_id, employee_id, device_id").in("device_user_id", part).or(`device_id.is.null,device_id.eq.${deviceId}`).order("employee_id"),
      ),
      fetchAll<{ id: number; code: string }>(() => sb.from("employees").select("id, code").in("code", part).order("id")),
    ]);
    for (const e of emps) out.set(e.code, Number(e.id));
    for (const m of maps.filter((m) => m.device_id == null)) out.set(m.device_user_id, Number(m.employee_id));
    for (const m of maps.filter((m) => m.device_id != null)) out.set(m.device_user_id, Number(m.employee_id));
  }
  return out;
}
