// Export files: TIS-620 encoding, template engine, built-in layouts (RD / SSO / banks), validation
import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeTis620, encodeTis620, toTis620Text, truncateBytes, byteLength } from "../lib/payroll/tis620";
import { checkLayout, formatAmount, formatDate, formatField, recordWidth, renderFile, renderFileName, toSatang, type FieldDef, type FileLayout, type Issue } from "../lib/payroll/file-engine";
import { accountNumber11, BUILTIN_LAYOUTS, cloneLayout, findBuiltin, VARIABLES } from "../lib/payroll/file-layouts";
import { bankFileData, buildExport, rdFileData, ssoFileData, ssoRound, stripPrefix, type BankRow, type SsoRow } from "../lib/payroll/file-data";

// valid check digits (mod 11): 1103700123450, 3101700234560, company 0105556000014 → computed below to be safe
function withCheckDigit(d12: string): string {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(d12[i]) * (13 - i);
  return d12 + ((11 - (sum % 11)) % 10);
}
const PIN1 = withCheckDigit("110370012345");
const PIN2 = withCheckDigit("310170023456");
const COMPANY_TAX = withCheckDigit("010555600001");
const company = { name: "บริษัท ทดสอบ จำกัด", name_en: "Test Co., Ltd.", tax_id: COMPANY_TAX };

const bytesOf = (s: string) => encodeTis620(s).length;
const linesOf = (text: string) => text.split("\r\n").slice(0, -1);

// ---------------------------------------------------------------------------------------------- TIS-620
test("TIS-620: Thai block maps to 0xA1–0xFB, ASCII unchanged, round-trip", () => {
  assert.deepEqual([...encodeTis620("ก A")], [0xa1, 0x20, 0x41]);
  assert.deepEqual([...encodeTis620("ฮ")], [0xce]);
  assert.deepEqual([...encodeTis620("ฺ")], [0xda]); // U+0E3A phinthu
  assert.deepEqual([...encodeTis620("฿")], [0xdf]); // U+0E3F baht sign
  assert.deepEqual([...encodeTis620("๛")], [0xfb]); // U+0E5B last
  const s = "นางสาวสมหญิง รักงาน 1,234.50 บาท ๑๒๓";
  assert.equal(decodeTis620(encodeTis620(s)), s);
  assert.equal(encodeTis620(s).length, s.length, "1 byte per character");
});

test("TIS-620: characters outside the table are substituted, not dropped silently", () => {
  assert.equal(toTis620Text("“สมชาย” – ok…"), "\"สมชาย\" - ok...");
  assert.equal(toTis620Text("A😀B"), "A?B");
  assert.equal(encodeTis620("A😀B").length, 3);
});

test("byteLength: Thai is 1 byte in TIS-620 and 3 bytes in UTF-8", () => {
  assert.equal(byteLength("สมชาย", "tis620"), 5);
  assert.equal(byteLength("สมชาย", "utf8"), 15);
  assert.equal(byteLength("ABC", "utf8"), 3);
});

test("truncateBytes never splits a base consonant from its vowel/tone marks", () => {
  assert.equal(truncateBytes("สมศรี", 4, "tis620"), "สมศ"); // "ร" would lose "ี" → drop both
  assert.equal(truncateBytes("น้ำ", 2, "tis620"), ""); // น + ้ + ำ is one cluster (ำ is a spacing vowel but ้ combines)
  assert.equal(truncateBytes("กขค", 2, "tis620"), "กข");
  assert.equal(truncateBytes("สมชาย", 7, "utf8"), "สม"); // 3 bytes per char in UTF-8
});

// ---------------------------------------------------------------------------------------------- engine
const issues: Issue[] = [];
const ctx = (mode: "fixed" | "delimited", encoding: "tis620" | "utf8" = "tis620") => ({ layout: { mode, encoding, delimiter: "|" }, vars: { name: "สมชาย ใจดี", n: 1234.5, neg: -12.3, acct: "123-4-56789-0", d: "2026-09-30", big: 123456789 }, issues, where: "t" });

