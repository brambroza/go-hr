// Go-live data import (moving from HumanSoft / Excel): opening year-to-date payroll totals and leave balances.
// Pure functions shared by the browser preview and the server action (the server re-validates).

export type CsvTable = string[][];

const num = (s: string | undefined): number | null => {
  const t = (s ?? "").replace(/[,\s฿]/g, "");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
};
const norm = (s: string) => s.replace(/^﻿/, "").trim().toLowerCase().replace(/[\s_()./-]+/g, "");

/** tax year in the file may be พ.ศ. (2569) or ค.ศ. (2026) */
export function toCeYear(v: string | undefined, fallback: number): number | null {
  const t = (v ?? "").trim();
  if (!t) return fallback;
  const n = Number(t);
  if (!Number.isInteger(n)) return null;
  const y = n > 2400 ? n - 543 : n;
  return y >= 2000 && y <= 2100 ? y : null;
}

function mapHeader(header: string[], cols: { key: string; aliases: string[] }[]): (string | null)[] {
  return header.map((h) => {
    const k = norm(h);
    return cols.find((c) => c.aliases.some((a) => norm(a) === k))?.key ?? null;
  });
}

function rowsOf(table: CsvTable, cols: { key: string; aliases: string[] }[]) {
  const keys = mapHeader(table[0] ?? [], cols);
  const missing = cols.filter((c) => (c as { required?: boolean }).required && !keys.includes(c.key)).map((c) => c.aliases[0]);
  const rows = table
    .slice(1)
    .map((r, i) => ({ line: i + 2, v: Object.fromEntries(keys.map((k, j) => [k, r[j] ?? ""]).filter(([k]) => k)) as Record<string, string> }))
    .filter((r) => Object.values(r.v).some((x) => x.trim() !== ""));
  return { rows, missing };
}

// ------------------------------------------------------------------ opening YTD
export const YTD_COLUMNS = [
  { key: "code", aliases: ["รหัสพนักงาน", "code", "employee_code", "emp_code"], required: true },
  { key: "year", aliases: ["ปีภาษี", "ปี", "year", "tax_year"] },
  { key: "income", aliases: ["เงินได้สะสม", "เงินได้สะสมยกมา", "income", "ytd_income"], required: true },
  { key: "tax", aliases: ["ภาษีสะสม", "ภาษีหักณที่จ่ายสะสม", "tax", "ytd_tax"], required: true },
  { key: "sso", aliases: ["ประกันสังคมสะสม", "เงินสมทบสะสม", "sso", "ytd_sso"] },
  { key: "pvd", aliases: ["กองทุนสำรองเลี้ยงชีพสะสม", "กองทุนสะสม", "pvd", "ytd_pvd"] },
] as const;

export interface YtdRow {
  line: number;
  code: string;
  year: number;
  income: number;
  tax: number;
  sso: number;
  pvd: number;
  errors: string[];
}

export function parseYtd(table: CsvTable, opts: { defaultYear: number; knownCodes?: Set<string> }) {
  const { rows, missing } = rowsOf(table, YTD_COLUMNS as unknown as { key: string; aliases: string[] }[]);
  const seen = new Set<string>();
  const out: YtdRow[] = rows.map(({ line, v }) => {
    const errors: string[] = [];
    const code = (v.code ?? "").trim();
    if (!code) errors.push("ไม่มีรหัสพนักงาน");
    else if (opts.knownCodes && !opts.knownCodes.has(code.toLowerCase())) errors.push(`ไม่พบรหัสพนักงาน ${code} ในระบบ (นำเข้าพนักงานก่อน)`);
    if (code && seen.has(code.toLowerCase())) errors.push("รหัสพนักงานซ้ำในไฟล์");
    seen.add(code.toLowerCase());
    const year = toCeYear(v.year, opts.defaultYear);
    if (year === null) errors.push("ปีภาษีไม่ถูกต้อง (ใส่ 2569 หรือ 2026)");
    const val = (k: string, label: string) => {
      const n = num(v[k]);
      if (n === null) return 0;
      if (Number.isNaN(n)) {
        errors.push(`${label}ไม่ใช่ตัวเลข`);
        return 0;
      }
      if (n < 0) errors.push(`${label}ติดลบ`);
      return Math.round(n * 100) / 100;
    };
    const income = val("income", "เงินได้สะสม");
    const tax = val("tax", "ภาษีสะสม");
    const sso = val("sso", "ประกันสังคมสะสม");
    const pvd = val("pvd", "กองทุนสะสม");
    if (tax > income && income >= 0) errors.push("ภาษีสะสมมากกว่าเงินได้สะสม");
    if (year !== null && sso > 1150 * 12) errors.push("ประกันสังคมสะสมเกินเพดานทั้งปี ตรวจหน่วยเงิน");
    return { line, code, year: year ?? opts.defaultYear, income, tax, sso, pvd, errors };
  });
  return { rows: out, missing };
}

