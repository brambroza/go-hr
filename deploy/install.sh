#!/usr/bin/env bash
# =====================================================================
# GO HR — one-shot installer for a customer server (Ubuntu 22.04/24.04 with Docker)
#
#   git clone https://github.com/brambroza/go-hr.git /opt/gohr && cd /opt/gohr
#   sudo deploy/install.sh --domain hr.customer.co.th --admin-email it@customer.co.th
#
# Options:
#   --domain <host>        public domain (Let's Encrypt) or LAN IP / hostname
#   --tls internal|<email> "internal" = self-signed (LAN only); an e-mail = Let's Encrypt account (needs a public domain)
#   --admin-email <email>  first administrator login (password is generated and printed)
#   --company "<name>"     company name shown on the login page (editable later)
#   --license <string>     license key (can also be pasted later in Settings → License)
#   --image <name>         use a prebuilt image (docker load / registry) instead of building
#   --no-backup-cron       do not schedule the nightly backup (only when backups are handled elsewhere)
#   --upgrade-supabase     re-download the Supabase docker setup at the commit pinned in versions.env
#                          (secrets and data are kept; take a backup and test on staging first)
#
# Re-running is safe: secrets, domain and TLS mode are kept unless given again, migrations apply only once.
# To move to a new GO HR version use deploy/upgrade.sh (backup → build → migrate → restart → health check).
# =====================================================================
set -euo pipefail
cd "$(dirname "$0")"
DEPLOY_DIR=$(pwd)
ROOT=$(cd .. && pwd)

DOMAIN=""; TLS=""; ADMIN_EMAIL=""; COMPANY=""; LICENSE=""; IMAGE=""; BACKUP_CRON=1; UPGRADE_SUPABASE=0
while [ $# -gt 0 ]; do
  case "$1" in
    --domain) DOMAIN="$2"; shift 2 ;;
    --tls) TLS="$2"; shift 2 ;;
    --admin-email) ADMIN_EMAIL="$2"; shift 2 ;;
    --company) COMPANY="$2"; shift 2 ;;
    --license) LICENSE="$2"; shift 2 ;;
    --image) IMAGE="$2"; shift 2 ;;
    --no-backup-cron) BACKUP_CRON=0; shift ;;
    --upgrade-supabase) UPGRADE_SUPABASE=1; shift ;;
    *) echo "unknown option $1"; exit 1 ;;
  esac
done
# value of KEY in an env file ('' when the file or the key is missing)
getenv() { if [ -f "$1" ]; then sed -n "s/^$2=//p" "$1" | head -1; fi; }
# A re-run keeps what the first install chose: before, leaving out --tls silently turned a Let's Encrypt site into a
# self-signed one.
if [ -z "$DOMAIN" ]; then DOMAIN=$(getenv .env GOHR_DOMAIN); fi
if [ -z "$TLS" ]; then TLS=$(getenv .env TLS_MODE); fi
if [ -z "$TLS" ]; then TLS="internal"; fi
if [ -z "$DOMAIN" ]; then echo "ต้องระบุ --domain (เช่น hr.company.co.th หรือ IP ของเครื่อง)"; exit 1; fi
case "$DOMAIN" in *[!A-Za-z0-9.:-]*) echo "--domain ไม่ถูกต้อง: $DOMAIN"; exit 1 ;; esac
case "$TLS" in
  *[!A-Za-z0-9.@_+-]*) echo "--tls ไม่ถูกต้อง"; exit 1 ;;
  internal | *@*.*) ;;
  *) echo "--tls ต้องเป็น internal หรืออีเมล (บัญชี Let's Encrypt)"; exit 1 ;;
esac

step() { printf '\n\033[1;32m▶ %s\033[0m\n' "$*"; }
need() { command -v "$1" >/dev/null || { echo "ไม่พบคำสั่ง $1 — กรุณาติดตั้งก่อน"; exit 1; }; }
need docker; need git; need openssl; need curl
docker compose version >/dev/null || { echo "ต้องใช้ Docker Compose v2"; exit 1; }

rand() { openssl rand -hex "${1:-24}"; }
b64url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }
jwt() { # role, secret
  local h p s
  h=$(printf '{"alg":"HS256","typ":"JWT"}' | b64url)
  p=$(printf '{"role":"%s","iss":"supabase","iat":%s,"exp":%s}' "$1" "$(date +%s)" "$(( $(date +%s) + 315360000 ))" | b64url)
  s=$(printf '%s.%s' "$h" "$p" | openssl dgst -sha256 -hmac "$2" -binary | b64url)
  printf '%s.%s.%s' "$h" "$p" "$s"
}
setenv() { # file key value  (replace or append)
  local f=$1 k=$2 v=$3
  if grep -q "^$k=" "$f"; then sed -i "s|^$k=.*|$k=$(printf '%s' "$v" | sed 's/[&|]/\\&/g')|" "$f"; else echo "$k=$v" >> "$f"; fi
}

