// Built-in export layouts (bank / SSO / RD) + the variables a layout can use. Pure data — see docs/GOV-BANK-FILES.md
//
// Every layout records where its spec came from. status:
//   official   — published by the agency / bank itself (URL + date in `source`)
//   secondary  — reproduced by a third party (software vendor / open-source module) from the agency/bank spec
//   unverified — common structure only; the customer MUST confirm with the bank (ต้องยืนยันกับธนาคาร) and adjust the
//                layout in /settings/file-formats (clone → edit) if the bank's spec differs
import type { FieldDef, FileKind, FileLayout } from "./file-engine";

// ------------------------------------------------------------------------------------------------ variables
export interface VarDef {
  key: string;
  label: string;
  scope: "file" | "row";
  example?: string;
}

const v = (key: string, label: string, scope: "file" | "row", example?: string): VarDef => ({ key, label, scope, example });

const COMMON_FILE: VarDef[] = [
  v("company.name", "ชื่อบริษัท", "file", "บริษัท ตัวอย่าง จำกัด"),
  v("company.name_en", "ชื่อบริษัท (อังกฤษ)", "file"),
  v("company.tax_id", "เลขประจำตัวผู้เสียภาษีบริษัท (13 หลัก)", "file", "0105556000001"),
  v("period.code", "รหัสงวดเงินเดือน", "file", "PR202609-1"),
  v("period.pay_date", "วันที่จ่ายเงินเดือน", "file", "2026-09-30"),
  v("today", "วันที่สร้างไฟล์", "file"),
];

export const VARIABLES: Record<FileKind, VarDef[]> = {
  bank: [
    ...COMMON_FILE,
    v("company.bank_code", "รหัสธนาคารของบัญชีบริษัท (3 หลัก)", "file", "006"),
    v("company.bank_branch", "รหัสสาขาบัญชีบริษัท (4 หลัก)", "file", "0123"),
    v("company.account", "เลขที่บัญชีบริษัท (ตัวเลขล้วน)", "file", "1234567890"),
    v("company.bank_id", "Company ID / รหัสบริษัทที่ธนาคารกำหนด", "file"),
    v("company.sender_name", "ชื่อผู้โอน (ชื่อบัญชีบริษัท)", "file"),
    v("batch.no", "เลขที่ชุด (Batch No.)", "file", "1"),
    v("batch.ref", "เลขอ้างอิงชุด", "file", "PR202609-1"),
    v("batch.effective_date", "วันที่มีผลโอนเงิน", "file", "2026-09-30"),
    v("batch.count", "จำนวนรายการ", "file", "45"),
    v("batch.total", "ยอดรวมเงินโอน", "file", "812345.50"),
    v("employee.code", "รหัสพนักงาน", "row", "E0001"),
    v("employee.prefix", "คำนำหน้า", "row", "นาย"),
    v("employee.first_name", "ชื่อ", "row", "สมชาย"),
    v("employee.last_name", "นามสกุล", "row", "ใจดี"),
    v("employee.full_name", "ชื่อ-นามสกุล (ไม่มีคำนำหน้า)", "row", "สมชาย ใจดี"),
    v("employee.national_id", "เลขประจำตัวประชาชน", "row"),
    v("employee.email", "อีเมล", "row"),
    v("employee.phone", "เบอร์โทร", "row"),
    v("account.name", "ชื่อบัญชีผู้รับ", "row", "สมชาย ใจดี"),
    v("account.bank_code", "รหัสธนาคารผู้รับ (3 หลัก ธปท.)", "row", "004"),
    v("account.branch_code", "รหัสสาขาผู้รับ (4 หลัก)", "row", "0001"),
    v("account.number", "เลขที่บัญชีผู้รับ (ตัวเลขล้วน)", "row", "1234567890"),
    v("account.number11", "เลขที่บัญชีผู้รับ 11 หลัก (มาตรฐาน ITMX/ธนาคาร)", "row", "01234567890"),
    v("entry.net_pay", "จำนวนเงินโอน (เงินได้สุทธิ)", "row", "15234.50"),
    v("entry.ref", "เลขอ้างอิงรายการ (รหัสงวด-รหัสพนักงาน)", "row"),
  ],
  sso: [
    ...COMMON_FILE,
    v("employer.account_no", "เลขที่บัญชีนายจ้าง (10 หลัก)", "file", "1000123456"),
    v("employer.branch_no", "ลำดับที่สาขา (6 หลัก)", "file", "000000"),
    v("branch.name", "ชื่อสาขา / สถานประกอบการ", "file"),
    v("sso.pay_date", "วันที่ชำระเงิน", "file"),
    v("sso.wage_month", "งวดค่าจ้าง (วันที่ 1 ของเดือน)", "file", "2026-09-01"),
    v("sso.rate100", "อัตราเงินสมทบ × 100 (5% = 500)", "file", "500"),
    v("sso.rate", "อัตราเงินสมทบ (%)", "file", "5"),
    v("sso.count", "จำนวนผู้ประกันตน", "file"),
    v("sso.total_wage", "ค่าจ้างรวม", "file"),
    v("sso.total_contribution", "เงินสมทบรวม (ผู้ประกันตน + นายจ้าง)", "file"),
    v("sso.total_employee", "เงินสมทบส่วนผู้ประกันตน", "file"),
    v("sso.total_employer", "เงินสมทบส่วนนายจ้าง", "file"),
    v("insured.id", "เลขประจำตัวประชาชน / เลขประกันสังคม", "row", "1103700123451"),
    v("insured.title_code", "รหัสคำนำหน้าชื่อ (ตามตาราง สปส.)", "row", "003"),
    v("insured.prefix", "คำนำหน้า", "row", "นาย"),
    v("insured.first_name", "ชื่อ", "row"),
    v("insured.last_name", "นามสกุล", "row"),
    v("sso.wage_month_be", "งวดค่าจ้าง ปปปปดด (พ.ศ.) สำหรับชื่อไฟล์", "file", "256909"),
    v("insured.wage", "ค่าจ้างที่ใช้คำนวณเงินสมทบ (ไม่เกินเพดาน)", "row", "17500.00"),
    v("insured.employee", "เงินสมทบผู้ประกันตน", "row", "875.00"),
    v("insured.employer", "เงินสมทบนายจ้าง", "row", "875.00"),
    v("employee.code", "รหัสพนักงาน", "row"),
  ],
  pnd1: [] as VarDef[],
  pnd1a: [] as VarDef[],
  rd_fund: [] as VarDef[],
  pvd: [
    ...COMMON_FILE,
    v("pvd.fund_name", "ชื่อกองทุน (ตั้งค่า เงินเดือน)", "file"),
    v("pvd.employer_code", "รหัสนายจ้าง / รหัสบริษัทที่บริษัทจัดการกำหนด", "file"),
    v("pvd.wage_month", "งวดค่าจ้าง (วันที่ 1 ของเดือน)", "file", "2026-09-01"),
    v("pvd.count", "จำนวนสมาชิก", "file"),
    v("pvd.total_wage", "ค่าจ้างที่ใช้คำนวณรวม", "file"),
    v("pvd.total_employee", "เงินสะสมรวม (ลูกจ้าง)", "file"),
    v("pvd.total_employer", "เงินสมทบรวม (นายจ้าง)", "file"),
    v("pvd.total", "รวมเงินนำส่ง", "file"),
    v("employee.code", "รหัสพนักงาน", "row"),
    v("member.no", "เลขที่สมาชิกกองทุน", "row"),
    v("member.national_id", "เลขประจำตัวประชาชน", "row"),
    v("member.prefix", "คำนำหน้า", "row"),
    v("member.first_name", "ชื่อ", "row"),
    v("member.last_name", "นามสกุล", "row"),
    v("member.wage", "ค่าจ้างที่ใช้คำนวณ", "row", "30000.00"),
    v("member.employee_rate", "อัตราเงินสะสม (%)", "row", "5"),
    v("member.employer_rate", "อัตราเงินสมทบ (%)", "row", "5"),
    v("member.employee", "เงินสะสม (ลูกจ้าง)", "row", "1500.00"),
    v("member.employer", "เงินสมทบ (นายจ้าง)", "row", "1500.00"),
  ],
};

