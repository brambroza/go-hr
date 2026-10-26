# Technical Specification: GO HR Native Mobile Add-on — Phase 0 (Spike) + Phase 1 (Backend prep, go-hr 1.3.0)

**Ticket:** GOHR-130 (ชั่วคราว: ยังไม่มีเลข ticket จริง)
**Author:** Amnart Kongpet (ร่างร่วมกับ Claude)
**Date:** 2026-10-14
**Status:** Draft

ผู้อ่าน: ทีม GoAlong (PM / dev / QA)
อ้างอิง: decision 2026-10-13 ใน memory `go-hr-mobile-native-addon`, `docs/FEATURES.md` (PWA `/m`), `docs/ACCEPTANCE-REVIEW-2026-10.md`

---

## 1. Overview

GO HR มีแอปพนักงานแบบ PWA (`/m`) อยู่แล้ว และ PWA นี้รวมอยู่ในทุก license ต่อไป ส่วนแอป native ชื่อ "GO HR" (Expo + TypeScript, repo แยก `go-hr-mobile`) จะขายเป็น add-on ที่เปิดด้วย license module `mobile` แอปตัวเดียวบน App Store / Play Store ใช้ร่วมกันทุกลูกค้า และจับคู่กับเซิร์ฟเวอร์ของลูกค้าแต่ละรายด้วยการสแกน QR หรือพิมพ์ URL

เอกสารนี้ครอบคลุมสองช่วง:
- **Phase 0:** spike เพื่อยืนยันเรื่องที่ยังเสี่ยงก่อนลงแรงจริง ได้แก่ การคำนวณ face descriptor ฝั่ง server, IP ที่เซิร์ฟเวอร์เห็นเมื่อ check-in ผ่าน Wi-Fi, การจัดการ token และ push
- **Phase 1:** เตรียม backend ใน go-hr 1.3.0 ให้แอป native ใช้งานได้ โดยใช้ business rule ชุดเดียวกับ PWA (RPC + RLS เดิม) และไม่ต้องสร้าง API ซ้ำ

## 2. Goals

- แอป native ล็อกอินได้โดยใช้ lockout เดิมทั้งหมด (`login_precheck` / `login_failed` / per-IP throttle)
- แอปรู้ค่าที่จำเป็นของเซิร์ฟเวอร์ได้จาก `/api/mobile/config` อย่างเดียว เช่น Supabase URL, anon key, สถานะ license module `mobile` และวิธีลงเวลาที่เปิดอยู่
- ตรวจ license module ได้ทั้งฝั่ง Node (`getLicense()`) และฝั่ง SQL (`app.license_has_module('mobile')`)
- ลงเวลาแบบ Wi-Fi บริษัทจากแอปได้ ด้วยการรองรับ `Authorization: Bearer` บน `/api/checkin/network`
- ลงเวลาด้วยใบหน้าได้ใน MVP: แอปส่งรูป เซิร์ฟเวอร์คำนวณ descriptor แล้วส่งเข้า `check_in_face` เดิม (`POST /api/mobile/face`)
- ดูสลิปเงินเดือนของตัวเองผ่าน RPC ที่คืนเฉพาะสลิปของตัวเองที่เผยแพร่แล้ว และ mask เลขบัญชีตาม PDPA ฝั่ง server
- เก็บ push token ของอุปกรณ์ (`device_push_tokens`) ให้พร้อมสำหรับ Phase 2
- หน้า ตั้งค่า แสดง QR สำหรับจับคู่แอปกับเซิร์ฟเวอร์

## 3. Non-goals (สิ่งที่ไม่ทำใน scope นี้)

- ตัวแอป Expo (หน้าจอ, navigation, store submission) อยู่ใน Phase 2 ที่ repo `go-hr-mobile` เอกสารนี้กำหนดไว้แค่ contract ที่แอปต้องใช้
- ตัวส่ง push notification จริง (job ที่อ่าน `notifications` แล้วส่งออกไป) อยู่ใน Phase 2 ส่วน Phase 1 ทำแค่ table + RPC ลงทะเบียน token
- ไม่มีคิวออฟไลน์สำหรับ face check-in เพราะ face ต้องออนไลน์ ส่วนคิวออฟไลน์ GPS ของ native อยู่ใน Phase 2
- ไม่ลงทะเบียนใบหน้าด้วยตัวเองจากแอป native ใน MVP (HR ลงทะเบียนผ่านเว็บเหมือนเดิม) ดู Open Questions
- ไม่ทำ liveness detection (กันรูปถ่ายของรูปถ่าย) ซึ่งเป็นข้อจำกัดเดียวกับ PWA ปัจจุบัน
- ไม่รองรับ install แบบ LAN-only / self-signed เพราะลูกค้าที่ซื้อ mobile ต้องมีโดเมนสาธารณะและ TLS จริง โดยระบุเป็นเงื่อนไขใน SOW
- ไม่ทำ white-label หรือแอปแยกต่อลูกค้า
- ไม่เปลี่ยนพฤติกรรมของ PWA `/m` และหน้าเว็บ login เดิม (มี refactor ภายใน แต่ผลลัพธ์ต้องเหมือนเดิม)

## 4. User Stories