PUBLIC_URL="https://$DOMAIN"

# pinned versions (Supabase commit, Caddy image ...) — see deploy/versions.env
# shellcheck disable=SC1091
. "$DEPLOY_DIR/versions.env"
APP_VERSION=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$ROOT/package.json" | head -1)

# ---------------------------------------------------------------- 1. Supabase (official docker setup)
step "เตรียม Supabase (ref ${SUPABASE_REF:0:12})"
# The secrets in supabase/.env belong to the data in supabase/volumes: the database was initialised with that
# password and every stored session / encrypted value depends on those keys. They are generated exactly once.
# Data without its .env means the secrets were lost — generating new ones here would lock everything out.
if [ ! -f supabase/.env ] && [ -d supabase/volumes/db/data ] && [ -n "$(ls -A supabase/volumes/db/data 2>/dev/null)" ]; then
  echo "พบฐานข้อมูลเดิมที่ deploy/supabase/volumes/db/data แต่ไม่มี deploy/supabase/.env (คีย์/รหัสผ่านของฐานข้อมูลนั้น)" >&2
  echo "หยุดการติดตั้ง: กู้ไฟล์ตั้งค่าจากข้อมูลสำรองก่อน — deploy/restore.sh --config <config-...tgz> <โฟลเดอร์ว่าง>" >&2
  exit 1
fi
have_ref=$(cat supabase/.gohr-supabase-ref 2>/dev/null || true)
if [ -f supabase/docker-compose.yml ] && [ "$have_ref" != "$SUPABASE_REF" ] && [ "$UPGRADE_SUPABASE" = 0 ]; then
  echo "หมายเหตุ: Supabase ที่ติดตั้งอยู่ (${have_ref:0:12}) ต่างจาก versions.env (${SUPABASE_REF:0:12}) — ยังใช้ชุดเดิม; อัปเกรดด้วย --upgrade-supabase หลังสำรองข้อมูล"
fi
if [ ! -f supabase/docker-compose.yml ] || { [ "$UPGRADE_SUPABASE" = 1 ] && [ "$have_ref" != "$SUPABASE_REF" ]; }; then
  tmp=$(mktemp -d)
  # fetch exactly the pinned commit (no branch checkout → no surprise upgrade)
  git -C "$tmp" init -q supabase
  git -C "$tmp/supabase" remote add origin https://github.com/supabase/supabase.git
  git -C "$tmp/supabase" fetch -q --depth 1 origin "$SUPABASE_REF"
  git -C "$tmp/supabase" checkout -q FETCH_HEAD
  mkdir -p supabase && cp -rf "$tmp/supabase/docker/." supabase/ && rm -rf "$tmp"
  # (the copy above brings the compose file and config templates; it never touches supabase/.env or the data
  #  under supabase/volumes/db/data)
  echo "$SUPABASE_REF" > supabase/.gohr-supabase-ref
fi
if [ ! -f supabase/.env ]; then
  cp supabase/.env.example supabase/.env
  chmod 600 supabase/.env
  JWT_SECRET=$(rand 32)
  setenv supabase/.env POSTGRES_PASSWORD "$(rand 20)"
  setenv supabase/.env JWT_SECRET "$JWT_SECRET"
  setenv supabase/.env ANON_KEY "$(jwt anon "$JWT_SECRET")"
  setenv supabase/.env SERVICE_ROLE_KEY "$(jwt service_role "$JWT_SECRET")"
  setenv supabase/.env DASHBOARD_PASSWORD "$(rand 12)"
  for k in SECRET_KEY_BASE VAULT_ENC_KEY PG_META_CRYPTO_KEY LOGFLARE_PUBLIC_ACCESS_TOKEN LOGFLARE_PRIVATE_ACCESS_TOKEN LOGFLARE_API_KEY; do
    if grep -q "^$k=" supabase/.env; then setenv supabase/.env "$k" "$(rand 32)"; fi
  done
else
  # a newer Supabase setup may need settings the old .env does not have: add the missing keys with their defaults
  while IFS= read -r line; do
    k=${line%%=*}
    grep -q "^$k=" supabase/.env || echo "$line" >> supabase/.env
  done < <(grep -E '^[A-Z][A-Z0-9_]*=' supabase/.env.example)
