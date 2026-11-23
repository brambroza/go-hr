import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Health check for deploy/upgrade.sh, the Docker HEALTHCHECK and an uptime monitor (UptimeRobot ...).
// Public on purpose (lives under /api/public, which proxy.ts lets through without a session) and therefore says
// nothing beyond "the app answers" and "the app can read the database": no version, no host names, no error text.
// The database probe is cached for a few seconds so that hammering this URL cannot turn into database load.

export const dynamic = "force-dynamic";

const CACHE_MS = 5_000;
const PROBE_TIMEOUT_MS = 3_000;
let last: { at: number; ok: boolean } | null = null;

/**
 * Ask the database for one row count through the service role (the same path every server action uses).
 * @returns true when the query came back without an error inside the timeout
 */
async function databaseAnswers(): Promise<boolean> {
  try {
    const probe = supabaseAdmin().from("settings").select("key", { head: true, count: "exact" }).limit(1);
    const timeout = new Promise<{ error: unknown }>((resolve) => setTimeout(() => resolve({ error: "timeout" }), PROBE_TIMEOUT_MS));
    const { error } = await Promise.race([probe, timeout]);
    return !error;
  } catch {
    return false;
  }
}

/**
 * GET /api/public/health → 200 {"ok":true,"db":true} when the app and the database answer, 503 otherwise.
 */
export async function GET() {
  const now = Date.now();
  if (!last || now - last.at > CACHE_MS) last = { at: now, ok: await databaseAnswers() };
  return NextResponse.json({ ok: last.ok, db: last.ok }, { status: last.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
