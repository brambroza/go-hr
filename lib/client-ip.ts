// Visitor IP for rate limits / bot checks. Pure (takes a Headers-like getter) so it can be unit tested.
//
// Behind Cloudflare the real visitor IP is in CF-Connecting-IP. That header is only trusted when
// TRUST_CLOUDFLARE=1, because without Cloudflare in front anyone can send it and dodge the rate limit.
// Otherwise the first X-Forwarded-For hop (set by Caddy) is used, then X-Real-IP.

type HeaderGetter = { get(name: string): string | null };

const IP_RE = /^[0-9a-fA-F:.]{2,45}$/;

/**
 * @param headers - request headers
 * @param trustCloudflare - true when the app is only reachable through Cloudflare (TRUST_CLOUDFLARE=1)
 * @returns an IP string, or "local" when nothing usable is present
 */
export function clientIp(headers: HeaderGetter, trustCloudflare: boolean): string {
  const candidates = [
    trustCloudflare ? headers.get("cf-connecting-ip") : null,
    (headers.get("x-forwarded-for") ?? "").split(",")[0],
    headers.get("x-real-ip"),
  ];
  for (const c of candidates) {
    const v = (c ?? "").trim();
    if (v && IP_RE.test(v)) return v;
  }
  return "local";
}
