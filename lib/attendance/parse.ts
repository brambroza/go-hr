// Parsers for time-log imports & device pushes. Pure (no I/O) — unit tested in tests/attendance-extra.test.ts.

export type Direction = "in" | "out" | "break_out" | "break_in" | "auto";
const DIRECTIONS: Direction[] = ["in", "out", "break_out", "break_in", "auto"];

/**
 * Parse a timestamp. Accepts ISO with zone ("2026-10-07T08:01:00+07:00", "...Z"), or local Bangkok time
 * "YYYY-MM-DD HH:mm[:ss]" / "YYYY-MM-DDTHH:mm[:ss]" / "DD/MM/YYYY HH:mm[:ss]" (Buddhist years > 2400 are converted).
 */
export function parseBangkokTime(raw: string | null | undefined): Date | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  if (/[zZ]$|[+-]\d\d:?\d\d$/.test(s) && /^\d{4}-\d{2}-\d{2}T/.test(s)) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s);
  let y: number, mo: number, d: number, h: number, mi: number, se: number;
  if (m) {
    [y, mo, d, h, mi, se] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] ?? 0)];
  } else {
    m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s);
    if (!m) return null;
    [d, mo, y, h, mi, se] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] ?? 0)];
  }
  if (y > 2400) y -= 543;
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || se > 59) return null;
  const iso = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}T${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}:${String(se).padStart(2, "0")}+07:00`;
  const out = new Date(iso);
  return isNaN(out.getTime()) || out.getUTCDate() === undefined ? null : out;
}

/** "in"/"out"/... or ZKTeco punch state codes (0 in, 1 out, 2 break out, 3 break in, 4 OT in, 5 OT out) */
export function normalizeDirection(v: unknown): Direction {
  if (v === null || v === undefined || v === "") return "auto";
  const s = String(v).trim().toLowerCase();
  if ((DIRECTIONS as string[]).includes(s)) return s as Direction;
  switch (s) {
    case "0":
    case "4":
    case "checkin":
    case "check-in":
    case "เข้า":
      return "in";
    case "1":
    case "5":
    case "checkout":
    case "check-out":
    case "ออก":
      return "out";
    case "2":
      return "break_out";
    case "3":
      return "break_in";
    default:
      return "auto";
  }
}

export interface ParsedLog {
  line: number;
  user: string; // employee code or device user id
  time: string | null; // ISO, null when invalid
  direction: Direction;
  raw: string;
  error?: string;
}

/** CSV: employee_code,datetime[,direction] — a header row is skipped automatically. */
export function parseCsvLogs(rows: string[][]): ParsedLog[] {
  const out: ParsedLog[] = [];
  rows.forEach((r, i) => {
    const [user = "", dt = "", dir = ""] = r.map((c) => (c ?? "").trim());
    if (i === 0 && !parseBangkokTime(dt) && /code|รหัส|employee|user/i.test(user)) return; // header
    if (!user && !dt) return;
    const t = parseBangkokTime(dt);
    out.push({ line: i + 1, user, time: t?.toISOString() ?? null, direction: normalizeDirection(dir), raw: r.join(","), error: !user ? "ไม่มีรหัสพนักงาน" : !t ? "รูปแบบวันเวลาไม่ถูกต้อง" : undefined });
  });
  return out;
}

/** ZKTeco attlog .dat/.txt: "<user_id>\t<YYYY-MM-DD HH:mm:ss>\t<verify>\t<state>\t..." (tabs or 2+ spaces) */
export function parseZkAttlog(text: string): ParsedLog[] {
  const out: ParsedLog[] = [];
  text.replace(/^﻿/, "").split(/\r?\n/).forEach((lineText, i) => {
    const line = lineText.trim();
    if (!line) return;
    const cols = line.split(/\t+|\s{2,}/).map((c) => c.trim());
    let user = cols[0] ?? "";
    let dt = cols[1] ?? "";
    let state: string | undefined = cols[3];
    // some firmwares export "user date time state ..." with single spaces
    if (!parseBangkokTime(dt) && cols.length === 1) {
      const m = /^(\S+)\s+(\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}(?::\d{2})?)\s*(?:\S+\s+(\S+))?/.exec(line);
      if (m) {
        user = m[1];
        dt = m[2];
        state = m[3];
      }
    }
    const t = parseBangkokTime(dt);
    out.push({ line: i + 1, user, time: t?.toISOString() ?? null, direction: normalizeDirection(state), raw: line, error: !user ? "ไม่มีรหัสผู้ใช้" : !t ? "รูปแบบวันเวลาไม่ถูกต้อง" : undefined });
  });
  return out;
}

/** Bangkok calendar date of an instant */
export function bkkDate(t: Date | string): string {
  const d = typeof t === "string" ? new Date(t) : t;
  return new Date(d.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
}