- As an **employee**, I want to scan the QR on the HR notice board (or type the server URL) once, so that the GO HR app connects to my company's server.
- As an **employee**, I want to sign in with the same username/employee code and password as the web, and be locked out under the same rules, so that the app is not a weaker door.
- As an **employee**, I want to check in with my face from the app, so that I do not need the kiosk.
- As an **employee** on office Wi-Fi, I want to check in with the "Wi-Fi บริษัท" method from the app.
- As an **employee**, I want to see my published payslips in the app with the bank account masked.
- As an **HR admin**, I want a QR code on the settings page that I can print, so that staff can pair the app without typing URLs.
- As **GoAlong**, I want the app to refuse sign-in on servers whose license lacks the `mobile` module, so that the add-on is actually paid for.

## 5. Technical Design

### 5.1 Architecture

```
 GO HR app (Expo, store build — one app for all customers)
   │  1. pair: QR "gohr://pair?url=https://hr.customer.co.th"  →  GET /api/mobile/config
   │  2. POST /api/mobile/login            → Supabase session (access + refresh token)  [stored in SecureStore]
   │  3. supabase-js with the session       → /rest/v1/rpc/my_today, my_payslips, register_push_token ...  (RLS as today)
   │     token refresh                      → /auth/v1/token?grant_type=refresh_token  (GoTrue; banned users fail)
   │  4. Bearer calls to Next.js            → /api/checkin/network, /api/mobile/face
   ▼
 Caddy (public domain, Let's Encrypt)
   ├── /auth/v1 /rest/v1 /storage/v1 /realtime/v1  → Kong → Supabase      (same origin, already in deploy/Caddyfile)
   └── everything else                              → Next.js app :3000
         ├── proxy.ts: /api/mobile/* public at the proxy level (routes authenticate themselves);
         │             /api/checkin/network passes through when an Authorization header is present
         ├── lib/supabase/bearer.ts  → per-request client carrying the user's JWT (RLS + auth.uid() work)
         └── face: @vladmandic/face-api (node-wasm) + same 3 models as the browser → descriptor → check_in_face
```

หลักการ:
1. **ใช้ RPC/RLS เดิมให้มากที่สุด** เพราะ RPC ESS (`my_today`, `my_days`, `my_leave_balances`, `my_checkin_policy`, `check_in`, `submit_request` ...) ใช้ `app.my_employee_id()` อยู่แล้ว ซึ่ง (ตั้งแต่ 1.2.1) คืน null เมื่อบัญชีถูกปิดหรือพ้นสภาพ แอปจึงเรียก RPC เหล่านี้ด้วย JWT ได้ตรง ๆ
2. **Next.js รับเฉพาะงานที่ทำใน DB ไม่ได้**: login (ต้องใช้ service role + lockout), config, network check-in (ต้องรู้ IP ที่ Caddy เห็น), face (ต้องรันโมเดล)
3. **Bearer client = JWT ของผู้ใช้ ไม่ใช่ service role** เพื่อให้ RLS กับ `auth.uid()` ทำงานตามปกติ ส่วน service role ใช้ในจุดเดิมเท่านั้น (`login_precheck`, `login_failed`, `check_in_network`)

### 5.2 Data Model

#### Migration `supabase/migrations/20261015010000_mobile.sql` (idempotent, user เป็นคนรัน)

```sql
-- license module check (defense in depth; Node re-verifies the signature with getLicense())
create or replace function app.license_has_module(p_module text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select (value->>'valid')::boolean and coalesce(value->'modules', '[]'::jsonb) ? p_module
      from settings where key = 'license_status'), false)
$$;
revoke all on function app.license_has_module(text) from public, anon;
grant execute on function app.license_has_module(text) to authenticated, service_role;
```

> หมายเหตุ: แถว `license_status` เขียนได้เฉพาะ service role (RLS ใน `20261008080000_platform.sql`) และ `getLicense()` ตรวจลายเซ็น Ed25519 ซ้ำทุกครั้งที่อ่าน ฟังก์ชัน SQL นี้จึงเชื่อค่าที่ cache ไว้ได้ ด่านจริงอยู่ที่ Node (`/api/mobile/login`, `/api/mobile/config`)

```typescript
// public.device_push_tokens
interface IDevicePushToken {
  id: number;                 // bigint identity
  user_id: string;            // uuid → auth.users(id) on delete cascade
  token: string;              // unique; ExponentPushToken[...] or raw FCM/APNs token (decided in spike S3)
  provider: 'expo' | 'fcm' | 'apns';
  platform: 'ios' | 'android';
  app_version: string | null; // e.g. "1.0.0 (12)"
  device_name: string | null; // max 80 chars, display only
  created_at: string;
  last_seen_at: string;       // updated on every register call
  revoked_at: string | null;  // set on logout / DeviceNotRegistered from provider
}
```

- unique(`token`): ถ้าเครื่องเดิมล็อกอินด้วยผู้ใช้อื่น token จะย้ายไปเป็นของผู้ใช้ใหม่ (ON CONFLICT update `user_id`) เพื่อไม่ให้ push ของคนเก่าไปเด้งบนเครื่องที่คนอื่นถืออยู่
- index(`user_id`) where `revoked_at is null`
- RLS: `select` / `delete` ได้เฉพาะของตัวเอง (`user_id = auth.uid()`) ส่วน `insert` / `update` ทำผ่าน RPC เท่านั้น
- จำกัด 10 token ที่ยัง active ต่อผู้ใช้ ถ้าเกินให้ revoke ตัวที่ `last_seen_at` เก่าสุด