export function ytdTemplate(year: number): CsvTable {
  return [
    ["รหัสพนักงาน", "ปีภาษี", "เงินได้สะสม", "ภาษีสะสม", "ประกันสังคมสะสม", "กองทุนสำรองเลี้ยงชีพสะสม"],
    ["E0001", String(year + 543), "270000.00", "8250.00", "7875.00", "0"],
  ];
}

// ------------------------------------------------------------------ leave balances
export const LEAVE_COLUMNS = [
  { key: "code", aliases: ["รหัสพนักงาน", "code", "employee_code", "emp_code"], required: true },
  { key: "type", aliases: ["รหัสประเภทลา", "ประเภทลา", "leave_type", "leave_type_code", "type"], required: true },
  { key: "year", aliases: ["ปี", "year", "leave_year"] },
  { key: "quota", aliases: ["สิทธิ์ทั้งปี", "สิทธิ์วันลา", "quota", "quota_days"], required: true },
  { key: "carried", aliases: ["ยกมาจากปีก่อน", "ยกมา", "carried", "carried_days"] },
  { key: "used", aliases: ["ใช้ไปแล้ว", "ใช้ไป", "used", "used_days"], required: true },
] as const;

export interface LeaveRow {
  line: number;
  code: string;
  type: string;
  year: number;
  quota: number;
  carried: number;
  used: number;
  remaining: number;
  errors: string[];
}

export function parseLeave(table: CsvTable, opts: { defaultYear: number; knownCodes?: Set<string>; leaveTypes?: Set<string> }) {
  const { rows, missing } = rowsOf(table, LEAVE_COLUMNS as unknown as { key: string; aliases: string[] }[]);
  const seen = new Set<string>();
  const out: LeaveRow[] = rows.map(({ line, v }) => {
    const errors: string[] = [];
    const code = (v.code ?? "").trim();
    const type = (v.type ?? "").trim();
    if (!code) errors.push("ไม่มีรหัสพนักงาน");
    else if (opts.knownCodes && !opts.knownCodes.has(code.toLowerCase())) errors.push(`ไม่พบรหัสพนักงาน ${code} ในระบบ`);
    if (!type) errors.push("ไม่มีรหัสประเภทลา");
    else if (opts.leaveTypes && !opts.leaveTypes.has(type.toLowerCase())) errors.push(`ไม่พบประเภทลา ${type} (ดูรหัสที่ เอกสารและอนุมัติ › ประเภทการลา)`);
    const year = toCeYear(v.year, opts.defaultYear);
    if (year === null) errors.push("ปีไม่ถูกต้อง");
    const key = `${code}|${type}|${year}`.toLowerCase();
    if (seen.has(key)) errors.push("ซ้ำในไฟล์ (พนักงาน + ประเภทลา + ปีเดียวกัน)");
    seen.add(key);
    const val = (k: string, label: string) => {
      const n = num(v[k]);
      if (n === null) return 0;
      if (Number.isNaN(n)) {
        errors.push(`${label}ไม่ใช่ตัวเลข`);
        return 0;
      }
      if (n < 0) errors.push(`${label}ติดลบ`);
      if (n > 366) errors.push(`${label}เกิน 366 วัน`);
      return Math.round(n * 100) / 100;
    };
    const quota = val("quota", "สิทธิ์ทั้งปี");
    const carried = val("carried", "ยกมา");
    const used = val("used", "ใช้ไปแล้ว");
    const remaining = Math.round((quota + carried - used) * 100) / 100;
    if (remaining < 0) errors.push("ใช้ไปมากกว่าสิทธิ์ (คงเหลือติดลบ)");
    return { line, code, type, year: year ?? opts.defaultYear, quota, carried, used, remaining, errors };
  });
  return { rows: out, missing };
}

export function leaveTemplate(year: number, types: string[] = ["SICK", "PERSONAL", "VACATION"]): CsvTable {
  return [["รหัสพนักงาน", "รหัสประเภทลา", "ปี", "สิทธิ์ทั้งปี", "ยกมาจากปีก่อน", "ใช้ไปแล้ว"], ...types.map((t, i) => ["E0001", t, String(year + 543), ["30", "3", "6"][i] ?? "0", "0", ["2", "0", "1.5"][i] ?? "0"])];
}

