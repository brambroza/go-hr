// Data-driven text file engine for bank / SSO / Revenue Department exports (pure — tests/payroll-files.test.ts)
//
// A layout is plain JSON (so HR can clone and edit it in /settings/file-formats and store it in table file_formats):
//   header / detail / trailer records, each a list of fields
//   field = where the value comes from (a variable of the file kind, a constant, the running number) + how it is
//           written (type, width in BYTES of the output encoding, alignment, padding, date pattern, decimals)
//   file  = fixed width or delimited, encoding (TIS-620 / UTF-8), line ending, file-name pattern
//
// Fixed-width text is measured in bytes of the output encoding: in TIS-620 one Thai character = 1 byte (so "สมชาย"
// takes 5 positions), in UTF-8 it is 3 bytes. Text longer than the field is cut at a character boundary (and a
// warning is returned); numbers that do not fit are an ERROR — a silently cut account number or amount would send
// money to the wrong place.

import { byteLength, encodeText, toTis620Text, truncateBytes, type Encoding } from "./tis620";

export type FileKind = "bank" | "sso" | "pnd1" | "pnd1a" | "rd_fund" | "pvd";
export type FieldType = "text" | "digits" | "int" | "amount" | "satang" | "date";

export interface FieldDef {
  /** name of the field in the agency/bank spec (shown in the editor and in error messages) */
  label: string;
  /** variable key (see VARIABLES in file-layouts.ts), or "const" (use `value`), "blank" (spaces / empty), "seq" (running no.) */
  source: string;
  value?: string;
  type: FieldType;
  /** fixed width in bytes (fixed layouts) — or maximum length (delimited layouts, optional) */
  len?: number;
  /** default: text → left, numbers → right */
  align?: "left" | "right";
  /** default: text → space, digits/int/satang → "0", amount → "0" (fixed) */
  pad?: string;
  /** date pattern: DD MM YYYY YY (e.g. DDMMYYYY, DD/MM/YYYY, YYYYMMDD, MMYY) */
  format?: string;
  /** date era: BE = พ.ศ. (default), CE = ค.ศ. */
  era?: "BE" | "CE";
  /** amount: number of decimals (default 2) */
  decimals?: number;
  /** empty value is an error */
  required?: boolean;
  /** remarks from the spec */
  note?: string;
}

export interface FileLayout {
  key: string;
  kind: FileKind;
  label: string;
  description?: string;
  /** official = agency/bank published spec · secondary = documented by third parties · unverified = needs confirming */
  status: "official" | "secondary" | "unverified";
  /** where the spec came from (URL + date) */
  source?: string;
  mode: "fixed" | "delimited";
  delimiter?: string;
  /** CSV quoting (RFC 4180) for values with delimiter/quotes; otherwise the delimiter is removed from values */
  quote?: boolean;
  /** first line = field labels (CSV for Excel) */
  columnTitles?: boolean;
  encoding: Encoding;
  lineEnding: "CRLF" | "LF";
  /** line ending after the last record (default true) */
  finalNewline?: boolean;
  /** characters removed from TEXT values (agency rules, e.g. RD forbids * + / \ ! $ % # & @ , ' ") */
  stripChars?: string;
  /** replacements applied before stripChars, e.g. { "/": "-" } keeps house no. 12/3 readable as 12-3 */
  charMap?: Record<string, string>;
  /** file name pattern with {variable} placeholders, e.g. PND1_{company.tax_id}_{tax.branch6}_{tax.year_be}_{tax.month2}_00_00.txt */
  fileName: string;
  header?: FieldDef[];
  detail: FieldDef[];
  trailer?: FieldDef[];
  /** bank layouts: which receiving banks the file may contain */
  bankScope?: "any" | "same" | "other";
  /** bank layouts: receiving account length rule ("bot" = per-bank BOT length; number = exact digits) */
  accountDigits?: "bot" | number;
}

export type Vars = Record<string, string | number | null | undefined>;

export interface Issue {
  level: "error" | "warn";
  message: string;
  /** detail row index (0-based) */
  row?: number;
}

export interface RenderedFile {
  filename: string;
  mime: string;
  text: string;
  bytes: Uint8Array;
  lines: string[];
  issues: Issue[];
  count: number;
}

// --------------------------------------------------------------------------------------------- value formatting
/** "2026-09-30" → pattern with DD MM YYYY YY (era BE adds 543) */
export function formatDate(iso: string, pattern = "DDMMYYYY", era: "BE" | "CE" = "BE"): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  if (!m) return "";
  const y = Number(m[1]) + (era === "BE" ? 543 : 0);
  return pattern.replace(/YYYY|YY|MM|DD/g, (t) => (t === "YYYY" ? String(y).padStart(4, "0") : t === "YY" ? String(y % 100).padStart(2, "0") : t === "MM" ? m[2] : m[3]));
}

/** round half away from zero to 2 decimals using integer satang (avoids 1.005 → 1.00) */
export function toSatang(n: number): number {
  const v = Number(n) || 0;
  return Math.sign(v) * Math.round(Math.abs(v) * 100 + 1e-7);
}