test("formatField: fixed width pads by bytes, numbers right-aligned with zeros", () => {
  issues.length = 0;
  const f = (x: Partial<FieldDef>) => formatField({ label: "x", source: "name", type: "text", ...x } as FieldDef, ctx("fixed"));
  assert.equal(f({ len: 12 }), "สมชาย ใจดี  ");
  assert.equal(bytesOf(f({ len: 12 })), 12);
  assert.equal(f({ source: "n", type: "satang", len: 10 }), "0000123450");
  assert.equal(f({ source: "n", type: "amount", len: 10 }), "0001234.50");
  assert.equal(f({ source: "neg", type: "satang", len: 8 }), "-0001230");
  assert.equal(f({ source: "acct", type: "digits", len: 11 }), "01234567890");
  assert.equal(f({ source: "d", type: "date", format: "DDMMYYYY", len: 8 }), "30092569");
  assert.equal(f({ source: "d", type: "date", format: "DDMMYYYY", era: "CE", len: 8 }), "30092026");
  assert.equal(f({ source: "d", type: "date", format: "DD/MM/YY", len: 8 }), "30/09/69");
  assert.equal(f({ source: "const", value: "H", len: 3 }), "H  ");
  assert.equal(f({ source: "seq", type: "int", len: 4 }), "0000"); // no seq in header context → empty → zero padded
  assert.equal(f({ source: "name", len: 12, align: "right" }), "  สมชาย ใจดี");
  assert.equal(issues.length, 0);
});

test("formatField: text overflow is cut with a warning, number overflow is an error", () => {
  issues.length = 0;
  const t = formatField({ label: "ชื่อ", source: "name", type: "text", len: 6 }, ctx("fixed"));
  assert.equal(t, "สมชาย ");
  assert.equal(issues[0].level, "warn");
  const n = formatField({ label: "ยอด", source: "big", type: "satang", len: 5 }, ctx("fixed"));
  assert.equal(n.length, 5);
  assert.equal(issues[1].level, "error");
  issues.length = 0;
  // delimited: length counts characters even in UTF-8
  assert.equal(formatField({ label: "ชื่อ", source: "name", type: "text", len: 10 }, ctx("delimited", "utf8")), "สมชาย ใจดี");
  assert.equal(issues.length, 0);
});

test("toSatang / formatAmount round half away from zero without float drift", () => {
  assert.equal(toSatang(1.005), 101);
  assert.equal(toSatang(0.285), 29);
  assert.equal(toSatang(-1.005), -101);
  assert.equal(formatAmount(1234.5), "1234.50");
  assert.equal(formatAmount(-0.5), "-0.50");
  assert.equal(formatAmount(0), "0.00");
  assert.equal(formatDate("2026-01-05", "MMYY"), "0169");
  assert.equal(formatDate("bad"), "");
});

test("renderFile: header/detail/trailer, CRLF, constant record widths, file-name pattern", () => {
  const l: FileLayout = {
    key: "t", kind: "bank", label: "t", status: "unverified", mode: "fixed", encoding: "tis620", lineEnding: "CRLF", fileName: "PAY_{period.code}/{x}.txt",
    header: [{ label: "H", source: "const", value: "H", type: "text", len: 1 }, { label: "n", source: "batch.count", type: "int", len: 4 }],
    detail: [{ label: "D", source: "const", value: "D", type: "text", len: 1 }, { label: "seq", source: "seq", type: "int", len: 3 }, { label: "name", source: "account.name", type: "text", len: 10 }],
    trailer: [{ label: "T", source: "const", value: "T", type: "text", len: 1 }, { label: "sum", source: "batch.total", type: "satang", len: 9 }],
  };
  const r = renderFile(l, { file: { "batch.count": 2, "batch.total": 100.5, "period.code": "P1" }, rows: [{ "account.name": "สมศักดิ์" }, { "account.name": "Bob" }] });
  assert.equal(r.text, "H0002\r\nD001สมศักดิ์  \r\nD002Bob       \r\nT000010050\r\n");
  assert.equal(r.filename, "PAY_P1-.txt");
  const recs = linesOf(r.text);
  assert.equal(bytesOf(recs[1]), recordWidth(l.detail));
  assert.equal(bytesOf(recs[2]), recordWidth(l.detail));
  assert.equal(r.bytes.length, r.text.length);
  assert.ok(r.mime.includes("windows-874"));
  assert.equal(renderFileName("{a}_{b}.csv", { a: "X", b: 3 }), "X_3.csv");
});

