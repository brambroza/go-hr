#!/usr/bin/env bash
# Nightly backup of the GO HR database + uploaded files. Add to root's crontab:
#   30 1 * * * /opt/gohr/deploy/backup.sh >> /var/log/gohr-backup.log 2>&1
set -euo pipefail
cd "$(dirname "$0")"
DEST="${BACKUP_DIR:-/var/backups/gohr}"
KEEP_DAYS="${KEEP_DAYS:-30}"
mkdir -p "$DEST"
stamp=$(date +%Y%m%d-%H%M)
docker exec supabase-db pg_dump -U supabase_admin -d postgres -Fc --no-owner > "$DEST/db-$stamp.dump"
if [ -d supabase/volumes/storage ]; then tar -czf "$DEST/files-$stamp.tgz" -C supabase/volumes storage; fi
find "$DEST" -type f -mtime +"$KEEP_DAYS" -delete
echo "$(date) backup ok → $DEST/db-$stamp.dump"
