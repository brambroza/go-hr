import { NextResponse, type NextRequest } from "next/server";

// Receives Content-Security-Policy violation reports (report-uri) and writes one JSON line per report to the
// app log (`docker compose logs app | grep csp-report`). No login (browsers post without cookies for cross-site
// cases), rate limited per IP, body capped at 16 KB. Nothing is stored in the database.

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 30;
const hits = new Map<string, number[]>();

function allowed(ip: string): boolean {
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (list.length >= MAX_PER_WINDOW) return false;
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < WINDOW_MS)) hits.delete(k);
  return true;
}

type Report = Record<string, unknown>;

/** normalise the two report formats (legacy `csp-report` object, or the Reporting API array) to a flat list */
function normalise(body: unknown): Report[] {
  if (Array.isArray(body)) return body.map((r) => (r && typeof r === "object" && "body" in r ? ((r as { body: Report }).body ?? {}) : (r as Report)));
  if (body && typeof body === "object") {
    const o = body as Record<string, unknown>;
    if (o["csp-report"] && typeof o["csp-report"] === "object") return [o["csp-report"] as Report];
    return [o];
  }
  return [];
}

const pick = (r: Report, ...keys: string[]) => keys.map((k) => r[k]).find((v) => v != null);

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  if (!allowed(ip)) return new NextResponse(null, { status: 429 });
  const raw = await req.text();
  if (raw.length > 16 * 1024) return new NextResponse(null, { status: 413 });
  let body: unknown = null;
  try {
    body = JSON.parse(raw);
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  for (const r of normalise(body).slice(0, 10)) {
    const line = {
      kind: "csp-report",
      at: new Date().toISOString(),
      document: pick(r, "document-uri", "documentURL"),
      directive: pick(r, "effective-directive", "effectiveDirective", "violated-directive"),
      blocked: pick(r, "blocked-uri", "blockedURL"),
      source: pick(r, "source-file", "sourceFile"),
      line: pick(r, "line-number", "lineNumber"),
      sample: String(pick(r, "script-sample", "sample") ?? "").slice(0, 120),
      disposition: pick(r, "disposition"),
      ua: (req.headers.get("user-agent") ?? "").slice(0, 120),
    };
    console.warn(JSON.stringify(line));
  }
  return new NextResponse(null, { status: 204 });
}
