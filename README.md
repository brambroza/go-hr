# GO HR — ระบบบริหารงานบุคคล ลงเวลา และเงินเดือน (ซื้อขาด ติดตั้งที่ลูกค้า)

โดย บริษัท โกอะลอง จำกัด (GO Along Co., Ltd.)

ระบบ HR ครบวงจรสำหรับบริษัทไทย ฟังก์ชันเทียบเท่าหรือมากกว่าระบบ HR แบบ SaaS ชั้นนำในตลาด
(ดูตารางฟีเจอร์ [docs/FEATURES.md](docs/FEATURES.md)) แต่ขายครั้งเดียวและติดตั้งบนเซิร์ฟเวอร์ของลูกค้า

- **หลังบ้าน HR (Desktop)** — โครงสร้างองค์กร 10 ชั้น, ข้อมูลพนักงานครบทุกหมวด, ลงเวลา/กะ/ผังกำลังพล, เอกสาร 14 ประเภท อนุมัติได้ 10 ขั้น,
  เงินเดือน (ภาษี/ประกันสังคม/PVD/เงินกู้/คอมมิชชั่น), ภ.ง.ด.1 / 1ก / สปส.1-10 / 50 ทวิ, สรรหา, ทดลองงาน, E-Learning, ประเมินผล/KPI,
  จดหมายเตือน, ประกาศ/News Feed/To-do, Insight, Automation, LINE OA, PDPA, Back Log
- **แอปพนักงาน (Mobile PWA `/m`)** — ลงเวลา GPS / QR / ใบหน้า / Wi-Fi บริษัท / ออฟไลน์, ยื่นลา/OT/เอกสาร, สลิปเงินเดือน, วันลาคงเหลือ,
  ปฏิทิน, อนุมัติ (หัวหน้า), ลงเวลาแทนลูกทีม, เรียนออนไลน์, แบบประเมิน
- **หน้าสมัครงาน (`/careers`)** และ **Kiosk (`/kiosk`)**

## เทคโนโลยี
Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · Supabase (PostgreSQL + Auth + Storage, self-hosted) · Docker

---

## ตัวอย่างหน้าจอ

### หลังบ้าน HR (Desktop)

| แดชบอร์ด | ข้อมูลพนักงาน |
|---|---|
| ![แดชบอร์ด](docs/screenshots/desktop-dashboard.png) | ![ประวัติพนักงาน](docs/screenshots/desktop-employee-profile.png) |

| รายชื่อพนักงาน | ผังองค์กร |
|---|---|
| ![รายชื่อพนักงาน](docs/screenshots/desktop-employees.png) | ![ผังองค์กร](docs/screenshots/desktop-org-chart.png) |

| สรุปเวลารายวัน | ตารางกะ / วันหยุด |
|---|---|
| ![สรุปเวลารายวัน](docs/screenshots/desktop-attendance-daily.png) | ![ตารางกะ](docs/screenshots/desktop-roster.png) |

| โควต้าการลา | เอกสารและอนุมัติ |
|---|---|
| ![โควต้าการลา](docs/screenshots/desktop-leave-quotas.png) | ![เอกสาร](docs/screenshots/desktop-requests.png) |

| เงินเดือน | รายงานราชการ (ภ.ง.ด.1 / สปส. / 50 ทวิ) |
|---|---|
| ![เงินเดือน](docs/screenshots/desktop-payroll.png) | ![รายงาน](docs/screenshots/desktop-reports.png) |

| พื้นที่ลงเวลา (GPS / Wi-Fi / QR) | ย้ายข้อมูลจากระบบเดิม (9 ขั้น) |
|---|---|
| ![พื้นที่ลงเวลา](docs/screenshots/desktop-locations.png) | ![ย้ายข้อมูล](docs/screenshots/desktop-migration.png) |

| ผู้ใช้งานและสิทธิ์ | หน้าสมัครงาน (สาธารณะ) |
|---|---|
| ![ผู้ใช้งาน](docs/screenshots/desktop-users.png) | ![สมัครงาน](docs/screenshots/desktop-careers.png) |