test("renderFile: CSV quoting, column titles, UTF-8 BOM", () => {
  const l: FileLayout = {
    key: "c", kind: "bank", label: "c", status: "unverified", mode: "delimited", delimiter: ",", quote: true, columnTitles: true, encoding: "utf8bom", lineEnding: "CRLF", fileName: "x.csv",
    detail: [{ label: "ชื่อ", source: "n", type: "text" }, { label: "ยอด", source: "a", type: "amount" }],
  };
  const r = renderFile(l, { file: {}, rows: [{ n: 'A, "B"', a: 5 }] });
  assert.equal(r.text, 'ชื่อ,ยอด\r\n"A, ""B""",5.00\r\n');
  assert.deepEqual([...r.bytes.slice(0, 3)], [0xef, 0xbb, 0xbf]);
});

test("checkLayout: fixed fields need a length, unknown variables are rejected", () => {
  const bad: FileLayout = { key: "b", kind: "bank", label: "b", status: "unverified", mode: "fixed", encoding: "tis620", lineEnding: "CRLF", fileName: "x", detail: [{ label: "a", source: "nope", type: "text" }] };
  const p = checkLayout(bad, VARIABLES.bank.map((v) => v.key));
  assert.equal(p.filter((x) => x.level === "error").length, 2);
  for (const l of BUILTIN_LAYOUTS) assert.deepEqual(checkLayout(l, VARIABLES[l.kind].map((v) => v.key)).filter((x) => x.level === "error"), [], l.key);
});

test("cloneLayout makes an independent unverified copy", () => {
  const src = findBuiltin("sso_1_10")!;
  const c = cloneLayout(src);
  c.detail[0].value = "X";
  assert.equal(src.detail[0].value, "2");
  assert.ok(c.key.startsWith("custom_"));
  assert.equal(c.status, "unverified");
  assert.equal(findBuiltin("ktb")?.key, "bank_ktb_direct", "legacy settings key");
});

// ---------------------------------------------------------------------------------------------- RD
const rdRow = (o: Partial<Parameters<typeof rdFileData>[1][number]> = {}) => ({
  employee_id: 1, emp_code: "E0001", pin: PIN1, prefix: "นาย", first_name: "สมชาย", last_name: "ใจดี", pay_date: "2026-09-30", income: 30000, tax: 312.5,
  address: { house_no: "12/3", moo: "5", subdistrict: "บางเสาธง", district: "บางเสาธง", province: "สมุทรปราการ", postcode: "10570" }, sso: 875, pvd: 0, ...o,
});

test("RD V2.0 ภ.ง.ด.1: exact header + detail per ฟอร์แมตกลาง (UTF-8, |, CRLF, file name)", () => {
  const l = findBuiltin("rd_v2_pnd1")!;
  const r = buildExport(l, rdFileData({ company, kind: "pnd1", year: 2026, month: 9, branch_no: "00000", requireAddress: true }, [rdRow(), rdRow({ employee_id: 2, emp_code: "E0002", pin: PIN2, prefix: "นางสาว", first_name: "สมหญิง", last_name: "รักงาน", income: 9360.25, tax: 0 })]));
  assert.ok(r.ok, JSON.stringify(r.issues));
  assert.equal(r.filename, `PND1_${COMPANY_TAX}_000000_2569_09_00_00.txt`);
  const [h, d1, d2] = linesOf(r.text);
  assert.equal(h, `H|0000|${COMPANY_TAX}|000000|1|PND1|${COMPANY_TAX}|000000|สำนักงานใหญ่|0|09|2569||00|2|39360.25|312.50|0.00|312.50|312.50||2`);
  assert.equal(h.split("|").length, 22);
  assert.equal(d1, `D|1|000000|${PIN1}|0000000000|นาย|สมชาย|ใจดี|30092569|0.00|30000.00|312.50|1|1|||||12-3|5|||บางเสาธง|บางเสาธง|สมุทรปราการ|10570`);
  assert.equal(d1.split("|").length, 26);
  assert.ok(d2.startsWith(`D|2|000000|${PIN2}|0000000000|นางสาว|สมหญิง|รักงาน|30092569|0.00|9360.25|0.00|1|1|`));
  assert.ok(!r.text.includes("﻿"), "no BOM");
  assert.equal(new TextDecoder().decode(r.bytes), r.text);
});

