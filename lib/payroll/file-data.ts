// Build template variables + validate data for bank / SSO / RD export files (pure — tests/payroll-files.test.ts)
//
// The report pages load rows under RLS and call these builders; renderFile() (file-engine.ts) then writes the file.
// Validation returns a Thai error list. Errors block the download (the agency would reject the file, or worse, a bank
// would transfer to a wrong account); warnings are shown but the file can still be downloaded.

import { validNationalId } from "../format";
import { formatDate, renderFile, toSatang, type FileData, type FileLayout, type Issue, type RenderedFile, type Vars } from "./file-engine";
import { accountNumber11, BANK_NAMES, expectedAccountLengths, SSO_TITLE_CODES } from "./file-layouts";

const digits = (s: unknown) => String(s ?? "").replace(/\D/g, "");
const r2 = (n: number) => toSatang(n) / 100;
const sum = <T,>(l: T[], f: (x: T) => number) => r2(l.reduce((s, x) => s + (Number(f(x)) || 0), 0));

/** valid 13-digit Thai tax id of a juristic person / individual (same mod-11 check digit as the national id) */
export const validTaxId = (s: string | null | undefined) => validNationalId(digits(s));

/** strip a leading title from a full name ("นายสมชาย ใจดี" → "สมชาย ใจดี") */
export function stripPrefix(name: string): string {
  return name.replace(/^(นางสาว|นาง|นาย|น\.ส\.|Mrs\.?|Mr\.?|Miss|Ms\.?)\s*/i, "").trim();
}

export interface CompanyInfo {
  name: string;
  name_en?: string | null;
  tax_id: string;
}

// ===================================================================================================== bank
export interface BankRow {
  employee_id: number;
  emp_code: string;
  prefix?: string | null;
  first_name: string;
  last_name: string;
  national_id?: string | null;
  email?: string | null;
  phone?: string | null;
  account_name?: string | null;
  bank_code: string | null;
  branch_code?: string | null;
  account: string | null;
  amount: number;
  pay_method: string;
}

export interface BankBatch {
  company: CompanyInfo;
  company_bank_code: string;
  company_bank_branch?: string;
  company_account: string;
  company_bank_id?: string;
  sender_name?: string;
  effective_date: string;
  batch_no?: number;
  batch_ref: string;
  period_code: string;
  pay_date: string;
}

