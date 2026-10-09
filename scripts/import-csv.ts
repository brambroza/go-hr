/**
 * Import master data and employees from CSV files (same column layout as the in-app import pages).
 *
 *   npx tsx --tsconfig scripts/tsconfig.json scripts/import-csv.ts --org data/import/0-org-structure.csv --employees data/import/1-employees.csv
 *   npx tsx --tsconfig scripts/tsconfig.json scripts/import-csv.ts --employees data/import/1-employees.csv --dry-run
 *
 * --org        CSV with rows of type สาขา / หน่วยงาน / ตำแหน่ง (branches, org units, positions). Upserts by code.
 * --employees  CSV with the employee import columns (see lib/employees/import.ts). Existing codes are updated.
 * --dry-run    validate only, write nothing.
 *
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment / .env.local
 */
import fs from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { parseCsv } from "@/lib/csv";
import { mapHeaders, validateRows, type ImportKey, type RawRow, type Refs } from "@/lib/employees/import";
import { loadEnv } from "./env";

loadEnv();

interface Args {
  org?: string;
  employees?: string;
  dryRun: boolean;
}

/** Parse command-line flags */
function parseArgs(argv: string[]): Args {
  const a: Args = { dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    if (v === "--org") a.org = argv[++i];
    else if (v === "--employees") a.employees = argv[++i];
    else if (v === "--dry-run") a.dryRun = true;
    else throw new Error(`unknown argument: ${v}`);
  }
  if (!a.org && !a.employees) throw new Error("usage: import-csv.ts [--org file.csv] [--employees file.csv] [--dry-run]");
  return a;
}

/** Read a CSV file into an array of objects keyed by the header row */
function readCsvObjects(path: string): Record<string, string>[] {
  const table = parseCsv(fs.readFileSync(path, "utf8"));
  if (table.length < 2) throw new Error(`${path}: no data rows`);
  const header = table[0].map((h) => h.trim());
  return table.slice(1).filter((r) => r.some((c) => c.trim())).map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? "").trim()])));
}

const must = <T,>(r: { data: T; error: { message: string } | null }, ctx: string): NonNullable<T> => {
  if (r.error) throw new Error(`${ctx}: ${r.error.message}`);
  return r.data as NonNullable<T>;
};

const numOrNull = (s: string): number | null => (s.replace(/,/g, "").trim() === "" ? null : Number(s.replace(/,/g, "")));
const yes = (s: string) => /^(ใช่|yes|y|true|1)$/i.test(s.trim());

// ---------------------------------------------------------------- org structure

/** Import branches, org units (parents first) and positions; upsert by code */
async function importOrg(sb: SupabaseClient, path: string, dryRun: boolean) {
  const rows = readCsvObjects(path);
  const kind = (r: Record<string, string>) => r["ประเภทข้อมูล"];
  const branches = rows.filter((r) => kind(r) === "สาขา");
  const units = rows.filter((r) => kind(r) === "หน่วยงาน");
  const positions = rows.filter((r) => kind(r) === "ตำแหน่ง");
  const unknown = rows.filter((r) => !["สาขา", "หน่วยงาน", "ตำแหน่ง"].includes(kind(r)));
  if (unknown.length) throw new Error(`${path}: unknown ประเภทข้อมูล: ${unknown.map((r) => kind(r)).join(", ")}`);
  for (const r of rows) if (!r["รหัส"] || !r["ชื่อ"]) throw new Error(`${path}: row without รหัส/ชื่อ (${JSON.stringify(r)})`);

  console.log(`org: ${branches.length} branches, ${units.length} org units, ${positions.length} positions`);
  if (dryRun) return;

  // branches
  const branchId: Record<string, number> = {};
  for (const r of branches) {
    const row = {
      code: r["รหัส"],
      name: r["ชื่อ"],
      is_head_office: yes(r["สำนักงานใหญ่"] ?? ""),
      tax_branch_no: r["เลขที่สาขาภาษี"] || "00000",
      sso_account_no: r["เลขบัญชีนายจ้าง สปส."] || null,
      sso_branch_no: r["ลำดับที่สาขา สปส."] || "000000",
    };
    const d = must(await sb.from("branches").upsert(row, { onConflict: "code" }).select("id").single(), `branch ${row.code}`);
    branchId[row.code] = d.id;
  }
  for (const b of must(await sb.from("branches").select("id, code"), "branches")) branchId[b.code] = b.id;

  // org units: insert in dependency order (parent must already exist)
  const unitId: Record<string, number> = {};
  for (const u of must(await sb.from("org_units").select("id, code"), "org_units")) unitId[u.code] = u.id;
  let pending = [...units];
  while (pending.length) {
    const ready = pending.filter((r) => !r["รหัสหน่วยงานแม่"] || unitId[r["รหัสหน่วยงานแม่"]]);
    if (!ready.length) throw new Error(`org units with missing parent: ${pending.map((r) => `${r["รหัส"]} (parent ${r["รหัสหน่วยงานแม่"]})`).join(", ")}`);
    for (const r of ready) {
      const branch = r["รหัสสาขา"] ? branchId[r["รหัสสาขา"]] : null;
      if (r["รหัสสาขา"] && !branch) throw new Error(`org unit ${r["รหัส"]}: unknown branch ${r["รหัสสาขา"]}`);
      const row = {
        code: r["รหัส"],
        name: r["ชื่อ"],
        unit_type: r["ระดับหน่วยงาน"] || null,
        parent_id: r["รหัสหน่วยงานแม่"] ? unitId[r["รหัสหน่วยงานแม่"]] : null,
        branch_id: branch,
      };
      const d = must(await sb.from("org_units").upsert(row, { onConflict: "code" }).select("id").single(), `org unit ${row.code}`);
      unitId[row.code] = d.id;
    }
    pending = pending.filter((r) => !ready.includes(r));
  }

  // positions
  for (const r of positions) {
    const unit = r["รหัสหน่วยงาน"] ? unitId[r["รหัสหน่วยงาน"]] : null;
    if (r["รหัสหน่วยงาน"] && !unit) throw new Error(`position ${r["รหัส"]}: unknown org unit ${r["รหัสหน่วยงาน"]}`);
    const row = {
      code: r["รหัส"],
      name: r["ชื่อ"],
      org_unit_id: unit,
      job_level: numOrNull(r["ระดับตำแหน่ง"] ?? "") ?? 1,
      min_salary: numOrNull(r["เงินเดือนต่ำสุด"] ?? ""),
      max_salary: numOrNull(r["เงินเดือนสูงสุด"] ?? ""),
    };
    must(await sb.from("positions").upsert(row, { onConflict: "code" }).select("id").single(), `position ${row.code}`);
  }
  console.log("org: done");
}