test("RD V2.0 ภ.ง.ด.1ก: month 00, pay date = 31 Dec (พ.ศ.), TAX_TYPE PND1A", () => {
  const l = findBuiltin("rd_v2_pnd1a")!;
  const r = buildExport(l, rdFileData({ company, kind: "pnd1a", year: 2026, branch_no: "00001", requireAddress: true }, [rdRow({ income: 360000, tax: 6250 })]));
  const [h, d] = linesOf(r.text);
  assert.ok(h.startsWith(`H|0000|${COMPANY_TAX}|000001|1|PND1A|${COMPANY_TAX}|000001|`));
  assert.ok(h.includes("|0|00|2569|"));
  assert.ok(d.includes("|31122569|0.00|360000.00|6250.00|1|1|"));
  assert.equal(r.filename, `PND1A_${COMPANY_TAX}_000001_2569_00_00_00.txt`);
});

test("RD V1.0 PND1.txt: 20 fields, TIS-620, DDMMYYYY พ.ศ.", () => {
  const l = findBuiltin("rd_v1_pnd1")!;
  const r = buildExport(l, rdFileData({ company, kind: "pnd1", year: 2026, month: 9, branch_no: "00000" }, [rdRow()]));
  assert.equal(r.filename, "PND1.txt");
  const [d] = linesOf(r.text);
  assert.equal(d, `00|${COMPANY_TAX}|0000000000|0000|${PIN1}|0000000000|นาย|สมชาย|ใจดี|12-3 หมู่ 5|ต.บางเสาธง อ.บางเสาธง จ.สมุทรปราการ|10570|09|2569|1|30092569|0|30000.00|312.50|1`);
  assert.equal(d.split("|").length, 20);
  assert.equal(decodeTis620(r.bytes), r.text);
});

test("RD Prep: 11 fields 0–10, dd/mm/yyyy พ.ศ., condition 2 for tax paid by employer", () => {
  const l = findBuiltin("rd_prep_pnd1")!;
  const r = buildExport(l, rdFileData({ company, kind: "pnd1", year: 2026, month: 9, branch_no: "0" }, [rdRow({ condition: 2 })]));
  assert.equal(linesOf(r.text)[0], `1|${PIN1}|00000|นาย|สมชาย|ใจดี|1|30/09/2569|30000.00|312.50|2`);
});

test("RD fund file: PIN|year|GPF|SSO|PVD", () => {
  const l = findBuiltin("rd_fund")!;
  const r = buildExport(l, rdFileData({ company, kind: "pnd1a", year: 2026, branch_no: "00000" }, [rdRow({ sso: 10500, pvd: 1200.5 })]));
  assert.equal(linesOf(r.text)[0], `${PIN1}|2569|0.00|10500.00|1200.50`);
  assert.equal(r.filename, `FUND_PND1A_${COMPANY_TAX}_2569.csv`);
});

test("RD validation: bad PIN checksum, bad company tax id, missing names, negative amounts, missing address", () => {
  const res = rdFileData({ company: { ...company, tax_id: "0105556000010" }, kind: "pnd1", year: 2026, month: 9, branch_no: "0000A", requireAddress: true }, [
    rdRow({ pin: "1103700123451" === PIN1 ? "1103700123452" : "1103700123451" }),
    rdRow({ employee_id: 2, emp_code: "E2", pin: PIN2, prefix: "", first_name: "", income: -5, address: null }),
  ]);
  const msg = res.issues.filter((x) => x.level === "error").map((x) => x.message).join("\n");
  assert.match(msg, /เลขประจำตัวผู้เสียภาษีของบริษัท .* หลักตรวจสอบ/);
  assert.match(msg, /เลขที่สาขา/);
  assert.match(msg, /E0001 สมชาย ใจดี: เลขประจำตัวผู้เสียภาษี .* หลักตรวจสอบไม่ถูกต้อง/);
  assert.match(msg, /E2 .*ไม่มีคำนำหน้าชื่อ/);
  assert.match(msg, /E2 .*ไม่มีชื่อ/);
  assert.match(msg, /ติดลบ/);
  assert.match(msg, /ที่อยู่ไม่ครบ/);
  const r = buildExport(findBuiltin("rd_v2_pnd1")!, res);
  assert.equal(r.ok, false);
});

