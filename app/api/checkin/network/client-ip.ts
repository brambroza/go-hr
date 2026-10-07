import { isIP } from "node:net";

/** Normalize one address: strip brackets / port / zone, IPv4-mapped IPv6 → IPv4. Returns null when invalid. */
export function normalizeIp(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = raw.trim().replace(/^"|"$/g, "");
  if (!s) return null;
  const bracket = /^\[([^\]]+)\](?::\d+)?$/.exec(s); // [::1]:443
  if (bracket) s = bracket[1];
  else if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(s)) s = s.replace(/:\d+$/, ""); // 1.2.3.4:5678
  s = s.replace(/%.*$/, ""); // fe80::1%eth0
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(s);
  if (mapped) s = mapped[1];
  return isIP(s) ? s.toLowerCase() : null;
}

/**
 * Client IP as seen by the reverse proxy. Caddy (≥2.5) overwrites X-Forwarded-For with the real peer address
 * unless the peer is a configured trusted proxy, so the FIRST hop is the client. The app container must not be
 * reachable directly (deploy/docker-compose.yml publishes only Caddy), otherwise the header could be forged.
 */
export function clientIpFrom(h: { get(name: string): string | null }): string | null {
  const xff = h.get("x-forwarded-for");
  if (xff) {
    const first = normalizeIp(xff.split(",")[0]);
    if (first) return first;
  }
  return normalizeIp(h.get("x-real-ip"));
}