fi
setenv supabase/.env SITE_URL "$PUBLIC_URL"
setenv supabase/.env API_EXTERNAL_URL "$PUBLIC_URL"
setenv supabase/.env SUPABASE_PUBLIC_URL "$PUBLIC_URL"
setenv supabase/.env ENABLE_EMAIL_SIGNUP "true"
setenv supabase/.env ENABLE_EMAIL_AUTOCONFIRM "true"
setenv supabase/.env DISABLE_SIGNUP "true"          # users are created by HR / admins only
setenv supabase/.env ENABLE_ANONYMOUS_USERS "false"
setenv supabase/.env TZ "Asia/Bangkok"
# shellcheck disable=SC1091
set -a; . supabase/.env; set +a

step "เริ่ม Supabase"
(cd supabase && docker compose pull -q && docker compose up -d)
printf 'รอฐานข้อมูลพร้อม'
for _ in $(seq 1 90); do
  docker exec supabase-db pg_isready -U postgres >/dev/null 2>&1 && break; printf '.'; sleep 2
done
echo
for _ in $(seq 1 60); do
  curl -fs "http://localhost:${KONG_HTTP_PORT:-8000}/auth/v1/health" -H "apikey: $ANON_KEY" >/dev/null && break; sleep 2
done

# ---------------------------------------------------------------- 2. database schema
step "ติดตั้ง/อัปเกรดฐานข้อมูล"
"$DEPLOY_DIR/migrate.sh"

# ---------------------------------------------------------------- 3. app configuration
step "ตั้งค่าแอป"
[ -f .env ] || touch .env
grep -q '^CRON_SECRET=' .env || setenv .env CRON_SECRET "$(rand 24)"
setenv .env PUBLIC_SUPABASE_URL "$PUBLIC_URL"
setenv .env SUPABASE_ANON_KEY "$ANON_KEY"
setenv .env SUPABASE_SERVICE_ROLE_KEY "$SERVICE_ROLE_KEY"
setenv .env APP_URL "$PUBLIC_URL"
setenv .env GOHR_DOMAIN "$DOMAIN"
setenv .env TLS_MODE "$TLS"
setenv .env SUPABASE_NETWORK "supabase_default"
setenv .env CADDY_IMAGE "${CADDY_IMAGE:-caddy:2.10.2-alpine}"
setenv .env CRON_IMAGE "${CRON_IMAGE:-alpine:3.20}"
grep -q '^CSP_ENFORCE=' .env || setenv .env CSP_ENFORCE "0"     # Content-Security-Policy report-only; set 1 to enforce
[ -n "$LICENSE" ] && setenv .env GOHR_LICENSE "$LICENSE"
# the app image is tagged with the version in package.json so "latest" never silently changes meaning
if [ -n "$IMAGE" ]; then setenv .env GOHR_IMAGE "$IMAGE"; else setenv .env GOHR_IMAGE "gohr/app:${APP_VERSION:-dev}"; fi
chmod 600 .env supabase/.env

# ---------------------------------------------------------------- 3b. nightly backup (on by default)
# A server without a scheduled backup loses everything with its disk. The schedule is installed here so that it does
# not depend on somebody remembering a manual step; the off-site target still has to be chosen (backup.env).
if [ ! -f backup.env ]; then cp backup.env.example backup.env; chmod 600 backup.env; fi
if [ "$BACKUP_CRON" = 1 ]; then
  if [ -d /etc/cron.d ]; then
    printf '%s\n' "# GO HR nightly backup (written by deploy/install.sh)" \
      "30 1 * * * root $DEPLOY_DIR/backup.sh >> /var/log/gohr-backup.log 2>&1" > /etc/cron.d/gohr-backup
    chmod 644 /etc/cron.d/gohr-backup
    BACKUP_NOTE="ทุกคืน 01:30 (/etc/cron.d/gohr-backup) → /var/backups/gohr  log: /var/log/gohr-backup.log"
  else
    BACKUP_NOTE="!! ไม่พบ /etc/cron.d — ยังไม่ได้ตั้งเวลาสำรองข้อมูล ติดตั้ง cron แล้วรัน install.sh อีกครั้ง"
  fi
else
  BACKUP_NOTE="ไม่ได้ตั้งเวลา (--no-backup-cron) — ต้องมีระบบสำรองข้อมูลอื่นเรียก $DEPLOY_DIR/backup.sh"
fi

