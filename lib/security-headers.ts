// HTTP security headers — pure helpers used by proxy.ts (per-request CSP with nonce) and next.config.ts
// (static headers). Unit tested in tests/security-headers.test.ts.
//
// Content-Security-Policy is sent in **Report-Only** mode first (CSP_ENFORCE=1 switches to enforcing):
// violations are posted to /api/csp-report and show up in the app log, nothing is blocked yet. Run with
// report-only for a couple of weeks on a real customer, fix what it reports, then enforce.

export interface CspInput {
  /** per-request random value; every inline <script> the server renders carries nonce="..." */
  nonce: string;
  /** public Supabase URL (storage / auth / realtime) — may be the app's own origin behind Caddy */
  supabaseUrl?: string | null;
  /** development build: Next's dev tooling needs eval + websocket HMR */
  dev?: boolean;
  /** extra origins allowed for connect/img (e.g. a LINE LIFF SDK host) — from CSP_EXTRA_ORIGINS */
  extraOrigins?: string[];
  /** Cloudflare Turnstile widget on the page (trial sign-up): allow its script host + iframe */
  turnstile?: boolean;
}

/** Turnstile widget host — kept here so this module stays dependency free */
const TURNSTILE_HOST = "https://challenges.cloudflare.com";

/** origin (scheme://host[:port]) of a URL, or null when it is not a valid absolute URL */
export function originOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (!["http:", "https:"].includes(u.protocol) || !u.host) return null;
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

/** Build the CSP header value */
export function buildCsp(i: CspInput): string {
  const sb = originOf(i.supabaseUrl);
  const extra = (i.extraOrigins ?? []).map(originOf).filter((x): x is string => !!x);
  const remote = [...new Set([sb, ...extra].filter((x): x is string => !!x))];
  const ws = remote.map((o) => o.replace(/^http/, "ws"));
  const script = [`'self'`, `'nonce-${i.nonce}'`, `'strict-dynamic'`, `'wasm-unsafe-eval'`];
  if (i.dev) script.push(`'unsafe-eval'`);
  // host allow-list is ignored by browsers that honour 'strict-dynamic' (the <script> carries the nonce);
  // it is the fallback for older browsers
  if (i.turnstile) script.push(TURNSTILE_HOST);
  const cf = i.turnstile ? [TURNSTILE_HOST] : [];
  const directives: [string, string[]][] = [
    ["default-src", [`'self'`]],
    ["base-uri", [`'self'`]],
    ["object-src", [`'none'`]],
    ["frame-ancestors", [`'none'`]],
    ["form-action", [`'self'`]],
    ["script-src", script],
    // Tailwind / inline style attributes from React — nonce-based styles are not practical for an SPA shell
    ["style-src", [`'self'`, `'unsafe-inline'`]],
    ["img-src", [`'self'`, "data:", "blob:", ...remote]],
    ["font-src", [`'self'`, "data:"]],
    ["media-src", [`'self'`, "blob:", ...remote]],
    ["connect-src", [`'self'`, ...remote, ...ws, ...cf, ...(i.dev ? ["ws:", "wss:"] : [])]],
    ["worker-src", [`'self'`, "blob:"]],
    ["frame-src", [`'self'`, "blob:", ...remote, ...cf]],
    ["manifest-src", [`'self'`]],
    ["report-uri", ["/api/csp-report"]],
  ];
  return directives.map(([k, v]) => `${k} ${v.join(" ")}`).join("; ");
}

/** Header name for the CSP: enforce when CSP_ENFORCE=1 (or "true"), otherwise report-only */
export function cspHeaderName(enforce: boolean): "Content-Security-Policy" | "Content-Security-Policy-Report-Only" {
  return enforce ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only";
}

export function isTruthyEnv(v: string | undefined | null): boolean {
  return !!v && ["1", "true", "yes", "on"].includes(v.trim().toLowerCase());
}

/** Headers that do not depend on the request (also set by Caddy in production; harmless to repeat) */
export const STATIC_SECURITY_HEADERS: { key: string; value: string }[] = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // camera: face check-in / selfie; geolocation: GPS check-in; both only for the app's own origin
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(self), payment=(), usb=()" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
];

/** A nonce fit for CSP: 128 random bits, base64 */
export function makeNonce(random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  const bytes = random(16);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
