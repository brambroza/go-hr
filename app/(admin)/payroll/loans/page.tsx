"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Search } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useCan } from "@/components/app/me-context";
import { Badge, Button, Empty, Field, Input, Modal, PageHeader, Panel, Select, Spinner, Tabs, Textarea, toast } from "@/components/ui";
import { EmployeePicker } from "@/components/crud/employee-picker";
import { humanError } from "@/components/crud/crud-page";
import { usePayrollLookups } from "@/components/payroll/use-payroll-lookups";
import { loanSchedule, loanTotals } from "@/lib/payroll/commission";
import { money, thDate } from "@/lib/format";
import { downloadCsv } from "@/lib/csv";

type Loan = {
  id: number; doc_no: string | null; employee_id: number; pay_item_id: number | null; loan_name: string; lender: string | null; principal: number; interest_rate: number;
  total_payable: number; installment_amount: number; start_month: string; paid_amount: number; status: string; note: string | null;
  employees: { code: string; first_name: string; last_name: string } | null;
};
type Payment = { id: number; pay_date: string; amount: number; note: string | null; period_id: number | null };

const STATUS: Record<string, [string, string]> = { active: ["กำลังผ่อน", "amber"], paused: ["พักชำระ", "gray"], closed: ["ชำระครบ", "green"], cancelled: ["ยกเลิก", "gray"] };
const LENDERS = ["บริษัท", "กยศ.", "กรมบังคับคดี", "สหกรณ์ออมทรัพย์", "ธนาคาร"];
const TH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const monthText = (d: string) => `${TH[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(0, 4)) + 543}`;

