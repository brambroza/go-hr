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
#
# Re-running is safe: secrets are kept, migrations apply only once (also use it for upgrades: git pull && install.sh).
# =====================================================================
set -euo pipefail
cd "$(dirname "$0")"
DEPLOY_DIR=$(pwd)
ROOT=$(cd .. && pwd)

DOMAIN=""; TLS="internal"; ADMIN_EMAIL=""; COMPANY=""; LICENSE=""; IMAGE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --domain) DOMAIN="$2"; shift 2 ;;
    --tls) TLS="$2"; shift 2 ;;
    --admin-email) ADMIN_EMAIL="$2"; shift 2 ;;
    --company) COMPANY="$2"; shift 2 ;;
    --license) LICENSE="$2"; shift 2 ;;
    --image) IMAGE="$2"; shift 2 ;;
    *) echo "unknown option $1"; exit 1 ;;
  esac
done
[ -z "$DOMAIN" ] && { echo "ต้องระบุ --domain (เช่น hr.company.co.th หรือ IP ของเครื่อง)"; exit 1; }

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
if [ ! -f supabase/docker-compose.yml ]; then
  tmp=$(mktemp -d)
  # fetch exactly the pinned commit (no branch checkout → no surprise upgrade)
  git -C "$tmp" init -q supabase
  git -C "$tmp/supabase" remote add origin https://github.com/supabase/supabase.git
  git -C "$tmp/supabase" fetch -q --depth 1 origin "$SUPABASE_REF"
  git -C "$tmp/supabase" checkout -q FETCH_HEAD
  mkdir -p supabase && cp -rf "$tmp/supabase/docker/." supabase/ && rm -rf "$tmp"
  echo "$SUPABASE_REF" > supabase/.gohr-supabase-ref
  cp supabase/.env.example supabase/.env
  JWT_SECRET=$(rand 32)
  setenv supabase/.env POSTGRES_PASSWORD "$(rand 20)"
  setenv supabase/.env JWT_SECRET "$JWT_SECRET"
  setenv supabase/.env ANON_KEY "$(jwt anon "$JWT_SECRET")"
  setenv supabase/.env SERVICE_ROLE_KEY "$(jwt service_role "$JWT_SECRET")"
  setenv supabase/.env DASHBOARD_PASSWORD "$(rand 12)"
  for k in SECRET_KEY_BASE VAULT_ENC_KEY PG_META_CRYPTO_KEY LOGFLARE_PUBLIC_ACCESS_TOKEN LOGFLARE_PRIVATE_ACCESS_TOKEN LOGFLARE_API_KEY; do
    grep -q "^$k=" supabase/.env && setenv supabase/.env "$k" "$(rand 32)"
  done
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

step "สร้างและเริ่มระบบ GO HR"
if [ -n "$IMAGE" ]; then
  docker compose --env-file .env -f docker-compose.yml up -d
else
  docker compose --env-file .env -f docker-compose.yml up -d --build
fi

# ---------------------------------------------------------------- 4. first admin + company
if [ -n "$COMPANY" ]; then
  docker exec -i supabase-db psql -q -U supabase_admin -d postgres -c \
    "update public.settings set value = value || jsonb_build_object('name', \$\$${COMPANY}\$\$) where key = 'company';" >/dev/null
fi
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
  สำรองข้อมูลอัตโนมัติ      : เพิ่ม "30 1 * * * $DEPLOY_DIR/backup.sh" ใน crontab ของ root
  สำรองนอกเครื่อง          : ตั้ง BACKUP_OFFSITE ใน $DEPLOY_DIR/backup.env (ดู backup.env.example) แล้วซ้อมกู้คืน: $DEPLOY_DIR/restore.sh --drill <ไฟล์ dump>
  License                 : ตั้งค่า → License / ระบบ (ยังไม่ติดตั้ง = ทดลองใช้ได้ 10 คน)
EOF
