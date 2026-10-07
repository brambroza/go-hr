import "server-only";
import { createClient } from "@supabase/supabase-js";
import { serverSupabaseUrl } from "../public-env";

/**
 * Service-role client — BYPASSES RLS. Only use after checking permissions
 * with requirePerm() (lib/auth.ts), never with user-controlled filters alone.
 */
export function supabaseAdmin() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createClient(serverSupabaseUrl(), key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