const RD_FILE: VarDef[] = [
  ...COMMON_FILE,
  v("company.tax_id10", "เลขผู้เสียภาษี 10 หลักเดิม (ไม่มี = 0000000000)", "file", "0000000000"),
  v("rd.branch4", "เลขที่สาขา 4 หลัก", "file", "0000"),
  v("rd.branch5", "เลขที่สาขา 5 หลัก", "file", "00000"),
  v("rd.branch6", "เลขที่สาขา 6 หลัก", "file", "000000"),
  v("rd.dept_name", "ชื่อแผนก/ส่วน/ฝ่าย", "file", "สำนักงานใหญ่"),
  v("rd.tax_type", "ประเภทแบบ (PND1 / PND1A)", "file", "PND1"),
  v("rd.tax_month", "เดือนภาษี (01–12, ภ.ง.ด.1ก = 00)", "file", "09"),
  v("rd.tax_year", "ปีภาษี (พ.ศ. 4 หลัก)", "file", "2569"),
  v("rd.form_type", "ประเภทการยื่น (00 ปกติ, 01 เพิ่มเติมครั้งที่ 1 …)", "file", "00"),
  v("rd.send_no", "ครั้งที่ส่งไฟล์ (00–99)", "file", "00"),
  v("rd.sender_id", "รหัสผู้นำส่ง (0000)", "file", "0000"),
  v("rd.sender_role", "ประเภทการนำส่ง (1 ผู้หักภาษี)", "file", "1"),
  v("rd.lto", "ผู้ประกอบการรายใหญ่ (0/1)", "file", "0"),
  v("rd.branch_type", "ประเภทสาขา (V / S / ว่าง)", "file"),
  v("rd.user_id", "รหัสผู้ใช้ e-Filing / เลขอ้างอิง", "file"),
  v("rd.form_flag", "ช่องทาง (1 สื่อ, 2 อินเทอร์เน็ต)", "file", "2"),
  v("rd.count", "จำนวนราย", "file"),
  v("rd.total_income", "รวมเงินได้", "file"),
  v("rd.total_tax", "รวมภาษีนำส่ง", "file"),
  v("rd.surcharge", "เงินเพิ่ม (0.00)", "file", "0.00"),
  v("rd.grand_tax", "รวมภาษีและเงินเพิ่ม", "file"),
  v("rd.trans_amt", "จำนวนเงินโอนผ่านธนาคาร", "file"),
];
const RD_ROW: VarDef[] = [
  v("payee.pin", "เลขประจำตัวผู้เสียภาษี / เลขบัตรประชาชน (13 หลัก)", "row", "1103700123451"),
  v("payee.tin10", "เลขผู้เสียภาษี 10 หลักเดิม (0000000000)", "row", "0000000000"),
  v("payee.prefix", "คำนำหน้าชื่อ", "row", "นาย"),
  v("payee.first_name", "ชื่อ", "row", "สมชาย"),
  v("payee.last_name", "ชื่อสกุล", "row", "ใจดี"),
  v("payee.address1", "ที่อยู่ บรรทัด 1", "row"),
  v("payee.address2", "ที่อยู่ บรรทัด 2", "row"),
  v("payee.building", "ชื่ออาคาร", "row"),
  v("payee.room", "ห้องเลขที่", "row"),
  v("payee.floor", "ชั้นที่", "row"),
  v("payee.village", "หมู่บ้าน", "row"),
  v("payee.house_no", "เลขที่", "row"),
  v("payee.moo", "หมู่ที่", "row"),
  v("payee.soi", "ซอย/แยก", "row"),
  v("payee.road", "ถนน", "row"),
  v("payee.subdistrict", "ตำบล/แขวง", "row"),
  v("payee.district", "อำเภอ/เขต", "row"),
  v("payee.province", "จังหวัด", "row"),
  v("payee.postcode", "รหัสไปรษณีย์", "row"),
  v("pay.date", "วันเดือนปีที่จ่าย", "row", "2026-09-30"),
  v("pay.tax_rate", "อัตราภาษี (อัตราก้าวหน้า = 0)", "row", "0"),
  v("pay.income", "จำนวนเงินที่จ่าย", "row", "30000.00"),
  v("pay.tax", "ภาษีที่หักและนำส่ง", "row", "312.50"),
  v("pay.income_code", "ประเภทเงินได้ (1 = 40(1))", "row", "1"),
  v("pay.condition", "เงื่อนไขการหักภาษี (1/2/3)", "row", "1"),
  v("fund.gpf", "กบข./กสจ./กองทุนสงเคราะห์ครู", "row", "0.00"),
  v("fund.sso", "เงินสมทบกองทุนประกันสังคม", "row"),
  v("fund.pvd", "เงินสะสมกองทุนสำรองเลี้ยงชีพ", "row"),
  v("employee.code", "รหัสพนักงาน", "row"),
];
VARIABLES.pnd1 = [...RD_FILE, ...RD_ROW];
VARIABLES.pnd1a = [...RD_FILE, ...RD_ROW];
VARIABLES.rd_fund = [...RD_FILE, ...RD_ROW];

export const KIND_LABEL: Record<FileKind, string> = {
  bank: "ไฟล์โอนเงินเดือนเข้าธนาคาร",
  sso: "ไฟล์ส่งเงินสมทบประกันสังคม (สปส.1-10)",
  pnd1: "ไฟล์ ภ.ง.ด.1 (รายเดือน)",
  pnd1a: "ไฟล์ ภ.ง.ด.1ก (ประจำปี)",
  rd_fund: "ไฟล์ข้อมูลกองทุน (แนบ ภ.ง.ด.1ก)",
  pvd: "ไฟล์นำส่งกองทุนสำรองเลี้ยงชีพ",
};

