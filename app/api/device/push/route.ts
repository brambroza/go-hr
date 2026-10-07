import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { deviceByKey, resolveDeviceUsers } from "@/lib/attendance/device";
import { normalizeDirection, parseBangkokTime } from "@/lib/attendance/parse";

export const dynamic = "force-dynamic";

/**
 * Push endpoint for fingerprint / face terminals and middleware.
 *   POST /api/device/push   header: x-device-key: <time_devices.api_key>
 *   body: { logs: [{ user_id | employee_code, time: ISO | 'YYYY-MM-DD HH:mm:ss' (Bangkok), direction? }] }
 * Idempotent (client_ref = deviceId:user:time) — safe to resend the whole buffer.
 * Response: { ok, received, inserted, duplicates, unknown_users: [...], invalid: [...] }
 */
export async function POST(req: NextRequest) {
  const device = await deviceByKey(req.headers.get("x-device-key"));
  if (!device) return NextResponse.json({ ok: false, error: "invalid device key" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "body must be JSON" }, { status: 400 });
  }
  const logs = (body as { logs?: unknown })?.logs;
  if (!Array.isArray(logs)) return NextResponse.json({ ok: false, error: "logs[] is required" }, { status: 400 });
  if (logs.length > 5000) return NextResponse.json({ ok: false, error: "max 5000 logs per request" }, { status: 413 });

  const parsed = logs.map((l, i) => {
    const o = (l ?? {}) as Record<string, unknown>;
    const user = String(o.user_id ?? o.employee_code ?? o.user ?? "").trim();
    const t = parseBangkokTime(typeof o.time === "string" ? o.time : o.time != null ? String(o.time) : "");
    return { i, user, time: t, direction: normalizeDirection(o.direction ?? o.state) };
  });
  const invalid = parsed.filter((p) => !p.user || !p.time || p.time.getTime() > Date.now() + 10 * 60_000).map((p) => p.i);
  const valid = parsed.filter((p) => !invalid.includes(p.i));

  const sb = supabaseAdmin();
  const map = await resolveDeviceUsers(device.id, valid.map((p) => p.user));
  const unknown = [...new Set(valid.filter((p) => !map.has(p.user)).map((p) => p.user))];
  const source = ["fingerprint", "face", "kiosk"].includes(device.device_type) ? device.device_type : "fingerprint";

  const seen = new Set<string>();
  const rows = [];
  for (const p of valid) {
    const emp = map.get(p.user);
    if (!emp) continue;
    const ref = `${device.id}:${p.user}:${p.time!.toISOString()}`;
    if (seen.has(ref)) continue;
    seen.add(ref);
    rows.push({ employee_id: emp, log_time: p.time!.toISOString(), direction: p.direction, source, device_id: device.id, location_id: device.location_id, client_ref: ref });
  }

  let inserted = 0;
  for (let i = 0; i < rows.length; i += 1000) {
    const { data, error } = await sb.from("time_logs").upsert(rows.slice(i, i + 1000), { onConflict: "client_ref", ignoreDuplicates: true }).select("id");
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    inserted += data?.length ?? 0;
  }
  await sb.from("time_devices").update({ last_seen_at: new Date().toISOString() }).eq("id", device.id);

  return NextResponse.json({
    ok: true,
    device: device.name,
    received: logs.length,
    inserted,
    duplicates: rows.length - inserted,
    unknown_users: unknown,
    invalid,
  });
}

/** heartbeat: GET with x-device-key updates last_seen_at */
export async function GET(req: NextRequest) {
  const device = await deviceByKey(req.headers.get("x-device-key"));
  if (!device) return NextResponse.json({ ok: false, error: "invalid device key" }, { status: 401 });
  await supabaseAdmin().from("time_devices").update({ last_seen_at: new Date().toISOString() }).eq("id", device.id);
  return NextResponse.json({ ok: true, device: device.name, server_time: new Date().toISOString() });
}
