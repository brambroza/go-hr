"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { FileText, Fingerprint, Home, LayoutGrid, Monitor, Receipt, WifiOff } from "lucide-react";
import { clsx, toast } from "@/components/ui";
import { Notifications } from "@/components/app/app-shell";
import { onQueueChange, queuedCheckins, syncQueue } from "./offline-queue";

const TABS = [
  { href: "/m", label: "หน้าแรก", icon: Home, exact: true },
  { href: "/m/checkin", label: "ลงเวลา", icon: Fingerprint },
  { href: "/m/requests", label: "ยื่นเอกสาร", icon: FileText },
  { href: "/m/payslips", label: "สลิป", icon: Receipt },
  { href: "/m/more", label: "เมนู", icon: LayoutGrid },
];

const MORE_PATHS = ["/m/more", "/m/leave", "/m/calendar", "/m/approvals", "/m/team", "/m/profile", "/m/career", "/m/policies", "/m/feed", "/m/todos", "/m/learning", "/m/evaluations"];

export function EssShell({ company, backOffice, children }: { company: { name: string; logo_url: string | null }; backOffice: boolean; children: ReactNode }) {
  const pathname = usePathname();
  const [online, setOnline] = useState(true);
  const [queued, setQueued] = useState(0);

  // service worker + offline queue sync
  useEffect(() => {
    // dev builds serve un-hashed chunks, so the SW is only registered in production (or with ?sw=1 for testing)
    if ("serviceWorker" in navigator && (process.env.NODE_ENV === "production" || location.search.includes("sw=1"))) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
    }
    const refresh = () => setQueued(queuedCheckins().length);
    refresh();
    const off = onQueueChange(refresh);
    const doSync = async () => {
      if (!queuedCheckins().length) return;
      const r = await syncQueue();
      if (r.synced) toast.ok(`ซิงก์การลงเวลาที่ค้างไว้แล้ว ${r.synced} รายการ`);
    };
    const on = () => {
      setOnline(true);
      doSync();
    };
    const offl = () => setOnline(false);
    setOnline(navigator.onLine);
    window.addEventListener("online", on);
    window.addEventListener("offline", offl);
    doSync();
    const t = setInterval(doSync, 60_000);
    return () => {
      off();
      window.removeEventListener("online", on);
      window.removeEventListener("offline", offl);
      clearInterval(t);
    };
  }, []);

  const isActive = (t: (typeof TABS)[number]) => {
    if (t.exact) return pathname === t.href;
    if (t.href === "/m/more") return MORE_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
    return pathname === t.href || pathname.startsWith(t.href + "/");
  };

  return (
    <div className="min-h-dvh bg-paper">
      <header className="no-print sticky top-0 z-30 border-b border-line bg-white/85 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-md items-center gap-2.5 px-4">
          <Link href="/m" className="flex min-w-0 flex-1 items-center gap-2.5">
            {company.logo_url ? (
               
              <img src={company.logo_url} alt="" className="size-8 rounded-md bg-white object-contain" />
            ) : (
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-jade-500 text-sm font-bold text-white">HR</span>
            )}
            <span className="truncate text-[15px] font-semibold text-ink">{company.name}</span>
          </Link>
          {backOffice && (
            <Link href="/dashboard" className="hidden items-center gap-1 rounded-md px-2 py-1.5 text-sm text-ink-soft hover:bg-paper min-[400px]:inline-flex" title="ระบบหลังบ้าน">
              <Monitor className="size-4" /> หลังบ้าน
            </Link>
          )}
          <Notifications />
        </div>
        {(!online || queued > 0) && (
          <Link href="/m/checkin" className={clsx("flex items-center justify-center gap-2 px-4 py-1.5 text-sm", online ? "bg-amber-50 text-amber-ink" : "bg-gray-100 text-ink")}>
            <WifiOff className="size-4" />
            {!online ? "ออฟไลน์อยู่ — ลงเวลาได้ ระบบจะส่งให้เมื่อกลับมาออนไลน์" : `มีการลงเวลารอซิงก์ ${queued} รายการ`}
          </Link>
        )}
      </header>

      <div className="pb-[calc(5.5rem+env(safe-area-inset-bottom))]">{children}</div>

      <nav aria-label="เมนูหลัก" className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md">
        <ul className="mx-auto grid h-16 max-w-md grid-cols-5">
          {TABS.map((t) => {
            const active = isActive(t);
            const Icon = t.icon;
            const center = t.href === "/m/checkin";
            return (
              <li key={t.href}>
                <Link
                  href={t.href}
                  aria-current={active ? "page" : undefined}
                  className={clsx("flex h-full flex-col items-center justify-center gap-0.5 text-[12px] transition-colors", active ? "font-semibold text-jade-700" : "text-ink-mute active:text-jade-700")}
                >
                  <span className={clsx("grid place-items-center rounded-full", center ? clsx("size-9", active ? "bg-jade-500 text-white" : "bg-jade-50 text-jade-700") : "size-7")}>
                    <Icon className={center ? "size-5" : "size-[22px]"} strokeWidth={active ? 2.3 : 1.9} />
                  </span>
                  {t.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

/** Standard mobile page container + title */
export function MPage({ title, description, back, actions, children, className }: { title?: ReactNode; description?: ReactNode; back?: { href: string; label: string }; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <main className={clsx("mx-auto w-full max-w-md px-4 pt-4", className)}>
      {back && (
        <Link href={back.href} className="-ml-1 mb-1 inline-flex h-10 items-center gap-1 pr-2 text-[15px] text-ink-soft active:text-jade-700">
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
            <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {back.label}
        </Link>
      )}
      {(title || actions) && (
        <div className="mb-4 flex items-end justify-between gap-3">
          <div className="min-w-0">
            {title && <h1 className="text-[22px] font-semibold leading-tight tracking-tight text-ink">{title}</h1>}
            {description && <p className="mt-1 text-[15px] text-ink-soft">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </main>
  );
}

export function Card({ children, className, title, action }: { children: ReactNode; className?: string; title?: ReactNode; action?: ReactNode }) {
  return (
    <section className={clsx("rounded-[var(--radius-panel)] border border-line/80 bg-white shadow-[var(--shadow-soft)]", className)}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-2 px-4 pb-1 pt-3.5">
          {title && <h2 className="text-[15px] font-semibold text-ink">{title}</h2>}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}