export const STATUS_LABEL: Record<FileLayout["status"], string> = {
  official: "ตามสเปกทางการ",
  secondary: "ตามเอกสารที่เผยแพร่ (ไม่ใช่ต้นฉบับหน่วยงาน)",
  unverified: "ต้องยืนยันกับธนาคาร",
};

// ------------------------------------------------------------------------------------- bank codes (ธปท. / ITMX)
/** 3-digit receiving bank codes used by Thai interbank (Smart / Media Clearing) files */
export const BANK_NAMES: Record<string, string> = {
  "002": "ธนาคารกรุงเทพ (BBL)",
  "004": "ธนาคารกสิกรไทย (KBANK)",
  "006": "ธนาคารกรุงไทย (KTB)",
  "011": "ธนาคารทหารไทยธนชาต (TTB)",
  "014": "ธนาคารไทยพาณิชย์ (SCB)",
  "017": "ธนาคารซิตี้แบงก์ (CITI)",
  "022": "ธนาคารซีไอเอ็มบี ไทย (CIMBT)",
  "024": "ธนาคารยูโอบี (UOB)",
  "025": "ธนาคารกรุงศรีอยุธยา (BAY)",
  "030": "ธนาคารออมสิน (GSB)",
  "031": "ธนาคารฮ่องกงและเซี่ยงไฮ้ (HSBC)",
  "033": "ธนาคารอาคารสงเคราะห์ (GHB)",
  "034": "ธ.ก.ส. (BAAC)",
  "066": "ธนาคารอิสลามแห่งประเทศไทย (IBANK)",
  "067": "ธนาคารทิสโก้ (TISCO)",
  "069": "ธนาคารเกียรตินาคินภัทร (KKP)",
  "070": "ธนาคารไอซีบีซี (ไทย) (ICBCT)",
  "071": "ธนาคารไทยเครดิต (TCR)",
  "073": "ธนาคารแลนด์ แอนด์ เฮ้าส์ (LHB)",
};

/**
 * Account number length per receiving bank (digits). Most Thai banks use 10 digits; the exceptions follow the
 * normalisation rules of OCA l10n_th_bank_payment_export (Ecosoft, AGPL — logic re-implemented, not copied):
 * GSB/GHB/BAAC/IBANK/HSBC 12, TISCO/KKP 14. Interbank files carry 11 digits (see accountNumber11).
 */
export const ACCOUNT_LENGTH: Record<string, number[]> = { "030": [12, 15], "031": [12], "033": [12], "034": [12], "066": [12], "067": [14], "069": [14] };

export function expectedAccountLengths(bank: string): number[] {
  return ACCOUNT_LENGTH[bank] ?? [10];
}

/** 11-digit account for interbank/KTB files: ≤11 → left-pad 0; BAAC/HSBC 12 → drop 1st; IBANK 12 → drop 2 + pad; TISCO/KKP 14 → drop 4 + pad; GSB 12 → "999"+no, 15 → drop 4 */
export function accountNumber11(bank: string, account: string): string {
  const a = (account ?? "").replace(/\D/g, "");
  if (a.length <= 11) return a.padStart(11, "0");
  if ((bank === "034" || bank === "031") && a.length === 12) return a.slice(1);
  if (bank === "066" && a.length === 12) return a.slice(2).padStart(11, "0");
  if ((bank === "067" || bank === "069") && a.length === 14) return a.slice(4).padStart(11, "0");
  if (bank === "030") return (a.length === 12 ? "999" + a : a).slice(4);
  return a.slice(-11);
}

// --------------------------------------------------------------------------------------- SSO title codes
/** title codes for the สปส.1-10 file — UNVERIFIED (the public layout says "รหัสตามที่ สปส. กำหนด"); override per layout if needed */
export const SSO_TITLE_CODES: Record<string, string> = {
  นาย: "003", "Mr.": "003", MR: "003",
  นางสาว: "004", "น.ส.": "004", "Miss": "004", "Ms.": "004",
  นาง: "005", "Mrs.": "005",
};

// ------------------------------------------------------------------------------------------- field helpers
const F = {
  c: (label: string, value: string, len?: number, note?: string): FieldDef => ({ label, source: "const", value, type: "text", len, note }),
  blank: (label: string, len?: number): FieldDef => ({ label, source: "blank", type: "text", len }),
  t: (label: string, source: string, len?: number, extra: Partial<FieldDef> = {}): FieldDef => ({ label, source, type: "text", len, ...extra }),
  d: (label: string, source: string, len?: number, extra: Partial<FieldDef> = {}): FieldDef => ({ label, source, type: "digits", len, ...extra }),
  i: (label: string, source: string, len?: number, extra: Partial<FieldDef> = {}): FieldDef => ({ label, source, type: "int", len, ...extra }),
  s: (label: string, source: string, len?: number, extra: Partial<FieldDef> = {}): FieldDef => ({ label, source, type: "satang", len, ...extra }),
  a: (label: string, source: string, len?: number, extra: Partial<FieldDef> = {}): FieldDef => ({ label, source, type: "amount", len, ...extra }),
  dt: (label: string, source: string, format: string, len?: number, era: "BE" | "CE" = "BE", extra: Partial<FieldDef> = {}): FieldDef => ({ label, source, type: "date", format, era, len, ...extra }),
  seq: (label: string, len?: number): FieldDef => ({ label, source: "seq", type: "int", len }),
};

const RD_FORBIDDEN = "*+/\\!$%#&@,'\"";
/** RD forbids "/" and "," — keep house numbers like 12/3 readable */
const RD_CHARMAP: Record<string, string> = { "/": "-", ",": " " };

// ===================================================================================== RD — ภ.ง.ด.1 / 1ก
const RD_V2_SOURCE = "กรมสรรพากร: รูปแบบข้อมูล (FORMAT กลาง) ภ.ง.ด.1 ภ.ง.ด.1ก และ ภ.ง.ด.1ก พิเศษ Version 2.0 (16/06/2568) https://www.rd.go.th/fileadmin/user_upload/WHT/Download/FormatPND1V2_0.pdf — หน้าดาวน์โหลด https://www.rd.go.th/63724.html (ตรวจ 7 ต.ค. 2569)";
const RD_V1_SOURCE = "กรมสรรพากร: Format กลางโปรแกรมบันทึก (Import) ข้อมูลยื่นด้วยสื่อฯ ภ.ง.ด.1, 1ก และ 1ก พิเศษ (Version 1.0, 23/5/2566) https://www.rd.go.th/fileadmin/user_upload/WHT/swc1.5.1/FormatPND1.pdf และ https://whtsvs.rd.go.th/WHTSVS/view/svsr/svsr044_5c (ตรวจ 7 ต.ค. 2569)";

