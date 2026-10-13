// Per-IP throttle for the sign-in action (in-memory; GO HR runs as a single on-prem instance).
// The per-account lockout lives in the database (login_failures); this only slows down one source hammering
// many accounts. Pure so it can be unit tested.

export interface RateWindow {
  /** attempts allowed per window */
  limit: number;
  /** window length in ms */
  windowMs: number;
}

export const LOGIN_RATE: RateWindow = { limit: 30, windowMs: 5 * 60_000 };

const buckets = new Map<string, number[]>();

/**
 * Record one attempt for `key` and say whether it is still within the limit.
 * @param now - injectable clock for tests
 */
export function allowAttempt(key: string, now = Date.now(), rate: RateWindow = LOGIN_RATE, store: Map<string, number[]> = buckets): boolean {
  const since = now - rate.windowMs;
  const list = (store.get(key) ?? []).filter((t) => t > since);
  list.push(now);
  store.set(key, list);
  if (store.size > 10_000) {
    // forget idle sources so the map cannot grow without bound
    for (const [k, v] of store) if (!v.some((t) => t > since)) store.delete(k);
  }
  return list.length <= rate.limit;
}