step "สร้างและเริ่มระบบ GO HR"
if [ -n "$IMAGE" ]; then
  docker compose --env-file .env -f docker-compose.yml up -d
else
  docker compose --env-file .env -f docker-compose.yml up -d --build
fi

printf 'รอระบบพร้อมใช้งาน'
healthy=0
for _ in $(seq 1 60); do
  if docker compose --env-file .env -f docker-compose.yml exec -T app wget -qO- http://127.0.0.1:3000/api/public/health >/dev/null 2>&1; then healthy=1; break; fi
  printf '.'; sleep 3
done
echo
if [ "$healthy" != 1 ]; then echo "!! แอปยังไม่ตอบ /api/public/health — ตรวจด้วย: docker compose logs app"; fi

# ---------------------------------------------------------------- 4. first admin + company
if [ -n "$COMPANY" ]; then
  # psql variable (:'company') — the name is passed as data, never pasted into the SQL text
  printf '%s\n' "update public.settings set value = value || jsonb_build_object('name', :'company') where key = 'company';" |
    docker exec -i supabase-db psql -q -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -v company="$COMPANY" >/dev/null
fi
# the e-mail goes into a JSON body and an SQL statement below: accept plain addresses only
case "$ADMIN_EMAIL" in
  "") ;;
  *[!A-Za-z0-9.@_+-]* | *@*@*) echo "--admin-email ไม่ถูกต้อง — ข้ามการสร้างผู้ดูแลระบบ"; ADMIN_EMAIL="" ;;
esac
if [ -n "$ADMIN_EMAIL" ]; then
  step "สร้างผู้ดูแลระบบ"
  PW="Go$(rand 5)!"
  res=$(curl -fsS -X POST "http://localhost:${KONG_HTTP_PORT:-8000}/auth/v1/admin/users" \
        -H "apikey: $SERVICE_ROLE_KEY" -H "authorization: Bearer $SERVICE_ROLE_KEY" -H "content-type: application/json" \
        -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$PW\",\"email_confirm\":true}" || true)
  uid=$(printf '%s' "$res" | sed -n 's/.*"id":"\([0-9a-f-]\{36\}\)".*/\1/p' | head -1)
  if [ -n "$uid" ]; then
    docker exec -i supabase-db psql -q -U supabase_admin -d postgres -c \
      "insert into public.profiles(id, email, username, display_name, is_admin, is_active, must_change_password)
       values ('$uid', '$ADMIN_EMAIL', 'admin', 'ผู้ดูแลระบบ', true, true, true)
       on conflict (id) do update set is_admin = true, is_active = true;" >/dev/null
    echo "ผู้ดูแลระบบ: $ADMIN_EMAIL (หรือชื่อผู้ใช้ admin)  รหัสผ่านชั่วคราว: $PW  — ระบบจะให้เปลี่ยนรหัสผ่านเมื่อเข้าครั้งแรก"
  else
    echo "สร้างผู้ดูแลระบบไม่สำเร็จ (อาจมีอยู่แล้ว): $res"
  fi
fi

step "ติดตั้งเสร็จแล้ว"
cat <<EOF
  เว็บระบบ HR / แอปพนักงาน : $PUBLIC_URL        (พนักงานเปิด $PUBLIC_URL/m แล้วกด "เพิ่มไปยังหน้าจอหลัก")
  หน้าสมัครงาน            : $PUBLIC_URL/careers
  Supabase Studio         : http://<server-ip>:${KONG_HTTP_PORT:-8000}  (user: ${DASHBOARD_USERNAME:-supabase})  — อย่าเปิดพอร์ตนี้สู่อินเทอร์เน็ต
  สำรองข้อมูลอัตโนมัติ      : $BACKUP_NOTE
  สำรองนอกเครื่อง (ต้องทำ)  : ตั้ง BACKUP_OFFSITE + BACKUP_PASSPHRASE_FILE ใน $DEPLOY_DIR/backup.env แล้วซ้อมกู้คืน: $DEPLOY_DIR/restore.sh --drill <ไฟล์ dump>
                            เก็บสำเนารหัสผ่านสำรองข้อมูลไว้นอกเครื่องนี้ (ผู้ดูแลไอทีของลูกค้า + GoAlong) — ไม่มีรหัส = กู้คืนไม่ได้
  อัปเกรดเวอร์ชัน          : $DEPLOY_DIR/upgrade.sh
  License                 : ตั้งค่า → License / ระบบ (ยังไม่ติดตั้ง = ทดลองใช้ได้ 10 คน)
EOF
