"use client";
import { createBrowserClient, parseCookieHeader, serializeCookieHeader } from "@supabase/ssr";
import { AUTH_COOKIE, hasSessionOnlyMarker, persistCookieOptions } from "./cookie";
import { publicEnv } from "../public-env";

let client: ReturnType<typeof createBrowserClient> | undefined;

/** Supabase client for Client Components (uses the signed-in user's session → RLS applies). */
export function supabaseBrowser() {
  if (!client) {
    client = createBrowserClient(publicEnv().supabaseUrl, publicEnv().anonKey, {
      cookieOptions: AUTH_COOKIE,
      // same as the library default (document.cookie), plus "remember me": no max-age when the session-only marker is set
      cookies: {
        getAll() {
          return parseCookieHeader(document.cookie).map((c) => ({ name: c.name, value: c.value ?? "" }));
        },
        setAll(toSet) {
          const sessionOnly = hasSessionOnlyMarker(parseCookieHeader(document.cookie).map((c) => ({ name: c.name, value: c.value ?? "" })));
          for (const { name, value, options } of toSet) {
            document.cookie = serializeCookieHeader(name, value, persistCookieOptions(options, sessionOnly));
          }
        },
      },
    });
  }
  return client;
}