export default function LoansPage() {
  const sb = supabaseBrowser();
  const can = useCan();
  const lk = usePayrollLookups();
  const [rows, setRows] = useState<Loan[] | null>(null);
  const [status, setStatus] = useState("active");
  const [q, setQ] = useState("");
  const [form, setForm] = useState<(Partial<Loan> & { installments?: number }) | null>(null);
  const [view, setView] = useState<Loan | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    let query = sb.from("employee_loans").select("*, employees!inner(code, first_name, last_name)").order("id", { ascending: false }).limit(2000);
    if (status) query = query.eq("status", status);
    const { data, error } = await query;
    if (error) toast.error(error.message);
    setRows((data as Loan[]) ?? []);
  }, [sb, status]);
  useEffect(() => {
    load();
  }, [load]);

  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (rows ?? []).filter((r) => !t || `${r.employees?.code} ${r.employees?.first_name} ${r.employees?.last_name} ${r.loan_name} ${r.doc_no ?? ""}`.toLowerCase().includes(t));
  }, [rows, q]);
  const loanItems = lk.items.filter((i) => i.category === "loan" || i.system_key === "loan" || i.system_key === "slf");

  const calc = form ? loanTotals({ principal: Number(form.principal ?? 0), interest_rate: Number(form.interest_rate ?? 0), installments: Number(form.installments ?? 12) }) : null;
  const preview = form && calc ? loanSchedule(calc.total, Number(form.installment_amount || calc.installment), (form.start_month ?? new Date().toISOString().slice(0, 7)) + "", Number(form.paid_amount ?? 0)) : [];

  async function save() {
    if (!form?.employee_id || !form.loan_name || !(Number(form.principal) > 0)) return toast.error("กรุณาเลือกพนักงาน ระบุชื่อรายการ และเงินต้น");
    setSaving(true);
    const total = calc!.total;
    const payload = {
      employee_id: form.employee_id,
      pay_item_id: form.pay_item_id ? Number(form.pay_item_id) : loanItems.find((i) => i.system_key === "loan")?.id ?? null,
      loan_name: form.loan_name,
      lender: form.lender || null,
      principal: Number(form.principal),
      interest_rate: Number(form.interest_rate ?? 0),
      total_payable: form.id && form.total_payable && !form.installments ? Number(form.total_payable) : total,
      installment_amount: Number(form.installment_amount || calc!.installment),
      start_month: `${String(form.start_month).slice(0, 7)}-01`,
      status: form.status ?? "active",
      note: form.note || null,
      ...(form.id ? {} : { doc_no: newLoanNo() }),
    };
    const res = form.id ? await sb.from("employee_loans").update(payload).eq("id", form.id) : await sb.from("employee_loans").insert(payload);
    setSaving(false);
    if (res.error) return toast.error(humanError(res.error));
    toast.ok("บันทึกแล้ว");
    setForm(null);
    load();
  }

  function openEdit(l: Loan) {
    const n = Math.max(1, Math.round(Number(l.total_payable) / Number(l.installment_amount)));
    setForm({ ...l, start_month: l.start_month.slice(0, 7), installments: n });
  }

  return (
    <div>
      <PageHeader
        title="ภาระหนี้สินพนักงาน"
        description="เงินกู้บริษัท กยศ. กรมบังคับคดี สหกรณ์ — ระบบหักค่างวดในงวดเงินเดือนรายเดือนอัตโนมัติจนครบยอด"
        actions={
          <>
            {can("payroll", "export") && (
              <Button
                variant="secondary"
                onClick={() =>
                  downloadCsv("employee-loans.csv", [
                    ["เลขที่", "รหัส", "ชื่อ", "รายการ", "ผู้ให้กู้", "เงินต้น", "ดอกเบี้ย %/ปี", "ยอดผ่อนรวม", "ค่างวด", "เริ่มหัก", "ชำระแล้ว", "คงเหลือ", "สถานะ"],
                    ...list.map((l) => [l.doc_no, l.employees?.code, `${l.employees?.first_name} ${l.employees?.last_name}`, l.loan_name, l.lender, l.principal, l.interest_rate, l.total_payable, l.installment_amount, l.start_month, l.paid_amount, Number(l.total_payable) - Number(l.paid_amount), STATUS[l.status]?.[0]]),
                  ])
                }
              >
                ส่งออก
              </Button>
            )}
            {can("payroll", "create") && (
              <Button icon={<Plus className="size-4" />} onClick={() => setForm({ installments: 12, interest_rate: 0, start_month: new Date().toISOString().slice(0, 7), lender: "บริษัท", status: "active" })}>
                เพิ่มเงินกู้
              </Button>
            )}
          </>
        }
      />
      <Panel bodyClass="p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-line-soft px-3 py-2.5">
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-mute" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาพนักงาน / รายการ" className="h-9 pl-8 text-sm" />
          </div>
          <Select className="h-9 max-w-44 text-sm" value={status} onChange={(e) => setStatus(e.target.value)} placeholder="สถานะ: ทั้งหมด">
            {Object.entries(STATUS).map(([k, [l]]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </Select>
          <span className="num ml-auto text-sm text-ink-mute">
            {list.length} รายการ · คงเหลือรวม {money(list.reduce((s, l) => s + Number(l.total_payable) - Number(l.paid_amount), 0))} บาท
          </span>
        </div>
        {rows === null ? (
          <Spinner className="mx-auto my-12" />
        ) : list.length === 0 ? (
          <Empty title="ไม่มีรายการเงินกู้" />
        ) : (
          <div className="thin-scroll overflow-x-auto">
            <table className="w-full text-[14px]">
              <thead>
                <tr className="border-b border-line bg-paper/60 text-left text-[13px] text-ink-soft">
                  <th className="px-3 py-2 font-medium">พนักงาน</th>
                  <th className="px-3 py-2 font-medium">รายการ</th>
                  <th className="px-3 py-2 text-right font-medium">ยอดผ่อนรวม</th>
                  <th className="px-3 py-2 text-right font-medium">ค่างวด</th>
                  <th className="px-3 py-2 font-medium">เริ่มหัก</th>
                  <th className="px-3 py-2 text-right font-medium">ชำระแล้ว</th>
                  <th className="px-3 py-2 text-right font-medium">คงเหลือ</th>
                  <th className="px-3 py-2 font-medium">สถานะ</th>
                  <th className="w-px" />
                </tr>
              </thead>
              <tbody>
                {list.map((l) => {
                  const pct = Math.min(100, (Number(l.paid_amount) / Math.max(1, Number(l.total_payable))) * 100);
                  return (
                    <tr key={l.id} className="cursor-pointer border-b border-line-soft last:border-0 hover:bg-jade-50/40" onClick={() => setView(l)}>
                      <td className="px-3 py-2">
                        <span className="text-ink-mute">{l.employees?.code}</span> {l.employees?.first_name} {l.employees?.last_name}
                      </td>
                      <td className="px-3 py-2">
                        {l.loan_name}
                        <div className="text-xs text-ink-mute">
                          {l.lender ?? ""} {l.doc_no ? `· ${l.doc_no}` : ""}
                        </div>
                      </td>
                      <td className="num px-3 py-2 text-right">{money(l.total_payable)}</td>
                      <td className="num px-3 py-2 text-right">{money(l.installment_amount)}</td>
                      <td className="px-3 py-2">{monthText(l.start_month)}</td>
                      <td className="num px-3 py-2 text-right">
                        {money(l.paid_amount)}
                        <div className="ml-auto mt-1 h-1.5 w-24 rounded-full bg-jade-50">
                          <div className="h-1.5 rounded-full bg-jade-500" style={{ width: `${pct}%` }} />
                        </div>
                      </td>
                      <td className="num px-3 py-2 text-right font-medium">{money(Number(l.total_payable) - Number(l.paid_amount))}</td>
                      <td className="px-3 py-2">
                        <Badge color={STATUS[l.status]?.[1]}>{STATUS[l.status]?.[0]}</Badge>
                      </td>
                      <td className="px-2" onClick={(e) => e.stopPropagation()}>
                        {can("payroll", "edit") && (
                          <button className="rounded p-1.5 text-ink-mute hover:bg-jade-50 hover:text-jade-700" onClick={() => openEdit(l)} aria-label="แก้ไข">
                            <Pencil className="size-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Modal
        open={!!form}
        onClose={() => setForm(null)}
        size="xl"
        title={form?.id ? "แก้ไขเงินกู้" : "เพิ่มเงินกู้ / ภาระหนี้สิน"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setForm(null)}>
              ยกเลิก
            </Button>
            <Button loading={saving} onClick={save}>
              บันทึก
            </Button>
          </>
        }
      >
        {form && calc && (
          <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
            <div className="grid content-start gap-3 sm:grid-cols-2">
              <Field label="พนักงาน" required className="sm:col-span-2">
                <EmployeePicker value={form.employee_id ?? null} onChange={(v) => setForm({ ...form, employee_id: v ?? undefined })} options={lk.emps} disabled={!!form.id} />
              </Field>
              <Field label="ชื่อรายการ" required>
                <Input value={form.loan_name ?? ""} onChange={(e) => setForm({ ...form, loan_name: e.target.value })} placeholder="เช่น เงินกู้ฉุกเฉิน" />
              </Field>
              <Field label="ผู้ให้กู้ / หน่วยงาน">
                <Input list="lenders" value={form.lender ?? ""} onChange={(e) => setForm({ ...form, lender: e.target.value })} />
                <datalist id="lenders">
                  {LENDERS.map((l) => (
                    <option key={l} value={l} />
                  ))}
                </datalist>
              </Field>
              <Field label="รายการหักในสลิป">
                <Select value={form.pay_item_id ?? ""} onChange={(e) => setForm({ ...form, pay_item_id: Number(e.target.value) || null })} placeholder="หักชำระเงินกู้">
                  {loanItems.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="เงินต้น (บาท)" required>
                <Input type="money" className="num" value={form.principal ?? ""} onChange={(e) => setForm({ ...form, principal: e.target.value as unknown as number, installment_amount: undefined })} />
              </Field>
              <Field label="ดอกเบี้ย % ต่อปี (คงที่)">
                <Input type="number" step="0.01" className="num" value={form.interest_rate ?? 0} onChange={(e) => setForm({ ...form, interest_rate: e.target.value as unknown as number, installment_amount: undefined })} />
              </Field>
              <Field label="จำนวนงวด (เดือน)">
                <Input type="number" min={1} className="num" value={form.installments ?? 12} onChange={(e) => setForm({ ...form, installments: Number(e.target.value), installment_amount: undefined })} />
              </Field>
              <Field label="ค่างวดต่อเดือน" hint={`คำนวณได้ ${money(calc.installment)} — แก้ได้ถ้าต้องการปัดเศษ`}>
                <Input type="money" className="num" value={form.installment_amount ?? calc.installment} onChange={(e) => setForm({ ...form, installment_amount: e.target.value as unknown as number })} />
              </Field>
              <Field label="เริ่มหักเดือน" required>
                <Input type="month" value={String(form.start_month ?? "").slice(0, 7)} onChange={(e) => setForm({ ...form, start_month: e.target.value })} />
              </Field>
              <Field label="สถานะ">
                <Select value={form.status ?? "active"} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  {Object.entries(STATUS).map(([k, [l]]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="หมายเหตุ" className="sm:col-span-2">
                <Textarea rows={2} value={form.note ?? ""} onChange={(e) => setForm({ ...form, note: e.target.value })} />
              </Field>
            </div>
            <div>
              <div className="mb-2 grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-[var(--radius-ctl)] bg-paper px-3 py-2">
                  ดอกเบี้ย<div className="num font-semibold">{money(calc.interest)}</div>
                </div>
                <div className="rounded-[var(--radius-ctl)] bg-jade-50 px-3 py-2">
                  ยอดผ่อนรวม<div className="num font-semibold">{money(calc.total)}</div>
                </div>
              </div>
              <div className="thin-scroll max-h-80 overflow-y-auto rounded-[var(--radius-ctl)] border border-line">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-paper text-left text-xs text-ink-soft">
                    <tr>
                      <th className="px-2 py-1.5">งวด</th>
                      <th className="px-2 py-1.5">เดือน</th>
                      <th className="px-2 py-1.5 text-right">หัก</th>
                      <th className="px-2 py-1.5 text-right">คงเหลือ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((p) => (
                      <tr key={p.no} className={p.paid ? "text-ink-mute line-through" : ""}>
                        <td className="num px-2 py-1">{p.no}</td>
                        <td className="px-2 py-1">{monthText(p.month)}</td>
                        <td className="num px-2 py-1 text-right">{money(p.amount)}</td>
                        <td className="num px-2 py-1 text-right">{money(p.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </Modal>
      {view && <LoanView loan={view} onClose={() => setView(null)} />}
    </div>
  );
}

function LoanView({ loan, onClose }: { loan: Loan; onClose: () => void }) {
  const sb = supabaseBrowser();
  const [tab, setTab] = useState<"schedule" | "payments">("schedule");
  const [pays, setPays] = useState<Payment[] | null>(null);
  useEffect(() => {
    sb.from("loan_payments").select("id, pay_date, amount, note, period_id").eq("loan_id", loan.id).order("pay_date").then(({ data }: { data: unknown }) => setPays((data as Payment[]) ?? []));
  }, [sb, loan.id]);
  const sched = loanSchedule(Number(loan.total_payable), Number(loan.installment_amount), loan.start_month, Number(loan.paid_amount));
  return (
    <Modal open onClose={onClose} size="lg" title={`${loan.loan_name} — ${loan.employees?.first_name} ${loan.employees?.last_name}`}>
      <div className="mb-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <Box k="เงินต้น" v={money(loan.principal)} />
        <Box k="ยอดผ่อนรวม" v={money(loan.total_payable)} />
        <Box k="ชำระแล้ว" v={money(loan.paid_amount)} />
        <Box k="คงเหลือ" v={money(Number(loan.total_payable) - Number(loan.paid_amount))} strong />
      </div>
      <Tabs className="mb-3" value={tab} onChange={setTab} tabs={[{ value: "schedule", label: "ตารางผ่อน" }, { value: "payments", label: "ประวัติการหัก", count: pays?.length }]} />
      {tab === "schedule" ? (
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-ink-soft">
            <tr className="border-b border-line">
              <th className="py-1.5">งวด</th>
              <th className="py-1.5">เดือน</th>
              <th className="py-1.5 text-right">ค่างวด</th>
              <th className="py-1.5 text-right">คงเหลือ</th>
              <th className="py-1.5 text-right">สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {sched.map((s) => (
              <tr key={s.no} className="border-b border-line-soft">
                <td className="num py-1">{s.no}</td>
                <td className="py-1">{monthText(s.month)}</td>
                <td className="num py-1 text-right">{money(s.amount)}</td>
                <td className="num py-1 text-right">{money(s.balance)}</td>
                <td className="py-1 text-right">{s.paid ? <Badge color="green">หักแล้ว</Badge> : <Badge>รอหัก</Badge>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : pays === null ? (
        <Spinner className="mx-auto my-6" />
      ) : pays.length === 0 ? (
        <Empty title="ยังไม่มีการหักชำระ" description="ระบบบันทึกการหักเมื่อกด “บันทึกว่าจ่ายแล้ว” ในงวดเงินเดือน" />
      ) : (
        <table className="w-full text-sm">
          <tbody>
            {pays.map((p) => (
              <tr key={p.id} className="border-b border-line-soft">
                <td className="py-1.5">{thDate(p.pay_date)}</td>
                <td className="py-1.5 text-ink-soft">{p.note}</td>
                <td className="num py-1.5 text-right">{money(p.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Modal>
  );
}

function Box({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className={`rounded-[var(--radius-ctl)] px-3 py-2 ${strong ? "bg-jade-50" : "bg-paper"}`}>
      <div className="text-ink-soft">{k}</div>
      <div className="num font-semibold">{v}</div>
    </div>
  );
}

function newLoanNo() {
  const now = new Date();
  return `LN${now.toISOString().slice(2, 7).replace("-", "")}-${now.getTime() % 100000}`;
}
