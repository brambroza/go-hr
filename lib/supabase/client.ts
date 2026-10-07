"use client";
import { createBrowserClient } from "@supabase/ssr";
import { AUTH_COOKIE } from "./cookie";
import { publicEnv } from "../public-env";

let client: ReturnType<typeof createBrowserClient> | undefined;

/** Supabase client for Client Components (uses the signed-in user's session → RLS applies). */
export function supabaseBrowser() {
  if (!client) {
    client = createBrowserClient(
      publicEnv().supabaseUrl,
      publicEnv().anonKey,
      { cookieOptions: AUTH_COOKIE },
    );
  }
  return client;
}
