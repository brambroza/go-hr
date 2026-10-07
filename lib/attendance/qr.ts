import { createHmac } from "node:crypto";

/** Same format as SQL public.kiosk_qr_token: `<location_id>.<unix_minute>.<hex hmac sha256(location_id.minute, qr_secret)>` */
export function kioskToken(locationId: number, secret: string, minute = Math.floor(Date.now() / 60_000)): string {
  const msg = `${locationId}.${minute}`;
  return `${msg}.${createHmac("sha256", secret).update(msg).digest("hex")}`;
}
