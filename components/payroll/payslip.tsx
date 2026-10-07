// Printable Thai payslip (server or client component — no hooks). Used by /payroll/[id]/payslips and /m/payslips/[entryId].
import { bahtText, maskAccount, money, thDate } from "@/lib/format";
import { BANK_NAMES } from "@/lib/payroll/files";

export interface PayslipCompany {
  name: string;
  name_en?: string;
  address?: string;
  tax_id?: string;
  branch_no?: string;
  phone?: string;
  logo_url?: string | null;
}

export interface PayslipData {
  period: { name: string; start_date: string; end_date: string; pay_date: string; code?: string };
  entry: {
    emp_code: string; emp_name: string; position_name: string | null; org_name?: string | null; bank_code: string | null; bank_account: string | null; pay_method: string | null;
    base_salary: number; salary_unit: string; work_days: number; paid_days?: number; absent_days: number; late_minutes: number;
    total_income: number; total_deduction: number; net_pay: number; ytd_income: number; ytd_tax: number; ytd_sso: number; ytd_pvd: number; sso_employer?: number; pvd_employer?: number;
  };
  items: { name: string; direction: number; amount: number; qty: number | null; rate?: number | null; sort_order?: number }[];
}

const UNIT: Record<string, string> = { month: "เดือน", day: "วัน", hour: "ชั่วโมง" };

