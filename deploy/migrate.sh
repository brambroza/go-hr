#!/usr/bin/env bash
# Apply GO HR database migrations to the Supabase Postgres container (safe to re-run; used for upgrades too).
#   deploy/migrate.sh            → apply new migrations (and seed.sql on first install)
set -euo pipefail
cd "$(dirname "$0")/.."
DB_CONTAINER="${DB_CONTAINER:-supabase-db}"
if [ -n "${DB_URL:-}" ]; then   # alternative: any reachable Postgres (e.g. DB_URL=postgres://supabase_admin:pw@host:5432/postgres)
  PSQL=(psql "$DB_URL" -v ON_ERROR_STOP=1 -q)
else
  PSQL=(docker exec -i "$DB_CONTAINER" psql -v ON_ERROR_STOP=1 -q -U supabase_admin -d postgres)
fi

"${PSQL[@]}" <<'SQL'
create schema if not exists gohr_meta;
create table if not exists gohr_meta.migrations (name text primary key, applied_at timestamptz not null default now());
SQL

applied=$("${PSQL[@]}" -tAc "select name from gohr_meta.migrations")
# First install: remember that seed.sql is still owed. The marker survives a run that stops half-way, so the re-run
# still seeds (before, a failed first run left a database with tables and no master data).
SEED_MARK='__seed_pending__'
if [ -z "$applied" ]; then
  "${PSQL[@]}" -c "insert into gohr_meta.migrations(name) values ('$SEED_MARK') on conflict do nothing" >/dev/null
  applied="$SEED_MARK"
fi

for f in supabase/migrations/*.sql; do
  name=$(basename "$f")
  if grep -qx "$name" <<<"$applied"; then continue; fi
  echo "→ $name"
  { echo "begin;"; cat "$f"; echo "insert into gohr_meta.migrations(name) values ('$name');"; echo "commit;"; } | "${PSQL[@]}" >/dev/null
done

if grep -qx "$SEED_MARK" <<<"$applied"; then
  echo "→ seed.sql (base master data)"
  "${PSQL[@]}" < supabase/seed.sql >/dev/null
  "${PSQL[@]}" -c "delete from gohr_meta.migrations where name = '$SEED_MARK'" >/dev/null
fi

# Privileges: app.sync_grants() (supabase/migrations/20261123010000_grants_lockdown.sql and later) gives the API roles
# their baseline access and then re-applies every lockdown (secret columns, service-only functions, nothing for anon).
# Do NOT add "grant ... on all tables / all functions" here: a blanket grant after the migrations silently puts back
# what they revoked. A new secret column or service-only function goes into app.sync_grants().
"${PSQL[@]}" <<'SQL' >/dev/null
select app.sync_grants();
notify pgrst, 'reload schema';
SQL

# Time zone: the SQL uses current_date / now()::date (leave balances, probation, payroll cut-off, reminders). With the
# server default (UTC) "today" is yesterday until 07:00 Thai time. The setting is per database and only applies to
# new connections, so the API (PostgREST keeps a connection pool) is restarted when it changes.
DB_TZ="${GOHR_DB_TZ:-Asia/Bangkok}"
case "$DB_TZ" in *[!A-Za-z0-9_/+-]*) echo "GOHR_DB_TZ ไม่ถูกต้อง: $DB_TZ" >&2; exit 1 ;; esac
tz_before=$("${PSQL[@]}" -tAc "select coalesce((select split_part(c, '=', 2) from pg_db_role_setting s join pg_database d on d.oid = s.setdatabase, unnest(s.setconfig) c where d.datname = current_database() and s.setrole = 0 and c ilike 'timezone=%' limit 1), '')")
if [ "$tz_before" != "$DB_TZ" ]; then
  "${PSQL[@]}" -c "do \$\$ begin execute format('alter database %I set timezone to %L', current_database(), '$DB_TZ'); end \$\$" >/dev/null
  echo "→ database time zone: ${tz_before:-server default} → $DB_TZ"
  if [ -z "${DB_URL:-}" ]; then
    # self-hosted Supabase: reconnect the services that hold pooled connections
    for c in supabase-rest supabase-pooler; do
      if docker ps --format '{{.Names}}' | grep -qx "$c"; then docker restart "$c" >/dev/null; fi
    done
  else
    echo "  (ฐานข้อมูลภายนอก: การเชื่อมต่อเดิมยังใช้เขตเวลาเก่าจนกว่าจะเชื่อมต่อใหม่ — restart API / connection pooler)"
  fi
fi
echo "✓ database is up to date"