```sql
public.register_push_token(p_token text, p_provider text, p_platform text,
                           p_app_version text default null, p_device_name text default null) returns void
  -- security definer; requires auth.uid(); requires app.license_has_module('mobile') → Thai error otherwise;
  -- validates provider/platform enums and token length (≤ 255); upsert on token; enforces the 10-device cap
public.unregister_push_token(p_token text) returns void   -- sets revoked_at for the caller's own token only
```

#### Payslip RPCs

PWA ปัจจุบันอ่าน `payroll_entries` ตรง ๆ ภายใต้ RLS ซึ่ง **ยอมให้ HR เห็นสลิปของคนอื่นด้วย** หน้า `/m/payslips/[entryId]` จึงต้องกรอง `employee_id === me.employeeId` เองใน TypeScript แอป native ไม่ควรต้องทำแบบนั้น RPC ทั้งสองตัวจึงกรองตัวเองเสมอ ไม่ว่าผู้เรียกจะมีสิทธิ์ payroll หรือไม่

```sql
public.my_payslips(p_limit int default 60)
  returns table(entry_id bigint, period_id bigint, period_name text, pay_date date, pay_year int,
                total_income numeric, total_deduction numeric, net_pay numeric)
  -- where employee_id = app.my_employee_id() and payroll_periods.payslip_published
  -- order by pay_date desc; p_limit clamped to 1..120

public.my_payslip(p_entry_id bigint) returns jsonb
  -- null (→ app shows "ไม่พบสลิป") unless the entry is the caller's own and published
  -- { company:{name,address,tax_id,logo_url},
  --   period:{code,name,start_date,end_date,pay_date},
  --   entry:{emp_code,emp_name,position_name,org_name,pay_method,bank_code,bank_account(masked),
  --          base_salary,salary_unit,work_days,paid_days,absent_days,late_minutes,
  --          total_income,total_deduction,net_pay, ytd_* only when payslip_show_ytd},
  --   items:[{name,direction,amount,qty,rate}],
  --   options:{show_ytd,note,mask_bank_account} }
```

- ใช้ default เดียวกับ `lib/payroll/payslip-options.ts`: `payslip_show_ytd` เป็น null แปลว่า true และ `mask_bank_account` เป็น null แปลว่า true
- mask เลขบัญชีใน SQL ด้วยกติกาเดียวกับ `maskAccount()` ใน `lib/format.ts` (ตัดให้เหลือแต่ตัวเลข ว่างคืน `-` นอกนั้นคืน `XXX-X-X` + 4 หลักท้าย) เพราะถ้าเชื่อให้ client เป็นคน mask ก็เท่ากับไม่ได้ mask
- ถ้า `show_ytd = false` ห้ามส่ง field `ytd_*` ออกไปเลย (ไม่ใช่แค่ซ่อนบนจอ)
- ทั้งสองฟังก์ชัน `revoke ... from public, anon; grant ... to authenticated`
- ไม่ต้องเช็ค license module ใน RPC สลิป เพราะข้อมูลเดียวกันนี้อ่านผ่าน PWA ได้อยู่แล้ว การ gate จุดนี้ไม่ได้ป้องกันอะไรเพิ่ม

### 5.3 API Endpoints

ทุก response ใส่ `Cache-Control: no-store` และเมื่อ error จะคืน `{ error: string (Thai, show to user), code: string (stable, for app logic) }`

```
GET  /api/mobile/config                 public
POST /api/mobile/login                  public (rate limited)
POST /api/mobile/face                   Bearer
GET  /api/checkin/network               Bearer | cookie   (existing, extended)
POST /api/checkin/network               Bearer | cookie   (existing, extended)
```

#### `GET /api/mobile/config`
```jsonc
{
  "api_version": 1,
  "server": { "company_name": "บริษัท ...", "logo_url": "https://.../public/logo.png" },
  "supabase": { "url": "https://hr.customer.co.th", "anon_key": "eyJ..." },   // publicEnv()
  "mobile_enabled": true,              // getLicense()?.valid && modules.includes('mobile')
  "min_app_version": "1.0.0",          // env GOHR_MOBILE_MIN_VERSION, default "1.0.0"
  "checkin": { "face": true, "network": true, "gps": true, "qr": true },   // from settings.attendance
  "face": { "max_image_bytes": 1048576, "max_side_px": 1280 },
  "time_zone": "Asia/Bangkok"
}
```
- ห้ามส่ง licensee tax id, license id หรือจำนวนพนักงานสูงสุด เพราะ endpoint นี้เป็น public
- `mobile_enabled = false` แปลว่าแอปแสดงจอ "เซิร์ฟเวอร์นี้ยังไม่ได้เปิดใช้แอปมือถือ — ใช้งานผ่านเว็บ `<url>/m` ได้" แล้วหยุดแค่นั้น

#### `POST /api/mobile/login`
Request: `{ login: string(1..200), password: string(1..200), device?: { platform: 'ios'|'android', app_version?: string(≤40) } }` (Zod)
Response 200:
```jsonc
{ "access_token": "...", "refresh_token": "...", "expires_at": 1760000000,
  "user": { "id": "uuid", "display_name": "...", "employee_code": "T001", "must_change_password": true } }
```
Errors: `400 BAD_REQUEST`, `401 INVALID_CREDENTIALS` ("ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง"), `423 LOCKED` (ข้อความเดียวกับเว็บ พร้อมจำนวนนาที), `429 RATE_LIMITED`, `403 MOBILE_NOT_LICENSED`, `403 NO_EMPLOYEE` (บัญชีไม่ผูกพนักงาน), `503 UNAVAILABLE`