export function bankFileData(layout: FileLayout, b: BankBatch, rows: BankRow[]): { data: FileData; issues: Issue[]; skipped: BankRow[] } {
  const issues: Issue[] = [];
  const scope = layout.bankScope ?? "any";
  const inScope = (r: BankRow) => scope === "any" || (scope === "same" ? r.bank_code === b.company_bank_code : r.bank_code !== b.company_bank_code);
  const candidates = rows.filter((r) => r.pay_method === "bank" && Number(r.amount) > 0);
  const list = candidates.filter(inScope);
  const skipped = candidates.filter((r) => !inScope(r));
  if (skipped.length)
    issues.push({ level: "warn", message: `ไม่รวม ${skipped.length} คนในไฟล์นี้ เพราะรูปแบบนี้ใช้กับ${scope === "same" ? `บัญชี${BANK_NAMES[b.company_bank_code] ?? b.company_bank_code}เท่านั้น` : "บัญชีต่างธนาคารเท่านั้น"} — สร้างอีกไฟล์ด้วยรูปแบบสำหรับกลุ่มนั้น` });

  const acc = digits(b.company_account);
  if (!acc) issues.push({ level: "error", message: "ยังไม่ได้ระบุเลขที่บัญชีบริษัท — ตั้งค่าที่ ตั้งค่าเวลา / เงินเดือน / ภาษี > บัญชีบริษัทและไฟล์โอนเงิน หรือกรอกในหน้าต่างนี้" });
  else if (!expectedAccountLengths(b.company_bank_code).includes(acc.length)) issues.push({ level: "warn", message: `เลขที่บัญชีบริษัท ${acc} มี ${acc.length} หลัก (ปกติ ${expectedAccountLengths(b.company_bank_code).join("/")} หลัก)` });
  if (!b.effective_date) issues.push({ level: "error", message: "ระบุวันที่มีผลโอนเงิน" });
  else {
    const d = new Date(b.effective_date + "T00:00:00Z").getUTCDay();
    if (d === 0 || d === 6) issues.push({ level: "warn", message: `วันที่มีผล ${formatDate(b.effective_date, "DD/MM/YYYY")} เป็นวันหยุดสุดสัปดาห์ — ธนาคารไม่โอนในวันหยุด` });
  }

  const out: Vars[] = [];
  list.forEach((r, i) => {
    const who = `${r.emp_code} ${r.first_name} ${r.last_name}`;
    const a = digits(r.account);
    const bank = digits(r.bank_code).padStart(3, "0");
    if (!r.bank_code) issues.push({ level: "error", message: `${who}: ไม่มีรหัสธนาคาร`, row: i });
    else if (!BANK_NAMES[bank]) issues.push({ level: "warn", message: `${who}: รหัสธนาคาร ${bank} ไม่อยู่ในรายชื่อธนาคาร`, row: i });
    if (!a) issues.push({ level: "error", message: `${who}: ไม่มีเลขที่บัญชี`, row: i });
    else if (layout.accountDigits === "bot" ? !expectedAccountLengths(bank).includes(a.length) : typeof layout.accountDigits === "number" && a.length !== layout.accountDigits)
      issues.push({ level: "error", message: `${who}: เลขที่บัญชี ${a} มี ${a.length} หลัก แต่${BANK_NAMES[bank] ?? `ธนาคาร ${bank}`}ใช้ ${layout.accountDigits === "bot" ? expectedAccountLengths(bank).join(" หรือ ") : layout.accountDigits} หลัก`, row: i });
    const name = (r.account_name || `${r.first_name} ${r.last_name}`).trim();
    out.push({
      "employee.code": r.emp_code,
      "employee.prefix": r.prefix ?? "",
      "employee.first_name": r.first_name,
      "employee.last_name": r.last_name,
      "employee.full_name": `${r.first_name} ${r.last_name}`.trim(),
      "employee.national_id": digits(r.national_id),
      "employee.email": r.email ?? "",
      "employee.phone": digits(r.phone),
      "account.name": stripPrefix(name),
      "account.bank_code": bank,
      "account.branch_code": digits(r.branch_code) ? digits(r.branch_code).slice(-4).padStart(4, "0") : "",
      "account.number": a,
      "account.number11": a ? accountNumber11(bank, a) : "",
      "entry.net_pay": r2(r.amount),
      "entry.ref": `${b.period_code}-${r.emp_code}`.slice(0, 18),
    });
  });

  const total = sum(list, (r) => r.amount);
  const file: Vars = {
    "company.name": b.company.name,
    "company.name_en": b.company.name_en ?? "",
    "company.tax_id": digits(b.company.tax_id),
    "company.bank_code": digits(b.company_bank_code).padStart(3, "0"),
    "company.bank_branch": digits(b.company_bank_branch).slice(-4).padStart(4, "0"),
    "company.account": acc,
    "company.bank_id": (b.company_bank_id ?? "").trim(),
    "company.sender_name": b.sender_name || b.company.name_en || b.company.name,
    "period.code": b.period_code,
    "period.pay_date": b.pay_date,
    today: new Date().toISOString().slice(0, 10),
    "batch.no": b.batch_no ?? 1,
    "batch.ref": b.batch_ref,
    "batch.effective_date": b.effective_date,
    "batch.count": list.length,
    "batch.total": total,
  };
  return { data: { file, rows: out }, issues, skipped };
}

// ============================================================================================ SSO สปส.1-10
export interface SsoRow {
  employee_id: number;
  emp_code: string;
  sso_no?: string | null;
  national_id?: string | null;
  prefix: string | null;
  first_name: string;
  last_name: string;
  wage: number;
  employee: number;
  employer: number;
}

export interface SsoBatch {
  company: CompanyInfo;
  branch_name?: string;
  account_no: string;
  branch_no: string;
  pay_date: string;
  year: number; // ค.ศ.
  month: number;
  rate: number; // % per side (5)
  employer_rate?: number;
  ceiling: number;
  floor: number;
  period_code?: string;
}

/** contribution per SSO rule: round half up to whole baht (สปส.1-10 คำชี้แจง: เศษตั้งแต่ 50 สตางค์ปัดเป็น 1 บาท) */
export function ssoRound(n: number): number {
  return Math.floor(n + 0.5 + 1e-9);
}

