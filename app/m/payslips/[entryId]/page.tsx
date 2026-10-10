import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireMe } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { loadCompany, loadPayslipOptions, loadPayslips } from "@/lib/payroll/payslip-data";
import { Payslip } from "@/components/payroll/payslip";
import { PrintButton } from "./print-button";

export const metadata = { title: "สลิปเงินเดือน" };

export default async function MyPayslipPage({ params }: PageProps<"/m/payslips/[entryId]">) {
  const me = await requireMe();
  const { entryId } = await params;
  const sb = await supabaseServer();
  const [company, slips, options] = await Promise.all([loadCompany(sb), loadPayslips(sb, { entryIds: [Number(entryId)] }), loadPayslipOptions(sb)]);
  // RLS lets HR see any entry; on the self-service page show only the employee's own published slip
  const slip = slips.find((s) => s.employee_id === me.employeeId) ?? null;

  return (
    <main className="mx-auto min-h-dvh w-full max-w-3xl px-3 pb-28 pt-4 print:p-0">
      <div className="no-print mb-3 flex items-center justify-between gap-2">
        <Link href="/m/payslips" className="inline-flex h-11 items-center gap-1 text-[15px] text-ink-soft">
          <ArrowLeft className="size-5" /> สลิปทั้งหมด
        </Link>
        {slip && <PrintButton />}
      </div>
      {!slip ? (
        <p className="rounded-[var(--radius-panel)] border border-line bg-white p-6 text-center text-ink-soft">ไม่พบสลิปนี้ หรือยังไม่ได้เผยแพร่</p>
      ) : (
        <div className="rounded-[var(--radius-panel)] border border-line bg-white p-4 print:border-0 print:p-0">
          <Payslip company={company} data={slip} options={options} />
        </div>
      )}
    </main>
  );
}