ลำดับการทำงาน (ต้องเหมือน `app/(auth)/login/actions.ts` ทุกขั้น):
1. ดึง logic ของ `loginAction` ออกมาเป็น `lib/password-login.ts`: `passwordLogin(typed, pw, ip, client)` ซึ่งคืน `{ ok, session } | { ok:false, code, error }` ให้เว็บ action กับ mobile route ใช้ตัวเดียวกัน เพื่อไม่ให้กติกา lockout สองชุดค่อย ๆ เพี้ยนออกจากกัน
2. per-IP throttle `allowAttempt` (ดู Risk R4 เรื่อง CGNAT / IP ของออฟฟิศ)
3. เช็ค license `mobile` ก่อนแตะ GoTrue เพื่อไม่ให้ server ที่ไม่มีสิทธิ์ถูกใช้เป็นเครื่องเดารหัส
4. `login_precheck` (service role) ถ้า `locked_minutes > 0` ให้คืน 423 ทันที
5. `signInWithPassword` ผ่าน stateless client (`persistSession:false`, ไม่มี cookie) ส่วน login ที่ไม่รู้จักใช้ `@invalid.local` เหมือนเว็บเพื่อให้ timing เท่ากัน
6. นับ `login_failed` เฉพาะกรณีรหัสผิดจริง
7. เรียก `record_login` ด้วย client ที่ถือ access token ที่เพิ่งได้มา (audit LOGIN) แล้วเพิ่ม note `mobile <platform> <app_version>` (ขยาย `record_login(p_note text default null)` แบบ backward compatible)
8. `must_change_password = true` แอปต้องบังคับเปลี่ยนรหัสด้วย `supabase.auth.updateUser({password})` ตามด้วย RPC `password_changed()` เดิม

ไม่มี `/api/mobile/refresh`: แอป refresh กับ GoTrue ตรง ๆ ผ่าน supabase-js ได้ เพราะคนที่ลาออกหรือถูกปิดบัญชีจะถูก ban ใน GoTrue อยู่แล้ว (`lib/jobs/runner.ts`) จึง refresh ไม่ผ่านเอง และ `app.my_employee_id()` ก็คืน null ตั้งแต่ก่อนรอบ job

#### Bearer support — `lib/supabase/bearer.ts` + `/api/checkin/network`
```typescript
/** Client for a route handler: user's JWT from `Authorization: Bearer` when present, else the cookie session. */
export async function supabaseForRequest(req: NextRequest): Promise<{ sb: SupabaseClient; user: User } | null>
```
- อ่าน header แบบเคร่ง: `^Bearer ([A-Za-z0-9._-]{20,4096})$` ถ้าไม่ตรงให้ถือว่าไม่มี header
- ตรวจ token ด้วย `sb.auth.getUser(token)` ผ่าน GoTrue ห้าม decode JWT เองโดยไม่ verify
- client ใช้ anon key + `global.headers.Authorization` เพื่อให้ RLS / `auth.uid()` ทำงาน ห้ามใช้ service role
- `/api/checkin/network`: แก้ `resolve()` ให้เรียก `supabaseForRequest` แทน `supabaseServer()` ส่วน logic อื่นไม่เปลี่ยน
- `proxy.ts`: เพิ่ม `/api/mobile` ใน `PUBLIC_PREFIXES` และให้ `/api/checkin/network` ผ่าน proxy ได้เมื่อมี `Authorization` header (ตัว route ตรวจซ้ำเอง) ถ้าไม่แก้จุดนี้ proxy จะตอบ 401 ก่อนถึง route ทุกครั้ง เพราะแอปไม่มี cookie
- ข้อควรรู้เรื่อง IP: เมื่อเซิร์ฟเวอร์อยู่บนโดเมนสาธารณะ IP ที่ Caddy เห็นจากมือถือที่ต่อ Wi-Fi ออฟฟิศคือ **public egress IP ของออฟฟิศ** ไม่ใช่ LAN IP ดังนั้น `work_locations.allowed_ip_ranges` ต้องเป็น public IP (/32) ซึ่งออฟฟิศที่ใช้ IP แบบ dynamic จะใช้วิธีนี้ไม่ได้ (ดู S4, R3)

#### `POST /api/mobile/face`
Request: `multipart/form-data`
- `image`: JPEG, ≤ 1 MB, ด้านยาวไม่เกิน 1280 px (แอปย่อรูปเองก่อนส่ง) ตรวจ magic bytes `FF D8 FF` ไม่เชื่อ Content-Type
- `direction`: `auto|in|out|break_out|break_in` (default `auto`)
- `latitude`, `longitude`, `accuracy` (optional, ตามนโยบาย check-in)
- `client_ref` (≤ 80), `note` (≤ 500)