test("RD: forbidden characters are removed from text (no comma / quote / slash in the file)", () => {
  const r = buildExport(findBuiltin("rd_v2_pnd1")!, rdFileData({ company, kind: "pnd1", year: 2026, month: 9, branch_no: "0", requireAddress: true }, [rdRow({ last_name: "ใจ'ดี,*" })]));
  assert.ok(linesOf(r.text)[1].includes("|ใจดี|"));
});

// ---------------------------------------------------------------------------------------------- SSO
const ssoRows: SsoRow[] = [
  { employee_id: 1, emp_code: "E1", national_id: PIN1, prefix: "นาย", first_name: "สมชาย", last_name: "ใจดี", wage: 17500, employee: 875, employer: 875 },
  { employee_id: 2, emp_code: "E2", national_id: PIN2, prefix: "นางสาว", first_name: "สมหญิง", last_name: "รักงาน", wage: 9360, employee: 468, employer: 468 },
];
const ssoBatch = { company, account_no: "10-0012345-6", branch_no: "1", pay_date: "2026-10-07", year: 2026, month: 9, rate: 5, ceiling: 17500, floor: 1650 };

test("SSO สปส.1-10: 135-byte TIS-620 records, satang amounts, header totals = details", () => {
  const l = findBuiltin("sso_1_10")!;
  const r = buildExport(l, ssoFileData(ssoBatch, ssoRows));
  assert.ok(r.ok, JSON.stringify(r.issues));
  assert.equal(recordWidth(l.header), 135);
  assert.equal(recordWidth(l.detail), 135);
  const recs = linesOf(r.text);
  assert.equal(recs.length, 3);
  for (const x of recs) assert.equal(bytesOf(x), 135);
  assert.equal(r.bytes.length, 3 * 137, "3 × (135 + CRLF)");
  const h = recs[0];
  assert.equal(h.slice(0, 1), "1");
  assert.equal(h.slice(1, 11), "1000123456");
  assert.equal(h.slice(11, 17), "000001");
  assert.equal(h.slice(17, 23), "071069");
  assert.equal(h.slice(23, 27), "0969");
  assert.equal(h.slice(27, 72).trimEnd(), "บริษัท ทดสอบ จำกัด");
  assert.equal(h.slice(72, 76), "0500");
  assert.equal(h.slice(76, 82), "000002");
  assert.equal(h.slice(82, 97), "000000002686000");
  assert.equal(h.slice(97, 111), "00000000268600");
  assert.equal(h.slice(111, 123), "000000134300");
  assert.equal(h.slice(123, 135), "000000134300");
  const d = recs[1];
  assert.equal(d.slice(0, 14), `2${PIN1}`);
  assert.equal(d.slice(14, 17), "003");
  assert.equal(d.slice(17, 47), "สมชาย".padEnd(30));
  assert.equal(d.slice(47, 82), "ใจดี".padEnd(35));
  assert.equal(d.slice(82, 96), "00000001750000");
  assert.equal(d.slice(96, 108), "000000087500");
  assert.equal(d.slice(108), " ".repeat(27));
  assert.equal(recs[2].slice(14, 17), "004");
  // header totals equal sum of details
  const wageSum = recs.slice(1).reduce((s, x) => s + Number(x.slice(82, 96)), 0);
  const empSum = recs.slice(1).reduce((s, x) => s + Number(x.slice(96, 108)), 0);
  assert.equal(Number(h.slice(82, 97)), wageSum);
  assert.equal(Number(h.slice(111, 123)), empSum);
  assert.equal(r.filename, "SSO256909_1000123456_000001.txt");
});

test("SSO: long Thai names are cut at 30/35 bytes on a character-cluster boundary", () => {
  const long = "ศรีสุริยวงศ์มหาสมบัติเจริญรุ่งเรืองยิ่ง";
  const r = buildExport(findBuiltin("sso_1_10")!, ssoFileData(ssoBatch, [{ ...ssoRows[0], last_name: long }]));
  const d = linesOf(r.text)[1];
  assert.equal(bytesOf(d), 135);
  assert.ok(r.issues.some((x) => x.level === "warn" && x.message.includes("ถูกตัด")));
  const cut = d.slice(47, 82).trimEnd();
  assert.ok(long.startsWith(cut));
});