// ---------------------------------------------------------------- employees

/** Load code → id lookups the validator needs */
async function loadRefs(sb: SupabaseClient): Promise<Refs> {
  const [b, o, p, e] = await Promise.all([
    sb.from("branches").select("id, code"),
    sb.from("org_units").select("id, code"),
    sb.from("positions").select("id, code"),
    sb.from("employees").select("id, code"),
  ]);
  const m = (d: { id: number; code: string }[] | null) => Object.fromEntries((d ?? []).map((x) => [x.code.toLowerCase(), x.id]));
  return { branches: m(b.data), orgs: m(o.data), positions: m(p.data), employees: m(e.data) };
}

/** Same flow as app/(admin)/employees/import/actions.ts, without the permission checks */
async function importEmployees(sb: SupabaseClient, path: string, dryRun: boolean) {
  const table = parseCsv(fs.readFileSync(path, "utf8"));
  if (table.length < 2) throw new Error(`${path}: no data rows`);
  const keys = mapHeaders(table[0]);
  const unmapped = table[0].filter((_, i) => !keys[i]).filter((h) => h.trim());
  if (unmapped.length) console.warn(`employees: ignored columns: ${unmapped.join(", ")}`);
  const raw: RawRow[] = table
    .slice(1)
    .filter((r) => r.some((c) => c.trim()))
    .map((r) => {
      const o: RawRow = {};
      keys.forEach((k, i) => {
        if (k) o[k as ImportKey] = r[i] ?? "";
      });
      return o;
    });

  const refs = await loadRefs(sb);
  const parsed = validateRows(raw, refs);
  const bad = parsed.filter((r) => r.errors.length);
  for (const r of bad) console.error(`  row ${r.line} ${r.raw.code ?? ""}: ${r.errors.join(", ")}`);
  for (const r of parsed.filter((r) => !r.errors.length && r.warnings.length)) console.warn(`  row ${r.line} ${r.raw.code ?? ""}: ${r.warnings.join(", ")}`);
  console.log(`employees: ${parsed.length} rows, ${parsed.length - bad.length} valid (${parsed.filter((r) => !r.errors.length && r.isUpdate).length} updates), ${bad.length} with errors`);
  if (bad.length) throw new Error("fix the rows above and re-run");
  if (dryRun) return;

  const idByCode: Record<string, number> = { ...refs.employees };
  let created = 0;
  let updated = 0;
  for (const r of parsed) {
    const code = String(r.employee.code);
    const { code: _c, ...rest } = r.employee;
    void _c;
    let id: number;
    if (r.isUpdate) {
      id = idByCode[code.toLowerCase()];
      if (Object.keys(rest).length) must(await sb.from("employees").update(rest).eq("id", id), `employee ${code}`);
      updated++;
    } else {
      const d = must(await sb.from("employees").insert(r.employee).select("id").single(), `employee ${code}`);
      id = d.id;
      idByCode[code.toLowerCase()] = id;
      created++;
    }
    if (Object.keys(r.priv).length) must(await sb.from("employee_private").upsert({ employee_id: id, ...r.priv }, { onConflict: "employee_id" }), `employee_private ${code}`);
  }
  // supervisors last: they may be created in the same file
  for (const r of parsed) {
    if (!r.supervisor_code) continue;
    const id = idByCode[String(r.employee.code).toLowerCase()];
    const sup = idByCode[r.supervisor_code.toLowerCase()];
    if (id && sup) must(await sb.from("employees").update({ supervisor_id: sup }).eq("id", id), `supervisor of ${r.employee.code}`);
  }
  await sb.from("audit_logs").insert({ action: "IMPORT", table_name: "employees", user_name: "scripts/import-csv.ts", note: `created ${created}, updated ${updated}, file ${path}` });
  console.log(`employees: created ${created}, updated ${updated}`);
}

// ---------------------------------------------------------------- main

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (.env.local)");
  const sb = createClient(url, key, { auth: { persistSession: false } });
  if (args.dryRun) console.log("dry run: nothing will be written");
  if (args.org) await importOrg(sb, args.org, args.dryRun);
  if (args.employees) await importEmployees(sb, args.employees, args.dryRun);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
