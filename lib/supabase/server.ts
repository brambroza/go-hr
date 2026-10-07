import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { AUTH_COOKIE } from "./cookie";
import { publicEnv, serverSupabaseUrl } from "../public-env";

/** Supabase client for Server Components / Server Actions / Route Handlers (user session → RLS applies). */
export async function supabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    serverSupabaseUrl(),
    publicEnv().anonKey,
    {
      cookieOptions: AUTH_COOKIE,
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(toSet) {
          try {
            toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // called from a Server Component — the proxy refreshes the session instead
          }
        },
      },
    },
  );
}
