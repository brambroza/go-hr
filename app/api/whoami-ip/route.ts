import { NextResponse, type NextRequest } from "next/server";
import { clientIpFrom } from "../checkin/network/client-ip";

export const dynamic = "force-dynamic";

// Echoes the caller's IP as the server sees it — used by "ใช้ IP ปัจจุบันของฉัน" on the work-locations page.
// Signed-in users only (proxy.ts returns 401 for anonymous /api calls).
export async function GET(req: NextRequest) {
  const ip = clientIpFrom(req.headers);
  return NextResponse.json({ ip, cidr: ip ? `${ip}/${ip.includes(":") ? 128 : 32}` : null }, { headers: { "Cache-Control": "no-store" } });
}
