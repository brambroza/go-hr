/**
 * Create login accounts for employees that do not have one yet (same rules as
 * Settings → Users → "สร้างบัญชีให้พนักงานที่ยังไม่มีบัญชี").
 *
 *   npx tsx scripts/create-employee-logins.ts                      # password = birth date ddmmyyyy (พ.ศ.)
 *   npx tsx scripts/create-employee-logins.ts --password 'Emp@12345'
 *   npx tsx scripts/create-employee-logins.ts --codes T001,T002 --group MANAGER
 *
 * --password <pw>   same initial password for everyone (otherwise birth date; employees without one are skipped)
 * --codes a,b,c     only these employee codes (default: every active employee without an account)
 * --group CODE      role group code (default EMPLOYEE; employees who supervise someone get MANAGER unless --group is given)
 * --no-must-change  do not force a password change on first login
 *
 * Username = employee code. Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "./env";

loadEnv();

interface Args {
  password?: string;
  codes?: string[];
  group?: string;
  mustChange: boolean;
}

/** Parse command-line flags */
function parseArgs(argv: string[]): Args {
  const a: Args = { mustChange: true };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    if (v === "--password") a.password = argv[++i];
    else if (v === "--codes") a.codes = argv[++i].split(",").map((s) => s.trim()).filter(Boolean);
    else if (v === "--group") a.group = argv[++i];
    else if (v === "--no-must-change") a.mustChange = false;
    else throw new Error(`unknown argument: ${v}`);
  }
  if (a.password !== undefined && a.password.length < 6) throw new Error("password must be at least 6 characters");
  return a;
}

/** Birth date ISO (yyyy-mm-dd) → ddmmyyyy in พ.ศ., the same rule as the admin UI */
function birthPassword(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}${m}${Number(y) + 543}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (.env.local)");
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const [{ data: groups, error: ge }, { data: emps, error: ee }, { data: profs, error: pe }] = await Promise.all([
    sb.from("role_groups").select("id, code"),
    sb.from("employees").select("id, code, first_name, last_name, birth_date, status, supervisor_id").neq("status", "resigned").order("code"),
    sb.from("profiles").select("employee_id, username"),
  ]);
  if (ge) throw new Error(ge.message);
  if (ee) throw new Error(ee.message);
  if (pe) throw new Error(pe.message);

  const groupId = (code: string) => {
    const g = (groups ?? []).find((x) => x.code === code);
    if (!g) throw new Error(`role group ${code} not found (have: ${(groups ?? []).map((x) => x.code).join(", ")})`);
    return g.id;
  };
  const employeeGroup = groupId(args.group ?? "EMPLOYEE");
  const managerGroup = args.group ? employeeGroup : groupId("MANAGER");
  const supervisors = new Set((emps ?? []).map((e) => e.supervisor_id).filter(Boolean));

  const linked = new Set((profs ?? []).map((p) => p.employee_id).filter(Boolean));
  const usernames = new Set((profs ?? []).map((p) => String(p.username ?? "").toLowerCase()));
  const want = args.codes ? new Set(args.codes.map((c) => c.toLowerCase())) : null;

  const created: { code: string; name: string; username: string; password: string; group: string }[] = [];
  const skipped: { code: string; reason: string }[] = [];

  for (const e of emps ?? []) {
    if (linked.has(e.id)) continue;
    if (want && !want.has(e.code.toLowerCase())) continue;
    const name = `${e.first_name} ${e.last_name}`;
    const username = e.code;
    if (usernames.has(username.toLowerCase())) {
      skipped.push({ code: e.code, reason: "username already used by another account" });
      continue;
    }
    const pw = args.password ?? (e.birth_date ? birthPassword(e.birth_date) : "");
    if (!pw) {
      skipped.push({ code: e.code, reason: "no birth date and no --password" });
      continue;
    }
    const isManager = !args.group && supervisors.has(e.id);
    const role_group_id = isManager ? managerGroup : employeeGroup;
    const email = `${e.code.toLowerCase()}@staff.gohr.local`;
    const { data: u, error: ue } = await sb.auth.admin.createUser({ email, password: pw, email_confirm: true });
    if (ue || !u.user) {
      skipped.push({ code: e.code, reason: ue?.message ?? "auth user not created" });
      continue;
    }
    const { error: upErr } = await sb.from("profiles").upsert({
      id: u.user.id, email, username, display_name: name, role_group_id, employee_id: e.id, must_change_password: args.mustChange, is_active: true,
    });
    if (upErr) {
      await sb.auth.admin.deleteUser(u.user.id);
      skipped.push({ code: e.code, reason: upErr.message });
      continue;
    }
    usernames.add(username.toLowerCase());
    created.push({ code: e.code, name, username, password: pw, group: isManager ? "MANAGER" : (args.group ?? "EMPLOYEE") });
  }

  await sb.from("audit_logs").insert({ action: "BULK_CREATE_USERS", table_name: "auth.users", user_name: "scripts/create-employee-logins.ts", note: `created ${created.length}, skipped ${skipped.length}` });

  for (const c of created) console.log(`✓ ${c.username.padEnd(8)} ${c.name.padEnd(28)} ${c.group.padEnd(9)} password: ${c.password}`);
  for (const s of skipped) console.log(`- ${s.code}: ${s.reason}`);
  console.log(`created ${created.length}, skipped ${skipped.length}${args.mustChange ? " (must change password on first login)" : ""}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