ขั้นตอน:
1. `supabaseForRequest` ถ้าไม่มี user ตอบ 401, ถ้า license ไม่มี `mobile` ตอบ 403 `MOBILE_NOT_LICENSED`
2. throttle ต่อผู้ใช้ 6 ครั้งต่อ 5 นาที (ในหน่วยความจำ แบบเดียวกับ `login-rate.ts`) เป็นชั้นหน้าก่อนถึง lockout 5 ครั้งต่อ 15 นาทีที่มีอยู่แล้วใน `check_in_face`
3. ถอดรหัส JPEG เป็น RGB ด้วย `jpeg-js` (pure JS ไม่มี native dependency บน alpine) แล้วตรวจจับใบหน้าด้วย TinyFaceDetector + landmark68Tiny + faceRecognitionNet ชุดเดียวกับเบราว์เซอร์ (`scripts/copy-face-models.mjs` → `FACE_MODELS`) และโหลดโมเดลครั้งเดียวต่อ process
4. ต้องเจอใบหน้า **1 ใบพอดี** ที่ score ≥ 0.6 และกล่องใบหน้ากว้าง ≥ 15% ของภาพ ไม่ผ่านตอบ 422 `NO_FACE` / `MULTIPLE_FACES` / `FACE_TOO_SMALL` (ข้อความไทย) โดยไม่บันทึกเป็น failure เพราะเป็นปัญหาการถ่ายรูป ไม่ใช่ใบหน้าไม่ตรง
5. คุมงาน inference ด้วย semaphore (ค่าเริ่ม 2 งานพร้อมกัน, คิวรอไม่เกิน 10 วินาที) ถ้าเกินให้ตอบ 503 `BUSY` ("ระบบกำลังประมวลผล ลองใหม่อีกครั้ง") เพื่อกันไม่ให้ช่วงเข้างานเช้าลากเว็บทั้งระบบช้าตาม
6. อัปโหลดรูปไป Storage `checkins/<uid>/<yyyy-mm-dd>/<uuid>.jpg` ด้วย **client ของผู้ใช้** (storage policy เดิมบังคับ folder = `auth.uid()`)
7. เรียก `check_in_face(p_descriptor, lat, lng, acc, photo_url, direction, client_ref, note)` เดิมด้วย client ของผู้ใช้ ตัว RPC เป็นคนตัดสินระยะห่าง, บันทึก failure, lockout และ policy ทั้งหมด จึงไม่ต้องแก้ SQL
8. Response คืนผลจาก RPC (`ok`, `face_score`, ทิศทาง, เวลา, error ภาษาไทย) **ห้ามคืน descriptor** ใน response, log หรือ Sentry เพราะเป็นข้อมูลชีวมิติ (PDPA ม.26)

`next.config.ts`: เพิ่ม `serverExternalPackages` สำหรับ face-api / tfjs ถ้าจำเป็น และตรวจว่า `.next/standalone` มีไฟล์ `.wasm` กับโมเดลครบ (`outputFileTracingIncludes`) ซึ่งเป็นผลที่ต้องได้จาก spike S1

#### Pairing QR (หน้า ตั้งค่า → License / ระบบ)
- เพิ่ม card "แอปมือถือ GO HR" ใน `app/(admin)/settings/license/page.tsx` ต้องมีสิทธิ์ `settings:view`
- เนื้อหาใน QR: `gohr://pair?v=1&url=<encodeURIComponent(origin)>` โดย origin มาจาก env ใหม่ `GOHR_PUBLIC_URL` (ถ้าไม่ได้ตั้งค่าให้ fallback เป็น origin ของ request แล้วแสดงคำเตือน) ใน QR ไม่มี secret ใด ๆ
- ใช้ lib `qrcode` ที่มีอยู่แล้ว มีปุ่ม "พิมพ์ / ดาวน์โหลด PNG" สำหรับติดบอร์ดประกาศ
- แสดงคำเตือนและไม่แสดง QR เมื่อ origin ไม่ใช่ `https:` หรือเป็น IP / `localhost` / `.local` ("แอปมือถือต้องใช้โดเมนสาธารณะที่มีใบรับรอง HTTPS")
- เมื่อ license ไม่มี module `mobile` ให้แสดงข้อความแนะนำ add-on แทน QR
- builder และ validator ของ payload เป็น pure function ใน `lib/mobile-pair.ts` ให้แอปใช้กติกาเดียวกัน (copy ไปฝั่งแอป ไม่ import ข้าม repo)

### 5.4 Business Logic

| Rule | Where enforced |
|---|---|
| Native app only works when license has `mobile` | `/api/mobile/login`, `/api/mobile/face`, `/api/mobile/config` (Node, signature re-verified) + `register_push_token` (SQL) |
| Lockout identical to web | shared `lib/password-login.ts` → `login_precheck` / `login_failed` |
| Resigned / disabled users lose access | `app.my_employee_id()` null + GoTrue ban (existing) |
| Face match decided by server only | descriptor computed on server; distance, threshold, lockout in `check_in_face` (existing) |
| Network check-in IP comes from Caddy, never from the app | `clientIpFrom()` (existing); app cannot send an IP |
| Payslip: only own + published, YTD/bank masking per settings | `my_payslips` / `my_payslip` |
| One push token belongs to one user at a time | unique token + reassignment in `register_push_token` |

