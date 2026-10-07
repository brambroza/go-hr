// Export file builders for payroll — pure functions (unit tested in tests/payroll-files.test.ts).
//
//  * Bank transfer files (generic CSV + bank-style layouts)
//  * SSO e-service text file (สปส.1-10 ส่วนที่ 2 แบบไฟล์)
//  * RD Prep / e-Filing import text (ใบแนบ ภ.ง.ด.1 / ภ.ง.ด.1ก)
//
// Every layout is DATA (field list with widths) so a customer whose bank or agency changes the spec can adjust the
// table below without touching the builders. Fixed-width files are encoded TIS-620 (Windows-874) by default because
// that is what Thai bank / SSO / RD import programs expect; widths therefore count characters = bytes.
//
// IMPORTANT: bank layouts follow the common structure of each bank's bulk payroll upload (Header / Detail / Trailer,
// amounts in satang, zero-padded). Banks issue per-customer specs (company ID, service code, file name rules), so
// confirm the field list with the customer's cash-management officer before the first live run.

// ----------------------------------------------------------------------------------------------------------- helpers
/** Thai Unicode (U+0E01–U+0E5B) → TIS-620 single bytes; ASCII passes through; anything else becomes '?' */
export function encodeTis620(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) out[i] = c;
    else if (c >= 0x0e01 && c <= 0x0e5b) out[i] = c - 0x0e00 + 0xa0;
    else out[i] = 0x3f;
  }
  return out;
}

export function padText(v: unknown, len: number): string {
  const s = String(v ?? "").replace(/[\r\n]+/g, " ");
  return s.length >= len ? s.slice(0, len) : s + " ".repeat(len - s.length);
}

export function padNum(v: unknown, len: number): string {
  const s = String(v ?? "").replace(/\D/g, "");
  return s.length >= len ? s.slice(-len) : "0".repeat(len - s.length) + s;
}

/** 1234.5 → "123450" (satang, no separator) */
export function satang(amount: number): string {
  return String(Math.round((Number(amount) || 0) * 100));
}

export const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