### แอปพนักงาน (Mobile PWA)

<p>
  <img src="docs/screenshots/mobile-home.png" width="180" alt="หน้าแรก">
  <img src="docs/screenshots/mobile-checkin.png" width="180" alt="ลงเวลา GPS">
  <img src="docs/screenshots/mobile-request-new.png" width="180" alt="ยื่นใบลา">
  <img src="docs/screenshots/mobile-leave.png" width="180" alt="วันลาคงเหลือ">
</p>
<p>
  <img src="docs/screenshots/mobile-calendar.png" width="180" alt="ปฏิทิน">
  <img src="docs/screenshots/mobile-approvals.png" width="180" alt="อนุมัติ (หัวหน้า)">
  <img src="docs/screenshots/mobile-more.png" width="180" alt="เมนูเพิ่มเติม">
</p>

---

## วิธีใช้งาน — หลังบ้าน HR (Desktop)

เข้าใช้งานที่ `https://<โดเมน>/login` ด้วยชื่อผู้ใช้ + รหัสผ่าน (ผู้ดูแลระบบ / HR / เงินเดือน / หัวหน้า ตามกลุ่มสิทธิ์ที่ตั้งไว้)

![เข้าสู่ระบบ](docs/screenshots/desktop-login.png)

### เมนูหลัก (แถบซ้าย)

| เมนู | ใช้ทำอะไร |
|---|---|
| **ภาพรวม** | แดชบอร์ด (พนักงาน ลงเวลาวันนี้ ลา สาย เอกสารรออนุมัติ) · Insight วิเคราะห์ข้อมูล |
| **องค์กร** | สาขา · โครงสร้างองค์กร (ผัง + รายการ) · ตำแหน่ง · เส้นทางเติบโต · การเคลื่อนไหว (โยกย้าย/ปรับเงินเดือน) · ระเบียบบริษัท |
| **พนักงาน** | ประวัติพนักงานทุกหมวด (ส่วนตัว การจ้าง เงินเดือน ธนาคาร ครอบครัว การศึกษา ลดหย่อนภาษี กองทุน เอกสาร) · นำเข้าจาก CSV |
| **เวลาทำงาน** | สรุปเวลารายวัน · บันทึกเวลา (Raw) · ตารางกะ/วันหยุด · ผังกำลังพล · กะการทำงาน · วันหยุดประจำปี · พื้นที่ลงเวลา · อุปกรณ์ลงเวลา · นำเข้าเวลา |
| **เอกสารและอนุมัติ** | รออนุมัติ · เอกสารทั้งหมด · ปฏิทินการทำงาน · โควต้าการลา · ประเภทการลา · ลำดับขั้นการอนุมัติ · ประเภทเอกสาร |
| **เงินเดือน** | งวดเงินเดือน (คำนวณ ตรวจ ปิดงวด) · รายการเงินได้/เงินหัก · เงินกู้ · โครงสร้างเงินเดือน · ไฟล์โอนเงินธนาคาร |
| **รายงาน** | สรุปเวลา · ลา · กำลังคน · สรุปเงินเดือน · ภ.ง.ด.1 / 1ก · สปส.1-10 · หนังสือรับรอง 50 ทวิ (ไฟล์ตามรูปแบบราชการ) |
| **สรรหาและทดลองงาน** | ประกาศรับสมัคร · ผู้สมัคร · นัดสัมภาษณ์ · รับเข้าทำงาน · ประเมินทดลองงาน |
| **เรียนรู้และฝึกอบรม / ประเมินผล** | คอร์สออนไลน์ · ตารางอบรม · แบบประเมิน · KPI · จดหมายเตือน |
| **สื่อสารและงาน** | ประกาศ · News Feed · To-do · ไดเรกทอรีพนักงาน |
| **ตั้งค่า** | ข้อมูลบริษัท · ผู้ใช้งานและกลุ่มสิทธิ์ · กติกาเวลา/เงินเดือน/ภาษี · รูปแบบไฟล์ · งานอัตโนมัติ · Automation/LINE · License · Audit log · **ย้ายข้อมูลเข้าระบบ** |
| **ช่วยเหลือ** | คู่มือในระบบ + ช่องทางติดต่อทีมดูแล |

