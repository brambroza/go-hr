# GO HR — ระบบบริหารงานบุคคล ลงเวลา และเงินเดือน (ซื้อขาด ติดตั้งที่ลูกค้า)

โดย บริษัท โกอะลอง จำกัด (GO Along Co., Ltd.)

ระบบ HR ครบวงจรสำหรับบริษัทไทย ฟังก์ชันเทียบเท่าหรือมากกว่า HumanSoft แพ็กเกจ PROFESSIONAL
(ดูตารางเปรียบเทียบ [docs/FEATURES.md](docs/FEATURES.md)) แต่ขายครั้งเดียวและติดตั้งบนเซิร์ฟเวอร์ของลูกค้า

- **หลังบ้าน HR** — โครงสร้างองค์กร 10 ชั้น, ข้อมูลพนักงานครบทุกหมวด, ลงเวลา/กะ/ผังกำลังพล, เอกสาร 14 ประเภท อนุมัติได้ 10 ขั้น,
  เงินเดือน (ภาษี/ประกันสังคม/PVD/เงินกู้/คอมมิชชั่น), ภ.ง.ด.1 / 1ก / สปส.1-10 / 50 ทวิ, สรรหา, ทดลองงาน, E-Learning, ประเมินผล/KPI,
  จดหมายเตือน, ประกาศ/News Feed/To-do, Insight, Automation, LINE OA, PDPA, Back Log
- **แอปพนักงาน (PWA `/m`)** — ลงเวลา GPS / QR / ใบหน้า / Wi-Fi บริษัท / ออฟไลน์, ยื่นลา/OT/เอกสาร, สลิปเงินเดือน, วันลาคงเหลือ,
  ปฏิทิน, อนุมัติ (หัวหน้า), ลงเวลาแทนลูกทีม, เรียนออนไลน์, แบบประเมิน
- **หน้าสมัครงาน (`/careers`)** และ **Kiosk (`/kiosk`)**

## เทคโนโลยี
Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · Supabase (PostgreSQL + Auth + Storage, self-hosted) · Docker

## เริ่มพัฒนาบนเครื่อง (MacBook)
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

คำสั่งอื่น: `npm test` (unit tests: ภาษี ประกันสังคม เงินเดือน เวลาทำงาน cron license) · `npm run typecheck` · `npm run lint` · `npm run build`

## ติดตั้งที่ลูกค้า
ดู [docs/INSTALL.md](docs/INSTALL.md) — สรุป: `sudo deploy/install.sh --domain hr.customer.co.th --admin-email it@customer.co.th --license <key>`

## เอกสาร
- [docs/FEATURES.md](docs/FEATURES.md) — เทียบฟีเจอร์กับ HumanSoft PROFESSIONAL
- [docs/INSTALL.md](docs/INSTALL.md) — ติดตั้ง สำรองข้อมูล อัปเกรด License
- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) — โครงสร้างโค้ด กติกาการพัฒนา สิทธิ์ และฐานข้อมูล