export function ssoFileData(b: SsoBatch, rows: SsoRow[]): { data: FileData; issues: Issue[] } {
  const issues: Issue[] = [];
  if (!/^\d{10}$/.test(digits(b.account_no))) issues.push({ level: "error", message: `เลขที่บัญชีนายจ้างต้องเป็นตัวเลข 10 หลัก (ตอนนี้: "${b.account_no || "-"}") — แก้ที่ องค์กร > สาขา / สถานประกอบการ` });
  if (!/^\d{1,6}$/.test(digits(b.branch_no) || "0")) issues.push({ level: "error", message: `ลำดับที่สาขาต้องเป็นตัวเลขไม่เกิน 6 หลัก (ตอนนี้: "${b.branch_no}")` });
  if (!b.pay_date) issues.push({ level: "error", message: "ระบุวันที่ชำระเงิน" });
  const erRate = b.employer_rate ?? b.rate;
  const seen = new Map<string, string>();
  const out: Vars[] = [];
  rows.forEach((r, i) => {
    const who = `${r.emp_code} ${r.first_name} ${r.last_name}`;
    const id = digits(r.sso_no) || digits(r.national_id);
    if (!id) issues.push({ level: "error", message: `${who}: ไม่มีเลขประจำตัวประชาชน/เลขประกันสังคม`, row: i });
    else if (id.length !== 13) issues.push({ level: "error", message: `${who}: เลขประกันสังคม ${id} ต้องมี 13 หลัก`, row: i });
    else if (!validNationalId(id)) issues.push({ level: "warn", message: `${who}: เลข ${id} หลักตรวจสอบไม่ถูกต้อง (ตรวจกับบัตรประชาชน)`, row: i });
    if (id && seen.has(id)) issues.push({ level: "error", message: `${who}: เลข ${id} ซ้ำกับ ${seen.get(id)} — ผู้ประกันตนต้องมีบรรทัดเดียวต่อเดือน`, row: i });
    if (id) seen.set(id, who);
    if (!r.first_name?.trim() || !r.last_name?.trim()) issues.push({ level: "error", message: `${who}: ไม่มีชื่อหรือนามสกุล`, row: i });
    const prefix = (r.prefix ?? "").trim();
    const title = SSO_TITLE_CODES[prefix];
    if (!title) issues.push({ level: "warn", message: `${who}: คำนำหน้า "${prefix || "-"}" ไม่มีรหัสในตาราง สปส. ใส่ 000`, row: i });
    if (r.wage < 0 || r.employee < 0 || r.employer < 0) issues.push({ level: "error", message: `${who}: ค่าจ้าง/เงินสมทบติดลบ`, row: i });
    if (r.wage > b.ceiling + 0.004) issues.push({ level: "error", message: `${who}: ค่าจ้าง ${r.wage.toFixed(2)} เกินเพดาน ${b.ceiling.toLocaleString()} บาท ของเดือนนี้`, row: i });
    // contribution = rate × wage (wage already floored/capped by the payroll engine), rounded per SSO rule
    const base = Math.min(Math.max(r.wage, r.wage > 0 ? b.floor : 0), b.ceiling);
    const expEmp = ssoRound((base * b.rate) / 100);
    const expEr = ssoRound((base * erRate) / 100);
    if (Math.abs(expEmp - r.employee) > 0.001) issues.push({ level: "warn", message: `${who}: เงินสมทบผู้ประกันตน ${r.employee.toFixed(2)} ไม่เท่ากับ ${b.rate}% × ${base.toFixed(2)} = ${expEmp.toFixed(2)} (อาจถูกหักบางส่วนในงวดอื่นของเดือน)`, row: i });
    if (Math.abs(expEr - r.employer) > 0.001) issues.push({ level: "warn", message: `${who}: เงินสมทบนายจ้าง ${r.employer.toFixed(2)} ไม่เท่ากับ ${erRate}% × ${base.toFixed(2)} = ${expEr.toFixed(2)}`, row: i });
    out.push({
      "employee.code": r.emp_code,
      "insured.id": id,
      "insured.title_code": title ?? "000",
      "insured.prefix": prefix,
      "insured.first_name": r.first_name.trim(),
      "insured.last_name": r.last_name.trim(),
      "insured.wage": r2(r.wage),
      "insured.employee": r2(r.employee),
      "insured.employer": r2(r.employer),
    });
  });
  const tw = sum(rows, (r) => r.wage);
  const te = sum(rows, (r) => r.employee);
  const tr = sum(rows, (r) => r.employer);
  const wageMonth = `${b.year}-${String(b.month).padStart(2, "0")}-01`;
  const file: Vars = {
    "company.name": b.company.name,
    "company.name_en": b.company.name_en ?? "",
    "company.tax_id": digits(b.company.tax_id),
    "period.code": b.period_code ?? "",
    "period.pay_date": b.pay_date,
    today: new Date().toISOString().slice(0, 10),
    "employer.account_no": digits(b.account_no),
    "employer.branch_no": (digits(b.branch_no) || "0").padStart(6, "0"),
    "branch.name": b.branch_name ?? "",
    "sso.pay_date": b.pay_date,
    "sso.wage_month": wageMonth,
    "sso.wage_month_be": `${b.year + 543}${String(b.month).padStart(2, "0")}`,
    "sso.rate": b.rate,
    "sso.rate100": Math.round(b.rate * 100),
    "sso.count": rows.length,
    "sso.total_wage": tw,
    "sso.total_contribution": r2(te + tr),
    "sso.total_employee": te,
    "sso.total_employer": tr,
  };
  return { data: { file, rows: out }, issues };
}

