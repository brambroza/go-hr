import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { passwordChangeError, DEFAULT_POLICY } from "../lib/employees/password";

const root = join(__dirname, "..");
const migrationsDir = join(root, "supabase", "migrations");
const migrations = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => ({ name: f, sql: readFileSync(join(migrationsDir, f), "utf8") }));

/** Body of the newest app.sync_grants() — the single place that decides privileges after every upgrade */
function syncGrantsBody(): string {
  const latest = [...migrations].reverse().find((m) => /create or replace function app\.sync_grants\(\)/.test(m.sql));
  assert.ok(latest, "a migration must define app.sync_grants()");
  const start = latest.sql.indexOf("create or replace function app.sync_grants()");
  const end = latest.sql.indexOf("end $$;", start);
  return latest.sql.slice(start, end);
}

test("migrate.sh: no blanket grants after the migrations, privileges come from app.sync_grants()", () => {
  const code = readFileSync(join(root, "deploy", "migrate.sh"), "utf8")
    .split("\n")
    .filter((l) => !l.trim().startsWith("#"))
    .join("\n");
  assert.doesNotMatch(code, /grant\s+all\s+on\s+all\s+tables/i);
  assert.doesNotMatch(code, /grant\s+execute\s+on\s+all\s+functions/i);
  assert.match(code, /select app\.sync_grants\(\);/);
});

test("sync_grants: every function a migration takes away from signed-in users stays service-only", () => {
  const body = syncGrantsBody();
  const missing = new Set<string>();
  for (const m of migrations) {
    const re = /revoke\s+(?:all|execute)\s+on\s+function\s+((?:public|app)\.[a-z_0-9]+)[^;]*?\bfrom\b[^;]*?\bauthenticated\b/gi;
    for (const hit of m.sql.matchAll(re)) {
      const fn = hit[1].split(".")[1];
      if (fn === "sync_grants" || fn === "grant_columns_except") continue; // handled by their own revoke line
      if (!body.includes(`'${fn}'`)) missing.add(`${hit[1]} (${m.name})`);
    }
  }
  assert.deepEqual([...missing], [], "add these to the service-only list in app.sync_grants()");
});

test("sync_grants: secret columns are hidden and anonymous callers get no RPC", () => {
  const body = syncGrantsBody();
  for (const [table, column] of [
    ["work_locations", "qr_secret"],
    ["time_devices", "api_key"],
    ["profiles", "line_link_code"],
    ["employee_faces", "descriptor"],
  ]) {
    assert.match(body, new RegExp(`grant_columns_except\\('${table}', 'select', array\\[[^\\]]*'${column}'`), `${table}.${column} must not be selectable`);
  }
  assert.match(body, /revoke all on all functions in schema public from public, anon;/);
  assert.doesNotMatch(body, /grant\s+all\s+on\s+all\s+tables\s+in\s+schema\s+public\s+to\s+authenticated/i);
});

test("Caddyfile: the auth service is closed from outside except who-am-I, refresh and sign-out", () => {
  const caddy = readFileSync(join(root, "deploy", "Caddyfile"), "utf8");
  const closed = caddy.indexOf("handle @auth_closed");
  const proxy = caddy.indexOf("handle @supabase");
  assert.ok(closed > 0 && proxy > closed, "the closing rule must come before the Supabase proxy");
  assert.match(caddy, /query grant_type=refresh_token/);
  assert.doesNotMatch(caddy, /query grant_type=password/);
});

test("passwordChangeError: current password required, policy enforced, no reuse", () => {
  assert.equal(passwordChangeError("", "Abcdef1!", DEFAULT_POLICY), "กรอกรหัสผ่านปัจจุบัน");
  assert.match(passwordChangeError("old", "1", DEFAULT_POLICY) ?? "", /^รหัสผ่านใหม่ต้อง/);
  assert.match(passwordChangeError("old", "abcdefgh", DEFAULT_POLICY) ?? "", /ตัวพิมพ์ใหญ่/);
  assert.equal(passwordChangeError("Abcdef1!", "Abcdef1!", DEFAULT_POLICY), "รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านเดิม");
  assert.equal(passwordChangeError("old", "A1!" + "a".repeat(250), DEFAULT_POLICY), "รหัสผ่านใหม่ยาวเกินไป");
  assert.equal(passwordChangeError("old", "Abcdef1!", DEFAULT_POLICY), null);
});

test("storage: the last definition of the private-bucket read policy goes through app.can_read_object()", () => {
  const re = /create policy "go_hr_own_read" on storage\.objects for select to authenticated\s+using \(([^$]*)\)\$p\$/g;
  const all = migrations.flatMap((m) => [...m.sql.matchAll(re)].map((hit) => ({ file: m.name, using: hit[1] })));
  assert.ok(all.length > 0);
  assert.equal(all[all.length - 1].using.trim(), "app.can_read_object(bucket_id, name)", `last definition is in ${all[all.length - 1].file}`);
});

test("lockdown migration: each object is defined once (a pasted-twice file re-creates an older policy last)", () => {
  const sql = migrations.find((m) => m.name === "20261123010000_grants_lockdown.sql")?.sql ?? "";
  for (const marker of ["create or replace function app.sync_grants()", "create or replace function app.can_read_object(", 'create policy "go_hr_own_read"', "create or replace function app.profiles_guard()"]) {
    assert.equal(sql.split(marker).length - 1, 1, marker);
  }
});