### ลำดับการตั้งค่าครั้งแรก (ทำครั้งเดียว)
1. **ตั้งค่า → ข้อมูลบริษัท** — ชื่อ โลโก้ เลขผู้เสียภาษี ที่อยู่
2. **องค์กร** — สาขา (เลขสาขาภาษี / เลขบัญชีนายจ้าง สปส.) → โครงสร้างองค์กร → ตำแหน่ง
   (หรือนำเข้าทีเดียวจาก CSV ที่ **ตั้งค่า → ย้ายข้อมูลเข้าระบบ** ดูไฟล์ตัวอย่างใน [samples/import/](samples/import/))
3. **เวลาทำงาน** — กะการทำงาน, วันหยุดประจำปี, พื้นที่ลงเวลา (พิกัด GPS + รัศมี / ช่วง IP Wi-Fi / พิมพ์ QR)
   - กำหนดพื้นที่ **ตามหน่วยงาน** ได้ที่ โครงสร้างองค์กร → แก้ไขหน่วยงาน → "พื้นที่ลงเวลาของหน่วยงาน"
     เลือก "กำหนดพื้นที่" (ติ๊กจุดที่อนุญาต, หน่วยงานลูกสืบทอดอัตโนมัติ) หรือ "ไม่จำกัดพื้นที่" สำหรับฝ่ายขาย/งานนอกสถานที่
4. **พนักงาน → นำเข้าพนักงาน (CSV)** แล้ว **ตั้งค่า → ผู้ใช้งาน → "สร้างบัญชีให้พนักงานที่ยังไม่มีบัญชี"**
   (ชื่อผู้ใช้ = รหัสพนักงาน, รหัสผ่านเริ่มต้น = วันเกิด ววดดปปปป หรือกำหนดเอง, บังคับเปลี่ยนเมื่อเข้าครั้งแรก)
5. **เอกสารและอนุมัติ → ประเภทการลา** ปรับสิทธิ์ต่อปีตามระเบียบบริษัท → **โควต้าการลา → "สร้างโควต้าประจำปี"**
6. **ตั้งค่า → กติกาเวลา/เงินเดือน/ภาษี** — ตัวหารรายวัน การหักสาย บัญชีธนาคารบริษัท
7. ย้ายยอดสะสมต้นปีและวันลาคงเหลือจากระบบเดิม (ถ้าเริ่มกลางปี) ที่ **ตั้งค่า → ย้ายข้อมูลเข้าระบบ**

### งานประจำ
- **ทุกวัน** — ตรวจ "สรุปเวลารายวัน" (สาย ขาด ลืมสแกน), อนุมัติเอกสารที่ "รออนุมัติ"
- **ทุกเดือน** — เงินเดือน → สร้างงวด → คำนวณ → ตรวจ → ปิดงวด → ส่งสลิปเข้าแอปพนักงาน → ไฟล์โอนเงินธนาคาร → ภ.ง.ด.1 / สปส.1-10
- **ต้นปี** — ระบบสร้างโควต้าวันลาใหม่และยกยอดให้อัตโนมัติ (งานอัตโนมัติ `leave_rollover`) · ออก 50 ทวิ

---

## วิธีใช้งาน — แอปพนักงาน (Mobile / PWA)

ไม่ต้องติดตั้งจาก App Store / Play Store เปิดผ่านเบราว์เซอร์แล้ว "เพิ่มลงหน้าจอหลัก" จะได้ไอคอนและใช้งานเหมือนแอปจริง
อัปเดตอัตโนมัติพร้อมเซิร์ฟเวอร์ และใช้ลงเวลาตอนไม่มีเน็ตได้ (ซิงก์ให้เองภายใน 72 ชม.)

> ต้องเปิดผ่าน **HTTPS** เท่านั้น มือถือจะไม่อนุญาตให้ใช้ GPS / กล้องบนเว็บที่ไม่ใช่ HTTPS (ตัวติดตั้งตั้งค่าให้แล้ว)

