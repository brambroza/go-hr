import Link from "next/link";
import { Sparkles } from "lucide-react";
import { getCompany } from "@/lib/settings";
import { isTruthyEnv } from "@/lib/security-headers";
import { LoginForm } from "./login-form";
import { LoginScene, TechBackdrop } from "./login-scene";

export const metadata = { title: "เข้าสู่ระบบ" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const company = await getCompany();
  const sp = await searchParams;
  const next = typeof sp.next === "string" && sp.next.startsWith("/") ? sp.next : "/";
  // GoAlong demo server only (TRIAL_SIGNUP=1): invite visitors without an account to the trial sign-up
  const trialOn = isTruthyEnv(process.env.TRIAL_SIGNUP);
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_minmax(420px,520px)]">
      <section className="relative m-3 hidden overflow-hidden rounded-[1.25rem] border border-jade-100 bg-gradient-to-br from-jade-50 via-white to-white p-12 text-ink lg:flex lg:flex-col lg:justify-between">
        <TechBackdrop />
        <div className="relative flex items-center gap-3">
          {company.logo_url ? (
            <img src={company.logo_url} alt="" className="size-11 rounded-lg border border-line bg-white object-contain p-1" />
          ) : (
            <div className="grid size-11 place-items-center rounded-lg bg-jade-500 text-xl font-bold text-white">HR</div>
          )}
          <span className="text-lg font-semibold text-ink">{company.name}</span>
        </div>
        <div className="relative my-6 flex flex-1 flex-col justify-center">
          <LoginScene />
        </div>
      </section>
      <section className="flex flex-col justify-center bg-white px-6 py-10 sm:px-12">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <div className="grid size-11 place-items-center rounded-lg bg-jade-500 text-xl font-bold text-white">HR</div>
            <p className="mt-3 text-lg font-semibold">{company.name}</p>
          </div>
          <h1 className="text-2xl font-semibold">เข้าสู่ระบบ</h1>
          <p className="mt-1 text-ink-soft">ใช้รหัสพนักงาน ชื่อผู้ใช้ หรืออีเมล</p>
          <LoginForm next={next} />
          {trialOn && (
            <div className="mt-8 border-t border-line pt-6 text-center">
              <p className="text-sm text-ink-soft">ยังไม่มีบัญชี GO HR?</p>
              <Link
                href="/trial"
                className="mt-3 inline-flex h-12 w-full items-center justify-center gap-2 rounded-[var(--radius-ctl)] border border-jade-200 bg-jade-50 px-5 font-semibold text-jade-800 hover:bg-jade-100"
              >
                <Sparkles className="size-4" /> ขอทดลองใช้ฟรี
              </Link>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