export function Payslip({ company, data, compact }: { company: PayslipCompany; data: PayslipData; compact?: boolean }) {
  const { period, entry, items } = data;
  const inc = items.filter((i) => i.direction === 1);
  const ded = items.filter((i) => i.direction === -1);
  const rows = Math.max(inc.length, ded.length, compact ? 6 : 8);
  return (
    <article className="payslip mx-auto w-full max-w-[190mm] bg-white text-[12px] leading-snug text-black">
      <header className="flex items-start justify-between gap-4 border-b-2 border-black pb-1.5">
        <div className="flex items-start gap-2">
          {company.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={company.logo_url} alt="" className="h-10 w-10 object-contain" />
          )}
          <div>
            <div className="text-[14px] font-semibold">{company.name}</div>
            {company.address && <div className="text-[10.5px]">{company.address}</div>}
            {company.tax_id && (
              <div className="text-[10.5px]">
                เลขประจำตัวผู้เสียภาษี {company.tax_id}
                {company.branch_no ? ` สาขา ${company.branch_no === "00000" ? "สำนักงานใหญ่" : company.branch_no}` : ""}
              </div>
            )}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[14px] font-semibold">ใบแจ้งเงินเดือน</div>
          <div className="text-[10.5px]">PAY SLIP</div>
          <div className="text-[10.5px]">ลับเฉพาะ</div>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-x-4 gap-y-0.5 border-b border-black py-1.5 sm:grid-cols-3 print:grid-cols-3">
        <KV k="รหัสพนักงาน" v={entry.emp_code} />
        <KV k="ชื่อ-สกุล" v={entry.emp_name} className="sm:col-span-2 print:col-span-2" />
        <KV k="ตำแหน่ง" v={entry.position_name ?? "-"} />
        <KV k="หน่วยงาน" v={entry.org_name ?? "-"} />
        <KV
          k="การจ่าย"
          v={entry.pay_method === "bank" ? `${(BANK_NAMES[entry.bank_code ?? ""] ?? "").replace(/^ธนาคาร/, "").replace(/ \(.*\)$/, "") || entry.bank_code || ""} ${maskAccount(entry.bank_account)}` : entry.pay_method === "cheque" ? "เช็ค" : "เงินสด"}
        />
        <KV k="งวด" v={period.name} />
        <KV k="รอบเงินเดือน" v={`${thDate(period.start_date)} – ${thDate(period.end_date)}`} />
        <KV k="วันที่จ่าย" v={thDate(period.pay_date, "long")} />
        <KV k="อัตรา" v={`${money(entry.base_salary)} / ${UNIT[entry.salary_unit] ?? entry.salary_unit}`} />
        <KV k="วันทำงาน" v={`${Number(entry.work_days)} วัน${Number(entry.absent_days) ? ` · ขาด ${Number(entry.absent_days)} วัน` : ""}${entry.late_minutes ? ` · สาย ${entry.late_minutes} นาที` : ""}`} className="sm:col-span-2 print:col-span-2" />
      </section>

      {/* phone: stacked lists */}
      <div className="sm:hidden print:hidden">
        <StackList title="รายได้" rows={inc} total={entry.total_income} totalLabel="รวมรายได้" />
        <StackList title="รายการหัก" rows={ded} total={entry.total_deduction} totalLabel="รวมรายการหัก" />
      </div>
      <table className="hidden w-full border-collapse sm:table print:table">
        <thead>
          <tr className="border-b border-black">
            <th className="w-[34%] py-1 text-left font-semibold">รายได้</th>
            <th className="w-[16%] py-1 pr-2 text-right font-semibold">จำนวนเงิน</th>
            <th className="w-[34%] border-l border-black py-1 pl-2 text-left font-semibold">รายการหัก</th>
            <th className="w-[16%] py-1 text-right font-semibold">จำนวนเงิน</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, i) => (
            <tr key={i} className="h-[17px] align-top">
              <td className="pr-1">{inc[i] ? lineName(inc[i]) : ""}</td>
              <td className="num pr-2 text-right">{inc[i] ? money(inc[i].amount) : ""}</td>
              <td className="border-l border-black pl-2 pr-1">{ded[i] ? lineName(ded[i]) : ""}</td>
              <td className="num text-right">{ded[i] ? money(ded[i].amount) : ""}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-y border-black font-semibold">
            <td className="py-1">รวมรายได้</td>
            <td className="num py-1 pr-2 text-right">{money(entry.total_income)}</td>
            <td className="border-l border-black py-1 pl-2">รวมรายการหัก</td>
            <td className="num py-1 text-right">{money(entry.total_deduction)}</td>
          </tr>
        </tfoot>
      </table>

      <section className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-black py-1.5">
        <div className="text-[11px]">({bahtText(Number(entry.net_pay))})</div>
        <div className="text-[14px] font-semibold">
          เงินได้สุทธิ <span className="num ml-2">{money(entry.net_pay)}</span> บาท
        </div>
      </section>

      <section className="grid grid-cols-2 gap-x-4 pt-1 text-[10.5px] sm:grid-cols-4 print:grid-cols-4">
        <KV k="เงินได้สะสม" v={money(entry.ytd_income)} />
        <KV k="ภาษีสะสม" v={money(entry.ytd_tax)} />
        <KV k="ประกันสังคมสะสม" v={money(entry.ytd_sso)} />
        <KV k="กองทุนสำรองฯ สะสม" v={money(entry.ytd_pvd)} />
        {!!Number(entry.pvd_employer) && <KV k="PVD ส่วนนายจ้างงวดนี้" v={money(entry.pvd_employer)} />}
      </section>
      <footer className="mt-1 flex justify-between text-[10px] text-neutral-600">
        <span>เอกสารนี้ออกโดยระบบคอมพิวเตอร์ ไม่ต้องลงลายมือชื่อ</span>
        {period.code && <span>{period.code}</span>}
      </footer>
    </article>
  );
}

function StackList({ title, rows, total, totalLabel }: { title: string; rows: PayslipData["items"]; total: number; totalLabel: string }) {
  return (
    <div className="border-b border-black py-1.5">
      <div className="mb-0.5 font-semibold">{title}</div>
      {rows.map((r, i) => (
        <div key={i} className="flex justify-between gap-3">
          <span>{r.name}</span>
          <span className="num">{money(r.amount)}</span>
        </div>
      ))}
      <div className="mt-0.5 flex justify-between gap-3 font-semibold">
        <span>{totalLabel}</span>
        <span className="num">{money(total)}</span>
      </div>
    </div>
  );
}

function lineName(i: { name: string; qty: number | null; rate?: number | null }) {
  return i.name;
}

function KV({ k, v, className }: { k: string; v: string; className?: string }) {
  return (
    <div className={`flex min-w-0 gap-1.5 ${className ?? ""}`}>
      <span className="shrink-0 text-neutral-600">{k}</span>
      <span className="num min-w-0 font-medium">{v}</span>
    </div>
  );
}
