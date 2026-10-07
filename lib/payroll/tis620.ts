// TIS-620 / Windows-874 encoding for Thai government & bank text files (pure, unit tested in tests/payroll-files.test.ts)
//
// TIS-620 (มอก.620-2533) maps the Thai block U+0E01–U+0E3A → 0xA1–0xDA and U+0E3F–U+0E5B → 0xDF–0xFB, ASCII is
// unchanged. Windows-874 (code page 874, "ANSI" Thai in Windows) is TIS-620 plus a few punctuation marks in 0x80–0x9F.
// Import programs of Thai banks and the SSO e-Service read files in this encoding, and fixed-width layouts count
// BYTES — one Thai character (including above/below vowels and tone marks) is exactly one byte here, while it is 3
// bytes in UTF-8. Characters outside the table are replaced by '?' after a best-effort ASCII substitution.

/** punctuation that TIS-620 lacks → ASCII look-alike (Windows-874 has some of them, but strict readers do not) */
const ASCII_FALLBACK: Record<string, string> = {
  " ": " ", " ": " ", " ": " ", "​": "", "﻿": "",
  "‘": "'", "’": "'", "“": '"', "”": '"',
  "–": "-", "—": "-", "−": "-", "…": "...", "•": "*", "×": "x",
};

/** true when a code point has a single-byte TIS-620 encoding (ASCII or Thai) */
export function isTis620(cp: number): boolean {
  return cp < 0x80 || (cp >= 0x0e01 && cp <= 0x0e3a) || (cp >= 0x0e3f && cp <= 0x0e5b);
}

/** replace characters that cannot be written in TIS-620 (smart quotes, dashes, emoji …) — 1 output char = 1 byte */
export function toTis620Text(s: string): string {
  let out = "";
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    if (isTis620(cp)) out += ch;
    else if (ch in ASCII_FALLBACK) out += ASCII_FALLBACK[ch];
    else out += "?";
  }
  return out;
}

export function encodeTis620(s: string): Uint8Array {
  const t = toTis620Text(s);
  const out = new Uint8Array(t.length);
  for (let i = 0; i < t.length; i++) {
    const c = t.charCodeAt(i);
    out[i] = c < 0x80 ? c : c - 0x0e00 + 0xa0;
  }
  return out;
}

export function decodeTis620(b: Uint8Array): string {
  let s = "";
  for (const x of b) s += x < 0x80 ? String.fromCharCode(x) : (x >= 0xa1 && x <= 0xda) || (x >= 0xdf && x <= 0xfb) ? String.fromCharCode(x - 0xa0 + 0x0e00) : "�";
  return s;
}

export type Encoding = "tis620" | "utf8" | "utf8bom";

/** byte length of a string in the target encoding (after TIS-620 substitution) */
export function byteLength(s: string, enc: Encoding): number {
  if (enc === "tis620") return toTis620Text(s).length;
  return new TextEncoder().encode(s).length;
}

/** Thai characters that belong to the previous base character (above/below vowels, tone marks, sara am) */
export function isThaiCombining(cp: number): boolean {
  return cp === 0x0e31 || cp === 0x0e33 || (cp >= 0x0e34 && cp <= 0x0e3a) || (cp >= 0x0e47 && cp <= 0x0e4e);
}

/**
 * Cut a string to at most `max` bytes in `enc` without splitting a character or leaving a base consonant without its
 * vowel/tone marks (e.g. "สมศรี" cut inside "รี" drops the whole "รี" instead of leaving "ร").
 */
export function truncateBytes(s: string, max: number, enc: Encoding | "chars"): string {
  const text = enc === "tis620" ? toTis620Text(s) : s;
  const chars = Array.from(text);
  let used = 0;
  let end = 0;
  for (let i = 0; i < chars.length; i++) {
    const n = enc === "tis620" || enc === "chars" ? 1 : new TextEncoder().encode(chars[i]).length;
    if (used + n > max) break;
    used += n;
    end = i + 1;
  }
  if (end < chars.length) {
    // don't separate a base character from its combining marks
    while (end > 0 && isThaiCombining(chars[end].codePointAt(0)!)) end--;
  }
  return chars.slice(0, end).join("");
}

export function encodeText(text: string, enc: Encoding): Uint8Array {
  if (enc === "tis620") return encodeTis620(text);
  return new TextEncoder().encode((enc === "utf8bom" ? "﻿" : "") + text);
}

export const ENCODING_LABEL: Record<Encoding, string> = {
  tis620: "TIS-620 / Windows-874 (ANSI ภาษาไทย)",
  utf8: "UTF-8",
  utf8bom: "UTF-8 + BOM (เปิดใน Excel)",
};
