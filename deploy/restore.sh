#!/usr/bin/env bash
# Restore a GO HR backup made by deploy/backup.sh — or rehearse it without touching the live data.
#
#   sudo deploy/restore.sh --drill  /var/backups/gohr/db-20261026-0130.dump[.enc]
#       restore drill: loads the dump into a scratch database (gohr_restore_drill) next to the live one, prints row
#       counts of key tables, then drops it. The live database and the app keep running. Do this once before
#       handover and after every change to the backup settings.
#
#   sudo deploy/restore.sh --restore /var/backups/gohr/db-20261026-0130.dump[.enc] [/var/backups/gohr/files-20261026-0130.tgz[.enc]]
#       REAL restore: decrypts and checks everything first, takes a safety dump of the live database, stops the app,
#       replaces GO HR's part of the database in ONE transaction (any error → nothing changes), runs migrate.sh, then the uploaded files when given, and
#       starts the app again. Everything written after the backup is lost. Asks to type RESTORE first.
#
#   sudo deploy/restore.sh --config  /var/backups/gohr/config-20261026-0130.tgz[.enc] <empty folder>
#       unpacks the configuration archive (deploy/.env, deploy/supabase/.env, backup.env ...) into a folder for you to
#       copy back by hand. Nothing live is touched. Needed when the server is rebuilt on a new machine.
#
# Encrypted files (.enc) are decrypted with BACKUP_PASSPHRASE_FILE from deploy/backup.env.
# A SHA256SUMS-<stamp> file next to the dump is checked when present.
set -euo pipefail
shopt -s inherit_errexit
cd "$(dirname "$0")"
# shellcheck disable=SC1091
[ -f backup.env ] && . ./backup.env

MODE="${1:-}"; DUMP="${2:-}"; FILES="${3:-}"
DB_CONTAINER="${DB_CONTAINER:-supabase-db}"
umask 077
usage() { sed -n '2,20p' "$0"; exit 1; }
[ "$MODE" = "--drill" ] || [ "$MODE" = "--restore" ] || [ "$MODE" = "--config" ] || usage
[ -n "$DUMP" ] && [ -f "$DUMP" ] || { echo "ไม่พบไฟล์ $DUMP"; exit 1; }
if [ "$MODE" = "--config" ]; then
  [ -n "$FILES" ] && [ -d "$FILES" ] && [ -z "$(ls -A "$FILES")" ] || { echo "ต้องระบุโฟลเดอร์ว่างสำหรับแตกไฟล์ตั้งค่า"; exit 1; }
else
  [ -z "$FILES" ] || [ -f "$FILES" ] || { echo "ไม่พบไฟล์ $FILES"; exit 1; }
fi

TMP=$(mktemp -d)
DRILL=gohr_restore_drill
cleanup() {
  find "$TMP" -mindepth 1 -maxdepth 1 -type f -delete; rmdir "$TMP"
  [ "$MODE" = "--drill" ] && docker exec -i "$DB_CONTAINER" psql -U supabase_admin -d postgres -tAc "drop database if exists $DRILL" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# checksum (when the SHA256SUMS file of the same backup is next to it)
stamp=$(basename "$DUMP" | sed -E 's/^(db|config)-([0-9]{8}-[0-9]{4}).*/\2/')
sums="$(dirname "$DUMP")/SHA256SUMS-$stamp"
if [ -f "$sums" ]; then
  ( cd "$(dirname "$DUMP")" && grep -F "$(basename "$DUMP")" "SHA256SUMS-$stamp" | sha256sum -c - ) || { echo "checksum ไม่ตรง — ไฟล์เสียหรือถูกแก้ไข"; exit 1; }
  if [ -n "$FILES" ] && [ "$MODE" != "--config" ]; then ( cd "$(dirname "$FILES")" && grep -F "$(basename "$FILES")" "SHA256SUMS-$stamp" | sha256sum -c - ) || { echo "checksum ไฟล์แนบไม่ตรง"; exit 1; }; fi
else
  echo "(ไม่พบ SHA256SUMS-$stamp — ข้ามการตรวจ checksum)"
fi

plain() { # file → path of the decrypted / plain file
  case "$1" in
    *.enc)
      [ -r "${BACKUP_PASSPHRASE_FILE:-}" ] || { echo "ไฟล์เข้ารหัส: ตั้ง BACKUP_PASSPHRASE_FILE ใน deploy/backup.env" >&2; exit 1; }
      local out
      out="$TMP/$(basename "${1%.enc}")"
      openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass "file:$BACKUP_PASSPHRASE_FILE" -in "$1" -out "$out" || { echo "ถอดรหัส $1 ไม่ได้ (รหัสผ่านผิด?)" >&2; return 1; }
      echo "$out" ;;
    *) echo "$1" ;;
  esac
}
if [ "$MODE" = "--config" ]; then
  CFG=$(plain "$DUMP") || exit 1
  tar -xzf "$CFG" -C "$FILES"
  chmod -R go-rwx "$FILES"
  echo "▶ แตกไฟล์ตั้งค่าไว้ที่ $FILES (มีความลับของระบบ — คัดลอกกลับไปที่ deploy/ แล้วลบโฟลเดอร์นี้)"
  ( cd "$FILES" && find . -type f | sort )
  exit 0
