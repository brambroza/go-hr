#!/usr/bin/env bash
# Nightly backup of the GO HR database + uploaded files, checked, optionally encrypted and copied off the server.
# Add to root's crontab:
#   30 1 * * * /opt/gohr/deploy/backup.sh >> /var/log/gohr-backup.log 2>&1
#
# Settings: deploy/backup.env (copy deploy/backup.env.example). All optional:
#   BACKUP_DIR              local folder (default /var/backups/gohr)
#   KEEP_DAYS               local retention in days (default 30)
#   BACKUP_OFFSITE          where to copy each backup — a copy on the same disk is not a backup:
#                             rclone:<remote>:<path>   any rclone remote (S3, Google Drive, OneDrive, Wasabi, B2 ...)
#                             <user>@<host>:<path>     rsync over SSH (key-based login)
#                             /mnt/<path>              a mounted NAS / USB disk
#   BACKUP_PASSPHRASE_FILE  file holding a passphrase → files are encrypted (AES-256, openssl) before they leave the
#                           server. Keep a copy of the passphrase somewhere else: without it the backup is useless.
#   BACKUP_NOTIFY_URL       URL that receives a POST with a short text when the backup FAILS (e.g. a LINE Notify proxy)
# Retention of the off-site copies is not managed here — set a lifecycle rule / retention on the target (S3, NAS ...).
# Restore / restore drill: deploy/restore.sh
set -euo pipefail
cd "$(dirname "$0")"
# shellcheck disable=SC1091
[ -f backup.env ] && . ./backup.env

DEST="${BACKUP_DIR:-/var/backups/gohr}"
KEEP_DAYS="${KEEP_DAYS:-30}"
OFFSITE="${BACKUP_OFFSITE:-}"
PASSFILE="${BACKUP_PASSPHRASE_FILE:-}"
stamp=$(date +%Y%m%d-%H%M)
complete=0

fail() {
  echo "$(date) backup FAILED: $*" >&2
  # never leave a half-written file that a restore could pick up later
  [ "$complete" = 0 ] && find "${DEST:-/nonexistent}" -maxdepth 1 -type f -name "*-$stamp*" -delete 2>/dev/null || true
  if [ -n "${BACKUP_NOTIFY_URL:-}" ]; then curl -fsS -m 20 -X POST --data-urlencode "message=GO HR backup ล้มเหลว ($(hostname)): $*" "$BACKUP_NOTIFY_URL" >/dev/null || true; fi
  exit 1
}
trap 'fail "line $LINENO"' ERR

mkdir -p "$DEST"
chmod 700 "$DEST"
db="$DEST/db-$stamp.dump"
docker exec supabase-db pg_dump -U supabase_admin -d postgres -Fc --no-owner > "$db"
# a dump that pg_restore cannot list is broken — stop here instead of keeping it as "the last good backup"
docker exec -i supabase-db pg_restore --list < "$db" > /dev/null || fail "dump $db is not readable"
files=()
[ -s "$db" ] || fail "empty dump"
files+=("$db")
if [ -d supabase/volumes/storage ]; then
  tar -czf "$DEST/files-$stamp.tgz" -C supabase/volumes storage
  files+=("$DEST/files-$stamp.tgz")
fi

if [ -n "$PASSFILE" ]; then
  [ -r "$PASSFILE" ] || fail "passphrase file $PASSFILE not readable"
  enc=()
  for f in "${files[@]}"; do
    openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass "file:$PASSFILE" -in "$f" -out "$f.enc"
    rm -f "$f"
    enc+=("$f.enc")
  done
  files=("${enc[@]}")
fi

( cd "$DEST" && sha256sum "${files[@]##*/}" > "SHA256SUMS-$stamp" )
files+=("$DEST/SHA256SUMS-$stamp")
complete=1 # the local backup is whole; a failing off-site copy below must not delete it

if [ -n "$OFFSITE" ]; then
  case "$OFFSITE" in
    rclone:*) command -v rclone >/dev/null || fail "rclone not installed"; for f in "${files[@]}"; do rclone copy "$f" "${OFFSITE#rclone:}" ; done ;;
    *@*:*)    rsync -a "${files[@]}" "$OFFSITE/" ;;
    /*)       mkdir -p "$OFFSITE" && cp "${files[@]}" "$OFFSITE/" ;;
    *)        fail "BACKUP_OFFSITE not understood: $OFFSITE" ;;
  esac
  offsite_note=" + $OFFSITE"
else
  offsite_note=" (ยังไม่ได้ตั้ง BACKUP_OFFSITE — สำเนาอยู่บนเครื่องเดียวกันเท่านั้น)"
fi

find "$DEST" -maxdepth 1 -type f \( -name 'db-*' -o -name 'files-*' -o -name 'SHA256SUMS-*' \) -mtime +"$KEEP_DAYS" -delete
printf '{"at":"%s","stamp":"%s","offsite":%s,"encrypted":%s}\n' "$(date -Iseconds)" "$stamp" "$([ -n "$OFFSITE" ] && echo true || echo false)" "$([ -n "$PASSFILE" ] && echo true || echo false)" > "$DEST/last-ok.json"
echo "$(date) backup ok → $DEST ($stamp)$offsite_note"