// ================================================================================================ PVD
export interface PvdRow {
  employee_id: number;
  emp_code: string;
  member_no: string | null;
  national_id: string | null;
  prefix: string | null;
  first_name: string;
  last_name: string;
  wage: number;
  employee_rate: number;
  employer_rate: number;
  employee: number;
  employer: number;
}

export interface PvdBatch {
  company: { name: string; name_en?: string; tax_id: string };
  period_code: string;
  pay_date: string;
  year: number;
  month: number;
  fund_name?: string;
  employer_code?: string;
}

export function pvdFileData(b: PvdBatch, rows: PvdRow[]): { data: FileData; issues: Issue[] } {
  const issues: Issue[] = [];
  const out: Vars[] = [];
  rows.forEach((r, i) => {
    const who = `${r.emp_code} ${r.first_name} ${r.last_name}`;
    const id = digits(r.national_id);
    if (!id) issues.push({ level: "error", message: `${who}: ไม่มีเลขประจำตัวประชาชน`, row: i });
    else if (!validNationalId(id)) issues.push({ level: "warn", message: `${who}: เลข ${id} หลักตรวจสอบไม่ถูกต้อง`, row: i });
    if (!r.member_no) issues.push({ level: "warn", message: `${who}: ยังไม่มีเลขที่สมาชิกกองทุน (ข้อมูลพนักงาน > เงินเดือน)`, row: i });
    if (r.employee < 0 || r.employer < 0) issues.push({ level: "error", message: `${who}: เงินสะสม/สมทบติดลบ`, row: i });
    const expEmp = r2((r.wage * r.employee_rate) / 100);
    if (r.wage > 0 && Math.abs(expEmp - r.employee) > 1) issues.push({ level: "warn", message: `${who}: เงินสะสม ${r.employee.toFixed(2)} ไม่เท่ากับ ${r.employee_rate}% × ${r.wage.toFixed(2)} (ปัดเศษหรือมีหลายงวดในเดือน)`, row: i });
    out.push({
      "employee.code": r.emp_code,
      "member.no": r.member_no ?? "",
      "member.national_id": id,
      "member.prefix": (r.prefix ?? "").trim(),
      "member.first_name": r.first_name.trim(),
      "member.last_name": r.last_name.trim(),
      "member.wage": r2(r.wage),
      "member.employee_rate": r.employee_rate,
      "member.employer_rate": r.employer_rate,
      "member.employee": r2(r.employee),
      "member.employer": r2(r.employer),
    });
  });
  const te = sum(rows, (r) => r.employee);
  const tr = sum(rows, (r) => r.employer);
  const file: Vars = {
    "company.name": b.company.name,
    "company.name_en": b.company.name_en ?? "",
    "company.tax_id": digits(b.company.tax_id),
    "period.code": b.period_code,
    "period.pay_date": b.pay_date,
    today: new Date().toISOString().slice(0, 10),
    "pvd.fund_name": b.fund_name ?? "",
    "pvd.employer_code": b.employer_code ?? "",
    "pvd.wage_month": `${b.year}-${String(b.month).padStart(2, "0")}-01`,
    "pvd.count": rows.length,
    "pvd.total_wage": sum(rows, (r) => r.wage),
    "pvd.total_employee": te,
    "pvd.total_employer": tr,
    "pvd.total": r2(te + tr),
  };
  return { data: { file, rows: out }, issues };
}

