import { supabaseAdmin } from "@/lib/supabase/admin";
import { deviceByKey } from "@/lib/attendance/device";
import { KioskScreen } from "@/components/attendance/kiosk-screen";

export const metadata = { title: "จุดลงเวลา", robots: { index: false } };
export const dynamic = "force-dynamic";

/** Public full-screen kiosk: /kiosk?key=<time_devices.api_key> — shows a QR that rotates every 30 s */
export default async function KioskPage({ searchParams }: PageProps<"/kiosk">) {
  const sp = await searchParams;
  const key = typeof sp.key === "string" ? sp.key : "";
  const device = await deviceByKey(key);
  let company = "GO HR";
  let logo: string | null = null;
  let location: string | null = null;
  if (device) {
    const sb = supabaseAdmin();
    const [{ data: c }, { data: l }] = await Promise.all([
      sb.from("settings").select("value").eq("key", "company").maybeSingle(),
      device.location_id ? sb.from("work_locations").select("name").eq("id", device.location_id).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    const v = (c?.value ?? {}) as { name?: string; logo_url?: string | null };
    company = v.name || company;
    logo = v.logo_url ?? null;
    location = (l as { name: string } | null)?.name ?? null;
  }
  return <KioskScreen deviceKey={device ? key : null} company={company} logo={logo} location={location} deviceName={device?.name ?? null} hasLocation={!!device?.location_id} />;
}
