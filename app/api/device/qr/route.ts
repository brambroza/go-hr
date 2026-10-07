import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { deviceByKey } from "@/lib/attendance/device";
import { kioskToken } from "@/lib/attendance/qr";

export const dynamic = "force-dynamic";

/**
 * Rotating QR token for kiosk screens.
 *   GET /api/device/qr   header x-device-key (or ?key=) → { token, location, expires_in, server_time }
 * Token format equals SQL public.kiosk_qr_token (check_in accepts ±2 minutes).
 */
export async function GET(req: NextRequest) {
  const key = req.headers.get("x-device-key") ?? req.nextUrl.searchParams.get("key");
  const device = await deviceByKey(key);
  if (!device) return NextResponse.json({ ok: false, error: "invalid device key" }, { status: 401 });
  if (!device.location_id) return NextResponse.json({ ok: false, error: "ยังไม่ได้ผูกอุปกรณ์นี้กับพื้นที่ลงเวลา" }, { status: 409 });

  const sb = supabaseAdmin();
  const { data: loc } = await sb.from("work_locations").select("id, name, qr_secret, is_active, allow_qr").eq("id", device.location_id).maybeSingle();
  if (!loc || !loc.is_active || !loc.allow_qr) return NextResponse.json({ ok: false, error: "พื้นที่ลงเวลานี้ไม่ได้เปิดให้ลงเวลาด้วย QR" }, { status: 409 });

  const now = Date.now();
  const minute = Math.floor(now / 60_000);
  await sb.from("time_devices").update({ last_seen_at: new Date(now).toISOString() }).eq("id", device.id);
  return NextResponse.json(
    {
      ok: true,
      token: kioskToken(Number(loc.id), String(loc.qr_secret), minute),
      location: loc.name,
      device: device.name,
      expires_in: 60 - Math.floor((now % 60_000) / 1000),
      server_time: new Date(now).toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
