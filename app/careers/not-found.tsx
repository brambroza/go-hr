import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-lg px-4 py-20 text-center">
      <h1 className="text-2xl font-semibold text-ink">ไม่พบประกาศนี้</h1>
      <p className="mt-2 text-[15px] text-ink-soft">ประกาศอาจปิดรับสมัครแล้ว หรือลิงก์ไม่ถูกต้อง</p>
      <Link href="/careers" className="mt-6 inline-flex h-12 items-center rounded-[var(--radius-ctl)] bg-jade-600 px-6 font-medium text-white">ดูตำแหน่งงานที่เปิดรับ</Link>
    </main>
  );
}
