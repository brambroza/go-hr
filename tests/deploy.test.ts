import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

// Static checks of the install / upgrade / backup scripts. They cannot prove that a server installs — that is the
// clean-VM rehearsal — but they stop the specific mistakes found in the 2026-11-23 review from coming back.

const root = join(__dirname, "..");

/** Read a repo file as text */
function read(...parts: string[]): string {
  return readFileSync(join(root, ...parts), "utf8");
}

/** Script text without comment lines (so a rule quoted in a comment does not count as code) */
function code(...parts: string[]): string {
  return read(...parts)
    .split("\n")
    .filter((l) => !l.trim().startsWith("#"))
    .join("\n");
}

const scripts = ["install.sh", "upgrade.sh", "backup.sh", "restore.sh", "migrate.sh"];

test("deploy scripts: executable, bash, fail fast", () => {
  for (const s of scripts) {
    const p = join(root, "deploy", s);
    assert.ok(existsSync(p), `${s} exists`);
    assert.ok(statSync(p).mode & 0o100, `${s} is executable`);
    const text = read("deploy", s);
    assert.match(text, /^#!\/usr\/bin\/env bash\n/, `${s} shebang`);
    assert.match(text, /^set -euo pipefail$/m, `${s} uses set -euo pipefail`);
  }
});

test("Dockerfile: the postinstall script is present before npm ci, health check uses the health endpoint", () => {
  const df = read("Dockerfile");
  const postinstall = JSON.parse(read("package.json")).scripts.postinstall as string;
  const script = postinstall.replace(/^node\s+/, "");
  const copyAt = df.indexOf(`COPY ${script}`);
  const ciAt = df.indexOf("RUN npm ci");
  assert.ok(copyAt > 0 && ciAt > 0 && copyAt < ciAt, `${script} must be copied before "npm ci" runs it`);
  assert.match(df, /HEALTHCHECK[^\n]*\/api\/public\/health/);
});

test("package-lock.json: every package.json dependency is locked at the root", () => {
  const pkg = JSON.parse(read("package.json"));
  const lock = JSON.parse(read("package-lock.json"));
  const rootDeps = { ...lock.packages[""].dependencies, ...lock.packages[""].devDependencies };
  assert.deepEqual(rootDeps, { ...pkg.dependencies, ...pkg.devDependencies }, "package-lock.json is out of sync with package.json");
  // npm 10 (the image's npm) refuses a lock that misses these peers of the wasm fallbacks — see Dockerfile build
  for (const name of ["node_modules/@emnapi/core", "node_modules/@emnapi/runtime"]) assert.ok(lock.packages[name], `${name} missing from package-lock.json`);
});

test("install.sh: secrets are generated only when supabase/.env does not exist, and never over existing data", () => {
  const sh = code("deploy", "install.sh");
  const gen = sh.indexOf('setenv supabase/.env JWT_SECRET');
  const guard = sh.lastIndexOf("if [ ! -f supabase/.env ]; then", gen);
  assert.ok(gen > 0 && guard > 0, "JWT_SECRET is generated inside the supabase/.env-missing branch");
  // nothing between the guard and the generation may close the branch
  assert.doesNotMatch(sh.slice(guard, gen), /^fi$/m);
  // generating secrets must not depend on the compose file being absent (the old upgrade advice deleted that file)
  const composeBranch = sh.slice(sh.indexOf("if [ ! -f supabase/docker-compose.yml ]"), guard);
  assert.doesNotMatch(composeBranch, /rand /, "no secret generation in the compose-download branch");
  assert.match(sh, /supabase\/volumes\/db\/data[\s\S]{0,400}exit 1/, "refuses when data exists without its .env");
});

test("install.sh: a re-run keeps the domain and TLS mode, and schedules the backup", () => {
  const sh = code("deploy", "install.sh");
  assert.match(sh, /TLS=""/, "no hard default that overrides the stored TLS mode");
  assert.match(sh, /TLS=\$\(getenv \.env TLS_MODE\)/);
  assert.match(sh, /DOMAIN=\$\(getenv \.env GOHR_DOMAIN\)/);
  assert.match(sh, /\/etc\/cron\.d\/gohr-backup/);
  assert.match(sh, /backup\.sh >> \/var\/log\/gohr-backup\.log/);
  // the company name is data, not SQL text
  assert.doesNotMatch(sh, /\$\{COMPANY\}/);
});

test("upgrade.sh: backup → fetch → build → migrate → start → health, without touching secrets or TLS", () => {
  const sh = code("deploy", "upgrade.sh");
  const order = ['"$DEPLOY_DIR/backup.sh"', "fetch --tags", "docker build", "dc stop app cron", '"$DEPLOY_DIR/migrate.sh"', "dc up -d", "app_healthy; then ok=1"];
  let at = -1;
  for (const step of order) {
    const next = sh.indexOf(step, at + 1);
    assert.ok(next > at, `"${step}" must come after the previous step`);
    at = next;
  }
  const written = [...sh.matchAll(/setenv \S+ (\w+)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(written)], ["GOHR_IMAGE"], "the only env value an upgrade writes is the image tag");
  assert.doesNotMatch(sh, /install\.sh"|rand |openssl/, "an upgrade never runs the installer or generates secrets");
  assert.match(sh, /ff-only/);
});

test("backup.sh: configuration is backed up, and secrets do not leave the server unencrypted", () => {
  const sh = code("deploy", "backup.sh");
  assert.match(sh, /for f in \.env supabase\/\.env backup\.env/);
  assert.match(sh, /config-\$stamp\.tgz/);
  assert.match(sh, /if \[ -z "\$PASSFILE" \] && \[ "\$f" = "\$config" \]; then[^\n]*continue/);
  assert.match(sh, /-name 'config-\*'/, "retention covers the config archives");
  assert.match(sh, /umask 077/);
  // the passphrase file itself must never be archived
  assert.doesNotMatch(sh, /tar [^\n]*PASSFILE/);
});

test("restore.sh: replaces only GO HR's part of the database, in one transaction, then migrates", () => {
  const sh = code("deploy", "restore.sh");
  assert.doesNotMatch(sh, /pg_restore[^\n]*--clean/, "pg_restore --clean of a full Supabase dump fails (rehearsal 2026-11-23)");
  const fn = sh.slice(sh.indexOf("replace_database() {"), sh.indexOf("\n}\n", sh.indexOf("replace_database() {")));
  assert.match(fn, /begin;/);
  assert.match(fn, /pg_restore -L [^\n]* \|\| exit 1/, "a failing pg_restore must end the stream before commit");
  assert.ok(fn.indexOf("|| exit 1") < fn.indexOf("commit;"));
  assert.match(fn, /ON_ERROR_STOP=1/);
  assert.match(sh, /auth schema_migrations\|storage migrations/, "Supabase's own migration tables are left alone");
  assert.ok(sh.indexOf("replace_database; then") < sh.indexOf("./migrate.sh"), "migrate.sh runs after the restore");
  assert.match(sh, /pre-restore-/, "safety dump before a real restore");
});

test("migrate.sh: seed survives an interrupted first run, database time zone is set", () => {
  const sh = code("deploy", "migrate.sh");
  assert.match(sh, /__seed_pending__/);
  assert.doesNotMatch(sh, /first_install/);
  assert.match(sh, /GOHR_DB_TZ:-Asia\/Bangkok/);
  assert.match(sh, /alter database %I set timezone/);
});

test("health endpoint: public path, no details in the response", () => {
  const route = read("app", "api", "public", "health", "route.ts");
  // proxy.ts lets /api/public through without a session — the endpoint must live there
  assert.match(read("proxy.ts"), /"\/api\/public"/);
  const bodies = [...route.matchAll(/NextResponse\.json\((\{[^}]*\})/g)].map((m) => m[1].trim());
  assert.deepEqual(bodies, ["{ ok: last.ok, db: last.ok }"], "the response carries two booleans and nothing else (no version, env or error text)");
  assert.match(route, /status: last\.ok \? 200 : 503/);
});

test("INSTALL.md: upgrade goes through upgrade.sh, no advice to delete Supabase files or re-run the installer", () => {
  const md = read("docs", "INSTALL.md");
  assert.match(md, /deploy\/upgrade\.sh/);
  assert.doesNotMatch(md, /git pull && sudo deploy\/install\.sh/);
  assert.doesNotMatch(md, /ลบ `deploy\/supabase\/docker-compose\.yml`/);
  assert.match(md, /BACKUP_PASSPHRASE_FILE/);
  assert.match(md, /api\/public\/health/);
});
