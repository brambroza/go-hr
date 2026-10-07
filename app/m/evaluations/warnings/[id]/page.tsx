import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireMe } from "@/lib/auth";
import { WarningLetter } from "@/components/performance/warning-letter";
import { loadWarning } from "@/components/performance/warning-data";

export const metadata = { title: "หนังสือเตือน" };

export default async function MyWarningPage({ params }: PageProps<"/m/evaluations/warnings/[id]">) {
  const me = await requireMe();
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const d = await loadWarning(Number(id));
  if (!d || d.w.employee_id !== me.employeeId) notFound();
  return (
    <main className="mx-auto w-full max-w-3xl px-3 pt-3 print:p-0">
      <Link href="/m/evaluations" className="no-print -ml-1 mb-2 inline-flex h-10 items-center gap-1 text-[15px] text-ink-soft"><ChevronLeft className="size-5" /> แบบประเมินและหนังสือเตือน</Link>
      <div className="overflow-x-auto rounded-[var(--radius-panel)] border border-line bg-white p-4 print:border-0 print:p-0">
        <WarningLetter company={d.company} emp={d.emp} w={d.w} issuer={d.issuer} />
      </div>
    </main>
  );
}
