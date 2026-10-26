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
#       replaces the database in ONE transaction (any error → nothing changes), then the uploaded files when given, and
#       starts the app again. Everything written after the backup is lost. Asks to type RESTORE first.
#
# Encrypted files (.enc) are decrypted with BACKUP_PASSPHRASE_FILE from deploy/backup.env.
# A SHA256SUMS-<stamp> file next to the dump is checked when present.
set -euo pipefail
shopt -s inherit_errexit
cd "$(dirname "$0")"
# shellcheck disable=SC1091
[ -f backup.env ] && . ./backup.env

MODE="${1:-}"; DUMP="${2:-}"; FILES="${3:-}"
usage() { sed -n '2,14p' "$0"; exit 1; }
[ "$MODE" = "--drill" ] || [ "$MODE" = "--restore" ] || usage
[ -n "$DUMP" ] && [ -f "$DUMP" ] || { echo "ไม่พบไฟล์ $DUMP"; exit 1; }
[ -z "$FILES" ] || [ -f "$FILES" ] || { echo "ไม่พบไฟล์ $FILES"; exit 1; }

TMP=$(mktemp -d)
DRILL=gohr_restore_drill
cleanup() {
  find "$TMP" -mindepth 1 -maxdepth 1 -type f -delete; rmdir "$TMP"
  [ "$MODE" = "--drill" ] && docker exec -i supabase-db psql -U supabase_admin -d postgres -tAc "drop database if exists $DRILL" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# checksum (when the SHA256SUMS file of the same backup is next to it)
stamp=$(basename "$DUMP" | sed -E 's/^db-([0-9]{8}-[0-9]{4}).*/\1/')
sums="$(dirname "$DUMP")/SHA256SUMS-$stamp"
if [ -f "$sums" ]; then
  ( cd "$(dirname "$DUMP")" && grep -F "$(basename "$DUMP")" "SHA256SUMS-$stamp" | sha256sum -c - ) || { echo "checksum ไม่ตรง — ไฟล์เสียหรือถูกแก้ไข"; exit 1; }
  if [ -n "$FILES" ]; then ( cd "$(dirname "$FILES")" && grep -F "$(basename "$FILES")" "SHA256SUMS-$stamp" | sha256sum -c - ) || { echo "checksum ไฟล์แนบไม่ตรง"; exit 1; }; fi
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
# decrypt and check every file BEFORE anything live is touched
DB_FILE=$(plain "$DUMP") || exit 1
docker exec -i supabase-db pg_restore --list < "$DB_FILE" > /dev/null || { echo "ไฟล์ dump อ่านไม่ได้"; exit 1; }
FILES_PLAIN=""
if [ -n "$FILES" ]; then
  FILES_PLAIN=$(plain "$FILES") || exit 1
  tar -tzf "$FILES_PLAIN" > /dev/null || { echo "ไฟล์แนบ (tgz) อ่านไม่ได้"; exit 1; }
fi

psql_q() { docker exec -i supabase-db psql -U supabase_admin -d "$1" -tAc "$2"; }
counts() {
  for t in employees employee_private payroll_periods payroll_entries attendance_days requests leave_quotas; do
    printf '  %-18s %s\n' "$t" "$(psql_q "$1" "select count(*) from public.$t" 2>/dev/null || echo '(ไม่มีตาราง)')"
  done
}

if [ "$MODE" = "--drill" ]; then
  psql_q postgres "drop database if exists $DRILL" >/dev/null
  psql_q postgres "create database $DRILL" >/dev/null
  echo "▶ กู้คืนลงฐานข้อมูลทดสอบ $DRILL (ฐานข้อมูลจริงไม่ถูกแตะ)"
  # Supabase-managed roles / extensions may print errors in a fresh database; the table counts are what matter
  errs=$(docker exec -i supabase-db pg_restore -U supabase_admin -d "$DRILL" --no-owner --no-privileges < "$DB_FILE" 2>&1 | grep -c "error:" || true)
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
docker exec supabase-db pg_dump -U supabase_admin -d postgres -Fc --no-owner > "$SAFETY"
docker exec -i supabase-db pg_restore --list < "$SAFETY" > /dev/null || { echo "สำรองก่อนกู้คืนไม่สำเร็จ — หยุด ไม่มีอะไรถูกเปลี่ยน"; exit 1; }

echo "▶ หยุดแอป"
docker compose stop app cron
echo "▶ กู้คืนฐานข้อมูล (ทั้งหมดในธุรกรรมเดียว)"
if ! docker exec -i supabase-db pg_restore -U supabase_admin -d postgres --clean --if-exists --no-owner --single-transaction --exit-on-error < "$DB_FILE"; then
  echo "กู้คืนไม่สำเร็จ — ฐานข้อมูลยังเป็นข้อมูลเดิม (ยกเลิกทั้งธุรกรรม) เปิดแอปกลับตามเดิม"
  docker compose start app cron
  exit 1
fi
if [ -n "$FILES_PLAIN" ]; then
  echo "▶ กู้คืนไฟล์แนบ"
  tar -xzf "$FILES_PLAIN" -C supabase/volumes
fi
psql_q postgres "notify pgrst, 'reload schema'" >/dev/null || true
echo "▶ เปิดแอป"
docker compose start app cron
counts postgres
echo "▶ กู้คืนเสร็จ $(date -Iseconds) — เข้าระบบตรวจข้อมูลล่าสุดก่อนแจ้งผู้ใช้ (ข้อมูลก่อนกู้คืนอยู่ที่ $SAFETY)"
