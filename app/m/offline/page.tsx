import Link from "next/link";
import { WifiOff } from "lucide-react";

export const metadata = { title: "ออฟไลน์" };

/** Served by the service worker when a page cannot be loaded without a connection */
export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-[70dvh] w-full max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
      <span className="grid size-16 place-items-center rounded-full bg-amber-50 text-amber-ink">
        <WifiOff className="size-8" />
      </span>
      <h1 className="text-xl font-semibold">ไม่มีการเชื่อมต่ออินเทอร์เน็ต</h1>
      <p className="text-[15px] text-ink-soft">หน้านี้ต้องใช้อินเทอร์เน็ต แต่คุณยังลงเวลาได้ — ระบบจะเก็บไว้ในเครื่องและส่งให้อัตโนมัติเมื่อกลับมาออนไลน์</p>
      <Link href="/m/checkin" className="mt-2 inline-flex h-12 items-center rounded-[var(--radius-ctl)] bg-jade-600 px-6 font-medium text-white">
        ไปหน้าลงเวลา
      </Link>
    </main>
  );
}
