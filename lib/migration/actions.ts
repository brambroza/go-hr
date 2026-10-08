"use server";

import { revalidatePath } from "next/cache";
import { requirePerm, safeAction, type ActionResult } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { orgSaveOrder, parseLeave, parseOrg, parseYtd, type CsvTable } from "./import";

export interface MigrationStatus {
  year: number;
  company: { name: boolean; tax_id: boolean; sso_account: boolean };
  branches: number;
  orgUnits: number;
  positions: number;
  employees: number;
  withSalary: number;
  withBank: number;
  withNationalId: number;
  ytdOpening: number;
  leaveQuotas: number;
  leaveOpening: number;
  recurring: number;
  loans: number;
  linkedUsers: number;
  periods: number;
  checklist: Record<string, { done_at: string; by?: string } | undefined>;
}

const MAX_ROWS = 5000;

async function count(q: PromiseLike<{ count: number | null; error: { message: string } | null }>) {
  const { count: c, error } = await q;
  if (error) throw new Error(error.message);
  return c ?? 0;
}

export async function migrationStatusAction(): Promise<ActionResult<MigrationStatus>> {
  return safeAction(async () => {
    await requirePerm("settings");
    const sb = supabaseAdmin();
    const year = new Date().getFullYear();
    const head = { count: "exact" as const, head: true };
    const [company, list, branchSso] = await Promise.all([
      sb.from("settings").select("value").eq("key", "company").maybeSingle(),
      sb.from("settings").select("value").eq("key", "migration").maybeSingle(),
      sb.from("branches").select("sso_account_no").not("sso_account_no", "is", null).limit(1),
    ]);
    const c = (company.data?.value ?? {}) as { name?: string; tax_id?: string };
    const active = () => sb.from("employees").select("id", head).neq("status", "resigned");
    const [branches, orgUnits, positions, employees, withSalary, withBank, withNationalId, ytdOpening, leaveQuotas, leaveOpening, recurring, loans, linkedUsers, periods] = await Promise.all([
      count(sb.from("branches").select("id", head)),
      count(sb.from("org_units").select("id", head)),
      count(sb.from("positions").select("id", head)),
      count(active()),
      count(sb.from("employee_private").select("employee_id", head).gt("salary", 0)),
      count(sb.from("employee_private").select("employee_id", head).not("bank_account", "is", null).neq("bank_account", "")),
      count(sb.from("employee_private").select("employee_id", head).not("national_id", "is", null).neq("national_id", "")),
      count(sb.from("employee_private").select("employee_id", head).eq("ytd_open_year", year)),
      count(sb.from("leave_quotas").select("id", head).eq("leave_year", year)),
      count(sb.from("leave_quotas").select("id", head).eq("leave_year", year).gt("opening_used_days", 0)),
      count(sb.from("employee_pay_items").select("id", head)),
      count(sb.from("employee_loans").select("id", head)),
      count(sb.from("profiles").select("id", head).not("employee_id", "is", null)),
      count(sb.from("payroll_periods").select("id", head)),
    ]);
    return {
      year,
      company: { name: !!c.name?.trim(), tax_id: /^\d{13}$/.test(c.tax_id ?? ""), sso_account: !!branchSso.data?.length },
      branches, orgUnits, positions, employees, withSalary, withBank, withNationalId, ytdOpening, leaveQuotas, leaveOpening, recurring, loans, linkedUsers, periods,
      checklist: ((list.data?.value ?? {}) as { checklist?: MigrationStatus["checklist"] }).checklist ?? {},
    };
  });
}

/** Mark a manual checklist step done / not done (stored in settings.migration) */
export async function setMigrationStepAction(step: string, done: boolean): Promise<ActionResult<void>> {
  return safeAction(async () => {
    const me = await requirePerm("settings", "edit");
    if (!/^[a-z_]{2,32}$/.test(step)) throw new Error("ขั้นตอนไม่ถูกต้อง");
    const sb = supabaseAdmin();
    const { data } = await sb.from("settings").select("value").eq("key", "migration").maybeSingle();
    const v = (data?.value ?? {}) as { checklist?: Record<string, unknown> };
    const checklist = { ...(v.checklist ?? {}) };
    if (done) checklist[step] = { done_at: new Date().toISOString(), by: me.displayName };
    else delete checklist[step];
    const { error } = await sb.from("settings").upsert({ key: "migration", value: { ...v, checklist }, updated_at: new Date().toISOString(), updated_by: me.userId });
    if (error) throw new Error(error.message);
    revalidatePath("/settings/migration");
  }, done ? "บันทึกว่าทำขั้นตอนนี้เสร็จแล้ว" : "ยกเลิกสถานะเสร็จแล้ว");
}

