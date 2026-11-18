import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Check, ChevronDown, Fingerprint, MapPin, QrCode, ScanFace, ShieldCheck, Sparkles, Wallet, Wifi } from "lucide-react";
import { COMPARISON, FAQ, FEATURE_BLOCKS, STEPS } from "@/lib/marketing/landing-content";

const BTN_PRIMARY =
  "inline-flex h-12 items-center justify-center gap-2 rounded-[var(--radius-ctl)] bg-jade-600 px-6 font-semibold text-white shadow-soft hover:bg-jade-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-jade-600";
const BTN_GHOST =
  "inline-flex h-12 items-center justify-center gap-2 rounded-[var(--radius-ctl)] border border-line bg-white px-6 font-semibold text-ink hover:bg-paper";

const CHECKIN_METHODS = [
  { icon: MapPin, label: "GPS" },
  { icon: QrCode, label: "QR Code" },
  { icon: ScanFace, label: "สแกนใบหน้า" },
  { icon: Wifi, label: "Wi-Fi บริษัท" },
  { icon: Fingerprint, label: "เครื่องสแกนนิ้ว" },
];

/**
 * Public marketing landing page — server rendered so crawlers get the full text without running JavaScript.
 * One <h1>, one <h2> per section, real anchors for in-page navigation, no client components.
 */