/** 2026-10-31 → "311069" (DDMMYY พ.ศ.) */
export function ddmmyyBE(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}${m}${String(Number(y) + 543).slice(-2)}`;
}
/** 2026-10-31 → "31102026" (DDMMYYYY ค.ศ.) */
export function ddmmyyyy(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}${m}${y}`;
}
/** 2026-10-31 → "31/10/2569" */
export function slashDateBE(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${Number(y) + 543}`;
}

export interface FixedField<C> {
  name: string;
  len: number;
  num?: boolean; // right-aligned, zero-padded digits
  value: (c: C) => unknown;
}

export function fixedLine<C>(fields: FixedField<C>[], c: C): string {
  return fields.map((f) => (f.num ? padNum(f.value(c), f.len) : padText(f.value(c), f.len))).join("");
}

export function csvLine(cells: unknown[], sep = ","): string {
  return cells
    .map((v) => {
      const s = v == null ? "" : String(v);
      return sep === "," && /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s.replace(new RegExp(`\\${sep}`, "g"), " ");
    })
    .join(sep);
}

export interface BuiltFile {
  filename: string;
  mime: string;
  bytes: Uint8Array;
  text: string;
  count: number;
  total: number;
}

function build(filename: string, lines: string[], encoding: "tis620" | "utf8bom" | "utf8", count: number, total: number, mime = "text/plain"): BuiltFile {
  const text = lines.join("\r\n") + "\r\n";
  const bytes = encoding === "tis620" ? encodeTis620(text) : new TextEncoder().encode((encoding === "utf8bom" ? "﻿" : "") + text);
  return { filename, mime: `${mime};charset=${encoding === "tis620" ? "windows-874" : "utf-8"}`, bytes, text, count, total };
}

// ----------------------------------------------------------------------------------------------------- bank files
export const BANK_NAMES: Record<string, string> = {
  "002": "ธนาคารกรุงเทพ (BBL)",
  "004": "ธนาคารกสิกรไทย (KBANK)",
  "006": "ธนาคารกรุงไทย (KTB)",
  "011": "ธนาคารทหารไทยธนชาต (TTB)",
  "014": "ธนาคารไทยพาณิชย์ (SCB)",
  "025": "ธนาคารกรุงศรีอยุธยา (BAY)",
  "030": "ธนาคารออมสิน (GSB)",
  "034": "ธ.ก.ส. (BAAC)",
  "069": "ธนาคารเกียรตินาคินภัทร (KKP)",
  "022": "ธนาคารซีไอเอ็มบี ไทย (CIMBT)",
  "024": "ธนาคารยูโอบี (UOB)",
  "067": "ธนาคารทิสโก้ (TISCO)",
  "073": "ธนาคารแลนด์ แอนด์ เฮ้าส์ (LHB)",
};

export interface BankTransferRow {
  emp_code: string;
  name: string; // account name (or employee name)
  bank_code: string;
  account: string;
  amount: number;
}

export interface BankFileContext {
  company_name: string;
  company_bank_code: string;
  company_account: string;
  company_id?: string; // bank-assigned company / customer ID (KTB / BBL)
  effective_date: string; // YYYY-MM-DD (pay date)
  batch_ref: string; // e.g. period code
}

type HdrCtx = BankFileContext & { count: number; total: number };
type DtlCtx = BankFileContext & { row: BankTransferRow; seq: number };

export interface BankFormat {
  key: string;
  label: string;
  description: string;
  kind: "csv" | "fixed";
  encoding: "tis620" | "utf8bom" | "utf8";
  ext: string;
  /** csv formats */
  csvHeader?: string[];
  csvRow?: (c: DtlCtx) => unknown[];
  /** fixed formats */
  header?: FixedField<HdrCtx>[];
  detail?: FixedField<DtlCtx>[];
  trailer?: FixedField<HdrCtx>[];
}

/**
 * Supported layouts. Widths are documented inline: [name len type].
 *  generic  — CSV (UTF-8 + BOM), opens in Excel; use for banks without a dedicated layout or manual upload.
 *  kbank    — CSV "K-Cash Connect Plus / Payroll" style: one row per transfer, amount with decimals.
 *  scb      — fixed width 'H'/'D'/'T' (SCB Business Net payroll style), amounts in satang.
 *  bbl      — fixed width (Bualuang iCash payroll style), header carries company ID, amounts in satang.
 *  ktb      — fixed width (KTB Corporate Online "Direct Credit" style), 1 header / N detail / 1 trailer.
 */
export const BANK_FORMATS: BankFormat[] = [
  {
    key: "generic",
    label: "CSV ทั่วไป (Excel)",
    description: "ลำดับ, รหัสธนาคาร, ชื่อธนาคาร, เลขที่บัญชี, ชื่อบัญชี, จำนวนเงิน, รหัสพนักงาน, วันที่โอน",
    kind: "csv",
    encoding: "utf8bom",
    ext: "csv",
    csvHeader: ["ลำดับ", "รหัสธนาคาร", "ชื่อธนาคาร", "เลขที่บัญชี", "ชื่อบัญชี", "จำนวนเงิน", "รหัสพนักงาน", "วันที่โอน"],
    csvRow: (c) => [c.seq, c.row.bank_code, BANK_NAMES[c.row.bank_code] ?? "", digits(c.row.account), c.row.name, c.row.amount.toFixed(2), c.row.emp_code, slashDateBE(c.effective_date)],
  },
  {
    key: "kbank",
    label: "กสิกรไทย (KBank) — CSV",
    description: "Receiving Bank Code, Account No, Account Name, Amount, Reference, Effective Date (DDMMYYYY)",
    kind: "csv",
    encoding: "utf8",
    ext: "csv",
    csvHeader: ["Receiving Bank Code", "Receiving Account No", "Receiver Name", "Transfer Amount", "Reference No", "Effective Date"],
    csvRow: (c) => [c.row.bank_code, digits(c.row.account), c.row.name, c.row.amount.toFixed(2), c.row.emp_code, ddmmyyyy(c.effective_date)],
  },
  {
    key: "scb",
    label: "ไทยพาณิชย์ (SCB) — Fixed width",
    description: "H(1) วันที่ DDMMYYYY(8) บัญชีบริษัท(10) ชื่อบริษัท(40) จำนวนรายการ(6) ยอดรวมสตางค์(15) / D(1) ลำดับ(6) ธนาคาร(3) บัญชี(11) ยอดสตางค์(15) ชื่อ(50) อ้างอิง(20) / T(1) จำนวน(6) ยอดรวม(15)",
    kind: "fixed",
    encoding: "tis620",
    ext: "txt",
    header: [
      { name: "type", len: 1, value: () => "H" },
      { name: "date", len: 8, value: (c) => ddmmyyyy(c.effective_date) },
      { name: "company_account", len: 10, num: true, value: (c) => digits(c.company_account) },
      { name: "company_name", len: 40, value: (c) => c.company_name },
      { name: "count", len: 6, num: true, value: (c) => c.count },
      { name: "total", len: 15, num: true, value: (c) => satang(c.total) },
    ],
    detail: [
      { name: "type", len: 1, value: () => "D" },
      { name: "seq", len: 6, num: true, value: (c) => c.seq },
      { name: "bank", len: 3, num: true, value: (c) => c.row.bank_code },
      { name: "account", len: 11, num: true, value: (c) => digits(c.row.account) },
      { name: "amount", len: 15, num: true, value: (c) => satang(c.row.amount) },
      { name: "name", len: 50, value: (c) => c.row.name },
      { name: "ref", len: 20, value: (c) => c.row.emp_code },
    ],
    trailer: [
      { name: "type", len: 1, value: () => "T" },
      { name: "count", len: 6, num: true, value: (c) => c.count },
      { name: "total", len: 15, num: true, value: (c) => satang(c.total) },
    ],
  },
  {
    key: "bbl",
    label: "กรุงเทพ (BBL) — Fixed width",
    description: "H(1) รหัสบริษัท(10) บัญชีบริษัท(10) วันที่ DDMMYY พ.ศ.(6) จำนวน(5) ยอดรวม(13) / D(1) ธนาคาร(3) บัญชี(10) ยอด(13) ชื่อ(35) รหัสพนักงาน(16) / T(1) จำนวน(5) ยอดรวม(13)",
    kind: "fixed",
    encoding: "tis620",
    ext: "txt",
    header: [
      { name: "type", len: 1, value: () => "H" },
      { name: "company_id", len: 10, value: (c) => c.company_id ?? "" },
      { name: "company_account", len: 10, num: true, value: (c) => digits(c.company_account) },
      { name: "date", len: 6, value: (c) => ddmmyyBE(c.effective_date) },
      { name: "count", len: 5, num: true, value: (c) => c.count },
      { name: "total", len: 13, num: true, value: (c) => satang(c.total) },
    ],
    detail: [
      { name: "type", len: 1, value: () => "D" },
      { name: "bank", len: 3, num: true, value: (c) => c.row.bank_code },
      { name: "account", len: 10, num: true, value: (c) => digits(c.row.account) },
      { name: "amount", len: 13, num: true, value: (c) => satang(c.row.amount) },
      { name: "name", len: 35, value: (c) => c.row.name },
      { name: "ref", len: 16, value: (c) => c.row.emp_code },
    ],
    trailer: [
      { name: "type", len: 1, value: () => "T" },
      { name: "count", len: 5, num: true, value: (c) => c.count },
      { name: "total", len: 13, num: true, value: (c) => satang(c.total) },
    ],
  },
  {
    key: "ktb",
    label: "กรุงไทย (KTB) — Fixed width",
    description: "1(1) รหัสบริษัท(10) บัญชีบริษัท(10) วันที่ DDMMYYYY(8) จำนวน(7) ยอดรวม(17) อ้างอิงชุด(20) / 2(1) ลำดับ(6) ธนาคาร(3) บัญชี(16) ยอด(17) ชื่อ(60) อ้างอิง(20) / 3(1) จำนวน(7) ยอดรวม(17)",
    kind: "fixed",
    encoding: "tis620",
    ext: "txt",
    header: [
      { name: "type", len: 1, value: () => "1" },
      { name: "company_id", len: 10, value: (c) => c.company_id ?? "" },
      { name: "company_account", len: 10, num: true, value: (c) => digits(c.company_account) },
      { name: "date", len: 8, value: (c) => ddmmyyyy(c.effective_date) },
      { name: "count", len: 7, num: true, value: (c) => c.count },
      { name: "total", len: 17, num: true, value: (c) => satang(c.total) },
      { name: "batch_ref", len: 20, value: (c) => c.batch_ref },
    ],
    detail: [
      { name: "type", len: 1, value: () => "2" },
      { name: "seq", len: 6, num: true, value: (c) => c.seq },
      { name: "bank", len: 3, num: true, value: (c) => c.row.bank_code },
      { name: "account", len: 16, num: true, value: (c) => digits(c.row.account) },
      { name: "amount", len: 17, num: true, value: (c) => satang(c.row.amount) },
      { name: "name", len: 60, value: (c) => c.row.name },
      { name: "ref", len: 20, value: (c) => c.row.emp_code },
    ],
    trailer: [
      { name: "type", len: 1, value: () => "3" },
      { name: "count", len: 7, num: true, value: (c) => c.count },
      { name: "total", len: 17, num: true, value: (c) => satang(c.total) },
    ],
  },
];

export function buildBankFile(formatKey: string, ctx: BankFileContext, rows: BankTransferRow[]): BuiltFile {
  const f = BANK_FORMATS.find((x) => x.key === formatKey) ?? BANK_FORMATS[0];
  const list = rows.filter((r) => r.amount > 0);
  const total = Math.round(list.reduce((s, r) => s + r.amount, 0) * 100) / 100;
  const hc: HdrCtx = { ...ctx, count: list.length, total };
  const lines: string[] = [];
  if (f.kind === "csv") {
    if (f.csvHeader) lines.push(csvLine(f.csvHeader));
    list.forEach((row, i) => lines.push(csvLine(f.csvRow!({ ...ctx, row, seq: i + 1 }))));
  } else {
    if (f.header) lines.push(fixedLine(f.header, hc));
    list.forEach((row, i) => lines.push(fixedLine(f.detail!, { ...ctx, row, seq: i + 1 })));
    if (f.trailer) lines.push(fixedLine(f.trailer, hc));
  }
  return build(`bank-${f.key}-${ctx.batch_ref}.${f.ext}`, lines, f.encoding, list.length, total, f.kind === "csv" ? "text/csv" : "text/plain");
}

// ------------------------------------------------------------------------------------------- SSO e-service (สปส.1-10)
//
// Text file uploaded at www.sso.go.th → e-Service → "ส่งข้อมูลเงินสมทบ" (TIS-620, CRLF, fixed width)
//
//  Record 1 (header, 1 line)
//    pos  1     1  record type '1'
//    pos  2-11 10  employer account no (เลขที่บัญชีนายจ้าง)
//    pos 12-17  6  branch no (ลำดับที่สาขา) e.g. 000000
//    pos 18-23  6  payment date DDMMYY (พ.ศ.)
//    pos 24-27  4  wage period MMYY (พ.ศ.)
//    pos 28-72 45  company name
//    pos 73-76  4  contribution rate ×100 e.g. 0500 = 5.00%
//    pos 77-82  6  number of insured persons
//    pos 83-97 15  total wages (satang)
//    pos 98-111 14 total contribution employee + employer (satang)
//    pos112-123 12 employee contribution (satang)
//    pos124-135 12 employer contribution (satang)
//  Record 2 (detail, one per insured person)
//    pos  1     1  record type '2'
//    pos  2-14 13  SSO no / national id
//    pos 15-17  3  title code (003 นาย, 004 นางสาว, 005 นาง, 000 other — see SSO_TITLE_CODES)
//    pos 18-47 30  first name
//    pos 48-82 35  last name
//    pos 83-96 14  wage (satang)
//    pos 97-108 12 employee contribution (satang)
//    pos109-116  8 blank
export const SSO_TITLE_CODES: Record<string, string> = { นาย: "003", นางสาว: "004", "น.ส.": "004", นาง: "005", "Mr.": "003", "Miss": "004", "Ms.": "004", "Mrs.": "005" };

export interface SsoRow {
  sso_no: string; // national id when no separate SSO number
  prefix: string | null;
  first_name: string;
  last_name: string;
  wage: number;
  employee: number;
  employer: number;
}

export interface SsoContext {
  account_no: string;
  branch_no: string;
  pay_date: string;
  year: number; // ค.ศ.
  month: number;
  company_name: string;
  rate: number; // percent (5)
}

type SsoHdr = SsoContext & { count: number; wage: number; employee: number; employer: number };

export const SSO_HEADER: FixedField<SsoHdr>[] = [
  { name: "type", len: 1, value: () => "1" },
  { name: "account_no", len: 10, num: true, value: (c) => digits(c.account_no) },
  { name: "branch_no", len: 6, num: true, value: (c) => digits(c.branch_no) || "0" },
  { name: "pay_date", len: 6, value: (c) => ddmmyyBE(c.pay_date) },
  { name: "period", len: 4, value: (c) => `${String(c.month).padStart(2, "0")}${String(c.year + 543).slice(-2)}` },
  { name: "company_name", len: 45, value: (c) => c.company_name },
  { name: "rate", len: 4, num: true, value: (c) => Math.round(c.rate * 100) },
  { name: "count", len: 6, num: true, value: (c) => c.count },
  { name: "total_wage", len: 15, num: true, value: (c) => satang(c.wage) },
  { name: "total_contribution", len: 14, num: true, value: (c) => satang(c.employee + c.employer) },
  { name: "employee", len: 12, num: true, value: (c) => satang(c.employee) },
  { name: "employer", len: 12, num: true, value: (c) => satang(c.employer) },
];

export const SSO_DETAIL: FixedField<SsoRow>[] = [
  { name: "type", len: 1, value: () => "2" },
  { name: "sso_no", len: 13, num: true, value: (r) => digits(r.sso_no) },
  { name: "title", len: 3, value: (r) => SSO_TITLE_CODES[(r.prefix ?? "").trim()] ?? "000" },
  { name: "first_name", len: 30, value: (r) => r.first_name },
  { name: "last_name", len: 35, value: (r) => r.last_name },
  { name: "wage", len: 14, num: true, value: (r) => satang(r.wage) },
  { name: "employee", len: 12, num: true, value: (r) => satang(r.employee) },
  { name: "blank", len: 8, value: () => "" },
];

export function buildSsoFile(ctx: SsoContext, rows: SsoRow[], opts: { encoding?: "tis620" | "utf8" } = {}): BuiltFile {
  const wage = rows.reduce((s, r) => s + r.wage, 0);
  const employee = rows.reduce((s, r) => s + r.employee, 0);
  const employer = rows.reduce((s, r) => s + r.employer, 0);
  const lines = [fixedLine(SSO_HEADER, { ...ctx, count: rows.length, wage, employee, employer }), ...rows.map((r) => fixedLine(SSO_DETAIL, r))];
  return build(`SSO-${ctx.year + 543}${String(ctx.month).padStart(2, "0")}-${digits(ctx.branch_no) || "000000"}.txt`, lines, opts.encoding ?? "tis620", rows.length, Math.round((employee + employer) * 100) / 100);
}

// ---------------------------------------------------------------------------------- RD Prep (ภ.ง.ด.1 / ภ.ง.ด.1ก)
//
// Text import for the Revenue Department "RD Prep" program (and e-Filing upload), pipe-separated, UTF-8, one line per payee.
// Column order (same for ภ.ง.ด.1 monthly and ภ.ง.ด.1ก annual; for 1ก the pay date is the last day of the year):
//   1 ลำดับที่ | 2 เลขประจำตัวผู้เสียภาษีอากร (13 หลัก) | 3 สาขาของผู้มีเงินได้ (00000) | 4 คำนำหน้าชื่อ | 5 ชื่อ | 6 ชื่อสกุล |
//   7 ประเภทเงินได้ (1 = 40(1) เงินเดือน ค่าจ้าง) | 8 วันเดือนปีที่จ่าย (DD/MM/YYYY พ.ศ.) | 9 จำนวนเงินได้ที่จ่าย (2 ตำแหน่ง) |
//  10 จำนวนเงินภาษีที่หักและนำส่ง (2 ตำแหน่ง) | 11 เงื่อนไขการหักภาษี (1 หัก ณ ที่จ่าย, 2 ออกให้ตลอดไป, 3 ออกให้ครั้งเดียว)
export const RD_COLUMNS = ["ลำดับที่", "เลขประจำตัวผู้เสียภาษี", "สาขา", "คำนำหน้า", "ชื่อ", "ชื่อสกุล", "ประเภทเงินได้", "วันที่จ่าย", "เงินได้", "ภาษีที่หัก", "เงื่อนไข"];

export interface RdRow {
  tax_id: string;
  prefix: string | null;
  first_name: string;
  last_name: string;
  pay_date: string;
  income: number;
  tax: number;
  condition?: 1 | 2 | 3;
}

export function buildRdPrepFile(name: string, rows: RdRow[], opts: { separator?: string; withHeader?: boolean } = {}): BuiltFile {
  const sep = opts.separator ?? "|";
  const lines: string[] = [];
  if (opts.withHeader) lines.push(csvLine(RD_COLUMNS, sep));
  rows.forEach((r, i) =>
    lines.push(csvLine([i + 1, digits(r.tax_id), "00000", r.prefix ?? "", r.first_name, r.last_name, 1, slashDateBE(r.pay_date), r.income.toFixed(2), r.tax.toFixed(2), r.condition ?? 1], sep)),
  );
  const total = rows.reduce((s, r) => s + r.tax, 0);
  return build(name, lines, "utf8", rows.length, Math.round(total * 100) / 100);
}

/** trigger a browser download of a built file */
export function downloadBuilt(f: BuiltFile) {
  const blob = new Blob([f.bytes as BlobPart], { type: f.mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = f.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