Edge cases ที่ต้องรองรับ:
- license ถูกถอดหลังผู้ใช้ล็อกอินไปแล้ว: `config` จะคืน `mobile_enabled=false` และแอปขึ้นจอปิดใช้งานในการเปิดครั้งถัดไป ส่วน face จะตอบ 403 ทันที แต่ RPC ESS ยังเรียกได้ เพราะข้อมูลชุดเดียวกันใช้ผ่าน PWA ได้อยู่แล้ว
- เวลาลงเวลาเป็นเวลาฝั่ง server เสมอ (`check_in_core` ใช้ `now()`) นาฬิกาเครื่องผิดจึงไม่มีผล
- ผู้ใช้ที่เป็น admin แต่ไม่ผูกพนักงานจะล็อกอินแอปได้ แต่ทุกหน้าจอ ESS ขึ้น "บัญชีนี้ยังไม่ได้ผูกกับข้อมูลพนักงาน" หรือเลือกตอบ `403 NO_EMPLOYEE` ตั้งแต่ตอน login (ดู Open Questions)
- ผู้ใช้ส่ง face ซ้ำเพราะเน็ตหลุด: `client_ref` เดิมกันข้อมูลซ้ำได้ (`time_logs.client_ref` unique)

## 6. Security Considerations

- **Bearer auth:** verify ด้วย GoTrue ทุก request, ไม่ใช้ service role กับข้อมูลที่ผู้ใช้ส่งมา, regex header แบบเคร่ง, และไม่ log token
- **Brute force:** lockout ต่อบัญชี (DB) + throttle ต่อ IP (memory) ใช้ชุดเดียวกับเว็บ และเช็ค license ก่อนเรียก GoTrue
- **Account enumeration:** ข้อความ error ต้องเหมือนกันระหว่าง login ที่ไม่มีอยู่จริงกับรหัสผิด และใช้ timing trick เดิม
- **ข้อมูลชีวมิติ (PDPA):** descriptor ไม่ถูกเก็บจากการ check-in และไม่ออกจาก server, รูปเก็บใน bucket private `checkins` ตาม retention เดิม, ไม่ log descriptor/รูปใน Sentry (ต้องตั้ง `beforeSend` ตัด body ของ `/api/mobile/face`)
- **Upload:** จำกัดขนาดก่อนอ่าน body, ตรวจ magic bytes, จำกัดขนาดภาพหลัง decode (กัน decompression bomb: ปฏิเสธเมื่อ width × height > 4 MP), ไม่เขียนไฟล์ลงดิสก์
- **DoS จาก inference:** semaphore + throttle ต่อผู้ใช้ และ timeout ต่อ inference 5 วินาที
- **Payslip:** กรองด้วย `app.my_employee_id()` ใน RPC เพื่อปิดช่องที่ HR เห็นสลิปคนอื่นผ่าน RLS และ mask ฝั่ง server
- **SQL injection:** ทุก RPC ใช้ parameter, ไม่มี dynamic SQL ใหม่
- **XSS / CSRF:** endpoint ใหม่คืน JSON เท่านั้น และไม่รับ cookie auth (ยกเว้น `/api/checkin/network` เดิมที่ยังรับ cookie จาก PWA เหมือนเดิม) จึงไม่เกิดช่อง CSRF ใหม่
- **Transport:** HTTPS เท่านั้น แอปปฏิเสธ URL ที่ไม่ใช่ `https:` ตอน pairing
- **Push (Phase 2 แต่ต้องตัดสินตั้งแต่ตอนนี้):** payload ห้ามมีข้อมูลเงินเดือนหรือข้อมูลส่วนบุคคล ส่งได้แค่ข้อความทั่วไปพร้อม deep link เพราะผ่าน Expo/FCM/APNs ซึ่งเป็นบุคคลภายนอก

## 7. Performance Considerations

- ขนาดโหลด: ลูกค้า SME 50–500 คน ช่วงพีคคือเข้างาน 07:45–08:15 คิดเป็นราว 0.3–0.6 req/s บน `/api/mobile/face`
- เป้าหมาย: `/api/mobile/face` p95 ≤ 2.0 วินาที (รวมอัปโหลด) บน VPS 2 vCPU / 4 GB, หน่วยความจำที่เพิ่มจากโมเดล ≤ 300 MB, cold start (โหลดโมเดล) ≤ 3 วินาที และ warm-up ตอน server start
- โมเดล recognition (~6.2 MB) โหลดครั้งเดียวต่อ process ต้องไม่โหลดใหม่ต่อ request
- `my_payslips` ต้องใช้ index `payroll_entries(employee_id)` (ตรวจด้วย `explain` ตอน dry-run)
- `/api/mobile/config` cache ฝั่ง server 60 วินาที (license + settings) แต่ตอบ client แบบ `no-store`
- ถ้า WASM ช้ากว่าเป้า: ใช้ทางเลือกใน S1 (tfjs-node บน image `node:22-bookworm-slim`) ซึ่งกระทบ Dockerfile และขนาด image จึงต้อง escalate ไป Technical Lead

## 8. Testing Plan

**Unit tests** (`tests/*.test.ts`, tsx --test, ใส่ logic เป็น pure function ให้ test ได้):
- `mobile-pair.test.ts`: build/parse QR payload, ปฏิเสธ http / IP / localhost / `.local` / URL ที่มี path หรือ credential
- `license.test.ts` (เพิ่ม): `hasModule()` กรณี valid+มี module / valid+ไม่มี / invalid / modules ไม่มี field
- `bearer.test.ts`: parse header (ถูก, ไม่มี, scheme ผิด, ตัวอักษรนอก charset, ยาวเกิน)
- `password-login.test.ts`: map ผลลัพธ์ (locked → 423, wrong password → นับ failure, banned → ไม่นับ, network error → ไม่นับ, unknown login → ข้อความเดียวกับรหัสผิด) ด้วย RPC/GoTrue ปลอม
- `face-input.test.ts`: magic bytes, จำกัดขนาด, ขนาดภาพ, กติกาเลือกใบหน้า (0 / 1 / หลายใบ / เล็กเกิน) จาก detection ปลอม
- `payslip-mask.test.ts`: mask ใน SQL ต้องตรงกับ `maskAccount()` (สร้าง fixture จาก TS แล้วเทียบกับผล dry-run)
- เป้าหมาย coverage ≥ 80% ของไฟล์ใหม่ใน `lib/`

