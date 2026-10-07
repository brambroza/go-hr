// Employee CSV import — column mapping, parsing and validation (pure; used by client preview and server action)
import { validNationalId } from "@/lib/format";
import { BANKS, EMP_STATUS, EMP_TYPE, GENDER, SALARY_UNIT } from "./labels";

export const IMPORT_COLUMNS = [
  { key: "code", label: "รหัสพนักงาน", required: true, example: "E0101" },
  { key: "prefix", label: "คำนำหน้า", example: "นาย" },
  { key: "first_name", label: "ชื่อ", required: true, example: "สมศักดิ์" },
  { key: "last_name", label: "นามสกุล", required: true, example: "ใจดี" },
  { key: "nickname", label: "ชื่อเล่น", example: "ศักดิ์" },
  { key: "gender", label: "เพศ", example: "ชาย" },
  { key: "birth_date", label: "วันเกิด", example: "15/03/2538" },
  { key: "phone", label: "โทรศัพท์", example: "0812345678" },
  { key: "email", label: "อีเมล", example: "somsak@example.com" },
  { key: "branch_code", label: "รหัสสาขา", example: "HQ" },
  { key: "org_unit_code", label: "รหัสหน่วยงาน", example: "PRD-L1" },
  { key: "position_code", label: "รหัสตำแหน่ง", example: "OP" },
  { key: "supervisor_code", label: "รหัสหัวหน้างาน", example: "E0007" },
  { key: "employee_type", label: "ประเภทพนักงาน", example: "รายวัน" },
  { key: "status", label: "สถานะ", example: "ทดลองงาน" },
  { key: "hire_date", label: "วันเริ่มงาน", required: true, example: "01/10/2569" },
  { key: "salary", label: "เงินเดือน/ค่าจ้าง", example: "400" },
  { key: "salary_unit", label: "หน่วยค่าจ้าง", example: "ต่อวัน" },
  { key: "national_id", label: "เลขประจำตัวประชาชน", example: "" },
  { key: "bank_code", label: "รหัสธนาคาร", example: "004" },
  { key: "bank_account", label: "เลขที่บัญชี", example: "1234567890" },
  { key: "sso_no", label: "เลขประกันสังคม", example: "" },
] as const;

export type ImportKey = (typeof IMPORT_COLUMNS)[number]["key"];
export type RawRow = Partial<Record<ImportKey, string>>;

export interface Refs {
  branches: Record<string, number>; // lower(code) -> id
  orgs: Record<string, number>;
  positions: Record<string, number>;
  employees: Record<string, number>; // existing employee codes (lower) -> id
}

export interface ParsedRow {
  line: number;
  raw: RawRow;
  errors: string[];
  warnings: string[];
  isUpdate: boolean;
  employee: Record<string, unknown>;
  priv: Record<string, unknown>;
  supervisor_code: string | null;
}

const ALIASES: Record<string, ImportKey> = {};
for (const c of IMPORT_COLUMNS) {
  ALIASES[norm(c.label)] = c.key;
  ALIASES[norm(c.key)] = c.key;
}
Object.assign(ALIASES, {
  [norm("รหัส")]: "code", [norm("employee code")]: "code", [norm("emp code")]: "code",
  [norm("firstname")]: "first_name", [norm("lastname")]: "last_name", [norm("สกุล")]: "last_name",
  [norm("ตำแหน่ง")]: "position_code", [norm("หน่วยงาน")]: "org_unit_code", [norm("แผนก")]: "org_unit_code", [norm("สาขา")]: "branch_code",
  [norm("หัวหน้า")]: "supervisor_code", [norm("ประเภท")]: "employee_type", [norm("เงินเดือน")]: "salary", [norm("ค่าจ้าง")]: "salary",
  [norm("เลขบัตรประชาชน")]: "national_id", [norm("ธนาคาร")]: "bank_code", [norm("บัญชีธนาคาร")]: "bank_account", [norm("วันที่เริ่มงาน")]: "hire_date",
} as Record<string, ImportKey>);

