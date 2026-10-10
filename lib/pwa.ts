// Service-worker helpers shared by the app and the tests. public/sw.js cannot import TypeScript, so the
// no-cache list is duplicated there; tests/pwa.test.ts checks that both copies agree.

/** Employee-app pages that must never be served from the offline page cache (personal / salary data) */
export const NO_CACHE_PATTERNS: RegExp[] = [
  /^\/m\/payslips(\/|$)/,
  /^\/m\/profile(\/|$)/,
  /^\/m\/evaluations(\/|$)/,
  /^\/m\/approvals(\/|$)/,
  /^\/m\/team(\/|$)/,
  /^\/m\/requests\/\d+/,
];

/** May this navigation be stored for offline use? Only /m pages that carry no personal data. */
export function shouldCachePage(pathname: string): boolean {
  if (!pathname.startsWith("/m")) return false;
  return !NO_CACHE_PATTERNS.some((r) => r.test(pathname));
}

/** Ask the active service worker to drop its page cache (sign-out). Best effort: resolves after 500 ms at most. */
export function clearSwPages(): Promise<void> {
  return new Promise((resolve) => {
    try {
      const ctrl = typeof navigator !== "undefined" ? navigator.serviceWorker?.controller : null;
      if (!ctrl) return resolve();
      const ch = new MessageChannel();
      const t = setTimeout(resolve, 500);
      ch.port1.onmessage = () => {
        clearTimeout(t);
        resolve();
      };
      ctrl.postMessage({ type: "clearPages" }, [ch.port2]);
    } catch {
      resolve();
    }
  });
}