**Integration** (กับ DB เดโม่ hosted, ผู้ใช้ T001–T010):
- `/api/mobile/login`: สำเร็จ / รหัสผิด 5 ครั้งแล้วโดน 423 / license ไม่มี `mobile` ได้ 403 / T00x ที่พ้นสภาพแล้ว login ไม่ได้
- refresh token ของผู้ใช้ที่ถูกปิดบัญชีหลัง job รัน ต้อง fail
- `/api/checkin/network` ด้วย Bearer: IP ตรง / ไม่ตรง / token หมดอายุ ได้ 401 และ request ที่ใช้ cookie ของ PWA ต้องยังทำงานเหมือนเดิม
- `/api/mobile/face`: คนเดียวกับที่ HR ลงทะเบียนผ่านเว็บต้องผ่าน, คนอื่นต้องไม่ผ่าน, พลาด 5 ครั้งต้องโดน lockout, รูปไม่มีหน้าได้ 422 และไม่นับ failure, ยิงพร้อมกัน 20 request ต้องไม่มีครั้งไหนเกิน timeout และส่วนเกินได้ 503
- `my_payslip` เรียกด้วยบัญชี HR (มีสิทธิ์ payroll) กับ entry ของคนอื่น ต้องได้ null
- `register_push_token`: ไม่มี module ต้อง error, token เดียวกันกับผู้ใช้ใหม่ต้องย้ายเจ้าของ, ครบ 10 เครื่องแล้วตัวเก่าสุดต้องถูก revoke

**Manual QA:**
- พิมพ์ QR จากหน้าตั้งค่าแล้วสแกนด้วยแอป dev build (Expo Go / dev client) ต้องจับคู่ได้
- face check-in บน iPhone และ Android ระดับกลาง (เช่น Samsung A-series) ทั้งในที่แสงน้อยและย้อนแสง
- regression ของ PWA: login, ลงเวลา GPS / Wi-Fi / face บนเว็บ, หน้าสลิป

## 9. Rollout Plan

### Phase 0 — Spike (ประมาณ 1 สัปดาห์, time-boxed; ผลลัพธ์คือ go/no-go ของแต่ละข้อ)

| # | Spike | Pass criteria | ถ้าไม่ผ่าน |
|---|---|---|---|
| S1 | Server-side face descriptor ใน `node:22-alpine` ด้วย `face-api.node-wasm` + `@tensorflow/tfjs-backend-wasm` + `jpeg-js` | (a) ระยะห่างระหว่าง descriptor ที่เบราว์เซอร์ enroll กับที่ server คำนวณจากคนเดียวกัน: median ≤ 0.35 และ p95 ≤ 0.45; (b) คนต่างกันต้องไม่มีคู่ไหนผ่านที่ 0.5 (ทดสอบ ≥ 10 คน × 5 รูป); (c) p95 inference ≤ 1.2 s บน 2 vCPU; (d) `next build` standalone รันได้พร้อมไฟล์ wasm + โมเดล | (a/b) ไม่ผ่าน: ให้ HR enroll ใหม่ด้วย pipeline ฝั่ง server; (c) ไม่ผ่าน: tfjs-node + เปลี่ยน base image (escalate Technical Lead) |
| S2 | Expo: `expo-camera` ถ่าย, ย่อ ≤ 1280 px, JPEG ≤ 1 MB; `expo-location`; `expo-secure-store` เก็บ session; supabase-js ใน RN | ทั้ง flow login → config → face ใช้งานได้บน iOS + Android จริงอย่างละ 1 เครื่อง | ประเมินทางเลือก library ใหม่ |
| S3 | Push: Expo Push Service เทียบกับ FCM/APNs ตรง | ส่งถึงเครื่องได้จากเซิร์ฟเวอร์ลูกค้า (มี outbound internet), สรุปเรื่อง PDPA กับต้นทุน | เลือก FCM ตรง |
| S4 | IP ของ Wi-Fi check-in บนโดเมนสาธารณะ | ยืนยันกับเซิร์ฟเวอร์ทดสอบว่า Caddy เห็น public egress IP ของออฟฟิศ และกรณี hairpin NAT สำหรับ server on-prem ว่าเห็นอะไร | เขียนข้อจำกัดลง SOW / คู่มือ |
| S5 | Deep link `gohr://pair` + การสแกน QR ด้วยกล้องระบบ | กล้องระบบเปิดแอปได้ หรือใช้ตัวสแกนในแอปแทน | ใช้ตัวสแกนในแอปอย่างเดียว |
| S6 | App Store review ของแอปที่ต้องจับคู่เซิร์ฟเวอร์ก่อนใช้ | มีเซิร์ฟเวอร์เดโม่ถาวร + บัญชีเดโม่สำหรับ reviewer ตามแนวทางของ Apple | เพิ่มโหมดเดโม่ในแอป |

ผลลัพธ์ของ Phase 0 ต้องบันทึกไว้ใน `docs/specs/GOHR-130-spike-results.md` และ decision สำคัญลง MEMORY ก่อนเริ่ม Phase 1

