// Service-worker helpers shared by the app and the tests. public/sw.js cannot import TypeScript, so the
// no-cache list is duplicated there; tests/pwa.test.ts checks that both copies agree.

/** Employee-app pages that must never be served from the offline page cache (personal / salary data) */
export const NO_CACHE_PATTERNS: RegExp[] = [
  /^\/m\/payslips(\/|$)/,
  /^\/m\/profile(\/|$)/,
  /^\/m\/evaluations(\/|$)/,
  /^\/m\/approvals(\/|$)/,
  /^\/m\/team(\/|$)/,
  /^\/m\/requests(\/|$)/,
  /^\/m\/leave(\/|$)/,
  /^\/m\/calendar(\/|$)/,
  /^\/m\/todos(\/|$)/,
  /^\/m\/feed(\/|$)/,
  /^\/m\/notifications(\/|$)/,
];

/** Pages pre-cached for offline check-in; they are personalised, so sign-out removes them as well */
export const PRECACHED_PERSONAL = ["/m", "/m/checkin"];

/** May this navigation be stored for offline use? Only /m pages that carry no personal data. */
export function shouldCachePage(pathname: string): boolean {
  if (!pathname.startsWith("/m")) return false;
  return !NO_CACHE_PATTERNS.some((r) => r.test(pathname));
}

/**
 * Forget every cached page on sign-out: the page cache and the personalised shell pages.
 * Done from the window (the Cache API is shared with the worker), so it works even when no worker controls the page;
 * the worker is told as well so it can drop what it holds in memory. Best effort, never throws.
 */
export async function clearSwPages(): Promise<void> {
  try {
    if (typeof caches === "undefined") return;
    const keys = await caches.keys();
    for (const k of keys) {
      if (!k.startsWith("gohr-")) continue;
      if (k.endsWith("-pages")) {
        await caches.delete(k);
      } else {
        const c = await caches.open(k);
        for (const p of PRECACHED_PERSONAL) await c.delete(p, { ignoreSearch: true });
      }
    }
    const ctrl = typeof navigator !== "undefined" ? navigator.serviceWorker?.controller : null;
    if (ctrl) {
      await new Promise<void>((resolve) => {
        const ch = new MessageChannel();
        const t = setTimeout(resolve, 500);
        ch.port1.onmessage = () => {
          clearTimeout(t);
          resolve();
        };
        ctrl.postMessage({ type: "clearPages" }, [ch.port2]);
      });
    }
  } catch {
    /* best effort */
  }
}
