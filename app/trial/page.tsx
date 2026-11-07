import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { CalendarCheck2, Clock3, ReceiptText, ShieldCheck, Smartphone, Wallet } from "lucide-react";
import { isTruthyEnv } from "@/lib/security-headers";
import { TrialForm } from "@/components/trial/trial-form";

export const metadata: Metadata = {
  title: "ทดลองใช้ GO HR ฟรี",
  description: "ระบบ HR ลงเวลา และเงินเดือน ครบตามกฎหมายไทย ซื้อขาดครั้งเดียว ข้อมูลอยู่บนเซิร์ฟเวอร์ของคุณ",
  robots: { index: true, follow: true },
};

const POINTS = [
  { icon: Smartphone, title: "ลงเวลาผ่าน LINE / GPS / ใบหน้า / QR", body: "ใช้เครื่องสแกนนิ้วเดิมต่อได้ ไม่ต้องซื้ออุปกรณ์เพิ่ม" },
  { icon: CalendarCheck2, title: "ลา OT อนุมัติบนมือถือ", body: "อนุมัติหลายขั้นได้ถึง 10 ขั้น หัวหน้าอนุมัติได้ทุกที่" },
  { icon: Wallet, title: "เงินเดือนครบในหน้าเดียว", body: "ภาษี ประกันสังคม กองทุน ไฟล์ธนาคาร สลิปเข้าแอป" },
  { icon: ReceiptText, title: "ไฟล์ส่งราชการ", body: "ภ.ง.ด.1 / 1ก, สปส.1-10, 50 ทวิ พร้อมกำหนดยื่น" },
  { icon: ShieldCheck, title: "PDPA และข้อมูลเป็นของคุณ", body: "ติดตั้งบนเซิร์ฟเวอร์ของบริษัท ปิดบังข้อมูลอ่อนไหว บันทึกผู้ดูทุกครั้ง" },
  { icon: Clock3, title: "ซื้อขาดครั้งเดียว", body: "ไม่คิดรายหัวรายเดือน ทุกโมดูลรวมในราคาเดียว" },
];

/** Public trial sign-up page — only on GoAlong's demo server (TRIAL_SIGNUP=1) */
export default async function TrialPage() {
  if (!isTruthyEnv(process.env.TRIAL_SIGNUP)) notFound();
  const siteKey = process.env.TURNSTILE_SITE_KEY ?? "";
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const contactLine = process.env.TRIAL_CONTACT_LINE?.trim() || undefined;

  return (
    <div className="min-h-dvh bg-paper">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex h-16 max-w-5xl items-center gap-2.5 px-4">
          <span className="grid size-9 place-items-center rounded-lg bg-jade-500 font-semibold text-white">HR</span>
          <span className="font-semibold text-ink">GO HR</span>
          {contactLine && <span className="ml-auto text-sm text-ink-soft">LINE {contactLine}</span>}
        </div>
      </header>
      <main className="mx-auto grid max-w-5xl gap-8 px-4 py-8 lg:grid-cols-[1fr_440px] lg:py-12">
        <section>
          <h1 className="text-3xl font-semibold leading-tight text-ink sm:text-4xl">ระบบ HR ลงเวลา และเงินเดือน ครบตามกฎหมายไทย</h1>
          <p className="mt-3 text-[16px] text-ink-soft">ลองระบบตัวอย่างได้ทันทีหลังกรอกแบบฟอร์ม และนัดทีมงานทำระบบทดลองด้วยข้อมูลบริษัทของคุณเอง 30 วัน</p>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2">
            {POINTS.map((p) => (
              <li key={p.title} className="flex gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-jade-50 text-jade-700">
                  <p.icon className="size-5" />
                </span>
                <span>
                  <span className="block font-medium text-ink">{p.title}</span>
                  <span className="block text-sm text-ink-soft">{p.body}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
        <section>
          {siteKey ? (
            <TrialForm siteKey={siteKey} nonce={nonce} contactLine={contactLine} />
          ) : (
            <div className="rounded-[var(--radius-panel)] border border-line bg-white p-6 text-sm text-ink-soft">
              ระบบยังไม่พร้อมรับสมัครออนไลน์{contactLine ? ` กรุณาทัก LINE ${contactLine}` : ""}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