function rdV2(kind: "pnd1" | "pnd1a"): FileLayout {
  const t = kind === "pnd1" ? "PND1" : "PND1A";
  return {
    key: `rd_v2_${kind}`,
    kind,
    label: `สรรพากร ฟอร์แมตกลาง V2.0 — ${kind === "pnd1" ? "ภ.ง.ด.1" : "ภ.ง.ด.1ก"} (H/D, UTF-8)`,
    description: "ไฟล์ข้อความคั่นด้วย | มีส่วน Header 1 บรรทัด + Detail รายคน ใช้กับโปรแกรม WHT Software Component (SWC) ของกรมสรรพากร แล้วยื่นผ่าน e-Filing",
    status: "official",
    source: RD_V2_SOURCE,
    mode: "delimited",
    delimiter: "|",
    encoding: "utf8",
    lineEnding: "CRLF",
    stripChars: RD_FORBIDDEN,
    charMap: RD_CHARMAP,
    fileName: `${t}_{company.tax_id}_{rd.branch6}_{rd.tax_year}_{rd.tax_month}_{rd.form_type}_{rd.send_no}.txt`,
    header: [
      F.c("HEADER", "H"),
      F.d("SENDER_ID รหัสผู้นำส่ง", "rd.sender_id", 4),
      F.d("SENDER_NID เลขประจำตัวผู้เสียภาษีผู้นำส่ง", "company.tax_id", 13, { required: true }),
      F.d("SENDER_BRANCH สาขาผู้นำส่ง", "rd.branch6", 6),
      F.t("SENDER_ROLE ประเภทการนำส่ง", "rd.sender_role", 1),
      F.c("TAX_TYPE ประเภทแบบภาษี", t, 8),
      F.d("NID เลขประจำตัวผู้เสียภาษีผู้มีหน้าที่หักภาษี", "company.tax_id", 13, { required: true }),
      F.d("BRANCH_NO สาขาผู้มีหน้าที่หักภาษี", "rd.branch6", 6),
      F.t("DEPT_NAME ชื่อแผนก/ส่วน/ฝ่าย", "rd.dept_name", 80),
      F.t("LTO ผู้ประกอบการรายใหญ่", "rd.lto", 1),
      F.t("TAX_MONTH เดือนภาษี", "rd.tax_month", 2),
      F.t("TAX_YEAR ปีภาษี (พ.ศ.)", "rd.tax_year", 4),
      F.t("BRANCH_TYPE ประเภทสาขา", "rd.branch_type", 1),
      F.t("FORM_TYPE ประเภทการยื่นแบบ", "rd.form_type", 2),
      F.i("TOT_NUM รวมจำนวนราย", "rd.count", 7),
      F.a("TOT_AMT รวมเงินได้ทั้งสิ้น", "rd.total_income", 18),
      F.a("TOT_TAX รวมภาษีนำส่ง", "rd.total_tax", 18),
      F.a("SUR_AMT เงินเพิ่ม", "rd.surcharge", 18, { note: "ให้ระบุ 0.00 ระบบคำนวณให้ตอนชำระภาษี" }),
      F.a("GTOT_TAX รวมภาษีและเงินเพิ่ม", "rd.grand_tax", 18),
      F.a("TRANS_AMT จำนวนเงินโอนผ่านธนาคาร", "rd.trans_amt", 18, { note: "ยื่นอินเทอร์เน็ต = จำนวนที่ชำระ, ยื่นสื่อ = 0.00" }),
      F.t("USER_ID รหัสลงทะเบียน", "rd.user_id", 20, { note: "ยื่นอินเทอร์เน็ต = UserID e-Filing, ยื่นสื่อ = เลขอ้างอิง" }),
      F.t("FORM_FLAG ช่องทางการยื่นแบบ", "rd.form_flag", 1),
    ],
    detail: [
      F.c("DETAIL", "D"),
      F.seq("SEQ_NO ลำดับที่ตามใบแนบ", 10),
      F.d("BRANCH_NO สาขาผู้หักภาษี", "rd.branch6", 6),
      F.d("PIN เลขประจำตัวผู้มีเงินได้", "payee.pin", 13, { required: true }),
      F.d("TIN เลข 10 หลักเดิม", "payee.tin10", 10),
      F.t("TITLE_NAME คำนำหน้าชื่อ", "payee.prefix", 100, { required: true }),
      F.t("FNAME ชื่อ", "payee.first_name", 100, { required: true }),
      F.t("SNAME ชื่อสกุล", "payee.last_name", 80, { required: true }),
      F.dt("PAID_DATE วันเดือนปีที่จ่าย (ววดดปปปป พ.ศ.)", "pay.date", "DDMMYYYY", 8),
      F.a("TAX_RATE อัตราภาษี", "pay.tax_rate", 7),
      F.a("PAID_AMT จำนวนเงินที่จ่าย", "pay.income", 18),
      F.a("TAX_AMT จำนวนเงินภาษี", "pay.tax", 18),
      F.t("INC_TYPE_PND ประเภทเงินได้", "pay.income_code", 1),
      F.t("PAY_CON เงื่อนไขการหักภาษี", "pay.condition", 1),
      F.t("BUILD_NAME ชื่ออาคาร", "payee.building", 40),
      F.t("ROOM_NO ห้องเลขที่", "payee.room", 20),
      F.t("FLOOR_NO ชั้นที่", "payee.floor", 20),
      F.t("VILLAGE_NAME หมู่บ้าน", "payee.village", 100),
      F.t("ADD_NO เลขที่", "payee.house_no", 40),
      F.t("MOO_NO หมู่ที่", "payee.moo", 20),
      F.t("SOI ซอย/แยก", "payee.soi", 100),
      F.t("STREET_NAME ถนน", "payee.road", 100),
      F.t("TAMBON ตำบล/แขวง", "payee.subdistrict", 50),
      F.t("AMPHUR อำเภอ/เขต", "payee.district", 50, { required: true }),
      F.t("PROVINCE จังหวัด", "payee.province", 50, { required: true }),
      F.d("POSTAL_CODE รหัสไปรษณีย์", "payee.postcode", 5, { required: true }),
    ],
  };
}

