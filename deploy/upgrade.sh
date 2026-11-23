#!/usr/bin/env bash
# =====================================================================
# GO HR — upgrade an installed server to a newer version.
#
#   cd /opt/gohr && sudo deploy/upgrade.sh                 # newest commit of the current branch
#   sudo deploy/upgrade.sh --ref v1.3.0                    # a tag, branch or commit
#   sudo deploy/upgrade.sh --image gohr/app:1.3.0          # prebuilt image (docker load / registry), no build
#
# What it does, in this order — each step must succeed before the next one starts:
#   1. checks that this is an installed server (deploy/.env and deploy/supabase/.env exist)
#   2. takes a full backup (deploy/backup.sh)                    — skip only with --skip-backup
#   3. fetches the new code (git, fast-forward only; refuses a modified working tree)
#   4. builds the new app image while the old version keeps serving
#   5. stops the app, applies the database migrations (deploy/migrate.sh)
#   6. starts the new version and waits for /api/public/health
#
# It never regenerates secrets and never changes the domain or the TLS mode chosen at install: deploy/.env and
# deploy/supabase/.env are only read, except for GOHR_IMAGE (the image tag of the new version).
# Supabase itself is not upgraded here (see --upgrade-supabase in deploy/install.sh).
#
# If the new version does not come up, the script prints how to go back: the previous commit, the previous image
# (still on the machine) and the backup taken in step 2. Migrations only go forward — going back to the old code
# after a migration has run means restoring that backup (deploy/restore.sh --restore).
# =====================================================================
set -euo pipefail
cd "$(dirname "$0")"
DEPLOY_DIR=$(pwd)
ROOT=$(cd .. && pwd)

REF=""; IMAGE=""; SKIP_BACKUP=0; STAGE="start"
while [ $# -gt 0 ]; do
  case "$1" in
    --ref) REF="$2"; shift 2 ;;
    --image) IMAGE="$2"; shift 2 ;;
    --skip-backup) SKIP_BACKUP=1; shift ;;
    --continue) STAGE="continue"; shift ;; # internal: second half, run from the freshly fetched copy of this script
    -h | --help) sed -n '2,24p' "$0"; exit 0 ;;
    *) echo "unknown option $1"; exit 1 ;;
  esac
done
case "$REF" in *[!A-Za-z0-9._/-]*) echo "--ref ไม่ถูกต้อง"; exit 1 ;; esac
case "$IMAGE" in *[!A-Za-z0-9._/:@-]*) echo "--image ไม่ถูกต้อง"; exit 1 ;; esac

# print a step heading
step() { printf '\n\033[1;32m▶ %s\033[0m\n' "$*"; }
# value of KEY in an env file ('' when missing)
getenv() { if [ -f "$1" ]; then sed -n "s/^$2=//p" "$1" | head -1; fi; }
# replace or append KEY=value in an env file
setenv() {
  local f=$1 k=$2 v=$3
  if grep -q "^$k=" "$f"; then sed -i "s|^$k=.*|$k=$(printf '%s' "$v" | sed 's/[&|]/\\&/g')|" "$f"; else echo "$k=$v" >> "$f"; fi
}
# docker compose for the GO HR stack
dc() { docker compose --env-file .env -f docker-compose.yml "$@"; }
# version field of package.json
app_version() { sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$ROOT/package.json" | head -1; }
# true when the app answers its health endpoint from inside its container
app_healthy() { dc exec -T app wget -qO- http://127.0.0.1:3000/api/public/health >/dev/null 2>&1; }

# ---------------------------------------------------------------- 1. preflight
if [ ! -f .env ] || [ ! -f supabase/.env ]; then
  echo "ไม่พบ deploy/.env หรือ deploy/supabase/.env — เครื่องนี้ยังไม่ได้ติดตั้ง GO HR (ใช้ deploy/install.sh)" >&2
  exit 1
fi
for c in docker git; do command -v "$c" >/dev/null || { echo "ไม่พบคำสั่ง $c"; exit 1; }; done
docker ps --format '{{.Names}}' | grep -qx "supabase-db" || { echo "ฐานข้อมูล (supabase-db) ไม่ได้ทำงานอยู่ — เริ่มด้วย: (cd $DEPLOY_DIR/supabase && docker compose up -d)" >&2; exit 1; }

STATE="$DEPLOY_DIR/.upgrade-state" # previous commit / image, for the "how to go back" message (no secrets)

if [ "$STAGE" = "start" ]; then
  PREV_COMMIT=$(git -C "$ROOT" rev-parse HEAD)
  PREV_IMAGE=$(getenv .env GOHR_IMAGE)
  PREV_VERSION=$(app_version)
  if [ -n "$(git -C "$ROOT" status --porcelain --untracked-files=no)" ]; then
    echo "มีไฟล์ในระบบที่ถูกแก้ไขบนเครื่องนี้ (git status) — หยุด เพื่อไม่ให้การอัปเกรดเขียนทับ:" >&2
    git -C "$ROOT" status --short --untracked-files=no >&2
    exit 1
  fi

  # -------------------------------------------------------------- 2. backup first
  BACKUP_STAMP="(ข้าม)"
  if [ "$SKIP_BACKUP" = 0 ]; then
    step "สำรองข้อมูลก่อนอัปเกรด"
    "$DEPLOY_DIR/backup.sh"
    BACKUP_STAMP=$(sed -n 's/.*"stamp":"\([^"]*\)".*/\1/p' "$(if [ -f backup.env ]; then . ./backup.env; fi; echo "${BACKUP_DIR:-/var/backups/gohr}")/last-ok.json" | head -1)
  else
    echo "!! ข้ามการสำรองข้อมูล (--skip-backup)"
  fi
  printf 'PREV_COMMIT=%s\nPREV_IMAGE=%s\nPREV_VERSION=%s\nBACKUP_STAMP=%s\n' "$PREV_COMMIT" "$PREV_IMAGE" "$PREV_VERSION" "$BACKUP_STAMP" > "$STATE"

  # -------------------------------------------------------------- 3. new code
  step "ดึงเวอร์ชันใหม่"
  git -C "$ROOT" fetch --tags --prune origin
  if [ -n "$REF" ]; then
    git -C "$ROOT" checkout -q "$REF"
    # a branch name: move it to what the server has (fast-forward only); a tag or commit stays as checked out
    if git -C "$ROOT" symbolic-ref -q HEAD >/dev/null; then git -C "$ROOT" merge -q --ff-only "origin/$REF"; fi
  else
    git -C "$ROOT" symbolic-ref -q HEAD >/dev/null || { echo "ตอนนี้ไม่ได้อยู่บน branch — ระบุเวอร์ชันด้วย --ref <tag>" >&2; exit 1; }
    git -C "$ROOT" merge -q --ff-only "@{u}"
  fi
  # the rest runs from the new copy of this script, so that fixes to the upgrade itself take effect
  args=(--continue)
  [ -n "$IMAGE" ] && args+=(--image "$IMAGE")
  exec "$DEPLOY_DIR/upgrade.sh" "${args[@]}"
fi

# ---------------------------------------------------------------- second half (new code is checked out)
# shellcheck disable=SC1090
. "$STATE"
NEW_COMMIT=$(git -C "$ROOT" rev-parse HEAD)
NEW_VERSION=$(app_version)

# how to go back — printed whenever a later step fails
rollback_help() {
  cat >&2 <<EOF

!! อัปเกรดไม่สำเร็จ — ระบบอาจหยุดอยู่ วิธีกลับไปเวอร์ชันเดิม ($PREV_VERSION):
   1) cd $ROOT && git checkout $PREV_COMMIT
   2) ตั้ง GOHR_IMAGE=$PREV_IMAGE ใน $DEPLOY_DIR/.env แล้ว (cd $DEPLOY_DIR && docker compose --env-file .env -f docker-compose.yml up -d)
   3) ถ้าขั้น "ปรับฐานข้อมูล" ทำงานไปแล้ว ต้องกู้ฐานข้อมูลจากข้อมูลสำรองก่อนอัปเกรด (stamp $BACKUP_STAMP):
      $DEPLOY_DIR/restore.sh --restore <db-$BACKUP_STAMP.dump[.enc]> [<files-$BACKUP_STAMP.tgz[.enc]>]
   log ของแอป: (cd $DEPLOY_DIR && docker compose logs --tail 200 app)