/** codes only — used by the browser preview to flag unknown employees / leave types */
export async function migrationRefsAction(): Promise<ActionResult<{ employees: string[]; leaveTypes: string[]; branches: string[]; orgs: string[] }>> {
  return safeAction(async () => {
    await requirePerm("settings");
    const sb = supabaseAdmin();
    const [e, t, b, o] = await Promise.all([sb.from("employees").select("code"), sb.from("leave_types").select("code"), sb.from("branches").select("code"), sb.from("org_units").select("code")]);
    const codes = (r: { data: { code: unknown }[] | null }) => (r.data ?? []).map((x) => String(x.code));
    return { employees: codes(e), leaveTypes: codes(t), branches: codes(b), orgs: codes(o) };
  });
}

/** branches, org units and positions from one CSV (upsert by code) */
export async function importOrgAction(table: CsvTable): Promise<ActionResult<ImportSummary>> {
  return safeAction(async () => {
    const me = await requirePerm("org", "create");
    if (!Array.isArray(table) || table.length < 2) throw new Error("ไม่มีข้อมูลที่จะนำเข้า");
    if (table.length > MAX_ROWS + 1) throw new Error(`นำเข้าได้ครั้งละไม่เกิน ${MAX_ROWS.toLocaleString()} แถว`);
    const sb = supabaseAdmin();
    const load = async (t: "branches" | "org_units") => {
      const { data, error } = await sb.from(t).select("id, code");
      if (error) throw new Error(error.message);
      return new Map((data ?? []).map((x) => [String(x.code).toLowerCase(), Number(x.id)]));
    };
    const branchId = await load("branches");
    const orgId = await load("org_units");
    const { rows, missing } = parseOrg(table, { branches: new Set(branchId.keys()), orgs: new Set(orgId.keys()) });
    if (missing.length) throw new Error(`ไฟล์ไม่มีคอลัมน์ ${missing.join(", ")}`);
    const res: ImportSummary = { saved: 0, failed: [] };
    for (const r of orgSaveOrder(rows)) {
      if (r.errors.length) {
        res.failed.push({ line: r.line, code: r.code, error: r.errors.join(", ") });
        continue;
      }
      let error: { message: string } | null = null;
      if (r.kind === "branch") {
        const row: Record<string, unknown> = { code: r.code, name: r.name, is_head_office: r.head_office };
        if (r.tax_branch_no) row.tax_branch_no = r.tax_branch_no;
        if (r.sso_account_no) row.sso_account_no = r.sso_account_no;
        if (r.sso_branch_no) row.sso_branch_no = r.sso_branch_no;
        const q = await sb.from("branches").upsert(row, { onConflict: "code" }).select("id").single();
        error = q.error;
        if (q.data) branchId.set(r.code.toLowerCase(), Number(q.data.id));
      } else if (r.kind === "org") {
        const row: Record<string, unknown> = { code: r.code, name: r.name, parent_id: r.parent ? orgId.get(r.parent.toLowerCase()) ?? null : null, branch_id: r.branch ? branchId.get(r.branch.toLowerCase()) ?? null : null };
        if (r.unit_type) row.unit_type = r.unit_type;
        if (r.parent && !row.parent_id) {
          res.failed.push({ line: r.line, code: r.code, error: `บันทึกหน่วยงานแม่ “${r.parent}” ไม่สำเร็จ` });
          continue;
        }
        const q = await sb.from("org_units").upsert(row, { onConflict: "code" }).select("id").single();
        error = q.error;
        if (q.data) orgId.set(r.code.toLowerCase(), Number(q.data.id));
      } else {
        const row: Record<string, unknown> = { code: r.code, name: r.name, org_unit_id: r.unit ? orgId.get(r.unit.toLowerCase()) ?? null : null };
        if (r.job_level !== null) row.job_level = r.job_level;
        if (r.min_salary !== null) row.min_salary = r.min_salary;
        if (r.max_salary !== null) row.max_salary = r.max_salary;
        const q = await sb.from("positions").upsert(row, { onConflict: "code" }).select("id").single();
        error = q.error;
      }
      if (error) res.failed.push({ line: r.line, code: r.code, error: error.message });
      else res.saved++;
    }
    await sb.from("audit_logs").insert({ user_id: me.userId, user_name: me.displayName, action: "IMPORT", table_name: "org_units", note: `โครงสร้างองค์กร: บันทึก ${res.saved} ไม่สำเร็จ ${res.failed.length}` });
    revalidatePath("/settings/migration");
    revalidatePath("/org");
    return res;
  });
}