### Phase 1 — go-hr 1.3.0 (เรียงตามลำดับที่ควรทำ)
- [ ] `lib/password-login.ts` + refactor `loginAction` ให้ใช้ตัวนี้ (test ว่าพฤติกรรมเว็บเหมือนเดิม)
- [ ] `lib/supabase/bearer.ts` + แก้ `proxy.ts` + `/api/checkin/network` รองรับ Bearer
- [ ] Migration `20261015010000_mobile.sql`: `app.license_has_module`, `device_push_tokens` + RPC, `my_payslips` / `my_payslip`, `record_login(p_note)` แล้ว dry-run แบบ `begin … rollback` **แจ้ง user ก่อนรันจริงทุกครั้ง**
- [ ] `/api/mobile/config`, `/api/mobile/login`
- [ ] `/api/mobile/face` (ขึ้นกับผล S1) + ปรับ `next.config.ts` / Dockerfile
- [ ] Card QR ในหน้า ตั้งค่า → License + `GOHR_PUBLIC_URL` ใน `deploy/` และ `docs/INSTALL.md`
- [ ] Unit tests + `npm run typecheck` + `npm run lint` + `next build`
- [ ] `lib/changelog.ts` 1.3.0, อัปเดต `docs/FEATURES.md` (แถว Mobile Application)
- [ ] Deploy to staging
- [ ] QA testing (integration + manual ตามหัวข้อ 8)
- [ ] ออก license ทดสอบที่มี `modules: ["professional","mobile"]` (`npm run license:issue`) สำหรับ staging
- [ ] Client review (ลูกค้านำร่อง)
- [ ] Deploy to production (ต้องได้ approval ก่อน)
- [ ] Monitor for 48h (Sentry error ของ `/api/mobile/*`, latency ของ face, จำนวน 503 `BUSY`)

## 10. Open Questions

- [ ] **Ticket ID จริง** และราคา add-on / MA ของ mobile (ส่ง @sales กับ @project-owner)
- [ ] ตัวให้บริการ push: Expo Push Service (ง่าย แต่ข้อความผ่าน Expo) หรือ FCM/APNs ตรง (ต้องดูแล key ต่อแอปเอง) รอผล S3
- [ ] รองรับการลงทะเบียนใบหน้าด้วยตัวเองจากแอปเมื่อ `allow_self_face_enroll = true` หรือไม่ (ต้องมี `POST /api/mobile/face/enroll` และ trigger guard เดิมรองรับอยู่แล้ว)
- [ ] ถ้า S1(a) ไม่ผ่าน ลูกค้าที่ enroll ใบหน้าผ่านเว็บไว้แล้วต้อง enroll ใหม่ทั้งหมด ใครรับภาระและคิดเงินไหม
- [ ] บัญชีที่ไม่ผูกพนักงาน (admin ล้วน) ควรถูกปฏิเสธที่ `/api/mobile/login` (`403 NO_EMPLOYEE`) หรือให้เข้าได้แต่ใช้งานไม่ได้
- [ ] per-IP throttle 30 ครั้ง / 5 นาที จะไม่พอในวัน rollout ที่ทุกคนล็อกอินจาก Wi-Fi ออฟฟิศ (IP เดียว) หรือจาก CGNAT ของค่ายมือถือ (R4) จะเพิ่ม limit หรือเปลี่ยน key เป็น IP + login
- [ ] ออฟฟิศที่ใช้ public IP แบบ dynamic: ตัดวิธี Wi-Fi ทิ้งไปเลย หรือแนะนำให้ซื้อ fixed IP (R3, ต้องเขียนใน SOW)
- [ ] เวอร์ชัน iOS / Android ขั้นต่ำที่รองรับ
- [ ] นโยบาย `min_app_version`: ใครเป็นคนปรับ และปรับที่ env ของแต่ละ server หรือที่ config กลางของ GoAlong
- [ ] Liveness detection: ยอมรับความเสี่ยงไปก่อนเหมือน PWA หรือต้องมีตั้งแต่ MVP สำหรับลูกค้าบางกลุ่ม

### Risks

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| R1 | descriptor จาก server ไม่ตรงกับที่เบราว์เซอร์ enroll ไว้ | face check-in ใช้ไม่ได้กับข้อมูลเดิม | S1(a), แผน re-enroll |
| R2 | WASM inference ช้าในช่วงพีคเช้า | เว็บทั้งระบบช้าตาม | semaphore + 503 `BUSY`, S1(c), fallback tfjs-node |
| R3 | IP ที่ใช้ Wi-Fi check-in เป็น public IP ของออฟฟิศ | check-in ผ่าน Wi-Fi ใช้ไม่ได้ถ้า IP เปลี่ยน | S4, เขียนลง SOW, ใช้ GPS / QR แทน |
| R4 | per-IP throttle ชนกันเมื่อหลายคนใช้ IP เดียว | ล็อกอินไม่ได้ในวัน rollout | Open question ข้อ throttle |
| R5 | App Store reject เพราะ reviewer ทดสอบแอปไม่ได้ | เลื่อน launch | S6, เซิร์ฟเวอร์เดโม่ถาวร |
| R6 | ข้อความ push ไปถึงบุคคลภายนอก | PDPA | payload ทั่วไป ไม่มีข้อมูลส่วนบุคคล |
