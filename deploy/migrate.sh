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
first_install=0
[ -z "$applied" ] && first_install=1

for f in supabase/migrations/*.sql; do
  name=$(basename "$f")
  if grep -qx "$name" <<<"$applied"; then continue; fi
  echo "→ $name"
  { echo "begin;"; cat "$f"; echo "insert into gohr_meta.migrations(name) values ('$name');"; echo "commit;"; } | "${PSQL[@]}" >/dev/null
done

if [ "$first_install" = 1 ]; then
  echo "→ seed.sql (base master data)"
  "${PSQL[@]}" < supabase/seed.sql >/dev/null
fi

# objects created by supabase_admin: make sure the API roles can use them (RLS still applies)
"${PSQL[@]}" <<'SQL' >/dev/null
grant usage on schema public, app to anon, authenticated, service_role;
grant all on all tables in schema public to authenticated, service_role;
grant all on all sequences in schema public to authenticated, service_role;
grant execute on all functions in schema public, app to authenticated, service_role;
-- the directory view bypasses RLS on purpose (masked columns) — never expose it to anonymous visitors
revoke all on public.v_directory from anon;
notify pgrst, 'reload schema';
SQL
echo "✓ database is up to date"