export function formatAmount(n: number, decimals = 2): string {
  const v = Number(n) || 0;
  if (decimals === 2) {
    const s = toSatang(v);
    const a = Math.abs(s);
    return `${s < 0 ? "-" : ""}${Math.floor(a / 100)}.${String(a % 100).padStart(2, "0")}`;
  }
  return v.toFixed(decimals);
}

const isNumType = (t: FieldType) => t === "digits" || t === "int" || t === "satang" || t === "amount";

export interface FormatCtx {
  layout: Pick<FileLayout, "mode" | "encoding" | "stripChars" | "charMap" | "delimiter" | "quote">;
  vars: Vars;
  seq?: number;
  issues: Issue[];
  row?: number;
  where: string;
}

function rawValue(f: FieldDef, c: FormatCtx): unknown {
  if (f.source === "const") return f.value ?? "";
  if (f.source === "blank" || !f.source) return "";
  if (f.source === "seq") return c.seq ?? "";
  return c.vars[f.source];
}

/** format one field; pushes issues (overflow, required) into c.issues */
export function formatField(f: FieldDef, c: FormatCtx): string {
  const raw = rawValue(f, c);
  const empty = raw === null || raw === undefined || raw === "";
  const label = `${c.where} ช่อง "${f.label}"`;
  if (f.required && empty) c.issues.push({ level: "error", message: `${label} ไม่มีข้อมูล`, row: c.row });

  let s = "";
  switch (f.type) {
    case "text": {
      s = String(raw ?? "").replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim();
      for (const [from, to] of Object.entries(c.layout.charMap ?? {})) s = s.split(from).join(to);
      if (c.layout.stripChars) for (const ch of c.layout.stripChars) s = s.split(ch).join("");
      s = s.replace(/\s{2,}/g, " ").trim();
      if (c.layout.mode === "delimited" && c.layout.delimiter && c.layout.delimiter !== ",") s = s.split(c.layout.delimiter).join(" ");
      if (c.layout.encoding === "tis620") s = toTis620Text(s);
      break;
    }
    case "digits":
      s = String(raw ?? "").replace(/\D/g, "");
      break;
    case "int": {
      if (empty) break;
      const n = Number(raw);
      if (!Number.isFinite(n)) c.issues.push({ level: "error", message: `${label} ต้องเป็นตัวเลข (ได้ "${raw}")`, row: c.row });
      s = String(Math.round(n || 0));
      break;
    }
    case "satang":
      s = empty ? "" : String(toSatang(Number(raw)));
      break;
    case "amount":
      s = empty ? "" : formatAmount(Number(raw), f.decimals ?? 2);
      break;
    case "date":
      s = empty ? "" : formatDate(String(raw), f.format || "DDMMYYYY", f.era ?? "BE");
      if (!empty && !s) c.issues.push({ level: "error", message: `${label} วันที่ไม่ถูกต้อง (${raw})`, row: c.row });
      break;
  }

  if (f.len && f.len > 0) {
    const len = f.len;
    const enc = c.layout.encoding;
    // fixed width = bytes of the output encoding; delimited = maximum number of characters
    const unit = c.layout.mode === "fixed" ? enc : "chars";
    const size = unit === "chars" ? Array.from(s).length : byteLength(s, enc);
    const numeric = isNumType(f.type);
    if (size > len) {
      if (numeric || f.type === "date") {
        c.issues.push({ level: "error", message: `${label} ยาว ${size} หลัก เกินที่กำหนด ${len} หลัก (${s})`, row: c.row });
        s = s.slice(-len);
      } else {
        const cut = truncateBytes(s, len, unit);
        c.issues.push({ level: "warn", message: `${label} ยาวเกิน ${len} ${unit === "chars" ? "ตัวอักษร" : "ไบต์"} ถูกตัดเป็น "${cut}"`, row: c.row });
        s = cut;
      }
    }
    if (c.layout.mode === "fixed") {
      const align = f.align ?? (numeric ? "right" : "left");
      const pad = (f.pad ?? (numeric ? "0" : " ")).slice(0, 1) || " ";
      const fill = pad.repeat(Math.max(0, len - byteLength(s, enc)));
      // negative zero-padded numbers keep the sign in front: -0000123
      if (align === "right" && pad === "0" && s.startsWith("-")) s = "-" + fill + s.slice(1);
      else s = align === "right" ? fill + s : s + fill;
    }
  }
  return s;
}

