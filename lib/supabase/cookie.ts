// Same auth cookie name on browser and server, even when the server reaches Supabase
// through an internal URL (e.g. http://kong:8000) — the default name is derived from the URL host.
export const AUTH_COOKIE = { name: "gohr-auth" };

/**
 * "Remember me" support. @supabase/ssr always writes the auth cookie with a 400-day max-age; when the user
 * unticks "จดจำฉันไว้" on the login page we set this marker as a *session* cookie and every place that writes
 * the auth cookie (browser client, server client, proxy) strips the persistence so the login ends with the browser.
 */
export const SESSION_ONLY_COOKIE = "gohr-session-only";

/** Remembered username for the login form (localStorage key) */
export const REMEMBER_LOGIN_KEY = "gohr.login";

interface CookieLike {
  maxAge?: number;
  expires?: Date;
  [k: string]: unknown;
}

/** Drop max-age / expires when the session must end with the browser; otherwise return the options untouched */
export function persistCookieOptions<T extends CookieLike>(options: T, sessionOnly: boolean): T {
  if (!sessionOnly) return options;
  const { maxAge: _m, expires: _e, ...rest } = options;
  void _m;
  void _e;
  return rest as T;
}

/** Whether a cookie list (name/value pairs) carries the session-only marker */
export function hasSessionOnlyMarker(cookies: { name: string; value: string }[]): boolean {
  return cookies.some((c) => c.name === SESSION_ONLY_COOKIE && c.value === "1");
}
