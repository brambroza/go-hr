import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { AUTH_COOKIE, hasSessionOnlyMarker, persistCookieOptions } from "@/lib/supabase/cookie";
import { publicEnv, serverSupabaseUrl } from "@/lib/public-env";
import { buildCsp, cspHeaderName, isTruthyEnv, makeNonce } from "@/lib/security-headers";

// Paths that work without a signed-in user
const PUBLIC_PREFIXES = ["/login", "/forgot-password", "/reset-password", "/careers", "/kiosk", "/api/public", "/api/cron", "/api/device", "/api/line", "/api/csp-report", "/manifest.webmanifest", "/sw.js", "/icons"];

export async function proxy(request: NextRequest) {
  // Content-Security-Policy with a per-request nonce. Next.js reads the nonce from the *request* header
  // "content-security-policy" and stamps it on every inline <script> it renders; app/layout.tsx reads x-nonce
  // for its own inline script. The browser gets the policy as report-only until CSP_ENFORCE=1.
  const nonce = makeNonce();
  const csp = buildCsp({
    nonce,
    supabaseUrl: publicEnv().supabaseUrl,
    dev: process.env.NODE_ENV !== "production",
    extraOrigins: (process.env.CSP_EXTRA_ORIGINS ?? "").split(/[,\s]+/).filter(Boolean),
  });
  const cspHeader = cspHeaderName(isTruthyEnv(process.env.CSP_ENFORCE));
  const withNonce = () => {
    const h = new Headers(request.headers);
    h.set("x-nonce", nonce);
    h.set("content-security-policy", csp);
    const res = NextResponse.next({ request: { headers: h } });
    res.headers.set(cspHeader, csp);
    return res;
  };
  let response = withNonce();

  const supabase = createServerClient(
    serverSupabaseUrl(),
    publicEnv().anonKey,
    {
      cookieOptions: AUTH_COOKIE,
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(toSet) {
          // "remember me" off → the refreshed auth cookie must stay a session cookie
          const sessionOnly = hasSessionOnlyMarker(request.cookies.getAll());
          toSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = withNonce();
          toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, persistCookieOptions(options, sessionOnly)));
        },
      },
    },
  );

  // Refreshes the session cookie when needed — must run before any redirect decision
  const { data } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const isPublic = path === "/" ? false : PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(p + "/") || path.startsWith(p));

  if (!data.user && !isPublic) {
    if (path.startsWith("/api/")) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path + request.nextUrl.search);
    const redirect = NextResponse.redirect(url);
    redirect.headers.set(cspHeader, csp);
    return redirect;
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico|woff2?)$).*)"],
};