test("SSO validation: account, id length, duplicate, wage above ceiling, contribution mismatch", () => {
  const res = ssoFileData({ ...ssoBatch, account_no: "123" }, [
    ssoRows[0],
    { ...ssoRows[1], national_id: "12345" },
    { ...ssoRows[0], employee_id: 3, emp_code: "E3" },
    { ...ssoRows[1], employee_id: 4, emp_code: "E4", national_id: withCheckDigit("310170023457"), wage: 18000, employee: 900, employer: 900 },
    { ...ssoRows[1], employee_id: 5, emp_code: "E5", national_id: withCheckDigit("310170023458"), employee: 470 },
  ]);
  const err = res.issues.filter((x) => x.level === "error").map((x) => x.message).join("\n");
  const warn = res.issues.filter((x) => x.level === "warn").map((x) => x.message).join("\n");
  assert.match(err, /เลขที่บัญชีนายจ้างต้องเป็นตัวเลข 10 หลัก/);
  assert.match(err, /E2 .*ต้องมี 13 หลัก/);
  assert.match(err, /E3 .*ซ้ำกับ E1/);
  assert.match(err, /E4 .*เกินเพดาน 17,500/);
  assert.match(warn, /E5 .*เงินสมทบผู้ประกันตน 470\.00 ไม่เท่ากับ 5% × 9360\.00 = 468\.00/);
});

test("ssoRound: .50 satang and above rounds up, below is dropped", () => {
  assert.equal(ssoRound(467.5), 468);
  assert.equal(ssoRound(467.49), 467);
  assert.equal(ssoRound((9350 * 5) / 100), 468);
  assert.equal(ssoRound((17500 * 5) / 100), 875);
});

// ---------------------------------------------------------------------------------------------- banks
const bankRows: BankRow[] = [
  { employee_id: 1, emp_code: "E0001", prefix: "นาย", first_name: "สมชาย", last_name: "ใจดี", bank_code: "006", account: "123-4-56789-0", amount: 15234.5, pay_method: "bank", account_name: "นายสมชาย ใจดี" },
  { employee_id: 2, emp_code: "E0002", prefix: "นางสาว", first_name: "สมหญิง", last_name: "รักงาน", bank_code: "004", account: "2223334445", amount: 9000, pay_method: "bank" },
  { employee_id: 3, emp_code: "E0003", first_name: "ศูนย์", last_name: "บาท", bank_code: "004", account: "1", amount: 0, pay_method: "bank" },
  { employee_id: 4, emp_code: "E0004", first_name: "เงิน", last_name: "สด", bank_code: null, account: null, amount: 500, pay_method: "cash" },
  { employee_id: 5, emp_code: "E0005", first_name: "ออม", last_name: "สิน", bank_code: "030", account: "020012345678", amount: 100, pay_method: "bank" },
];
const bankBatch = { company, company_bank_code: "006", company_bank_branch: "0123", company_account: "987-6-54321-0", company_bank_id: "KTBC001", effective_date: "2026-09-30", batch_ref: "PR2609", period_code: "PR2609", pay_date: "2026-09-30" };

test("bank: only pay_method=bank with amount > 0; totals; every fixed record has its declared byte width", () => {
  for (const l of BUILTIN_LAYOUTS.filter((x) => x.kind === "bank")) {
    const built = bankFileData(l, bankBatch, bankRows);
    const r = buildExport(l, built);
    const expected = bankRows.filter((x) => x.pay_method === "bank" && x.amount > 0 && (l.bankScope === "same" ? x.bank_code === "006" : l.bankScope === "other" ? x.bank_code !== "006" : true));
    assert.equal(r.count, expected.length, l.key);
    assert.equal(built.data.file["batch.total"], Math.round(expected.reduce((s, x) => s + x.amount, 0) * 100) / 100, l.key);
    if (l.mode === "fixed") {
      const recs = linesOf(r.text);
      if (l.header) assert.equal(bytesOf(recs[0]), recordWidth(l.header), `${l.key} header`);
      const first = l.header ? 1 : 0;
      for (let i = first; i < first + r.count; i++) assert.equal(bytesOf(recs[i]), recordWidth(l.detail), `${l.key} detail ${i}`);
      if (l.trailer) assert.equal(bytesOf(recs[recs.length - 1]), recordWidth(l.trailer), `${l.key} trailer`);
      assert.equal(r.bytes.length, r.text.length, `${l.key} TIS-620 1 byte/char`);
    }
    assert.ok(r.ok, `${l.key}: ${JSON.stringify(r.issues.filter((x) => x.level === "error"))}`);
  }
});