function rdV1(kind: "pnd1" | "pnd1a"): FileLayout {
  return {
    key: `rd_v1_${kind}`,
    kind,
    label: `สรรพากร ฟอร์แมตกลาง V1.0 — PND1.txt (${kind === "pnd1" ? "ภ.ง.ด.1" : "ภ.ง.ด.1ก"}, 20 ช่อง)`,
    description: "รูปแบบเดิมสำหรับยื่นด้วยสื่อ / ระบบ WHT SVS และโปรแกรม SWC รุ่นก่อน 2568 — ชื่อไฟล์ต้องเป็น PND1.txt",
    status: "official",
    source: RD_V1_SOURCE,
    mode: "delimited",
    delimiter: "|",
    encoding: "tis620",
    lineEnding: "CRLF",
    stripChars: RD_FORBIDDEN,
    charMap: RD_CHARMAP,
    fileName: "PND1.txt",
    detail: [
      F.t("FORMTYPE ลักษณะการยื่นแบบ", "rd.form_type", 2),
      F.d("COMPIN เลขผู้เสียภาษีผู้หักภาษี (13)", "company.tax_id", 13, { required: true }),
      F.d("COMTIN เลข 10 หลักเดิม", "company.tax_id10", 10),
      F.d("BRANO เลขที่สาขา (4)", "rd.branch4", 4),
      F.d("PIN เลขประจำตัวประชาชนผู้มีเงินได้", "payee.pin", 13, { required: true }),
      F.d("TIN เลข 10 หลักเดิมผู้มีเงินได้", "payee.tin10", 10),
      F.t("PER_N1 คำนำหน้าชื่อ", "payee.prefix", 40),
      F.t("NAME1 ชื่อ", "payee.first_name", 80, { required: true }),
      F.t("SUR_N1 นามสกุล", "payee.last_name", 80),
      F.t("ADDRESS1 ที่อยู่ 1", "payee.address1", 150),
      F.t("ADDRESS2 ที่อยู่ 2", "payee.address2", 150),
      F.d("POSCOD รหัสไปรษณีย์", "payee.postcode", 5),
      F.t("TAXMONTH เดือนภาษี", "rd.tax_month", 2),
      F.t("TAXYEAR ปีภาษี", "rd.tax_year", 4),
      F.t("INCOMECODE รหัสเงินได้", "pay.income_code", 1),
      F.dt("PAYDATE วันที่จ่ายเงินได้ (DDMMYYYY พ.ศ.)", "pay.date", "DDMMYYYY", 8),
      F.i("TAXRATE อัตราภาษีร้อยละ", "pay.tax_rate", 3),
      F.a("PAYMENT จำนวนเงินที่จ่าย", "pay.income", 16),
      F.a("TAX ภาษีที่หักและนำส่ง", "pay.tax", 16),
      F.t("TAXCONDITION เงื่อนไขการหักภาษี", "pay.condition", 1),
    ],
  };
}

function rdPrep(kind: "pnd1" | "pnd1a"): FileLayout {
  return {
    key: `rd_prep_${kind}`,
    kind,
    label: `โปรแกรม RD Prep — โอนย้ายข้อมูล ${kind === "pnd1" ? "ภ.ง.ด.1" : "ภ.ง.ด.1ก"} (คั่นด้วย |)`,
    description: "นำเข้าที่เมนู โอนย้ายข้อมูล ของ RD Prep: เลือกแบ่งข้อมูลด้วยสัญลักษณ์ |, วันที่ dd/mm/yyyy (พ.ศ. มีสัญลักษณ์), จับคู่ช่อง 0–10 ตามลำดับ แล้วสร้างไฟล์ .rdx เพื่ออัปโหลดใน e-Filing",
    status: "secondary",
    source: "ลำดับช่องกำหนดเองได้ใน RD Prep (ผู้ใช้จับคู่ตำแหน่ง) — ขั้นตอนอ้างอิง คู่มือ RD Prep กรมสรรพากร https://efiling.rd.go.th/content/download/RDPrep.pdf, PEAK https://www.peakaccount.com/peak-manual/peak-payroll/pnd1-pnd1a-payroll-summary/transferring-text-file-pnd1-to-rd-prep-program, FlowAccount https://flowaccount.com/blog/rd-prep-pnd1/ (ตรวจ 7 ต.ค. 2569)",
    mode: "delimited",
    delimiter: "|",
    encoding: "utf8",
    lineEnding: "CRLF",
    stripChars: RD_FORBIDDEN,
    charMap: RD_CHARMAP,
    fileName: `${kind === "pnd1" ? "PND1" : "PND1A"}_{company.tax_id}_{rd.branch5}_{rd.tax_year}${kind === "pnd1" ? "{rd.tax_month}" : ""}.txt`,
    detail: [
      F.seq("0 ลำดับที่"),
      F.d("1 เลขประจำตัวผู้เสียภาษีอากร", "payee.pin", 13, { required: true }),
      F.d("2 สาขา", "rd.branch5", 5),
      F.t("3 คำนำหน้าชื่อ", "payee.prefix", undefined, { required: true }),
      F.t("4 ชื่อ", "payee.first_name", undefined, { required: true }),
      F.t("5 ชื่อสกุล", "payee.last_name", undefined, { required: true }),
      F.t("6 เงินได้ตามมาตรา (1 = 40(1))", "pay.income_code"),
      F.dt("7 วันเดือนปีที่จ่าย (dd/mm/yyyy พ.ศ.)", "pay.date", "DD/MM/YYYY"),
      F.a("8 จำนวนเงินที่จ่าย", "pay.income"),
      F.a("9 ภาษีที่หักและนำส่ง", "pay.tax"),
      F.t("10 เงื่อนไขการหักภาษี", "pay.condition"),
    ],
  };
}

const RD_FUND: FileLayout = {
  key: "rd_fund",
  kind: "rd_fund",
  label: "สรรพากร — ข้อมูลกองทุน แนบ ภ.ง.ด.1ก (กบข./ประกันสังคม/กองทุนสำรองเลี้ยงชีพ)",
  description: "ไฟล์ข้อมูลเงินสมทบกองทุนรายคน ยื่นพร้อม ภ.ง.ด.1ก เพื่อให้ระบบ My Tax Account แสดงค่าลดหย่อนให้พนักงาน",
  status: "official",
  source: "กรมสรรพากร: รูปแบบข้อมูลกองทุนสำหรับ ภ.ง.ด 1ก และ 1ก พิเศษ (26/6/2566) https://www.rd.go.th/fileadmin/user_upload/WHT/swc1.5.1/FormatFund.pdf (ตรวจ 7 ต.ค. 2569)",
  mode: "delimited",
  delimiter: "|",
  encoding: "utf8",
  lineEnding: "CRLF",
  fileName: "FUND_PND1A_{company.tax_id}_{rd.tax_year}.csv",
  detail: [
    F.d("PIN เลขประจำตัวผู้ถูกหักภาษี", "payee.pin", 13, { required: true }),
    F.t("TAXYEAR ปีภาษี", "rd.tax_year", 4),
    F.a("FUNDGPF กบข./กสจ./กองทุนสงเคราะห์ครู", "fund.gpf", 16),
    F.a("FUNDSSO กองทุนประกันสังคม", "fund.sso", 16),
    F.a("FUNDPVD กองทุนสำรองเลี้ยงชีพ", "fund.pvd", 16),
  ],
};