// ================================================================================================ RD
export interface RdRow {
  employee_id: number;
  emp_code: string;
  pin: string | null;
  prefix: string | null;
  first_name: string;
  last_name: string;
  pay_date: string;
  income: number;
  tax: number;
  condition?: 1 | 2 | 3;
  address?: {
    house_no?: string | null; moo?: string | null; village?: string | null; soi?: string | null; road?: string | null;
    subdistrict?: string | null; district?: string | null; province?: string | null; postcode?: string | null;
  } | null;
  sso?: number;
  pvd?: number;
}

export interface RdBatch {
  company: CompanyInfo;
  kind: "pnd1" | "pnd1a";
  year: number; // ค.ศ.
  month?: number;
  branch_no: string; // 5 digits (00000 = สำนักงานใหญ่)
  dept_name?: string;
  form_type?: number; // 0 = ยื่นปกติ, 1.. = ยื่นเพิ่มเติม
  send_no?: number;
  user_id?: string;
  /** require address fields (RD V2 format marks อำเภอ/จังหวัด/รหัสไปรษณีย์ as mandatory) */
  requireAddress?: boolean;
}

export function rdFileData(b: RdBatch, rows: RdRow[]): { data: FileData; issues: Issue[] } {
  const issues: Issue[] = [];
  const tax = digits(b.company.tax_id);
  if (!tax) issues.push({ level: "error", message: "ยังไม่ได้ระบุเลขประจำตัวผู้เสียภาษีของบริษัท — ตั้งค่าที่ ตั้งค่า > ข้อมูลบริษัท" });
  else if (tax.length !== 13) issues.push({ level: "error", message: `เลขประจำตัวผู้เสียภาษีของบริษัท ${tax} ต้องมี 13 หลัก` });
  else if (!validTaxId(tax)) issues.push({ level: "error", message: `เลขประจำตัวผู้เสียภาษีของบริษัท ${tax} หลักตรวจสอบ (หลักที่ 13) ไม่ถูกต้อง — ตรวจกับหนังสือรับรองบริษัท` });
  const br = digits(b.branch_no);
  if (br.length > 6 || (b.branch_no && !/^\d+$/.test(b.branch_no.trim()))) issues.push({ level: "error", message: `เลขที่สาขา "${b.branch_no}" ต้องเป็นตัวเลข 5 หลัก (สำนักงานใหญ่ = 00000)` });
  if (b.kind === "pnd1" && !(b.month && b.month >= 1 && b.month <= 12)) issues.push({ level: "error", message: "ระบุเดือนภาษี" });

  const seen = new Map<string, string>();
  const out: Vars[] = [];
  rows.forEach((r, i) => {
    const who = `${r.emp_code} ${r.first_name} ${r.last_name}`;
    const pin = digits(r.pin);
    if (!pin) issues.push({ level: "error", message: `${who}: ไม่มีเลขประจำตัวผู้เสียภาษี/เลขบัตรประชาชน`, row: i });
    else if (pin.length !== 13) issues.push({ level: "error", message: `${who}: เลขประจำตัวผู้เสียภาษี ${pin} ต้องมี 13 หลัก`, row: i });
    else if (!validNationalId(pin)) issues.push({ level: "error", message: `${who}: เลขประจำตัวผู้เสียภาษี ${pin} หลักตรวจสอบไม่ถูกต้อง — e-Filing จะไม่รับรายการนี้`, row: i });
    if (pin && seen.has(pin)) issues.push({ level: "error", message: `${who}: เลข ${pin} ซ้ำกับ ${seen.get(pin)}`, row: i });
    if (pin) seen.set(pin, who);
    if (!r.prefix?.trim()) issues.push({ level: "error", message: `${who}: ไม่มีคำนำหน้าชื่อ`, row: i });
    if (!r.first_name?.trim()) issues.push({ level: "error", message: `${who}: ไม่มีชื่อ`, row: i });
    if (!r.last_name?.trim()) issues.push({ level: "error", message: `${who}: ไม่มีชื่อสกุล`, row: i });
    if (r.income < 0 || r.tax < 0) issues.push({ level: "error", message: `${who}: จำนวนเงินได้หรือภาษีติดลบ (${r.income.toFixed(2)} / ${r.tax.toFixed(2)}) — ตรวจรายการปรับปรุงก่อนยื่น`, row: i });
    if (r.tax > r.income && r.income >= 0) issues.push({ level: "error", message: `${who}: ภาษีที่หัก (${r.tax.toFixed(2)}) มากกว่าเงินได้ (${r.income.toFixed(2)})`, row: i });
    const a = r.address ?? {};
    if (b.requireAddress && (!a.district || !a.province || digits(a.postcode).length !== 5))
      issues.push({ level: "error", message: `${who}: ที่อยู่ไม่ครบ (ต้องมี อำเภอ/เขต จังหวัด และรหัสไปรษณีย์ 5 หลัก)`, row: i });
    const addr1 = [a.house_no, a.moo && `หมู่ ${a.moo}`, a.village, a.soi && `ซ.${a.soi}`, a.road && `ถ.${a.road}`].filter(Boolean).join(" ");
    const addr2 = [a.subdistrict && `ต.${a.subdistrict}`, a.district && `อ.${a.district}`, a.province && `จ.${a.province}`].filter(Boolean).join(" ");
    out.push({
      "employee.code": r.emp_code,
      "payee.pin": pin,
      "payee.tin10": "0000000000",
      "payee.prefix": (r.prefix ?? "").trim(),
      "payee.first_name": r.first_name.trim(),
      "payee.last_name": r.last_name.trim(),
      "payee.address1": addr1,
      "payee.address2": addr2,
      "payee.building": "",
      "payee.room": "",
      "payee.floor": "",
      "payee.village": a.village ?? "",
      "payee.house_no": a.house_no ?? "",
      "payee.moo": a.moo ?? "",
      "payee.soi": a.soi ?? "",
      "payee.road": a.road ?? "",
      "payee.subdistrict": a.subdistrict ?? "",
      "payee.district": a.district ?? "",
      "payee.province": a.province ?? "",
      "payee.postcode": digits(a.postcode),
      "pay.date": b.kind === "pnd1a" ? `${b.year}-12-31` : r.pay_date,
      "pay.tax_rate": 0,
      "pay.income": r2(r.income),
      "pay.tax": r2(r.tax),
      "pay.income_code": 1,
      "pay.condition": r.condition ?? 1,
      "fund.gpf": 0,
      "fund.sso": r2(r.sso ?? 0),
      "fund.pvd": r2(r.pvd ?? 0),
    });
  });
  const totalIncome = sum(rows, (r) => r.income);
  const totalTax = sum(rows, (r) => r.tax);
  const month = b.kind === "pnd1a" ? "00" : String(b.month ?? 0).padStart(2, "0");
  const file: Vars = {
    "company.name": b.company.name,
    "company.name_en": b.company.name_en ?? "",
    "company.tax_id": tax,
    "company.tax_id10": "0000000000",
    "period.code": "",
    "period.pay_date": "",
    today: new Date().toISOString().slice(0, 10),
    "rd.branch4": br.padStart(4, "0").slice(-4),
    "rd.branch5": br.padStart(5, "0").slice(-5),
    "rd.branch6": br.padStart(6, "0").slice(-6),
    "rd.dept_name": b.dept_name || "สำนักงานใหญ่",
    "rd.tax_type": b.kind === "pnd1" ? "PND1" : "PND1A",
    "rd.tax_month": month,
    "rd.tax_year": String(b.year + 543),
    "rd.form_type": String(b.form_type ?? 0).padStart(2, "0"),
    "rd.send_no": String(b.send_no ?? 0).padStart(2, "0"),
    "rd.sender_id": "0000",
    "rd.sender_role": "1",
    "rd.lto": "0",
    "rd.branch_type": "",
    "rd.user_id": b.user_id ?? "",
    "rd.form_flag": "2",
    "rd.count": rows.length,
    "rd.total_income": totalIncome,
    "rd.total_tax": totalTax,
    "rd.surcharge": 0,
    "rd.grand_tax": totalTax,
    "rd.trans_amt": totalTax,
  };
  return { data: { file, rows: out }, issues };
}

/** render + merge the data issues; `ok` = no blocking errors */
export function buildExport(layout: FileLayout, built: { data: FileData; issues: Issue[] }): RenderedFile & { ok: boolean } {
  const r = renderFile(layout, built.data);
  const issues = [...built.issues, ...r.issues];
  return { ...r, issues, ok: !issues.some((x) => x.level === "error") };
}