test("bank KTB Direct: 498-byte records per OCA/Ecosoft KTB layout", () => {
  const l = findBuiltin("bank_ktb_direct")!;
  assert.equal(recordWidth(l.header), 498);
  assert.equal(recordWidth(l.detail), 498);
  const r = buildExport(l, bankFileData(l, bankBatch, bankRows));
  const [h, d] = linesOf(r.text);
  assert.equal(h.slice(0, 19), "10" + "1" + "000001" + "006" + "0000001");
  assert.equal(h.slice(19, 38), "0000000000001523450", "19-digit satang total");
  assert.equal(h.slice(38, 55), "30092026" + "C" + "00000000");
  assert.equal(h.slice(55, 71), "KTBC001".padEnd(16));
  assert.equal(d.slice(0, 9), "102000001");
  assert.equal(d.slice(9, 12), "006");
  assert.equal(d.slice(16, 27), "01234567890");
  assert.equal(d.slice(27, 30), "006");
  assert.equal(d.slice(30, 34), "0123");
  assert.equal(d.slice(34, 45), "09876543210");
  assert.equal(d.slice(45, 53), "30092026");
  assert.equal(d.slice(53, 55), "02");
  assert.equal(d.slice(57, 74), "00000000001523450");
  assert.equal(d.slice(92, 192).trimEnd(), "สมชาย ใจดี", "account name without title");
  assert.equal(r.filename, "KTB-DIRECT-PR2609.txt");
});

test("bank LHB payroll: 80-byte H/D/T per bank manual", () => {
  const l = findBuiltin("bank_lhb_payroll")!;
  const r = buildExport(l, bankFileData(l, { ...bankBatch, company_bank_code: "004", company_account: "1234567890", company_bank_id: "LHB00001" }, bankRows));
  const recs = linesOf(r.text);
  assert.equal(recs.length, 3);
  for (const x of recs) assert.equal(bytesOf(x), 80);
  assert.equal(recs[0].slice(0, 44), "H000000LHB00001000001000000000900000" + "30092026");
  assert.equal(recs[1].slice(0, 32), "D0000012223334445000000000900000");
  assert.equal(recs[2].slice(0, 7), "T000000");
});

test("bank validation: account digits per receiving bank, missing company account, weekend effective date", () => {
  const l = findBuiltin("bank_generic_csv")!;
  const res = bankFileData(l, { ...bankBatch, company_account: "", effective_date: "2026-10-03" }, [
    { ...bankRows[0], account: "12345" },
    { ...bankRows[1], bank_code: null },
    { ...bankRows[4], account: "1234567890" },
  ]);
  const err = res.issues.filter((x) => x.level === "error").map((x) => x.message).join("\n");
  const warn = res.issues.filter((x) => x.level === "warn").map((x) => x.message).join("\n");
  assert.match(err, /เลขที่บัญชีบริษัท/);
  assert.match(err, /E0001 .*12345 มี 5 หลัก/);
  assert.match(err, /E0002 .*ไม่มีรหัสธนาคาร/);
  assert.match(err, /E0005 .*ใช้ 12 หรือ 15 หลัก/);
  assert.match(warn, /วันหยุดสุดสัปดาห์/);
});

test("accountNumber11 normalisation for interbank files", () => {
  assert.equal(accountNumber11("004", "123-4-56789-0"), "01234567890");
  assert.equal(accountNumber11("034", "012345678901"), "12345678901");
  assert.equal(accountNumber11("030", "020012345678"), "20012345678"); // GSB 12 → "999"+no → drop 4
  assert.equal(accountNumber11("069", "00011234567890"), "01234567890");
  assert.equal(stripPrefix("นางสาวสมหญิง รักงาน"), "สมหญิง รักงาน");
});

test("generic CSV keeps Excel-friendly UTF-8 BOM and quoting", () => {
  const l = findBuiltin("bank_generic_csv")!;
  const r = buildExport(l, bankFileData(l, bankBatch, bankRows.slice(0, 2)));
  assert.deepEqual([...r.bytes.slice(0, 3)], [0xef, 0xbb, 0xbf]);
  assert.equal(linesOf(r.text)[1], "1,006,1234567890,สมชาย ใจดี,15234.50,E0001,30/09/2569");
});