async function employeeIdsByCode(sb: ReturnType<typeof supabaseAdmin>) {
  const { data, error } = await sb.from("employees").select("id, code");
  if (error) throw new Error(error.message);
  return new Map((data ?? []).map((e) => [String(e.code).toLowerCase(), Number(e.id)]));
}

export interface ImportSummary {
  saved: number;
  failed: { line: number; code: string; error: string }[];
}

export async function importYtdAction(table: CsvTable): Promise<ActionResult<ImportSummary>> {
  return safeAction(async () => {
    const me = await requirePerm("employee_private", "edit");
    if (!Array.isArray(table) || table.length < 2) throw new Error("ไม่มีข้อมูลที่จะนำเข้า");
    if (table.length > MAX_ROWS + 1) throw new Error(`นำเข้าได้ครั้งละไม่เกิน ${MAX_ROWS.toLocaleString()} แถว`);
    const sb = supabaseAdmin();
    const ids = await employeeIdsByCode(sb);
    const { rows, missing } = parseYtd(table, { defaultYear: new Date().getFullYear(), knownCodes: new Set(ids.keys()) });
    if (missing.length) throw new Error(`ไฟล์ไม่มีคอลัมน์ ${missing.join(", ")}`);
    const res: ImportSummary = { saved: 0, failed: [] };
    for (const r of rows) {
      if (r.errors.length) {
        res.failed.push({ line: r.line, code: r.code, error: r.errors.join(", ") });
        continue;
      }
      const { error } = await sb.from("employee_private").upsert(
        { employee_id: ids.get(r.code.toLowerCase())!, ytd_open_year: r.year, ytd_open_income: r.income, ytd_open_tax: r.tax, ytd_open_sso: r.sso, ytd_open_pvd: r.pvd },
        { onConflict: "employee_id", defaultToNull: false },
      );
      if (error) res.failed.push({ line: r.line, code: r.code, error: error.message });
      else res.saved++;
    }
    await sb.from("audit_logs").insert({ user_id: me.userId, user_name: me.displayName, action: "IMPORT", table_name: "employee_private", note: `ยอดยกมาต้นปี: บันทึก ${res.saved} ไม่สำเร็จ ${res.failed.length}` });
    revalidatePath("/settings/migration");
    return res;
  });
}

export async function importLeaveAction(table: CsvTable): Promise<ActionResult<ImportSummary>> {
  return safeAction(async () => {
    const me = await requirePerm("attendance", "edit");
    if (!Array.isArray(table) || table.length < 2) throw new Error("ไม่มีข้อมูลที่จะนำเข้า");
    if (table.length > MAX_ROWS + 1) throw new Error(`นำเข้าได้ครั้งละไม่เกิน ${MAX_ROWS.toLocaleString()} แถว`);
    const sb = supabaseAdmin();
    const ids = await employeeIdsByCode(sb);
    const { data: types, error: te } = await sb.from("leave_types").select("id, code");
    if (te) throw new Error(te.message);
    const typeId = new Map((types ?? []).map((t) => [String(t.code).toLowerCase(), Number(t.id)]));
    const { rows, missing } = parseLeave(table, { defaultYear: new Date().getFullYear(), knownCodes: new Set(ids.keys()), leaveTypes: new Set(typeId.keys()) });
    if (missing.length) throw new Error(`ไฟล์ไม่มีคอลัมน์ ${missing.join(", ")}`);
    const res: ImportSummary = { saved: 0, failed: [] };
    for (const r of rows) {
      if (r.errors.length) {
        res.failed.push({ line: r.line, code: r.code, error: r.errors.join(", ") });
        continue;
      }
      const { error } = await sb.from("leave_quotas").upsert(
        {
          employee_id: ids.get(r.code.toLowerCase())!, leave_type_id: typeId.get(r.type.toLowerCase())!, leave_year: r.year,
          quota_days: r.quota, carried_days: r.carried, opening_used_days: r.used, note: "ยอดยกมาจากระบบเดิม",
        },
        { onConflict: "employee_id,leave_year,leave_type_id", defaultToNull: false },
      );
      if (error) res.failed.push({ line: r.line, code: r.code, error: error.message });
      else res.saved++;
    }
    await sb.from("audit_logs").insert({ user_id: me.userId, user_name: me.displayName, action: "IMPORT", table_name: "leave_quotas", note: `วันลายกมา: บันทึก ${res.saved} ไม่สำเร็จ ${res.failed.length}` });
    revalidatePath("/settings/migration");
    revalidatePath("/leave/quotas");
    return res;
  });
}
