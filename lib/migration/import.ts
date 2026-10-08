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