// =========================================================================================== กองทุนสำรองเลี้ยงชีพ
// Each fund manager (บลจ.) has its own upload template, so the built-in layout is a plain CSV with every column HR
// usually needs; clone it in /settings/file-formats to match the fund manager's template.
const PVD_GENERIC: FileLayout = {
  key: "pvd_generic_csv",
  kind: "pvd",
  label: "CSV ทั่วไป — เงินสะสม / เงินสมทบรายคน",
  description: "ใช้ส่งบริษัทจัดการกองทุน หรือคัดลอกลง Template ของบริษัทจัดการ",
  status: "unverified",
  source: "รูปแบบของ GO HR (ไม่ใช่สเปกของบริษัทจัดการกองทุน) — ยืนยันกับบริษัทจัดการก่อนส่งครั้งแรก",
  mode: "delimited",
  delimiter: ",",
  quote: true,
  columnTitles: true,
  encoding: "utf8bom",
  lineEnding: "CRLF",
  fileName: "pvd-{period.code}.csv",
  detail: [
    F.seq("ลำดับ"),
    F.t("รหัสพนักงาน", "employee.code"),
    F.t("เลขที่สมาชิก", "member.no"),
    F.d("เลขประจำตัวประชาชน", "member.national_id", 13, { required: true }),
    F.t("คำนำหน้า", "member.prefix"),
    F.t("ชื่อ", "member.first_name", undefined, { required: true }),
    F.t("นามสกุล", "member.last_name", undefined, { required: true }),
    F.a("ค่าจ้าง", "member.wage"),
    F.a("อัตราสะสม %", "member.employee_rate"),
    F.a("อัตราสมทบ %", "member.employer_rate"),
    F.a("เงินสะสม", "member.employee"),
    F.a("เงินสมทบ", "member.employer"),
  ],
};

// =========================================================================================== SSO สปส.1-10
const SSO_LAYOUT: FileLayout = {
  key: "sso_1_10",
  kind: "sso",
  label: "ประกันสังคม สปส.1-10 — ไฟล์ข้อความ 135 ตัวอักษร (TIS-620)",
  description: "ระเบียน 1 = ส่วนที่ 1 (สรุป) · ระเบียน 2 = ส่วนที่ 2 (รายคน) · ความยาวคงที่ 135 ไบต์ต่อบรรทัด · จำนวนเงินเป็นสตางค์ไม่มีจุดทศนิยม เติม 0 ด้านหน้า",
  status: "secondary",
  source: "โครงสร้างระเบียนจาก Panyame: รูปแบบไฟล์ Text สปส.1-10 https://www.panyame.com/blog/docs/others/e-filing/sso110txt/ (ตรวจ 7 ต.ค. 2569); แบบฟอร์มทางการ https://www.sso.go.th/wpr/assets/upload/files_storage/sso_th/918a5ffc639945c7890f199112922f09.pdf — สำนักงานประกันสังคมไม่เผยแพร่สเปกไฟล์ต่อสาธารณะ: รูปแบบจำนวนเงิน (สตางค์) และรหัสคำนำหน้าต้องทดสอบอัปโหลดครั้งแรก",
  mode: "fixed",
  encoding: "tis620",
  lineEnding: "CRLF",
  fileName: "SSO{sso.wage_month_be}_{employer.account_no}_{employer.branch_no}.txt",
  header: [
    F.c("ประเภท (1)", "1", 1),
    F.d("เลขที่บัญชีนายจ้าง", "employer.account_no", 10, { required: true }),
    F.d("ลำดับที่สาขา", "employer.branch_no", 6),
    F.dt("วันที่ชำระเงิน (ddMMyy พ.ศ.)", "sso.pay_date", "DDMMYY", 6),
    F.dt("งวดค่าจ้าง (MMyy พ.ศ.)", "sso.wage_month", "MMYY", 4),
    F.t("ชื่อสถานประกอบการ", "company.name", 45),
    F.i("อัตราเงินสมทบ (×100)", "sso.rate100", 4),
    F.i("จำนวนผู้ประกันตน", "sso.count", 6),
    F.s("ค่าจ้างรวม (สตางค์)", "sso.total_wage", 15),
    F.s("เงินสมทบรวม (สตางค์)", "sso.total_contribution", 14),
    F.s("เงินสมทบผู้ประกันตน (สตางค์)", "sso.total_employee", 12),
    F.s("เงินสมทบนายจ้าง (สตางค์)", "sso.total_employer", 12),
  ],
  detail: [
    F.c("ประเภท (2)", "2", 1),
    F.d("เลขประจำตัวประกันสังคม", "insured.id", 13, { required: true }),
    F.d("คำนำหน้าชื่อ (รหัส)", "insured.title_code", 3),
    F.t("ชื่อ", "insured.first_name", 30, { required: true }),
    F.t("นามสกุล", "insured.last_name", 35, { required: true }),
    F.s("ค่าจ้าง (สตางค์)", "insured.wage", 14),
    F.s("เงินสมทบผู้ประกันตน (สตางค์)", "insured.employee", 12),
    F.blank("ว่าง", 27),
  ],
};

// ========================================================================================== banks
const GENERIC_CSV: FileLayout = {
  key: "bank_generic_csv",
  kind: "bank",
  label: "CSV ทั่วไป (เปิดด้วย Excel)",
  description: "ใช้ตรวจสอบหรือคัดลอกลง Excel Template ของธนาคาร",
  status: "unverified",
  source: "รูปแบบของ GO HR (ไม่ใช่สเปกธนาคาร)",
  mode: "delimited",
  delimiter: ",",
  quote: true,
  columnTitles: true,
  encoding: "utf8bom",
  lineEnding: "CRLF",
  fileName: "bank-{batch.ref}.csv",
  bankScope: "any",
  accountDigits: "bot",
  detail: [
    F.seq("ลำดับ"),
    F.d("รหัสธนาคาร", "account.bank_code", 3, { required: true }),
    F.d("เลขที่บัญชี", "account.number", undefined, { required: true }),
    F.t("ชื่อบัญชี", "account.name", undefined, { required: true }),
    F.a("จำนวนเงิน", "entry.net_pay"),
    F.t("รหัสพนักงาน", "employee.code"),
    F.dt("วันที่โอน", "batch.effective_date", "DD/MM/YYYY"),
  ],
};

const KTB_SOURCE = "โครงสร้าง KTB iPay/Corporate Online (Direct Credit) 498 ไบต์ ตาม OCA l10n_th_bank_payment_export_ktb 15.0.3.0.0 โดย Ecosoft (AGPL-3) https://pypi.org/project/odoo-addon-l10n-th-bank-payment-export-ktb/ (ตรวจ 7 ต.ค. 2569) — ไม่ใช่เอกสารจากธนาคารโดยตรง ต้องยืนยันกับเจ้าหน้าที่ Cash Management ของ KTB";

