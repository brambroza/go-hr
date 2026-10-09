// Pure date helpers for the date / month / datetime pickers (no React, unit tested in tests/date-picker.test.ts).
// Values are the same strings the native inputs use: "YYYY-MM-DD", "YYYY-MM", "YYYY-MM-DDTHH:mm".

import { TH_MONTHS, TH_MONTHS_SHORT } from "@/lib/format";

export interface YMD {
  y: number;
  m: number; // 0-11
  d: number;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "YYYY-MM-DD" → parts, or null when not a real calendar date */
export function parseYmd(s: string | null | undefined): YMD | null {
  const r = /^(\d{4})-(\d{2})-(\d{2})/.exec((s ?? "").trim());
  if (!r) return null;
  const y = Number(r[1]), m = Number(r[2]) - 1, d = Number(r[3]);
  if (m < 0 || m > 11 || d < 1 || d > daysInMonth(y, m)) return null;
  return { y, m, d };
}

/** "YYYY-MM" (or a longer date string) → { y, m } */
export function parseYm(s: string | null | undefined): { y: number; m: number } | null {
  const r = /^(\d{4})-(\d{2})/.exec((s ?? "").trim());
  if (!r) return null;
  const y = Number(r[1]), m = Number(r[2]) - 1;
  if (m < 0 || m > 11) return null;
  return { y, m };
}

/** "YYYY-MM-DDTHH:mm" → date part + time part ("HH:mm", "" when missing) */
export function splitDateTime(s: string | null | undefined): { date: string; time: string } {
  const v = (s ?? "").trim();
  const r = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?/.exec(v);
  if (!r) return { date: "", time: "" };
  return { date: r[1], time: r[2] ?? "" };
}

export function toYmd(p: YMD): string {
  return `${p.y}-${pad(p.m + 1)}-${pad(p.d)}`;
}

export function toYm(y: number, m: number): string {
  return `${y}-${pad(m + 1)}`;
}

export function daysInMonth(y: number, m: number): number {
  return new Date(y, m + 1, 0).getDate();
}

/** Today in the browser's local time */
export function todayYmd(now: Date = new Date()): string {
  return toYmd({ y: now.getFullYear(), m: now.getMonth(), d: now.getDate() });
}

/** Add months to a (y, m) pair, normalising across years */
export function addMonths(y: number, m: number, n: number): { y: number; m: number } {
  const t = y * 12 + m + n;
  return { y: Math.floor(t / 12), m: ((t % 12) + 12) % 12 };
}

/** Shift a date by n days (used by keyboard navigation) */
export function addDaysYmd(s: string, n: number): string {
  const p = parseYmd(s);
  if (!p) return s;
  const t = new Date(p.y, p.m, p.d + n);
  return toYmd({ y: t.getFullYear(), m: t.getMonth(), d: t.getDate() });
}

/** Clamp a date string into [min, max] (ISO strings compare lexically) */
export function inRange(s: string, min?: string | null, max?: string | null): boolean {
  if (min && s < min.slice(0, 10)) return false;
  if (max && s > max.slice(0, 10)) return false;
  return true;
}

export interface GridCell {
  ymd: string;
  d: number;
  inMonth: boolean;
}

/** 6 × 7 grid for a month, weeks starting on Sunday (Thai calendars) */
export function monthGrid(y: number, m: number): GridCell[] {
  const first = new Date(y, m, 1).getDay(); // 0 = Sunday
  const start = new Date(y, m, 1 - first);
  const cells: GridCell[] = [];
  for (let i = 0; i < 42; i++) {
    const t = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    cells.push({ ymd: toYmd({ y: t.getFullYear(), m: t.getMonth(), d: t.getDate() }), d: t.getDate(), inMonth: t.getMonth() === m });
  }
  return cells;
}

/** 12-year block containing `y` (e.g. 2020–2031) */
export function yearBlock(y: number): number[] {
  const start = Math.floor(y / 12) * 12;
  return Array.from({ length: 12 }, (_, i) => start + i);
}

// ---------------------------------------------------------------- display (Thai, พ.ศ.)

export const BE = (y: number) => y + 543;

/** "9 ต.ค. 2569" */
export function fmtDate(s: string | null | undefined): string {
  const p = parseYmd(s);
  return p ? `${p.d} ${TH_MONTHS_SHORT[p.m]} ${BE(p.y)}` : "";
}

/** "ตุลาคม 2569" */
export function fmtMonth(s: string | null | undefined): string {
  const p = parseYm(s);
  return p ? `${TH_MONTHS[p.m]} ${BE(p.y)}` : "";
}

/** "9 ต.ค. 2569 08:30 น." */
export function fmtDateTime(s: string | null | undefined): string {
  const { date, time } = splitDateTime(s);
  const d = fmtDate(date);
  if (!d) return "";
  return time ? `${d} ${time} น.` : d;
}