### 1. เข้าสู่ระบบ
เปิด `https://<โดเมน>/m` ใส่ **รหัสพนักงาน** (เช่น `T001`) และรหัสผ่านที่ HR แจ้ง ครั้งแรกระบบจะให้ตั้งรหัสผ่านใหม่

### 2. ติดตั้งเป็นแอป (PWA)
| iPhone / iPad (Safari) | Android (Chrome) |
|---|---|
| เปิด `/m` → กดปุ่ม **แชร์** (สี่เหลี่ยมมีลูกศรขึ้น) → **เพิ่มลงหน้าจอโฮม** → เพิ่ม | เปิด `/m` → เมนู **⋮** มุมขวาบน → **ติดตั้งแอป** (หรือ "เพิ่มไปยังหน้าจอหลัก") → ติดตั้ง |

หลังติดตั้งจะมีไอคอน "GO HR" บนหน้าจอ เปิดแล้วเข้าหน้า `/m` ทันทีแบบเต็มจอ (ไม่มีแถบเบราว์เซอร์)

### 3. เมนูล่าง 5 แท็บ
| แท็บ | ใช้ทำอะไร |
|---|---|
| **หน้าแรก** | สถานะวันนี้ (กะ เวลาเข้า-ออก) ปุ่มลงเวลา ทางลัดส่งใบลา/ขอโอที วันลาคงเหลือ ประกาศ |
| **ลงเวลา** | เลือกวิธี **GPS** (ต้องอยู่ในรัศมีจุดลงเวลา) · **สแกน QR** (โปสเตอร์ประจำจุด หรือ QR หมุนจาก Kiosk) · **สแกนใบหน้า** (ตรวจกะพริบตา) · **Wi-Fi บริษัท** (ต่อ Wi-Fi ออฟฟิศ) — เลือกประเภท เข้างาน/ออกงาน/พักเบรค หรือ "อัตโนมัติ" · ถ่ายรูปยืนยันถ้าจุดนั้นกำหนด · ออฟไลน์ก็กดได้ ระบบจะเก็บไว้แล้วส่งเมื่อมีเน็ต |
| **ยื่นเอกสาร** | ส่งใบลา (เห็นวันคงเหลือทุกประเภท) · ขอโอที · ขอเพิ่มเวลา (ลืมสแกน) · เปลี่ยนกะ/วันหยุด · เบิกเงินล่วงหน้า · สวัสดิการ · หนังสือรับรอง · ลาออก ฯลฯ (14 ประเภท) แนบไฟล์ได้ ติดตามสถานะการอนุมัติทีละขั้น |
| **สลิป** | สลิปเงินเดือนทุกงวด ดูรายละเอียดเงินได้/เงินหัก และพิมพ์เป็น PDF |
| **เมนู** | วันลาคงเหลือ · ปฏิทิน/กะของฉัน (วางแผนกะเองได้ถ้าเปิดสิทธิ์) · เส้นทางเติบโต · เรียนออนไลน์ · แบบประเมิน · ระเบียบบริษัท · โปรไฟล์ · ผูก LINE |

### 4. สำหรับหัวหน้างาน
- แท็บ **อนุมัติ** (`/m/approvals`) — อนุมัติ/ไม่อนุมัติใบลา โอที เอกสารของลูกทีม พร้อมดูวันลาคงเหลือของคนนั้น
- **ทีมของฉัน** (`/m/team`) — ดูใครมา/สาย/ลา วันนี้ และ **ลงเวลาแทนลูกทีม** (พร้อมรูป + GPS)
- ประเมินพนักงานทดลองงานผ่านมือถือเมื่อระบบแจ้งเตือน

### 5. ใช้ผ่าน LINE (ถ้าเปิดใช้)
ผูกบัญชี LINE ที่ เมนู → ผูก LINE (รหัส 6 หลัก) แล้วจะได้รับแจ้งเตือนทาง LINE
แนะนำให้ HR ตั้ง Rich Menu ของ LINE OA ลิงก์ไป `https://<โดเมน>/m/checkin` (ลงเวลา) และ `https://<โดเมน>/m/requests/new` (ยื่นลา)