function ktb(scope: "same" | "other"): FileLayout {
  return {
    key: scope === "same" ? "bank_ktb_direct" : "bank_ktb_standard",
    kind: "bank",
    label: scope === "same" ? "กรุงไทย (KTB) Direct — โอนเข้าบัญชี KTB (498 ไบต์)" : "กรุงไทย (KTB) Standard/Smart — โอนต่างธนาคาร (498 ไบต์)",
    description: scope === "same" ? "Service Type 02 รายการเข้าบัญชีเงินเดือน — เฉพาะผู้รับที่มีบัญชีกรุงไทย" : "Service Type 01 เงินเดือน ค่าจ้าง — เฉพาะผู้รับต่างธนาคาร (ผ่านระบบ Smart/ITMX)",
    status: "secondary",
    source: KTB_SOURCE,
    mode: "fixed",
    encoding: "tis620",
    lineEnding: "CRLF",
    fileName: `KTB-${scope === "same" ? "DIRECT" : "SMART"}-{batch.ref}.txt`,
    bankScope: scope,
    accountDigits: "bot",
    header: [
      F.c("File Type", "10", 2),
      F.c("Record Type", "1", 1),
      F.i("Batch Number", "batch.no", 6),
      F.c("Sending Bank Code", "006", 3),
      F.i("Total Transaction", "batch.count", 7),
      F.s("Total Amount (สตางค์)", "batch.total", 19),
      F.dt("Effective Date (DDMMYYYY ค.ศ.)", "batch.effective_date", "DDMMYYYY", 8, "CE"),
      F.c("Transaction Code", "C", 1),
      F.c("Receiver No.", "00000000", 8),
      F.t("Company ID", "company.bank_id", 16, { required: true }),
      F.blank("User ID", 20),
      F.blank("Filler", 407),
    ],
    detail: [
      F.c("File Type", "10", 2),
      F.c("Record Type", "2", 1),
      F.i("Batch No.", "batch.no", 6),
      F.d("Receiving Bank", "account.bank_code", 3, { required: true }),
      F.t("Receiving Branch Code", "account.branch_code", 4),
      F.d("Receiving A/C", "account.number11", 11, { required: true }),
      F.c("Sending Bank Code", "006", 3),
      F.d("Sending Branch Code", "company.bank_branch", 4),
      F.d("Sending A/C", "company.account", 11, { required: true }),
      F.dt("Effective Date", "batch.effective_date", "DDMMYYYY", 8, "CE"),
      F.c("Service Type", scope === "same" ? "02" : "01", 2),
      F.c("Clearing House Code", "00", 2),
      F.s("Amount (สตางค์)", "entry.net_pay", 17),
      F.blank("Receiver Info.", 8),
      F.c("Receiver ID", "0000000000", 10),
      F.t("Receiver Name", "account.name", 100, { required: true }),
      F.t("Sender Name", "company.sender_name", 100),
      F.blank("Other Info 1", 40),
      F.blank("DDA Ref 1", 18),
      F.blank("Reserve Field", 2),
      F.t("Ref No./DDA Ref 2", "entry.ref", 18),
      F.blank("Reserve Field", 2),
      F.blank("Other Info 2", 20),
      F.seq("Ref Running Number", 6),
      F.c("Status", "09", 2),
      F.t("E-mail Address", "employee.email", 40),
      F.d("SMS/Mobile Phone", "employee.phone", 20, { align: "left", pad: " " }),
      F.c("Receiving Sub-Branch Code", "0000", 4),
      F.blank("Fillers", 34),
    ],
  };
}

const LHB_PAYROLL: FileLayout = {
  key: "bank_lhb_payroll",
  kind: "bank",
  label: "แลนด์ แอนด์ เฮ้าส์ (LHB Biz Connect) Payroll — 80 ไบต์",
  description: "H/D/T ความยาวคงที่ 80 ไบต์ เฉพาะบัญชี LHB",
  status: "official",
  source: "ธนาคารแลนด์ แอนด์ เฮ้าส์: คู่มือการใช้งาน LHB Biz Connect สำหรับไฟล์อัปโหลด V1 (5 ก.ย. 2568) https://corporate.lhbank.co.th/Files/20250905120503_คู่มือการใช้งาน LHB Biz Connect สำหรับไฟล์อัปโหลดV1_5-Sep-2025.pdf — จำนวนเงิน 15(13,2) ตีความเป็นสตางค์ 15 หลักไม่มีจุด (ทดสอบไฟล์แรกกับธนาคาร)",
  mode: "fixed",
  encoding: "tis620",
  lineEnding: "CRLF",
  fileName: "LHB-PR-{batch.ref}.txt",
  bankScope: "same",
  accountDigits: 10,
  header: [
    F.c("Record Type", "H", 1),
    F.c("Batch Number", "000000", 6),
    F.t("Company Code", "company.bank_id", 8, { required: true }),
    F.i("Total Records", "batch.count", 6),
    F.s("Total Amount", "batch.total", 15),
    F.dt("Effective Date (ddmmyyyy)", "batch.effective_date", "DDMMYYYY", 8, "CE"),
    F.blank("Filler", 36),
  ],
  detail: [
    F.c("Record Type", "D", 1),
    F.seq("Record Number", 6),
    F.d("Account Number", "account.number", 10, { required: true }),
    F.s("Amount", "entry.net_pay", 15),
    F.t("Recipient Name", "account.name", 40, { required: true }),
    F.blank("Filler", 8),
  ],
  trailer: [F.c("Record Type", "T", 1), F.c("Batch Number", "000000", 6), F.blank("Filler", 73)],
};

const UNVERIFIED_NOTE = "ไม่พบสเปกไฟล์สาธารณะของธนาคารนี้ (ธนาคารให้เฉพาะลูกค้าที่สมัครบริการ) — เป็นโครงสร้างที่พบบ่อย ต้องยืนยันกับธนาคาร แล้วปรับแม่แบบที่ ตั้งค่า > รูปแบบไฟล์";

const KBANK: FileLayout = {
  key: "bank_kbank_csv",
  kind: "bank",
  label: "กสิกรไทย (K-Cash Connect Plus / K BIZ) — CSV",
  description: "รายการละ 1 บรรทัด: รหัสธนาคาร, เลขบัญชี, ชื่อผู้รับ, จำนวนเงิน, อ้างอิง, วันที่มีผล",
  status: "unverified",
  source: `${UNVERIFIED_NOTE}. K-Cash Connect Plus ใช้รูปแบบ "PTC – KBANK PAYROLL" (อ้างอิง PEAK https://intercom.help/peak/en/articles/5667430)`,
  mode: "delimited",
  delimiter: ",",
  quote: true,
  encoding: "utf8",
  lineEnding: "CRLF",
  fileName: "KBANK-{batch.ref}.csv",
  bankScope: "any",
  accountDigits: "bot",
  detail: [
    F.d("Receiving Bank Code", "account.bank_code", 3, { required: true }),
    F.d("Receiving Account No", "account.number", undefined, { required: true }),
    F.t("Receiver Name", "account.name", undefined, { required: true }),
    F.a("Transfer Amount", "entry.net_pay"),
    F.t("Reference No", "employee.code"),
    F.dt("Effective Date", "batch.effective_date", "DDMMYYYY", undefined, "CE"),
  ],
};

