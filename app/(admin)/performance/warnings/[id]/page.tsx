import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PrintBar } from "@/components/payroll/print-bar";
import { WarningLetter } from "@/components/performance/warning-letter";
import { loadWarning } from "@/components/performance/warning-data";

export const metadata = { title: "หนังสือเตือน" };

export default async function WarningPrintPage({ params }: PageProps<"/performance/warnings/[id]">) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const d = await loadWarning(Number(id));
  if (!d) notFound();
  return (
    <div className="-mx-3 -my-5 sm:-mx-6 print:m-0">
      <PrintBar
        title={`หนังสือเตือน ${d.w.doc_no ?? ""}`}
        back={<Link href="/performance/warnings" className="inline-flex items-center gap-1 text-sm text-ink-soft hover:text-jade-700"><ArrowLeft className="size-4" /> กลับ</Link>}
      />
      <div className="mx-auto mb-8 max-w-[210mm] rounded-[var(--radius-panel)] border border-line bg-white p-[14mm] shadow-sm print:max-w-none print:border-0 print:p-0 print:shadow-none">
        <WarningLetter company={d.company} emp={d.emp} w={d.w} issuer={d.issuer} />
      </div>
    </div>
  );
}