fi

# decrypt and check every file BEFORE anything live is touched
DB_FILE=$(plain "$DUMP") || exit 1
docker exec -i "$DB_CONTAINER" pg_restore --list < "$DB_FILE" > /dev/null || { echo "ไฟล์ dump อ่านไม่ได้"; exit 1; }
FILES_PLAIN=""
if [ -n "$FILES" ]; then
  FILES_PLAIN=$(plain "$FILES") || exit 1
  tar -tzf "$FILES_PLAIN" > /dev/null || { echo "ไฟล์แนบ (tgz) อ่านไม่ได้"; exit 1; }
fi

psql_q() { docker exec -i "$DB_CONTAINER" psql -U supabase_admin -d "$1" -tAc "$2"; }
counts() {
  for t in employees employee_private payroll_periods payroll_entries attendance_days requests leave_quotas; do
    printf '  %-18s %s\n' "$t" "$(psql_q "$1" "select count(*) from public.$t" 2>/dev/null || echo '(ไม่มีตาราง)')"
  done
}

# ---------------------------------------------------------------------------------------------------------------
# Real restore. The dump holds the whole Supabase database, but only part of it is GO HR's to replace:
#   - schemas public, app, gohr_meta       → dropped and re-created from the dump (tables, data, functions, policies)
#   - the storage policies GO HR creates    → re-created from the dump (they depend on functions in schema app)
#   - rows of auth.* and storage.*          → replaced (users, sessions, file records); their table definitions stay
#                                             as the running Supabase version made them, and so do its own migration
#                                             tables (auth.schema_migrations, storage.migrations)
# Everything else (extensions, event triggers, realtime, vault, graphql) belongs to Supabase and is left alone.
# "pg_restore --clean" of the full dump does not work on a Supabase database: it tries to drop and re-create those
# Supabase-managed objects and stops on the first one (found in the restore rehearsal of 2026-11-23).
# ---------------------------------------------------------------------------------------------------------------

# stdin: "pg_restore --list" output → stdout: the entries GO HR restores, in their original (dependency) order
toc_filter() {
  awk '
    /^;/ { next }
    {
      s = $0; sub(/^[0-9]+; [0-9]+ [0-9]+ /, "", s)
      keep = 0
      if (s ~ /^SCHEMA - (app|gohr_meta) /) keep = 1
      else if (s ~ /^(ACL|COMMENT) - SCHEMA (public|app|gohr_meta) /) keep = 1
      else if (s ~ /^[A-Z][A-Z ]* (public|app|gohr_meta) /) keep = 1
      else if (s ~ /^POLICY storage /) keep = 1
      else if (s ~ /^(TABLE DATA|SEQUENCE SET) (auth|storage) / && s !~ /^TABLE DATA (auth schema_migrations|storage migrations) /) keep = 1
      if (keep) print $0
    }'
}

# stdin: filtered list → stdout: "schema"."table" of every auth/storage table whose rows will be replaced
toc_truncate_targets() {
  awk '{ s = $0; sub(/^[0-9]+; [0-9]+ [0-9]+ /, "", s); if (s ~ /^TABLE DATA (auth|storage) /) { split(s, a, " "); printf "\"%s\".\"%s\"\n", a[3], a[4] } }'
}

# Replace GO HR's part of the live database with the dump, in one transaction. Returns non-zero (and changes
# nothing) on any error: the stream only ends with "commit" when pg_restore produced the whole script.
replace_database() {
  local toc_all="$TMP/toc.all" toc_use="$TMP/toc.use" targets
  docker exec -i "$DB_CONTAINER" pg_restore --list < "$DB_FILE" > "$toc_all" || return 1
  toc_filter < "$toc_all" > "$toc_use"
  grep -q ' TABLE public employees ' "$toc_use" || { echo "ข้อมูลสำรองไม่มีตาราง public.employees — ไม่ใช่ข้อมูลสำรองของ GO HR" >&2; return 1; }
  targets=$(toc_truncate_targets < "$toc_use" | paste -sd, -)
  docker cp "$toc_use" "$DB_CONTAINER:/tmp/gohr-restore.toc" >/dev/null || return 1
  {
    cat <<SQL
begin;
set local lock_timeout = '60s';
do \$\$ begin
  if exists (select 1 from pg_extension e join pg_namespace n on n.oid = e.extnamespace where n.nspname in ('public', 'app', 'gohr_meta')) then
    raise exception 'an extension is installed in schema public/app/gohr_meta - restore would drop it; move it to schema extensions first';
  end if;
end \$\$;
do \$\$ declare r record; begin
  for r in select policyname, tablename from pg_policies where schemaname = 'storage' loop
    execute format('drop policy %I on storage.%I', r.policyname, r.tablename);
  end loop;
end \$\$;
drop schema if exists app cascade;
drop schema if exists gohr_meta cascade;
drop schema public cascade;
create schema public authorization pg_database_owner;
comment on schema public is 'standard public schema';
grant usage on schema public to public; -- the default of a stock database; role-specific grants come from the dump
${targets:+truncate table $targets cascade;}
set session_replication_role = replica;
SQL
    docker exec -i "$DB_CONTAINER" pg_restore -L /tmp/gohr-restore.toc --no-owner -f - < "$DB_FILE" || exit 1
    cat <<SQL
set session_replication_role = origin;
do \$\$ begin if to_regprocedure('app.sync_grants()') is not null then perform app.sync_grants(); end if; end \$\$;
commit;
SQL
  } | docker exec -i "$DB_CONTAINER" psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -q -o /dev/null
}