// ------------------------------------------------------------------ organisation (branches, units, positions)
export const ORG_COLUMNS = [
  { key: "kind", aliases: ["ประเภทข้อมูล", "ประเภท", "kind", "type"], required: true },
  { key: "code", aliases: ["รหัส", "code"], required: true },
  { key: "name", aliases: ["ชื่อ", "name"], required: true },
  { key: "parent", aliases: ["รหัสหน่วยงานแม่", "หน่วยงานแม่", "parent", "parent_code"] },
  { key: "branch", aliases: ["รหัสสาขา", "สาขา", "branch", "branch_code"] },
  { key: "unit", aliases: ["รหัสหน่วยงาน", "หน่วยงาน", "org_unit", "org_unit_code"] },
  { key: "unit_type", aliases: ["ระดับหน่วยงาน", "ชนิดหน่วยงาน", "unit_type"] },
  { key: "job_level", aliases: ["ระดับตำแหน่ง", "job_level"] },
  { key: "min_salary", aliases: ["เงินเดือนต่ำสุด", "min_salary"] },
  { key: "max_salary", aliases: ["เงินเดือนสูงสุด", "max_salary"] },
  { key: "head_office", aliases: ["สำนักงานใหญ่", "head_office"] },
  { key: "tax_branch_no", aliases: ["เลขที่สาขาภาษี", "tax_branch_no"] },
  { key: "sso_account_no", aliases: ["เลขบัญชีนายจ้าง สปส.", "เลขบัญชีนายจ้าง", "sso_account_no"] },
  { key: "sso_branch_no", aliases: ["ลำดับที่สาขา สปส.", "sso_branch_no"] },
] as const;

export type OrgKind = "branch" | "org" | "position";
const KIND_WORDS: Record<string, OrgKind> = {
  สาขา: "branch", branch: "branch",
  หน่วยงาน: "org", แผนก: "org", ฝ่าย: "org", org: "org", org_unit: "org", unit: "org",
  ตำแหน่ง: "position", position: "position",
};
const KIND_ORDER: Record<OrgKind, number> = { branch: 0, org: 1, position: 2 };

export interface OrgRow {
  line: number;
  kind: OrgKind;
  code: string;
  name: string;
  parent: string;
  branch: string;
  unit: string;
  unit_type: string;
  job_level: number | null;
  min_salary: number | null;
  max_salary: number | null;
  head_office: boolean;
  tax_branch_no: string;
  sso_account_no: string;
  sso_branch_no: string;
  errors: string[];
}