---

## การติดตั้ง

### A. ติดตั้งที่เซิร์ฟเวอร์ลูกค้า (Production)
ใช้เวลา 20–30 นาที รายละเอียดเต็มใน [docs/INSTALL.md](docs/INSTALL.md)

**เครื่อง:** Ubuntu Server 22.04 / 24.04, 4 vCPU, 8 GB RAM, ดิสก์ 100 GB (รองรับ ~500 คน) + Docker Engine/Compose v2
**โดเมน:** โดเมนสาธารณะชี้มาที่เครื่อง (HTTPS อัตโนมัติด้วย Let's Encrypt) หรือใช้ภายใน LAN ด้วย `--tls internal`

```bash
curl -fsSL https://get.docker.com | sudo sh && sudo apt-get install -y git openssl curl
sudo git clone https://github.com/brambroza/go-hr.git /opt/gohr && cd /opt/gohr
sudo deploy/install.sh \
  --domain hr.customer.co.th \
  --tls it@customer.co.th \
  --admin-email it@customer.co.th \
  --company "บริษัท ลูกค้า จำกัด" \
  --license "<license key>"
```
ตัวติดตั้งจะดาวน์โหลด Supabase, สุ่มรหัสผ่าน/คีย์ทั้งหมด, สร้างตาราง + ข้อมูลตั้งต้น (ประเภทการลาตามกฎหมาย, ประเภทเอกสาร, อัตราภาษี/สปส.),
build และรัน GO HR + ตัวตั้งเวลางานอัตโนมัติ + Caddy (HTTPS) แล้วแสดงรหัสผ่านผู้ดูแลระบบชั่วคราว

หลังติดตั้ง:
- สำรองข้อมูลทุกคืน: `30 1 * * * /opt/gohr/deploy/backup.sh >> /var/log/gohr-backup.log 2>&1` (เก็บ 30 วันที่ `/var/backups/gohr`)
- อัปเกรด: `cd /opt/gohr && sudo git pull && sudo deploy/install.sh --domain <เดิม>` (ปรับฐานข้อมูลเฉพาะส่วนใหม่ ข้อมูลเดิมไม่หาย)
- ดูสถานะ / log: `cd /opt/gohr/deploy && docker compose ps` · `docker compose logs -f app`
- เปิดเฉพาะพอร์ต 80/443 ห้ามเปิด 8000 (Supabase Studio) และ 5432 สู่อินเทอร์เน็ต
- เครื่องสแกนนิ้ว/ใบหน้า: เพิ่มที่ เวลาทำงาน → อุปกรณ์ลงเวลา เพื่อรับ API key แล้ว POST ไป `/api/device/push` หรือนำเข้าไฟล์ ZKTeco/CSV
- Kiosk หน้าทางเข้า: เปิด `https://<โดเมน>/kiosk?key=<api key ของอุปกรณ์ชนิด kiosk>` บนแท็บเล็ต

### B. พัฒนาบนเครื่อง — Supabase ในเครื่อง (Docker)
```bash
npm install
npx supabase start            # ต้องมี Docker Desktop — รัน Supabase ในเครื่อง (migrations + seed.sql อัตโนมัติ)
npx supabase status           # คัดลอก API URL / anon key / service_role key
cp .env.example .env.local    # ใส่ค่า PUBLIC_SUPABASE_URL, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
npm run admin:create -- admin@example.com 'Admin@1234'
# (ข้อมูลตัวอย่างสำหรับเดโม่)
npm run license:install -- "$(npx tsx scripts/license.ts issue --licensee 'Demo' --max 200 | tail -1)"
npm run db:seed-demo && psql "$(npx supabase status -o env | sed -n 's/^DB_URL=//p' | tr -d '\"')" -f scripts/seed-talent-demo.sql && npm run db:seed-demo-finish
npm run dev                   # http://localhost:3000
```
บัญชีเดโม่: `admin / Admin@1234` · `hr / Hr@12345` · `payroll / Pay@12345` · `manager / Mgr@12345` · พนักงาน `E0011 / Emp@12345`

### C. พัฒนาบนเครื่อง — ใช้ Supabase Cloud (ไม่ต้องมี Docker)
```bash
npm install
cp .env.example .env.local
# ใส่ค่าจาก Supabase Dashboard → Project Settings → API:
#   PUBLIC_SUPABASE_URL=https://<ref>.supabase.co   SUPABASE_URL=https://<ref>.supabase.co
#   SUPABASE_ANON_KEY=...   SUPABASE_SERVICE_ROLE_KEY=...
# และ Connection string แบบ Session pooler (Project Settings → Database):
#   DB_URL=postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
DB_URL="$(grep '^DB_URL=' .env.local | cut -d= -f2-)" bash deploy/migrate.sh   # สร้างตาราง + seed (รันซ้ำได้ ใช้ตอนอัปเกรดด้วย)
npm run admin:create -- admin@example.com 'Admin@1234'
npm run db:import-csv -- --org samples/import/0-org-structure.csv --employees samples/import/1-employees.csv   # ข้อมูลทดสอบ 10 คน
npm run users:create-employees                                     # สร้างบัญชี login ให้พนักงานทุกคน (รหัสผ่าน = วันเกิด ววดดปปปป)
npm run dev
```
> ทดสอบแอปมือถือจากโทรศัพท์จริงต้องเป็น HTTPS: `npx next dev --experimental-https` แล้วเปิด `https://<IP เครื่อง>:3000/m`
> หรือใช้ Chrome DevTools โหมดจำลองมือถือ (override ตำแหน่ง GPS ได้)

### คำสั่งที่ใช้บ่อย
| คำสั่ง | ใช้ทำอะไร |
|---|---|
| `npm run dev` / `npm run build` / `npm start` | พัฒนา / build / รัน production |
| `npm test` · `npm run typecheck` · `npm run lint` | unit tests (ภาษี ประกันสังคม เงินเดือน เวลาทำงาน cron license นโยบายลงเวลา date picker) · ตรวจ type · lint |
| `npm run admin:create -- <email> <password> [ชื่อ] [username]` | สร้าง/รีเซ็ตผู้ดูแลระบบ |
| `npm run users:create-employees [-- --password X --codes T001,T002 --no-must-change]` | สร้างบัญชี login ให้พนักงานที่ยังไม่มี |
| `npm run db:import-csv -- --org a.csv --employees b.csv [--dry-run]` | นำเข้าสาขา/หน่วยงาน/ตำแหน่ง และพนักงานจาก CSV (รูปแบบเดียวกับหน้านำเข้าในระบบ) |
| `npm run db:seed-demo` | ข้อมูลเดโม่โรงงานตัวอย่าง ~45 คน |
| `npm run license:issue -- --licensee "ชื่อ" --max 200` · `npm run license:install -- <key>` | ออก / ติดตั้ง License (ตรวจออฟไลน์ Ed25519) |
| `deploy/migrate.sh` · `deploy/backup.sh` | ปรับฐานข้อมูล · สำรองข้อมูล |

---

## เอกสาร
- [docs/INSTALL.md](docs/INSTALL.md) — ติดตั้ง ตั้งค่าหลังติดตั้ง สำรองข้อมูล อัปเกรด License
- [docs/FEATURES.md](docs/FEATURES.md) — ตารางฟีเจอร์ทั้งหมด เทียบกับระบบ HR แบบ SaaS ทั่วไป
- [docs/GOV-BANK-FILES.md](docs/GOV-BANK-FILES.md) — รูปแบบไฟล์ ภ.ง.ด.1 / สปส. / ธนาคาร
- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) — โครงสร้างโค้ด กติกาการพัฒนา สิทธิ์ และฐานข้อมูล
- [samples/import/README.md](samples/import/README.md) — ไฟล์ตัวอย่างสำหรับนำเข้าข้อมูล
