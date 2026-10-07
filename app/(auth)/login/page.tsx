import { getCompany } from "@/lib/settings";
import { LoginForm } from "./login-form";

export const metadata = { title: "เข้าสู่ระบบ" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const company = await getCompany();
  const sp = await searchParams;
  const next = typeof sp.next === "string" && sp.next.startsWith("/") ? sp.next : "/";
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_minmax(420px,520px)]">
      <section className="relative m-3 hidden overflow-hidden rounded-[1.25rem] border border-jade-100 bg-gradient-to-br from-jade-50 via-white to-white p-12 text-ink lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3">
          {company.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={company.logo_url} alt="" className="size-11 rounded-lg border border-line bg-white object-contain p-1" />
          ) : (
            <div className="grid size-11 place-items-center rounded-lg bg-jade-500 text-xl font-bold text-white">HR</div>
          )}
          <span className="text-lg font-semibold text-ink">{company.name}</span>
        </div>
        <div className="max-w-lg">
          <p className="text-4xl font-semibold leading-tight tracking-tight text-ink">ลงเวลา ยื่นลา รับสลิป ในที่เดียว</p>
          <p className="mt-4 text-lg leading-relaxed text-ink-soft">
            พนักงานใช้บนมือถือได้ทันที หัวหน้าอนุมัติได้ทุกที่ ฝ่ายบุคคลปิดงวดเงินเดือนพร้อมแบบ ภ.ง.ด. และ สปส. ในไม่กี่คลิก
          </p>
        </div>
        <ClockFace />
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
        </div>
      </section>
    </div>
  );
}

function ClockFace() {
  // decorative: a time-clock dial, the thing every employee touches first each morning
  return (
    <svg viewBox="0 0 200 200" className="absolute -bottom-24 -right-24 size-[420px] text-jade-200" aria-hidden>
      <circle cx="100" cy="100" r="96" fill="none" stroke="currentColor" strokeWidth="2" />
      {Array.from({ length: 60 }).map((_, i) => {
        const a = (i * Math.PI) / 30;
        const r1 = i % 5 === 0 ? 80 : 88;
        return <line key={i} x1={100 + Math.sin(a) * r1} y1={100 - Math.cos(a) * r1} x2={100 + Math.sin(a) * 92} y2={100 - Math.cos(a) * 92} stroke="currentColor" strokeWidth={i % 5 === 0 ? 2.5 : 1} />;
      })}
      <line x1="100" y1="100" x2="100" y2="38" stroke="#10b981" strokeWidth="4" strokeLinecap="round" />
      <line x1="100" y1="100" x2="146" y2="100" stroke="#10b981" strokeWidth="5" strokeLinecap="round" />
      <circle cx="100" cy="100" r="5" fill="#10b981" />
    </svg>
  );
}
