// Scheduler entry point. In production a tiny sidecar container calls this every minute:
//
//   while true; do curl -fsS -H "authorization: Bearer $CRON_SECRET" http://web:3000/api/cron >/dev/null; sleep 60; done
//   (or a host crontab:  * * * * *  curl -fsS -H "authorization: Bearer <CRON_SECRET>" http://localhost:3000/api/cron)
//
// GET/POST /api/cron              → runs every enabled job whose 5-field cron (Asia/Bangkok) is due since its last run
// GET/POST /api/cron?job=<code>   → force-runs one job now (enabled or not)
// Auth: header `authorization: Bearer ${CRON_SECRET}` or `?secret=${CRON_SECRET}`.
import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { runDueJobs, runJob } from "@/lib/jobs/runner";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const h = req.headers.get("authorization") ?? "";
  const given = h.startsWith("Bearer ") ? h.slice(7) : req.nextUrl.searchParams.get("secret") ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function handle(req: NextRequest) {
  if (!process.env.CRON_SECRET) return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const job = req.nextUrl.searchParams.get("job");
  const started = new Date();
  const results = job ? [await runJob(job, { now: started })] : await runDueJobs(started);
  return NextResponse.json({ at: started.toISOString(), ran: results.length, results });
}

export const GET = handle;
export const POST = handle;
