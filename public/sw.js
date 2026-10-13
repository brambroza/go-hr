/* GO HR service worker — app shell cache + offline fallback for the employee app (/m).
 * - Static assets (/_next/static, fonts, icons): cache-first (they are content-hashed).
 * - Pages (navigations): network-first, cached copy when offline, else /m/offline. Personal pages (payslips, profile ...) are never cached.
 * - Never cache API traffic: /rest/v1, /auth/v1, /storage/v1, /api/*, server actions / RSC requests.
 */
const VERSION = "gohr-v3";
const SHELL = `${VERSION}-shell`;
const PAGES = `${VERSION}-pages`;
const OFFLINE_URL = "/m/offline";
const PRECACHE = [OFFLINE_URL, "/m", "/m/checkin", "/manifest.webmanifest", "/icon.svg", "/icons/icon-192.png", "/icons/icon-512.png"];
// Pages with personal / salary data are never stored for offline use (keep in step with lib/pwa.ts NO_CACHE_PATTERNS)
const NO_CACHE = [/^\/m\/payslips(\/|$)/, /^\/m\/profile(\/|$)/, /^\/m\/evaluations(\/|$)/, /^\/m\/approvals(\/|$)/, /^\/m\/team(\/|$)/, /^\/m\/requests(\/|$)/, /^\/m\/leave(\/|$)/, /^\/m\/calendar(\/|$)/, /^\/m\/todos(\/|$)/, /^\/m\/feed(\/|$)/, /^\/m\/notifications(\/|$)/];
const cacheable = (pathname) => pathname.startsWith("/m") && !NO_CACHE.some((r) => r.test(pathname));

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((c) => Promise.allSettled(PRECACHE.map((u) => c.add(new Request(u, { credentials: "same-origin" })))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function isApi(url) {
  return /\/(rest|auth|storage|realtime|functions)\/v1\//.test(url.pathname) || url.pathname.startsWith("/api/");
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (isApi(url)) return; // never touch API calls (also cross-origin Supabase gateway)
  if (url.origin !== self.location.origin) return;
  // RSC / server action / prefetch requests must always hit the network
  if (req.headers.get("RSC") || req.headers.get("Next-Router-Prefetch") || url.searchParams.has("_rsc")) return;

  // immutable static assets: cache-first
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || /\.(woff2?|png|svg|ico)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(SHELL).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  // page navigations: network-first with offline fallback (only for the employee app & login)
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && cacheable(url.pathname) && !res.redirected) {
            const copy = res.clone();
            caches.open(PAGES).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(async () => (await caches.match(req)) || (await caches.match(OFFLINE_URL)) || Response.error()),
    );
  }
});

self.addEventListener("message", (event) => {
  if (event.data === "skipWaiting") self.skipWaiting();
  // sign-out: forget every cached page so the next person on this device cannot open them offline
  if (event.data && event.data.type === "clearPages") {
    event.waitUntil(
      caches
        .delete(PAGES)
        .then(() => caches.open(SHELL))
        .then((c) => Promise.all(["/m", "/m/checkin"].map((p) => c.delete(p, { ignoreSearch: true })))) // personalised shell pages
        .then(() => event.ports && event.ports[0] && event.ports[0].postMessage("ok")),
    );
  }
});
