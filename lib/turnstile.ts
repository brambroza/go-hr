// Cloudflare Turnstile (bot check) — server-side verification of the widget token.
// Pure + injectable fetch so it can be unit tested (tests/trial.test.ts).
// Docs: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/

/** Origin that serves the widget script and its iframe (added to the CSP when Turnstile is on) */
export const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";
export const TURNSTILE_SCRIPT = `${TURNSTILE_ORIGIN}/turnstile/v0/api.js?render=explicit`;
const VERIFY_URL = `${TURNSTILE_ORIGIN}/turnstile/v0/siteverify`;

export interface TurnstileResult {
  ok: boolean;
  /** Cloudflare error codes, or our own: missing-input-secret, missing-input-response, network-error, hostname-mismatch */
  codes: string[];
}

type FetchLike = (url: string, init: { method: string; body: URLSearchParams; signal?: AbortSignal }) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;

/**
 * Verify a Turnstile token with Cloudflare. Fails closed: a missing secret, a network error or a
 * hostname that does not match `expectedHostname` all count as "not verified".
 * @param token - value of the `cf-turnstile-response` form field
 * @param secret - TURNSTILE_SECRET_KEY
 * @param remoteIp - visitor IP (optional, helps Cloudflare's scoring)
 * @param expectedHostname - when set, the token must have been issued on this hostname
 */
export async function verifyTurnstile(
  token: string | null | undefined,
  secret: string | null | undefined,
  remoteIp?: string | null,
  expectedHostname?: string | null,
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
): Promise<TurnstileResult> {
  if (!secret) return { ok: false, codes: ["missing-input-secret"] };
  if (!token || token.length > 2048) return { ok: false, codes: ["missing-input-response"] };
  const body = new URLSearchParams({ secret, response: token });
  if (remoteIp) body.set("remoteip", remoteIp);
  try {
    const res = await fetchImpl(VERIFY_URL, { method: "POST", body, signal: AbortSignal.timeout(10_000) });
    const j = (await res.json()) as { success?: boolean; hostname?: string; "error-codes"?: string[] };
    if (!j.success) return { ok: false, codes: j["error-codes"] ?? ["verify-failed"] };
    if (expectedHostname && j.hostname && j.hostname !== expectedHostname) return { ok: false, codes: ["hostname-mismatch"] };
    return { ok: true, codes: [] };
  } catch {
    return { ok: false, codes: ["network-error"] };
  }
}
