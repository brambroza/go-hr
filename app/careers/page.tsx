import Link from "next/link";
import { Banknote, ChevronRight, Clock, MapPin, Search, Users } from "lucide-react";
import { getOpenJobs, getPublicCompany } from "@/components/careers/data";
import { EMP_TYPE_LABEL, salaryText } from "@/components/recruit/labels";
import { thDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function CareersPage({ searchParams }: PageProps<"/careers">) {
  const sp = await searchParams;
  const q = String(sp.q ?? "").trim();
  const loc = String(sp.loc ?? "");
  const type = String(sp.type ?? "");
  const [company, jobs] = await Promise.all([getPublicCompany(), getOpenJobs()]);
  const locations = [...new Set(jobs.map((j) => j.branch ?? j.location_text).filter(Boolean) as string[])];
  const types = [...new Set(jobs.map((j) => j.employment_type))];
  const t = q.toLowerCase();
  const list = jobs.filter(
    (j) =>
      (!t || `${j.title} ${j.description ?? ""} ${j.org_unit ?? ""} ${j.position ?? ""}`.toLowerCase().includes(t)) &&
      (!loc || j.branch === loc || j.location_text === loc) &&
      (!type || j.employment_type === type),
  );

  return (
    <main>
      <section className="bg-jade-900 text-white">
        <div className="mx-auto max-w-5xl px-4 py-10 sm:py-14">
          <h1 className="text-[28px] font-semibold leading-tight sm:text-4xl">ร่วมเป็นส่วนหนึ่งของ {company.name}</h1>
          <p className="mt-3 max-w-2xl text-[15px] text-jade-100 sm:text-base">
            เปิดรับสมัคร {jobs.length} ตำแหน่ง สมัครออนไลน์ได้ทันทีจากมือถือ ไม่ต้องสมัครสมาชิก ฝ่ายบุคคลจะติดต่อกลับทางโทรศัพท์หรืออีเมล
          </p>
          <form className="mt-6 grid gap-2 rounded-[var(--radius-panel)] bg-white p-2 sm:grid-cols-[1fr_auto_auto_auto]" action="/careers">
            <label className="relative">
              <span className="sr-only">ค้นหาตำแหน่ง</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-ink-mute" />
              <input name="q" defaultValue={q} placeholder="ค้นหาตำแหน่งงาน" className="h-12 w-full rounded-[var(--radius-ctl)] border border-line pl-10 pr-3 text-[16px] text-ink focus:border-jade-500 focus:outline-none" />
            </label>
            <select name="loc" defaultValue={loc} aria-label="สถานที่ทำงาน" className="h-12 rounded-[var(--radius-ctl)] border border-line bg-white px-3 text-[16px] text-ink">
              <option value="">ทุกสถานที่</option>
              {locations.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
            <select name="type" defaultValue={type} aria-label="ประเภทงาน" className="h-12 rounded-[var(--radius-ctl)] border border-line bg-white px-3 text-[16px] text-ink">
              <option value="">ทุกประเภทงาน</option>
              {types.map((x) => (
                <option key={x} value={x}>{EMP_TYPE_LABEL[x] ?? x}</option>
              ))}
            </select>
            <button className="h-12 rounded-[var(--radius-ctl)] bg-jade-600 px-6 text-[16px] font-medium text-white hover:bg-jade-700">ค้นหา</button>
          </form>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-8">
        <h2 className="mb-4 text-lg font-semibold text-ink">
          {q || loc || type ? `พบ ${list.length} ตำแหน่ง` : "ตำแหน่งที่เปิดรับสมัคร"}
        </h2>
        {list.length === 0 ? (
          <div className="rounded-[var(--radius-panel)] border border-line bg-white px-6 py-14 text-center">
            <p className="font-medium text-ink">{jobs.length ? "ไม่พบตำแหน่งที่ตรงกับการค้นหา" : "ขณะนี้ยังไม่มีตำแหน่งที่เปิดรับสมัคร"}</p>
            <p className="mt-1 text-sm text-ink-soft">{jobs.length ? "ลองเปลี่ยนคำค้นหาหรือตัวกรอง" : "กรุณาติดตามประกาศใหม่ได้ที่หน้านี้"}</p>
            {(q || loc || type) && (
              <Link href="/careers" className="mt-4 inline-block text-jade-700 underline">ดูตำแหน่งทั้งหมด</Link>
            )}
          </div>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {list.map((j) => (
              <li key={j.id}>
                <Link href={`/careers/${j.slug}`} className="group flex h-full flex-col rounded-[var(--radius-panel)] border border-line bg-white p-4 transition-colors hover:border-jade-300 active:bg-jade-50">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-[17px] font-semibold leading-snug text-ink group-hover:text-jade-800">{j.title}</h3>
                    <ChevronRight className="mt-0.5 size-5 shrink-0 text-ink-mute" />
                  </div>
                  {j.org_unit && <p className="mt-0.5 text-sm text-ink-soft">{j.org_unit}</p>}
                  <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-ink-soft">
                    <span className="inline-flex items-center gap-1.5"><MapPin className="size-4 text-jade-600" />{j.location_text ?? j.branch ?? "-"}</span>
                    <span className="inline-flex items-center gap-1.5"><Banknote className="size-4 text-jade-600" />{j.show_salary ? salaryText(j.salary_min, j.salary_max, j.employment_type) : "ตามโครงสร้างบริษัท"}</span>
                    <span className="inline-flex items-center gap-1.5"><Users className="size-4 text-jade-600" />รับ {j.headcount} อัตรา · {EMP_TYPE_LABEL[j.employment_type] ?? j.employment_type}</span>
                  </dl>
                  {j.close_date && (
                    <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-amber-ink">
                      <Clock className="size-3.5" /> ปิดรับสมัคร {thDate(j.close_date, "long")}
                    </p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
