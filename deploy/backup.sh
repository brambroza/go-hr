#!/usr/bin/env bash
# Nightly backup of the GO HR database + uploaded files + configuration, checked, optionally encrypted and copied
# off the server. deploy/install.sh schedules it (/etc/cron.d/gohr-backup, 01:30 every night):
#   30 1 * * * root /opt/gohr/deploy/backup.sh >> /var/log/gohr-backup.log 2>&1
#
# One backup = files sharing a time stamp in BACKUP_DIR:
#   db-<stamp>.dump       the whole database (pg_dump custom format)
#   files-<stamp>.tgz     uploaded files (documents, photos, signatures)
#   config-<stamp>.tgz    deploy/.env, deploy/supabase/.env, deploy/backup.env, versions — the SECRETS of this install.
#                         Needed to rebuild the server as it was (same keys, licence, domain, TLS mode).
#   SHA256SUMS-<stamp>    checksums, verified by deploy/restore.sh
# The passphrase file is never part of a backup: keep a copy of it somewhere else (see BACKUP_PASSPHRASE_FILE).
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
#                           Without a passphrase config-<stamp>.tgz stays on this server only (it holds secrets).
#   BACKUP_NOTIFY_URL       URL that receives a POST with a short text when the backup FAILS (e.g. a LINE Notify proxy)
#   DB_CONTAINER            name of the Postgres container (default supabase-db)
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
DB_CONTAINER="${DB_CONTAINER:-supabase-db}"
umask 077 # every file written here holds personal data or secrets
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
docker exec "$DB_CONTAINER" pg_dump -U supabase_admin -d postgres -Fc --no-owner > "$db"
# a dump that pg_restore cannot list is broken — stop here instead of keeping it as "the last good backup"
docker exec -i "$DB_CONTAINER" pg_restore --list < "$db" > /dev/null || fail "dump $db is not readable"
files=()
[ -s "$db" ] || fail "empty dump"
files+=("$db")
if [ -d supabase/volumes/storage ]; then
  tar -czf "$DEST/files-$stamp.tgz" -C supabase/volumes storage
  files+=("$DEST/files-$stamp.tgz")
fi
# configuration of this install (secrets). Only the files that exist; paths are relative to deploy/.
config=""
cfg=()
for f in .env supabase/.env backup.env versions.env supabase/.gohr-supabase-ref; do
  if [ -f "$f" ]; then cfg+=("$f"); fi
done
if [ "${#cfg[@]}" -gt 0 ]; then
  config="$DEST/config-$stamp.tgz"
  tar -czf "$config" "${cfg[@]}"
  files+=("$config")
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
  if [ -n "$config" ]; then config="$config.enc"; fi
fi

( cd "$DEST" && sha256sum "${files[@]##*/}" > "SHA256SUMS-$stamp" )
files+=("$DEST/SHA256SUMS-$stamp")
complete=1 # the local backup is whole; a failing off-site copy below must not delete it

config_note=""
if [ -n "$OFFSITE" ]; then
  # secrets never leave the server unencrypted: without a passphrase the config archive stays local
  send=()
  for f in "${files[@]}"; do
    if [ -z "$PASSFILE" ] && [ "$f" = "$config" ]; then config_note=" [config-$stamp.tgz ไม่ถูกส่งออกนอกเครื่องเพราะยังไม่ได้ตั้ง BACKUP_PASSPHRASE_FILE]"; continue; fi
    send+=("$f")
  done
  case "$OFFSITE" in
    rclone:*) command -v rclone >/dev/null || fail "rclone not installed"; for f in "${send[@]}"; do rclone copy "$f" "${OFFSITE#rclone:}" ; done ;;
    *@*:*)    rsync -a "${send[@]}" "$OFFSITE/" ;;
    /*)       mkdir -p "$OFFSITE" && cp "${send[@]}" "$OFFSITE/" ;;
    *)        fail "BACKUP_OFFSITE not understood: $OFFSITE" ;;
  esac
  offsite_note=" + $OFFSITE"
else
  offsite_note=" (ยังไม่ได้ตั้ง BACKUP_OFFSITE — สำเนาอยู่บนเครื่องเดียวกันเท่านั้น)"
fi

find "$DEST" -maxdepth 1 -type f \( -name 'db-*' -o -name 'files-*' -o -name 'config-*' -o -name 'SHA256SUMS-*' \) -mtime +"$KEEP_DAYS" -delete
printf '{"at":"%s","stamp":"%s","offsite":%s,"encrypted":%s}\n' "$(date -Iseconds)" "$stamp" "$([ -n "$OFFSITE" ] && echo true || echo false)" "$([ -n "$PASSFILE" ] && echo true || echo false)" > "$DEST/last-ok.json"
echo "$(date) backup ok → $DEST ($stamp)$offsite_note$config_note"
