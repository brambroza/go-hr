import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePerm } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { loadCompany, loadPayslipOptions, loadPayslips } from "@/lib/payroll/payslip-data";
import { Payslip } from "@/components/payroll/payslip";
import { PrintBar } from "@/components/payroll/print-bar";

export const metadata = { title: "พิมพ์สลิปเงินเดือน" };

/** All payslips of a period, 2 per A4 page (cut line between). ?entries=1,2,3 limits the list. */
export default async function PeriodPayslipsPage({ params, searchParams }: PageProps<"/payroll/[id]/payslips">) {
  await requirePerm("payroll", "view");
  const { id } = await params;
  const sp = await searchParams;
  const sb = await supabaseServer();
  const entryIds = typeof sp.entries === "string" ? sp.entries.split(",").map(Number).filter(Boolean) : undefined;
  const [company, slips, period, options] = await Promise.all([
    loadCompany(sb),
    loadPayslips(sb, { periodId: Number(id), entryIds }),
    sb.from("payroll_periods").select("name").eq("id", Number(id)).maybeSingle(),
    loadPayslipOptions(sb),
  ]);
  const pages: (typeof slips)[] = [];
  for (let i = 0; i < slips.length; i += 2) pages.push(slips.slice(i, i + 2));

  return (
    <div className="-mx-3 -my-5 sm:-mx-6">
      <style>{`@media print { @page { size: A4; margin: 8mm 10mm; } .slip-page { break-after: page; } .slip-page:last-child { break-after: auto; } }`}</style>
      <PrintBar
        title={`สลิปเงินเดือน ${period.data?.name ?? ""} (${slips.length} ใบ)`}
        back={
          <Link href={`/payroll/${id}`} className="inline-flex items-center gap-1 text-sm text-ink-soft hover:text-jade-700">
            <ArrowLeft className="size-4" /> กลับ
          </Link>
        }
      />
      {slips.length === 0 && <p className="p-8 text-center text-ink-soft">ยังไม่มีสลิปในงวดนี้ — คำนวณเงินเดือนก่อน</p>}
      <div className="flex flex-col items-center gap-6 pb-10 print:block print:gap-0 print:pb-0">
        {pages.map((pg, i) => (
          <div key={i} className="slip-page print-page flex w-[210mm] max-w-full flex-col bg-white px-[10mm] py-[8mm] shadow-sm ring-1 ring-line print:w-auto print:px-0 print:py-0 print:shadow-none print:ring-0">
            <Payslip company={company} data={pg[0]} compact options={options} />
            {pg[1] && (
              <>
                <div className="my-[6mm] border-t border-dashed border-neutral-400 print:my-[5mm]" aria-hidden />
                <Payslip company={company} data={pg[1]} compact options={options} />
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
