import Link from "next/link";
import { ChevronRight, FileText } from "lucide-react";
import { requireMe } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { money, thDate } from "@/lib/format";

export const metadata = { title: "สลิปเงินเดือน" };

type Row = { id: number; net_pay: number; total_income: number; total_deduction: number; period_id: number; payroll_periods: { name: string; pay_date: string; pay_year: number } | null };

/** Self-service: published payslips of the signed-in employee (RLS only returns published periods) */
export default async function MyPayslipsPage() {
  const me = await requireMe();
  const sb = await supabaseServer();
  const { data } = me.employeeId
    ? await sb
        .from("payroll_entries")
        .select("id, net_pay, total_income, total_deduction, period_id, payroll_periods!inner(name, pay_date, pay_year, payslip_published)")
        .eq("employee_id", me.employeeId)
        .eq("payroll_periods.payslip_published", true)
        .order("id", { ascending: false })
        .limit(60)
    : { data: [] };
  const rows = ((data ?? []) as unknown as Row[]).sort((a, b) => (b.payroll_periods?.pay_date ?? "").localeCompare(a.payroll_periods?.pay_date ?? ""));
  const byYear = new Map<number, Row[]>();
  for (const r of rows) {
    const y = r.payroll_periods?.pay_year ?? 0;
    byYear.set(y, [...(byYear.get(y) ?? []), r]);
  }

  return (
    <main className="mx-auto min-h-dvh w-full max-w-lg px-4 pb-28 pt-5">
      <h1 className="text-2xl font-semibold text-ink">สลิปเงินเดือน</h1>
      <p className="mt-1 text-[15px] text-ink-soft">แตะเพื่อดูรายละเอียด พิมพ์ หรือบันทึกเป็น PDF</p>
      {!me.employeeId && <p className="mt-6 rounded-[var(--radius-panel)] border border-line bg-white p-4 text-ink-soft">บัญชีนี้ยังไม่ได้ผูกกับข้อมูลพนักงาน</p>}
      {me.employeeId && rows.length === 0 && (
        <div className="mt-6 flex flex-col items-center gap-2 rounded-[var(--radius-panel)] border border-line bg-white px-6 py-12 text-center">
          <FileText className="size-8 text-jade-400" />
          <p className="font-medium">ยังไม่มีสลิปเงินเดือน</p>
          <p className="text-sm text-ink-soft">สลิปจะแสดงที่นี่เมื่อฝ่ายเงินเดือนเผยแพร่แล้ว</p>
        </div>
      )}
      {[...byYear.entries()].map(([y, list]) => (
        <section key={y} className="mt-5">
          <h2 className="mb-2 text-sm font-semibold text-ink-soft">ปี {y + 543}</h2>
          <ul className="overflow-hidden rounded-[var(--radius-panel)] border border-line bg-white">
            {list.map((r) => (
              <li key={r.id} className="border-b border-line-soft last:border-0">
                <Link href={`/m/payslips/${r.id}`} className="flex min-h-16 items-center gap-3 px-4 py-3 active:bg-jade-50">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{r.payroll_periods?.name}</div>
                    <div className="text-sm text-ink-mute">จ่ายวันที่ {thDate(r.payroll_periods?.pay_date)}</div>
                  </div>
                  <div className="text-right">
                    <div className="num text-lg font-semibold text-jade-800">{money(r.net_pay)}</div>
                    <div className="text-xs text-ink-mute">สุทธิ (บาท)</div>
                  </div>
                  <ChevronRight className="size-5 text-ink-mute" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
