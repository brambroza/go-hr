import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, Banknote, CalendarDays, MapPin, Users } from "lucide-react";
import { getConsentText, getJob, getPublicCompany } from "@/components/careers/data";
import { ApplyForm } from "@/components/careers/apply-form";
import { EMP_TYPE_LABEL, salaryText } from "@/components/recruit/labels";
import { thDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/careers/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const job = await getJob(slug);
  return { title: job ? `สมัครงาน ${job.title}` : "ไม่พบประกาศ" };
}

function Lines({ text }: { text: string | null }) {
  if (!text) return null;
  const lines = text.split(/\r?\n/).map((l) => l.replace(/^[-•*]\s*/, "").trim()).filter(Boolean);
  if (lines.length <= 1) return <p className="text-[15px] leading-relaxed text-ink">{text}</p>;
  return (
    <ul className="flex list-disc flex-col gap-1 pl-5 text-[15px] leading-relaxed text-ink marker:text-jade-500">
      {lines.map((l, i) => (
        <li key={i}>{l}</li>
      ))}
    </ul>
  );
}

export default async function JobPage({ params }: PageProps<"/careers/[slug]">) {
  const { slug } = await params;
  const [job, company, consent] = await Promise.all([getJob(slug), getPublicCompany(), getConsentText()]);
  if (!job) notFound();

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:py-8">
      <Link href="/careers" className="mb-3 inline-flex h-10 items-center gap-1 text-[15px] text-ink-soft hover:text-jade-700">
        <ArrowLeft className="size-4" /> ตำแหน่งงานทั้งหมด
      </Link>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <article className="flex flex-col gap-4 lg:sticky lg:top-4 lg:self-start">
          <div className="rounded-[var(--radius-panel)] border border-line bg-white p-5">
            <p className="text-sm text-ink-soft">{company.name}</p>
            <h1 className="mt-1 text-2xl font-semibold leading-tight text-ink">{job.title}</h1>
            <dl className="mt-4 grid gap-2.5 text-[15px] text-ink-soft sm:grid-cols-2">
              <span className="inline-flex items-center gap-2"><MapPin className="size-4 shrink-0 text-jade-600" />{job.location_text ?? job.branch ?? "-"}</span>
              <span className="inline-flex items-center gap-2"><Banknote className="size-4 shrink-0 text-jade-600" />{job.show_salary ? salaryText(job.salary_min, job.salary_max, job.employment_type) : "ตามโครงสร้างบริษัท"}</span>
              <span className="inline-flex items-center gap-2"><Users className="size-4 shrink-0 text-jade-600" />รับ {job.headcount} อัตรา · {EMP_TYPE_LABEL[job.employment_type] ?? job.employment_type}</span>
              <span className="inline-flex items-center gap-2"><CalendarDays className="size-4 shrink-0 text-jade-600" />{job.close_date ? `ปิดรับ ${thDate(job.close_date, "long")}` : "รับสมัครจนกว่าจะได้ผู้สมัคร"}</span>
            </dl>
            <a href="#apply" className="mt-5 flex h-12 items-center justify-center rounded-[var(--radius-ctl)] bg-jade-600 text-[16px] font-medium text-white hover:bg-jade-700 lg:hidden">
              กรอกใบสมัคร
            </a>
          </div>
          {[
            ["รายละเอียดงาน", job.description],
            ["คุณสมบัติผู้สมัคร", job.qualifications],
            ["สวัสดิการ", job.benefits],
          ].map(([h, t]) =>
            t ? (
              <section key={h} className="rounded-[var(--radius-panel)] border border-line bg-white p-5">
                <h2 className="mb-2 text-[17px] font-semibold text-ink">{h}</h2>
                <Lines text={t} />
              </section>
            ) : null,
          )}
        </article>
        <section id="apply" className="scroll-mt-4">
          <ApplyForm slug={job.slug} title={job.title} questions={job.questions ?? []} consentText={consent} companyName={company.name} />
        </section>
      </div>
    </main>
  );
}