if [ "$MODE" = "--drill" ]; then
  psql_q postgres "drop database if exists $DRILL" >/dev/null
  psql_q postgres "create database $DRILL" >/dev/null
  echo "▶ กู้คืนลงฐานข้อมูลทดสอบ $DRILL (ฐานข้อมูลจริงไม่ถูกแตะ)"
  # Supabase-managed roles / extensions may print errors in a fresh database; the table counts are what matter
  errs=$(docker exec -i "$DB_CONTAINER" pg_restore -U supabase_admin -d "$DRILL" --no-owner --no-privileges < "$DB_FILE" 2>&1 | grep -c "error:" || true)
  echo "▶ จำนวนแถวในข้อมูลสำรอง (pg_restore แจ้ง error $errs รายการ — ส่วนใหญ่เป็น role/extension ของ Supabase)"
  counts "$DRILL"
  echo "▶ เทียบกับฐานข้อมูลจริงตอนนี้"
  counts postgres
  psql_q postgres "drop database $DRILL" >/dev/null
  echo "▶ ซ้อมกู้คืนเสร็จ $(date -Iseconds) — บันทึกผลไว้ในรายงานส่งมอบ"
  exit 0
fi

echo "คำเตือน: จะแทนที่ฐานข้อมูลจริง${FILES:+และไฟล์แนบ}ด้วยข้อมูลสำรอง $stamp — ข้อมูลที่บันทึกหลังเวลานั้นจะหายทั้งหมด"
read -r -p "พิมพ์ RESTORE เพื่อยืนยัน: " ok
[ "$ok" = "RESTORE" ] || { echo "ยกเลิก"; exit 1; }

SAFETY="${BACKUP_DIR:-/var/backups/gohr}/pre-restore-$(date +%Y%m%d-%H%M%S).dump"
echo "▶ สำรองฐานข้อมูลปัจจุบันไว้ก่อน → $SAFETY"
mkdir -p "$(dirname "$SAFETY")"
docker exec "$DB_CONTAINER" pg_dump -U supabase_admin -d postgres -Fc --no-owner > "$SAFETY"
docker exec -i "$DB_CONTAINER" pg_restore --list < "$SAFETY" > /dev/null || { echo "สำรองก่อนกู้คืนไม่สำเร็จ — หยุด ไม่มีอะไรถูกเปลี่ยน"; exit 1; }

# The app is stopped while the database is replaced. On a rebuilt server where the app is not installed yet
# (or in a rehearsal against a bare database) set GOHR_NO_APP=1 to skip that.
app_ctl() { # stop|start
  if [ "${GOHR_NO_APP:-0}" = 1 ]; then return 0; fi
  docker compose "$1" app cron
}
echo "▶ หยุดแอป"
app_ctl stop
echo "▶ กู้คืนฐานข้อมูล (ทั้งหมดในธุรกรรมเดียว)"
if ! replace_database; then
  echo "กู้คืนไม่สำเร็จ — ฐานข้อมูลยังเป็นข้อมูลเดิม (ยกเลิกทั้งธุรกรรม) เปิดแอปกลับตามเดิม"
  app_ctl start
  exit 1
fi
if [ -n "$FILES_PLAIN" ]; then
  echo "▶ กู้คืนไฟล์แนบ"
  tar -xzf "$FILES_PLAIN" -C supabase/volumes
fi
psql_q postgres "notify pgrst, 'reload schema'" >/dev/null || true
# a backup from an older GO HR version: bring the schema up to the code installed now (also re-applies the
# privileges and the database time zone). The app stays stopped when this fails — old schema + new code is worse.
echo "▶ ปรับฐานข้อมูลให้ตรงกับเวอร์ชันที่ติดตั้ง"
./migrate.sh || { echo "กู้คืนข้อมูลแล้ว แต่ปรับฐานข้อมูล (migrate.sh) ไม่สำเร็จ — แอปยังหยุดอยู่ แก้แล้วรัน deploy/migrate.sh และ docker compose start app cron"; exit 1; }
echo "▶ เปิดแอป"
app_ctl start
counts postgres
echo "▶ กู้คืนเสร็จ $(date -Iseconds) — เข้าระบบตรวจข้อมูลล่าสุดก่อนแจ้งผู้ใช้ (ข้อมูลก่อนกู้คืนอยู่ที่ $SAFETY)"