/** existing = codes already in the system (lower case) */
export function parseOrg(table: CsvTable, existing: { branches: Set<string>; orgs: Set<string> } = { branches: new Set(), orgs: new Set() }) {
  const { rows, missing } = rowsOf(table, ORG_COLUMNS as unknown as { key: string; aliases: string[] }[]);
  const fileBranches = new Set<string>();
  const fileOrgs = new Set<string>();
  for (const { v } of rows) {
    const k = KIND_WORDS[(v.kind ?? "").trim().toLowerCase()];
    const c = (v.code ?? "").trim().toLowerCase();
    if (k === "branch") fileBranches.add(c);
    if (k === "org") fileOrgs.add(c);
  }
  const hasBranch = (c: string) => fileBranches.has(c.toLowerCase()) || existing.branches.has(c.toLowerCase());
  const hasOrg = (c: string) => fileOrgs.has(c.toLowerCase()) || existing.orgs.has(c.toLowerCase());
  const seen = new Set<string>();
  const out: OrgRow[] = rows.map(({ line, v }) => {
    const errors: string[] = [];
    const t = (k: string) => (v[k] ?? "").trim();
    const kind = KIND_WORDS[t("kind").toLowerCase()];
    if (!kind) errors.push(`ประเภทข้อมูล “${t("kind")}” ไม่ถูกต้อง (ใส่ สาขา / หน่วยงาน / ตำแหน่ง)`);
    const code = t("code");
    if (!code) errors.push("ไม่มีรหัส");
    else if (!/^[A-Za-z0-9._-]+$/.test(code)) errors.push("รหัสใช้ได้เฉพาะ A-Z 0-9 . _ -");
    const key = `${kind}|${code.toLowerCase()}`;
    if (code && seen.has(key)) errors.push("รหัสซ้ำในไฟล์");
    seen.add(key);
    if (!t("name")) errors.push("ไม่มีชื่อ");
    const n = (k: string, label: string) => {
      const x = num(v[k]);
      if (x === null) return null;
      if (Number.isNaN(x) || x < 0) {
        errors.push(`${label}ไม่ถูกต้อง`);
        return null;
      }
      return x;
    };
    const job_level = kind === "position" ? n("job_level", "ระดับตำแหน่ง") : null;
    if (job_level !== null && (!Number.isInteger(job_level) || job_level < 1 || job_level > 20)) errors.push("ระดับตำแหน่งต้องเป็น 1 ถึง 20");
    const min_salary = kind === "position" ? n("min_salary", "เงินเดือนต่ำสุด") : null;
    const max_salary = kind === "position" ? n("max_salary", "เงินเดือนสูงสุด") : null;
    if (min_salary !== null && max_salary !== null && min_salary > max_salary) errors.push("เงินเดือนต่ำสุดมากกว่าสูงสุด");
    if (kind === "org") {
      if (t("parent") && !hasOrg(t("parent"))) errors.push(`ไม่พบหน่วยงานแม่รหัส “${t("parent")}”`);
      if (t("parent") && t("parent").toLowerCase() === code.toLowerCase()) errors.push("หน่วยงานแม่ต้องไม่ใช่ตัวเอง");
      if (t("branch") && !hasBranch(t("branch"))) errors.push(`ไม่พบสาขารหัส “${t("branch")}”`);
    }
    if (kind === "position" && t("unit") && !hasOrg(t("unit"))) errors.push(`ไม่พบหน่วยงานรหัส “${t("unit")}”`);
    if (kind === "branch") {
      if (t("tax_branch_no") && !/^\d{5}$/.test(t("tax_branch_no"))) errors.push("เลขที่สาขาภาษีต้องเป็นตัวเลข 5 หลัก");
      if (t("sso_account_no") && !/^\d{10}$/.test(t("sso_account_no").replace(/\D/g, ""))) errors.push("เลขบัญชีนายจ้าง สปส. ต้องเป็นตัวเลข 10 หลัก");
      if (t("sso_branch_no") && !/^\d{6}$/.test(t("sso_branch_no"))) errors.push("ลำดับที่สาขา สปส. ต้องเป็นตัวเลข 6 หลัก");
    }
    return {
      line, kind: kind ?? "org", code, name: t("name"), parent: t("parent"), branch: t("branch"), unit: t("unit"), unit_type: t("unit_type"),
      job_level, min_salary, max_salary, head_office: /^(y|yes|true|1|ใช่|x|✓)$/i.test(t("head_office")),
      tax_branch_no: t("tax_branch_no"), sso_account_no: t("sso_account_no").replace(/\D/g, ""), sso_branch_no: t("sso_branch_no"), errors,
    };
  });
  return { rows: out, missing };
}

/** save order: branches, then units (parents before children), then positions */
export function orgSaveOrder(rows: OrgRow[]): OrgRow[] {
  const units = rows.filter((r) => r.kind === "org");
  const placed = new Set<string>();
  const ordered: OrgRow[] = [];
  let left = units;
  while (left.length) {
    const ready = left.filter((r) => !r.parent || placed.has(r.parent.toLowerCase()) || !units.some((u) => u.code.toLowerCase() === r.parent.toLowerCase()));
    if (!ready.length) {
      ordered.push(...left); // a loop in the file: the server reports it
      break;
    }
    for (const r of ready) placed.add(r.code.toLowerCase());
    ordered.push(...ready);
    left = left.filter((r) => !ready.includes(r));
  }
  return [...rows.filter((r) => r.kind === "branch"), ...ordered, ...rows.filter((r) => r.kind === "position")].sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
}

export function orgTemplate(): CsvTable {
  return [
    ["ประเภทข้อมูล", "รหัส", "ชื่อ", "รหัสหน่วยงานแม่", "รหัสสาขา", "รหัสหน่วยงาน", "ระดับหน่วยงาน", "ระดับตำแหน่ง", "เงินเดือนต่ำสุด", "เงินเดือนสูงสุด", "สำนักงานใหญ่", "เลขที่สาขาภาษี", "เลขบัญชีนายจ้าง สปส.", "ลำดับที่สาขา สปส."],
    ["สาขา", "HQ", "สำนักงานใหญ่", "", "", "", "", "", "", "", "ใช่", "00000", "", "000000"],
    ["หน่วยงาน", "PRD", "ฝ่ายผลิต", "", "HQ", "", "ฝ่าย", "", "", "", "", "", "", ""],
    ["ตำแหน่ง", "OP", "พนักงานฝ่ายผลิต", "", "", "PRD", "", "2", "11000", "18000", "", "", "", ""],
  ];
}
