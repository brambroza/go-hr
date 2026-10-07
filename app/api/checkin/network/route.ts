import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { clientIpFrom } from "./client-ip";

export const dynamic = "force-dynamic";

// "Wi-Fi บริษัท" check-in: browsers cannot read the Wi-Fi name, so we match the client IP (as seen by Caddy)
// against work_locations.allowed_ip_ranges. The IP and the location are derived here on the server; the
// recording RPC (check_in_network) is executable only by the service role and re-validates everything.

const Body = z.object({
  direction: z.enum(["auto", "in", "out", "break_out", "break_in"]).default("auto"),
  client_ref: z.string().max(80).optional(),
  note: z.string().max(500).optional(),
  photo_url: z.string().max(500).optional(),
});

const noStore = { "Cache-Control": "no-store" };
const notOnNetwork = (ip: string | null) =>
  `เครื่องของคุณไม่ได้ต่อ Wi-Fi ของบริษัท (IP ${ip ?? "ไม่ทราบ"}) — เชื่อมต่อ Wi-Fi ของบริษัทแล้วลองใหม่ หรือใช้วิธี GPS / QR แทน`;

async function resolve(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return { error: NextResponse.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401, headers: noStore }) };
  const ip = clientIpFrom(req.headers);
  if (!ip) return { user: auth.user, ip, locations: [] as { id: number; name: string }[] };
  const { data, error } = await sb.rpc("match_network_location", { p_ip: ip });
  if (error) return { error: NextResponse.json({ error: error.message }, { status: 400, headers: noStore }) };
  return { user: auth.user, ip, locations: (data ?? []) as { id: number; name: string }[] };
}

/** Preview: which office network am I on? */
export async function GET(req: NextRequest) {
  const r = await resolve(req);
  if ("error" in r && r.error) return r.error;
  const { ip, locations } = r as { ip: string | null; locations: { id: number; name: string }[] };
  return NextResponse.json({ ip, locations, message: locations.length ? null : notOnNetwork(ip) }, { headers: noStore });
}

/** Record the check-in */
export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400, headers: noStore });
  const r = await resolve(req);
  if ("error" in r && r.error) return r.error;
  const { user, ip, locations } = r as { user: { id: string }; ip: string | null; locations: { id: number; name: string }[] };
  if (!locations.length) return NextResponse.json({ error: notOnNetwork(ip), ip }, { status: 403, headers: noStore });

  const b = parsed.data;
  const { data, error } = await supabaseAdmin().rpc("check_in_network", {
    p_user_id: user.id,
    p_ip: ip,
    p_location_id: locations[0].id,
    p_direction: b.direction,
    p_client_ref: b.client_ref ?? null,
    p_note: b.note ?? null,
    p_photo_url: b.photo_url ?? null,
  });
  if (error) return NextResponse.json({ error: error.message, ip }, { status: 400, headers: noStore });
  return NextResponse.json({ ...(data as object), ip }, { headers: noStore });
}
