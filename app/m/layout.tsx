import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata, Viewport } from "next";
import { requireMe } from "@/lib/auth";
import { isBackOffice } from "@/lib/permissions";
import { getCompany } from "@/lib/settings";
import { MeProvider } from "@/components/app/me-context";
import { EssShell } from "@/components/ess/shell";

export const metadata: Metadata = {
  title: { default: "GO HR", template: "%s · GO HR" },
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "GO HR", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function EssLayout({ children }: LayoutProps<"/m">) {
  const me = await requireMe();
  if (me.mustChangePassword) redirect("/account/password?first=1");
  const company = await getCompany();
  const backOffice = isBackOffice(me) || me.isSupervisor;

  if (!me.employeeId) {
    return (
      <main className="grid min-h-dvh place-items-center bg-paper px-4 py-10">
        <div className="w-full max-w-md rounded-[var(--radius-panel)] border border-line bg-white p-6 text-center">
          <div className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-amber-50 text-xl font-semibold text-amber-ink">!</div>
          <h1 className="text-xl font-semibold text-ink">บัญชีนี้ยังไม่ได้ผูกกับข้อมูลพนักงาน</h1>
          <p className="mt-2 text-[15px] text-ink-soft">
            หน้าพนักงาน (ลงเวลา ยื่นเอกสาร ดูสลิป) ใช้ได้เฉพาะบัญชีที่ผูกกับพนักงาน ติดต่อฝ่ายบุคคลเพื่อผูกบัญชี <b>{me.displayName}</b> กับรหัสพนักงานของคุณ
          </p>
          <div className="mt-5 flex flex-col gap-2">
            {isBackOffice(me) && (
              <Link href="/dashboard" className="inline-flex h-12 items-center justify-center rounded-[var(--radius-ctl)] bg-jade-600 font-medium text-white">
                ไปหน้าระบบหลังบ้าน
              </Link>
            )}
            <Link href="/account/password" className="inline-flex h-12 items-center justify-center rounded-[var(--radius-ctl)] border border-line font-medium text-ink">
              เปลี่ยนรหัสผ่าน
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <MeProvider me={me}>
      <EssShell company={{ name: company.name, logo_url: company.logo_url ?? null }} backOffice={backOffice}>
        {children}
      </EssShell>
    </MeProvider>
  );
}