export function csvCell(s: string, delimiter: string): string {
  return /["\r\n]/.test(s) || s.includes(delimiter) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function renderRecord(fields: FieldDef[], c: FormatCtx): string {
  const cells = fields.map((f) => formatField(f, c));
  if (c.layout.mode === "fixed") return cells.join("");
  const d = c.layout.delimiter ?? ",";
  return cells.map((x) => (c.layout.quote ? csvCell(x, d) : x)).join(d);
}

/** total width of a fixed record in bytes */
export function recordWidth(fields: FieldDef[] | undefined): number {
  return (fields ?? []).reduce((s, f) => s + (f.len ?? 0), 0);
}

/** "{company.tax_id}_{period.code}.txt" → values; characters not allowed in file names are replaced */
export function renderFileName(pattern: string, vars: Vars): string {
  const name = pattern.replace(/\{([a-z0-9_.]+)\}/gi, (_, k: string) => String(vars[k] ?? ""));
  return name.replace(/[\\/:*?"<>|\r\n]+/g, "-").trim() || "export.txt";
}

export interface FileData {
  /** file-level variables (company, period, totals …) */
  file: Vars;
  /** one entry per detail record */
  rows: Vars[];
}

/** render a complete file. Issues from formatting are returned; the caller decides whether errors block download */
export function renderFile(layout: FileLayout, data: FileData): RenderedFile {
  const issues: Issue[] = [];
  const lines: string[] = [];
  const base = { layout, issues };
  if (layout.columnTitles) lines.push(layout.detail.map((f) => (layout.quote ? csvCell(f.label, layout.delimiter ?? ",") : f.label)).join(layout.delimiter ?? ","));
  if (layout.header?.length) lines.push(renderRecord(layout.header, { ...base, vars: data.file, where: "ส่วนหัว (Header)" }));
  data.rows.forEach((r, i) => lines.push(renderRecord(layout.detail, { ...base, vars: { ...data.file, ...r }, seq: i + 1, row: i, where: `รายการที่ ${i + 1}` })));
  if (layout.trailer?.length) lines.push(renderRecord(layout.trailer, { ...base, vars: data.file, where: "ส่วนท้าย (Trailer)" }));

  if (layout.mode === "fixed") {
    // every record of one type must have the same byte length
    const check = (fields: FieldDef[] | undefined, name: string) => {
      const w = recordWidth(fields);
      if (fields?.length && fields.some((f) => !f.len)) issues.push({ level: "error", message: `รูปแบบไฟล์: ${name} มีช่องที่ไม่ได้กำหนดความยาว (ไฟล์แบบความยาวคงที่ต้องกำหนดทุกช่อง)` });
      return w;
    };
    check(layout.header, "ส่วนหัว");
    check(layout.detail, "รายการ");
    check(layout.trailer, "ส่วนท้าย");
  }

  const eol = layout.lineEnding === "LF" ? "\n" : "\r\n";
  const text = lines.join(eol) + (layout.finalNewline === false || !lines.length ? "" : eol);
  const bytes = encodeText(text, layout.encoding);
  const ext = layout.fileName.split(".").pop()?.toLowerCase();
  const mime = `${ext === "csv" ? "text/csv" : "text/plain"};charset=${layout.encoding === "tis620" ? "windows-874" : "utf-8"}`;
  return { filename: renderFileName(layout.fileName, data.file), mime, text, bytes, lines, issues: dedupeIssues(issues), count: data.rows.length };
}

function dedupeIssues(list: Issue[]): Issue[] {
  const seen = new Set<string>();
  return list.filter((x) => {
    const k = `${x.level}|${x.message}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** structural checks of a (custom) layout before it is saved */
export function checkLayout(l: FileLayout, knownVars: string[]): Issue[] {
  const out: Issue[] = [];
  if (!l.label?.trim()) out.push({ level: "error", message: "ตั้งชื่อรูปแบบไฟล์" });
  if (!l.fileName?.trim()) out.push({ level: "error", message: "กำหนดรูปแบบชื่อไฟล์" });
  if (!l.detail?.length) out.push({ level: "error", message: "ต้องมีช่องข้อมูลในส่วนรายการอย่างน้อย 1 ช่อง" });
  if (l.mode === "delimited" && !l.delimiter) out.push({ level: "error", message: "ไฟล์แบบมีตัวคั่นต้องกำหนดตัวคั่น" });
  const all: [string, FieldDef[] | undefined][] = [["ส่วนหัว", l.header], ["รายการ", l.detail], ["ส่วนท้าย", l.trailer]];
  const known = new Set([...knownVars, "const", "blank", "seq"]);
  for (const [name, fields] of all)
    (fields ?? []).forEach((f, i) => {
      if (l.mode === "fixed" && !(Number(f.len) > 0)) out.push({ level: "error", message: `${name} ช่องที่ ${i + 1} (${f.label || "ไม่มีชื่อ"}) ต้องกำหนดความยาว` });
      if (!known.has(f.source)) out.push({ level: "error", message: `${name} ช่องที่ ${i + 1} ใช้ข้อมูล "${f.source}" ที่ไม่มีในระบบ` });
      if (f.type === "date" && f.format && !/DD|MM|YY/.test(f.format)) out.push({ level: "warn", message: `${name} ช่องที่ ${i + 1} รูปแบบวันที่ "${f.format}" ไม่มี DD/MM/YY` });
    });
  return out;
}

/** first n lines with visible spaces for the preview (· = space) */
export function previewLines(r: RenderedFile, n = 8): string[] {
  return r.lines.slice(0, n);
}