function norm(s: string) {
  return s.toLowerCase().replace(/[\s_\-./()]/g, "");
}

/** map header row → column keys (null = ignored column) */
export function mapHeaders(header: string[]): (ImportKey | null)[] {
  return header.map((h) => ALIASES[norm(h)] ?? null);
}

/** dd/mm/yyyy (พ.ศ. or ค.ศ.), d-m-yyyy, yyyy-mm-dd → ISO; null if invalid; "" if blank */
export function parseThaiDate(s: string | undefined): string | null | "" {
  const v = (s ?? "").trim();
  if (!v) return "";
  let y: number, m: number, d: number;
  let r = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(v);
  if (r) [y, m, d] = [Number(r[1]), Number(r[2]), Number(r[3])];
  else {
    r = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(v);
    if (!r) return null;
    [d, m, y] = [Number(r[1]), Number(r[2]), Number(r[3])];
  }
  if (y > 2400) y -= 543;
  if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function fromLabel(map: Record<string, string>, v: string, extra: Record<string, string> = {}): string | null {
  const t = v.trim().toLowerCase();
  if (!t) return "";
  for (const [k, l] of Object.entries(map)) if (k.toLowerCase() === t || l.toLowerCase() === t) return k;
  return extra[t] ?? null;
}

export function validateRows(rows: RawRow[], refs: Refs, startLine = 2): ParsedRow[] {
  const seen = new Map<string, number>();
  const fileCodes = new Set(rows.map((r) => (r.code ?? "").trim().toLowerCase()).filter(Boolean));
  return rows.map((raw, i) => {
    const line = startLine + i;
    const errors: string[] = [];
    const warnings: string[] = [];
    const s = (k: ImportKey) => (raw[k] ?? "").trim();
    const code = s("code");
    if (!code) errors.push("ไม่มีรหัสพนักงาน");
    else if (!/^[A-Za-z0-9._-]+$/.test(code)) errors.push("รหัสพนักงานใช้ได้เฉพาะ A-Z 0-9 . _ -");
    else if (seen.has(code.toLowerCase())) errors.push(`รหัสซ้ำกับแถวที่ ${seen.get(code.toLowerCase())}`);
    if (code) seen.set(code.toLowerCase(), line);
    const isUpdate = !!refs.employees[code.toLowerCase()];
    // existing employees: only filled columns are updated, so names may be blank
    if (!isUpdate && !s("first_name")) errors.push("ไม่มีชื่อ");
    if (!isUpdate && !s("last_name")) errors.push("ไม่มีนามสกุล");

    const emp: Record<string, unknown> = { code };
    const priv: Record<string, unknown> = {};
    const set = (k: string, v: unknown) => {
      if (v !== "" && v !== undefined) emp[k] = v;
    };
    set("prefix", s("prefix"));
    set("first_name", s("first_name"));
    set("last_name", s("last_name"));
    set("nickname", s("nickname"));
    set("phone", s("phone"));
    const email = s("email");
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push("อีเมลไม่ถูกต้อง");
    else set("email", email);

    const g = fromLabel(GENDER, s("gender"), { male: "M", female: "F", ช: "M", ญ: "F", "m.": "M", "f.": "F" });
    if (g === null) errors.push(`เพศ “${s("gender")}” ไม่ถูกต้อง (ชาย/หญิง)`);
    else set("gender", g);

    const bd = parseThaiDate(s("birth_date"));
    if (bd === null) errors.push(`วันเกิด “${s("birth_date")}” ไม่ถูกต้อง (ใช้ วว/ดด/ปปปป)`);
    else set("birth_date", bd);
    const hd = parseThaiDate(s("hire_date"));
    if (hd === null) errors.push(`วันเริ่มงาน “${s("hire_date")}” ไม่ถูกต้อง`);
    else if (hd === "" && !isUpdate) errors.push("ไม่มีวันเริ่มงาน");
    else set("hire_date", hd);
    if (bd && hd && bd >= hd) errors.push("วันเกิดต้องก่อนวันเริ่มงาน");

    const ref = (k: ImportKey, table: Record<string, number>, field: string, label: string) => {
      const v = s(k);
      if (!v) return;
      const id = table[v.toLowerCase()];
      if (!id) errors.push(`ไม่พบ${label}รหัส “${v}”`);
      else emp[field] = id;
    };
    ref("branch_code", refs.branches, "branch_id", "สาขา");
    ref("org_unit_code", refs.orgs, "org_unit_id", "หน่วยงาน");
    ref("position_code", refs.positions, "position_id", "ตำแหน่ง");
    const sup = s("supervisor_code");
    if (sup) {
      if (sup.toLowerCase() === code.toLowerCase()) errors.push("หัวหน้างานต้องไม่ใช่ตัวเอง");
      else if (!refs.employees[sup.toLowerCase()] && !fileCodes.has(sup.toLowerCase())) errors.push(`ไม่พบหัวหน้างานรหัส “${sup}”`);
    }

    const et = fromLabel(EMP_TYPE, s("employee_type"), { รายเดือน: "monthly", รายวัน: "daily" });
    if (et === null) errors.push(`ประเภทพนักงาน “${s("employee_type")}” ไม่ถูกต้อง`);
    else set("employee_type", et);
    const st = fromLabel(EMP_STATUS, s("status"), { ประจำ: "permanent", บรรจุ: "permanent" });
    if (st === null) errors.push(`สถานะ “${s("status")}” ไม่ถูกต้อง`);
    else set("status", st);

    const sal = s("salary").replace(/,/g, "");
    if (sal) {
      if (isNaN(Number(sal)) || Number(sal) < 0) errors.push(`เงินเดือน “${s("salary")}” ไม่ถูกต้อง`);
      else priv.salary = Number(sal);
    }
    const su = fromLabel(SALARY_UNIT, s("salary_unit"), { เดือน: "month", วัน: "day", ชั่วโมง: "hour", ชม: "hour" });
    if (su === null) errors.push(`หน่วยค่าจ้าง “${s("salary_unit")}” ไม่ถูกต้อง (เดือน/วัน/ชั่วโมง)`);
    else if (su) priv.salary_unit = su;
    else if (priv.salary != null && !isUpdate) priv.salary_unit = et === "daily" ? "day" : et === "hourly" ? "hour" : "month";

    const nid = s("national_id").replace(/\D/g, "");
    if (s("national_id")) {
      if (!validNationalId(nid)) errors.push("เลขประจำตัวประชาชนไม่ถูกต้อง (ตรวจหลักสุดท้าย)");
      else priv.national_id = nid;
    }
    const bank = s("bank_code");
    if (bank) {
      const b = bank.padStart(3, "0");
      if (!BANKS[b]) warnings.push(`รหัสธนาคาร “${bank}” ไม่อยู่ในรายการที่รู้จัก`);
      priv.bank_code = b;
    }
    const acc = s("bank_account").replace(/\D/g, "");
    if (s("bank_account")) {
      if (acc.length < 10 || acc.length > 15) errors.push("เลขที่บัญชีต้องเป็นตัวเลข 10–15 หลัก");
      else priv.bank_account = acc;
    }
    if (s("sso_no")) priv.sso_no = s("sso_no").replace(/\D/g, "") || s("sso_no");
    if (!s("national_id") && !isUpdate) warnings.push("ไม่มีเลขบัตรประชาชน (จำเป็นสำหรับยื่นภาษี/ประกันสังคม)");

    return { line, raw, errors, warnings, isUpdate, employee: emp, priv, supervisor_code: sup || null };
  });
}

export function templateRows(): string[][] {
  return [IMPORT_COLUMNS.map((c) => c.label), IMPORT_COLUMNS.map((c) => c.example)];
}