const SCB: FileLayout = {
  key: "bank_scb_fixed",
  kind: "bank",
  label: "ไทยพาณิชย์ (SCB Business Anywhere Payroll) — Fixed width",
  description: "H/D/T จำนวนเงินเป็นสตางค์ — SCB ให้สร้างไฟล์จาก Excel Template ของธนาคาร ใช้ไฟล์นี้เมื่อธนาคารยืนยันโครงสร้างแล้ว",
  status: "unverified",
  source: `${UNVERIFIED_NOTE}. คู่มือ SCB Payroll Excel Template https://www.scb.co.th/th/corporate-banking/digital-banking-services/business-anywhere/manual/payroll.html`,
  mode: "fixed",
  encoding: "tis620",
  lineEnding: "CRLF",
  fileName: "SCB-{batch.ref}.txt",
  bankScope: "any",
  accountDigits: "bot",
  header: [
    F.c("Record Type", "H", 1),
    F.dt("Effective Date", "batch.effective_date", "DDMMYYYY", 8, "CE"),
    F.d("Company Account", "company.account", 10, { required: true }),
    F.t("Company Name", "company.name", 40),
    F.i("Total Count", "batch.count", 6),
    F.s("Total Amount", "batch.total", 15),
  ],
  detail: [
    F.c("Record Type", "D", 1),
    F.seq("Sequence", 6),
    F.d("Receiving Bank", "account.bank_code", 3, { required: true }),
    F.d("Account No", "account.number11", 11, { required: true }),
    F.s("Amount", "entry.net_pay", 15),
    F.t("Receiver Name", "account.name", 50, { required: true }),
    F.t("Reference", "employee.code", 20),
  ],
  trailer: [F.c("Record Type", "T", 1), F.i("Total Count", "batch.count", 6), F.s("Total Amount", "batch.total", 15)],
};

const BBL: FileLayout = {
  key: "bank_bbl_csv",
  kind: "bank",
  label: "กรุงเทพ (BIZ iBanking — BIZ Payroll) — CSV",
  description: "ตาม Employee_Template ของธนาคาร: First Name, Last Name, Branch Code, Account Number, Bank Code (+ จำนวนเงิน) — บันทึกเป็น CSV (Comma delimited)",
  status: "unverified",
  source: `ธนาคารกรุงเทพ: วิธีใช้ BIZ Payroll https://www.bangkokbank.com/en/Hint/HintBiz/BIZ-%20Payroll (ตรวจ 7 ต.ค. 2569) ระบุช่องข้อมูลแต่ไม่ระบุลำดับคอลัมน์/ช่องจำนวนเงิน — ดาวน์โหลด Employee_Template.xls จาก BIZ iBanking แล้วเทียบ`,
  mode: "delimited",
  delimiter: ",",
  quote: true,
  encoding: "utf8",
  lineEnding: "CRLF",
  fileName: "BBL-{batch.ref}.csv",
  bankScope: "any",
  accountDigits: "bot",
  detail: [
    F.t("First Name", "employee.first_name", undefined, { required: true }),
    F.t("Last Name", "employee.last_name", undefined, { required: true }),
    F.d("Branch Code", "account.branch_code", 4),
    F.d("Account Number", "account.number", undefined, { required: true }),
    F.d("Bank Code", "account.bank_code", 3, { required: true }),
    F.a("Amount", "entry.net_pay"),
  ],
};

function genericTxt(key: string, label: string, src: string): FileLayout {
  return {
    key,
    kind: "bank",
    label,
    description: "ไฟล์ .txt คั่นด้วย | (TIS-620): รหัสธนาคาร|เลขบัญชี|ชื่อบัญชี|จำนวนเงิน|อ้างอิง|วันที่มีผล",
    status: "unverified",
    source: `${UNVERIFIED_NOTE}. ${src}`,
    mode: "delimited",
    delimiter: "|",
    encoding: "tis620",
    lineEnding: "CRLF",
    fileName: `${key.replace("bank_", "").toUpperCase()}-{batch.ref}.txt`,
    bankScope: "any",
    accountDigits: "bot",
    detail: [
      F.d("Receiving Bank Code", "account.bank_code", 3, { required: true }),
      F.d("Account No", "account.number", undefined, { required: true }),
      F.t("Account Name", "account.name", undefined, { required: true }),
      F.a("Amount", "entry.net_pay"),
      F.t("Reference", "employee.code"),
      F.dt("Effective Date", "batch.effective_date", "DDMMYYYY", undefined, "CE"),
    ],
  };
}

export const BUILTIN_LAYOUTS: FileLayout[] = [
  GENERIC_CSV,
  KBANK,
  SCB,
  BBL,
  ktb("same"),
  ktb("other"),
  genericTxt("bank_bay", "กรุงศรีอยุธยา (Krungsri Biz Online Payroll) — TXT", "FlowAccount ระบุว่ามีไฟล์สำหรับ Krungsri Biz Online แต่ไม่เผยแพร่โครงสร้าง https://flowaccount.com/help-center/category/payroll/krungsri-payroll"),
  genericTxt("bank_ttb", "ทหารไทยธนชาต (ttb business one) — TXT", "ttb business one รับเฉพาะไฟล์ .txt รูปแบบ SAPFORMAT เข้ารหัส TIS-620 (คู่มือ https://www.ttbbank.com/howto/businessone/manual/businessone_QuickStepPayroll_TH.pdf) — โครงสร้างช่องต้องขอจากธนาคาร"),
  LHB_PAYROLL,
  SSO_LAYOUT,
  rdV2("pnd1"),
  rdPrep("pnd1"),
  rdV1("pnd1"),
  rdV2("pnd1a"),
  rdPrep("pnd1a"),
  rdV1("pnd1a"),
  RD_FUND,
  PVD_GENERIC,
];

/** legacy keys stored in settings payroll.bank_file_format → built-in layout keys */
export const LEGACY_BANK_KEYS: Record<string, string> = {
  generic: "bank_generic_csv",
  kbank: "bank_kbank_csv",
  scb: "bank_scb_fixed",
  bbl: "bank_bbl_csv",
  ktb: "bank_ktb_direct",
  bay: "bank_bay",
  ttb: "bank_ttb",
};

export function builtinLayouts(kind: FileKind): FileLayout[] {
  return BUILTIN_LAYOUTS.filter((l) => l.kind === kind);
}

export function findBuiltin(key: string): FileLayout | undefined {
  return BUILTIN_LAYOUTS.find((l) => l.key === key || l.key === LEGACY_BANK_KEYS[key]);
}

/** deep copy of a layout for editing (custom layouts are stored as JSON) */
export function cloneLayout(l: FileLayout, label?: string): FileLayout {
  const c = JSON.parse(JSON.stringify(l)) as FileLayout;
  c.key = `custom_${Date.now().toString(36)}`;
  c.label = label ?? `${l.label} (แก้ไข)`;
  c.status = "unverified";
  c.source = `คัดลอกจาก "${l.label}" — ${l.source ?? ""}`;
  return c;
}