EOF
}
trap rollback_help ERR

if [ "$NEW_COMMIT" = "$PREV_COMMIT" ] && [ -z "$IMAGE" ]; then
  echo "ไม่มีเวอร์ชันใหม่ (commit ${NEW_COMMIT:0:12}) — ตรวจฐานข้อมูลและสถานะระบบเท่านั้น"
fi

# ---------------------------------------------------------------- 4. build while the old version serves
if [ -n "$IMAGE" ]; then
  NEW_IMAGE="$IMAGE"
  docker image inspect "$NEW_IMAGE" >/dev/null 2>&1 || docker pull "$NEW_IMAGE"
else
  NEW_IMAGE="gohr/app:${NEW_VERSION:-dev}-${NEW_COMMIT:0:8}"
  step "สร้าง image $NEW_IMAGE (เวอร์ชันเดิมยังให้บริการอยู่)"
  docker build -t "$NEW_IMAGE" -f "$ROOT/Dockerfile" "$ROOT"
fi

# ---------------------------------------------------------------- 5. stop the app, migrate
step "หยุดแอปและปรับฐานข้อมูล"
dc stop app cron
"$DEPLOY_DIR/migrate.sh"

# ---------------------------------------------------------------- 6. start the new version
step "เริ่ม GO HR $NEW_VERSION"
setenv .env GOHR_IMAGE "$NEW_IMAGE"
chmod 600 .env
dc up -d --no-build
printf 'รอระบบพร้อมใช้งาน'
ok=0
for _ in $(seq 1 60); do
  if app_healthy; then ok=1; break; fi
  printf '.'; sleep 3
done
echo
if [ "$ok" != 1 ]; then rollback_help; trap - ERR; exit 1; fi
trap - ERR

# through the reverse proxy as well (certificate and routing) — a warning only: DNS / firewall are outside this script
DOMAIN=$(getenv .env GOHR_DOMAIN)
if command -v curl >/dev/null && [ -n "$DOMAIN" ]; then
  if ! curl -fsSk -m 15 --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/api/public/health" >/dev/null; then
    echo "!! แอปพร้อมแล้ว แต่เรียกผ่าน https://$DOMAIN (Caddy) ไม่ได้ — ตรวจ: docker compose logs caddy"
  fi
fi

step "อัปเกรดเสร็จ: $PREV_VERSION (${PREV_COMMIT:0:8}) → $NEW_VERSION (${NEW_COMMIT:0:8})"
echo "  ข้อมูลสำรองก่อนอัปเกรด: stamp $BACKUP_STAMP   image เดิม: $PREV_IMAGE (ยังอยู่ในเครื่อง ลบได้เมื่อมั่นใจ)"
echo "  TLS: $(getenv .env TLS_MODE)   โดเมน: $DOMAIN   (ไม่เปลี่ยนจากตอนติดตั้ง)"