export function LandingPage({ contactLine }: { contactLine?: string }) {
  return (
    <div className="min-h-dvh bg-white text-ink">
      <header className="sticky top-0 z-30 border-b border-line bg-white/90 backdrop-blur">
        <nav aria-label="เมนูหลัก" className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4">
          <Link href="/" className="flex items-center gap-2.5" aria-label="GO HR หน้าแรก">
            <span className="grid size-9 place-items-center rounded-lg bg-jade-500 font-semibold text-white">HR</span>
            <span className="font-semibold">GO HR</span>
          </Link>
          <ul className="hidden items-center gap-6 text-sm text-ink-soft md:flex">
            <li><a href="#features" className="hover:text-ink">ฟีเจอร์</a></li>
            <li><a href="#compare" className="hover:text-ink">เปรียบเทียบ</a></li>
            <li><a href="#start" className="hover:text-ink">เริ่มใช้งาน</a></li>
            <li><a href="#faq" className="hover:text-ink">คำถามที่พบบ่อย</a></li>
          </ul>
          <div className="ml-auto flex items-center gap-2">
            <Link href="/login" className="hidden h-10 items-center rounded-[var(--radius-ctl)] px-3 text-sm font-medium text-ink-soft hover:text-ink sm:inline-flex">
              เข้าสู่ระบบ
            </Link>
            <Link href="/trial" className="inline-flex h-10 items-center rounded-[var(--radius-ctl)] bg-jade-600 px-4 text-sm font-semibold text-white hover:bg-jade-700">
              ทดลองใช้ฟรี
            </Link>
          </div>
        </nav>
      </header>

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden border-b border-line bg-gradient-to-b from-jade-50 via-white to-white">
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 lg:grid-cols-[1.05fr_1fr] lg:py-20">
            <div>
              <p className="inline-flex items-center gap-1.5 rounded-full border border-jade-200 bg-white px-3 py-1 text-sm font-medium text-jade-800">
                <Sparkles className="size-4" aria-hidden /> ซื้อขาดครั้งเดียว ไม่คิดรายหัว
              </p>
              <h1 className="mt-5 text-4xl font-semibold leading-[1.2] tracking-tight sm:text-5xl">
                โปรแกรม HR ลงเวลา <span className="whitespace-nowrap">และเงินเดือน</span>
                <span className="block text-jade-700">ครบตามกฎหมายไทย</span>
              </h1>
              <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-soft">
                GO HR รวมระบบลงเวลาผ่านมือถือ ลา โอที อนุมัติเอกสาร และคำนวณเงินเดือน ภาษี ประกันสังคม ไว้ในที่เดียว
                ติดตั้งบนเซิร์ฟเวอร์ของบริษัทคุณ ข้อมูลพนักงานเป็นของคุณ 100%
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link href="/trial" className={BTN_PRIMARY}>
                  ขอทดลองใช้ฟรี <ArrowRight className="size-4" aria-hidden />
                </Link>
                <a href="#features" className={BTN_GHOST}>ดูฟีเจอร์ทั้งหมด</a>
              </div>
              <ul className="mt-8 grid gap-2 text-sm text-ink-soft sm:grid-cols-2">
                {["ภ.ง.ด.1, สปส.1-10, 50 ทวิ ในระบบ", "อนุมัติบนมือถือได้ถึง 10 ขั้น", "ใช้เครื่องสแกนนิ้วเดิมต่อได้", "อบรมและคู่มือภาษาไทย"].map((t) => (
                  <li key={t} className="flex items-center gap-2">
                    <Check className="size-4 shrink-0 text-jade-600" aria-hidden /> {t}
                  </li>
                ))}
              </ul>
            </div>
            <div className="relative">
              <Image
                src="/landing/dashboard.png"
                alt="หน้าแดชบอร์ด GO HR แสดงจำนวนพนักงาน การลงเวลา การลา และอัตราลาออก"
                width={1440}
                height={900}
                priority
                sizes="(min-width: 1024px) 560px, 100vw"
                className="w-full rounded-[var(--radius-panel)] border border-line shadow-pop"
              />
              <Image
                src="/landing/mobile-checkin.png"
                alt="แอปพนักงาน GO HR หน้าลงเวลาเข้างานด้วย GPS, QR, สแกนใบหน้า และ Wi-Fi"
                width={780}
                height={1688}
                sizes="160px"
                className="absolute -bottom-10 -right-2 hidden w-28 rounded-2xl border-4 border-white shadow-pop sm:block lg:-right-6 lg:w-32"
              />
            </div>
          </div>
        </section>

        {/* Check-in methods strip */}
        <section aria-labelledby="checkin-methods" className="border-b border-line bg-white">
          <div className="mx-auto max-w-6xl px-4 py-8">
            <h2 id="checkin-methods" className="text-center text-sm font-medium text-ink-mute">
              ลงเวลาได้ทุกรูปแบบ ทั้งออฟฟิศ โรงงาน หน้าร้าน และพนักงานภาคสนาม
            </h2>
            <ul className="mt-5 flex flex-wrap justify-center gap-3">
              {CHECKIN_METHODS.map((m) => (
                <li key={m.label} className="flex items-center gap-2 rounded-full border border-line bg-paper px-4 py-2 text-sm font-medium">
                  <m.icon className="size-4 text-jade-700" aria-hidden /> {m.label}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Features */}
        <section id="features" aria-labelledby="features-title" className="scroll-mt-20 bg-paper">
          <div className="mx-auto max-w-6xl px-4 py-16 lg:py-20">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold text-jade-700">ฟีเจอร์</p>
              <h2 id="features-title" className="mt-2 text-3xl font-semibold tracking-tight">ระบบบริหารงานบุคคลครบในชุดเดียว</h2>
              <p className="mt-3 text-ink-soft">ทุกโมดูลรวมในราคาเดียว HR ทำงานในเบราว์เซอร์ พนักงานและหัวหน้าใช้ผ่านมือถือ</p>
            </div>
            <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {FEATURE_BLOCKS.map((f) => (
                <article key={f.id} id={f.id} className="scroll-mt-20 rounded-[var(--radius-panel)] border border-line bg-white p-6 shadow-soft">
                  <h3 className="text-lg font-semibold">{f.title}</h3>
                  <p className="mt-2 text-sm text-ink-soft">{f.lead}</p>
                  <ul className="mt-4 space-y-2 text-sm">
                    {f.points.map((p) => (
                      <li key={p} className="flex gap-2">
                        <Check className="mt-0.5 size-4 shrink-0 text-jade-600" aria-hidden />
                        <span>{p}</span>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Comparison */}
        <section id="compare" aria-labelledby="compare-title" className="scroll-mt-20 bg-white">
          <div className="mx-auto max-w-6xl px-4 py-16 lg:py-20">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold text-jade-700">เปรียบเทียบ</p>
              <h2 id="compare-title" className="mt-2 text-3xl font-semibold tracking-tight">GO HR เทียบกับโปรแกรม HR แบบรายเดือน</h2>
              <p className="mt-3 text-ink-soft">จ่ายครั้งเดียว ใช้ได้ทุกโมดูล ไม่มีค่าใช้จ่ายเพิ่มเมื่อจำนวนพนักงานเพิ่ม</p>
            </div>
            <div className="mt-8 overflow-x-auto rounded-[var(--radius-panel)] border border-line">
              <table className="w-full min-w-[640px] text-left text-sm">
                <caption className="sr-only">เปรียบเทียบ GO HR กับระบบ HR แบบ SaaS รายเดือน</caption>
                <thead className="bg-paper text-ink-soft">
                  <tr>
                    <th scope="col" className="px-5 py-3 font-medium">หัวข้อ</th>
                    <th scope="col" className="px-5 py-3 font-medium">ระบบ HR รายเดือนทั่วไป</th>
                    <th scope="col" className="px-5 py-3 font-semibold text-jade-800">GO HR</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {COMPARISON.map(([topic, saas, gohr]) => (
                    <tr key={topic}>
                      <th scope="row" className="px-5 py-4 font-medium">{topic}</th>
                      <td className="px-5 py-4 text-ink-soft">{saas}</td>
                      <td className="bg-jade-50/50 px-5 py-4 font-medium text-ink">{gohr}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Highlights */}
        <section aria-labelledby="highlight-title" className="border-y border-line bg-jade-950 text-white">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-14 md:grid-cols-3">
            <h2 id="highlight-title" className="sr-only">จุดเด่นของ GO HR</h2>
            {[
              { icon: Wallet, title: "เงินเดือนจบในหน้าเดียว", body: "ปิดเวลา คำนวณ อนุมัติ ไฟล์ธนาคาร สลิป ยื่นแบบ พร้อมเตือนกำหนดส่ง" },
              { icon: ShieldCheck, title: "PDPA ตั้งแต่ฐานข้อมูล", body: "ปิดบังข้อมูลอ่อนไหว บันทึกผู้ดู สิทธิ์ตามหน่วยงานถึงระดับแถวข้อมูล" },
              { icon: ScanFace, title: "กันลงเวลาแทนกัน", body: "สแกนใบหน้าพร้อมตรวจคนจริง QR เปลี่ยนทุก 30 วินาที GPS ตรวจที่เซิร์ฟเวอร์" },
            ].map((h) => (
              <div key={h.title} className="flex gap-4">
                <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-white/10 text-jade-300">
                  <h.icon className="size-5" aria-hidden />
                </span>
                <div>
                  <h3 className="font-semibold">{h.title}</h3>
                  <p className="mt-1 text-sm text-white/75">{h.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Getting started */}
        <section id="start" aria-labelledby="start-title" className="scroll-mt-20 bg-white">
          <div className="mx-auto max-w-6xl px-4 py-16 lg:py-20">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold text-jade-700">เริ่มใช้งาน</p>
              <h2 id="start-title" className="mt-2 text-3xl font-semibold tracking-tight">เริ่มใช้ GO HR ใน 4 ขั้นตอน</h2>
            </div>
            <ol className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((s, i) => (
                <li key={s.title} className="rounded-[var(--radius-panel)] border border-line p-6">
                  <span className="grid size-9 place-items-center rounded-full bg-jade-100 font-semibold text-jade-800">{i + 1}</span>
                  <h3 className="mt-4 font-semibold">{s.title}</h3>
                  <p className="mt-2 text-sm text-ink-soft">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* FAQ — native <details> so answers are in the HTML and work without JavaScript */}
        <section id="faq" aria-labelledby="faq-title" className="scroll-mt-20 bg-paper">
          <div className="mx-auto max-w-3xl px-4 py-16 lg:py-20">
            <h2 id="faq-title" className="text-center text-3xl font-semibold tracking-tight">คำถามที่พบบ่อย</h2>
            <div className="mt-10 divide-y divide-line rounded-[var(--radius-panel)] border border-line bg-white">
              {FAQ.map((f) => (
                <details key={f.q} className="group px-6 py-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium [&::-webkit-details-marker]:hidden">
                    <h3>{f.q}</h3>
                    <ChevronDown className="size-5 shrink-0 text-ink-mute transition-transform group-open:rotate-180" aria-hidden />
                  </summary>
                  <p className="mt-3 text-sm leading-relaxed text-ink-soft">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section aria-labelledby="cta-title" className="bg-white">
          <div className="mx-auto max-w-6xl px-4 py-16">
            <div className="rounded-[1.25rem] bg-gradient-to-br from-jade-600 to-jade-800 px-6 py-12 text-center text-white sm:px-12">
              <h2 id="cta-title" className="text-3xl font-semibold tracking-tight">ลองใช้ GO HR กับบริษัทของคุณ</h2>
              <p className="mx-auto mt-3 max-w-xl text-white/85">
                เข้าระบบตัวอย่างได้ทันทีหลังกรอกแบบฟอร์ม และนัดทีมงานทำระบบทดลองด้วยข้อมูลบริษัทของคุณ 30 วัน
              </p>
              <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                <Link href="/trial" className="inline-flex h-12 items-center justify-center gap-2 rounded-[var(--radius-ctl)] bg-white px-6 font-semibold text-jade-800 hover:bg-jade-50">
                  ขอทดลองใช้ฟรี <ArrowRight className="size-4" aria-hidden />
                </Link>
                {contactLine && (
                  <span className="inline-flex h-12 items-center justify-center rounded-[var(--radius-ctl)] border border-white/40 px-6 font-semibold">
                    LINE {contactLine}
                  </span>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-ink-mute sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} GO HR โดย GoAlong · โปรแกรม HR ลงเวลา และเงินเดือนสำหรับธุรกิจไทย</p>
          <nav aria-label="ลิงก์ท้ายหน้า" className="flex gap-5">
            <Link href="/trial" className="hover:text-ink">ทดลองใช้</Link>
            <Link href="/login" className="hover:text-ink">เข้าสู่ระบบ</Link>
            <a href="#faq" className="hover:text-ink">คำถามที่พบบ่อย</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
