"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, Banknote, Calculator, Check, CheckCheck, Download, FileSpreadsheet, Lock, Printer, Search, Send, Trash2, Undo2 } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useCan } from "@/components/app/me-context";
import { Badge, Button, Empty, Input, Modal, PageHeader, Panel, Select, Spinner, Stat, Tabs, clsx, toast, useConfirm } from "@/components/ui";
import { money, thDate, thDateTime } from "@/lib/format";
import { BANK_FORMATS } from "@/lib/payroll/files";
import { PERIOD_TYPE_LABEL, STATUS_COLOR, STATUS_STEPS, STATUS_TEXT, UNIT_LABEL, sumBy } from "@/lib/payroll/labels";
import { fetchRows } from "@/lib/payroll/fetch";
import { calculateAction, workflowAction } from "@/app/(admin)/payroll/actions";
import { EntryDetailModal } from "./entry-detail";
import { AdjustmentsTab } from "./adjustments-tab";
import { CommissionsTab } from "./commissions-tab";
import { exportBankFile, exportCashList, exportRegister } from "./exports";
import { ENTRY_COLS, type Entry, type PeriodFull } from "./types";

type Tab = "entries" | "adjustments" | "commissions";

export function PeriodWorkspace({ id }: { id: number }) {
  const sb = supabaseBrowser();
  const can = useCan();
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [period, setPeriod] = useState<PeriodFull | null | undefined>(undefined);
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [orgs, setOrgs] = useState<Map<number, string>>(new Map());
  const [branches, setBranches] = useState<{ id: number; name: string }[]>([]);
  const [tab, setTab] = useState<Tab>("entries");
  const [busy, setBusy] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState({ org: "", branch: "", unit: "", pay: "", warn: false });
  const [detail, setDetail] = useState<Entry | null>(null);
  const [bankOpen, setBankOpen] = useState(false);
  const [bankFmt, setBankFmt] = useState("generic");
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    const { data: p, error } = await sb.from("payroll_periods").select("*").eq("id", id).maybeSingle();
    if (error) toast.error(error.message);
    setPeriod((p as PeriodFull) ?? null);
    if (!p) return;
    const rows = await fetchRows<Entry>(() => sb.from("payroll_entries").select(ENTRY_COLS).eq("period_id", id).order("emp_code").order("id"));
    setEntries(rows);
  }, [sb, id]);

  useEffect(() => {
    load().catch((e) => toast.error(String(e?.message ?? e)));
    sb.from("org_units").select("id, name").then(({ data }: { data: unknown }) => setOrgs(new Map(((data as { id: number; name: string }[]) ?? []).map((o) => [o.id, o.name]))));
    sb.from("branches").select("id, name").order("code").then(({ data }: { data: unknown }) => setBranches((data as { id: number; name: string }[]) ?? []));
    sb.from("settings").select("value").eq("key", "payroll").maybeSingle().then(({ data }: { data: unknown }) => {
      const f = ((data as { value?: Record<string, unknown> } | null)?.value)?.bank_file_format;
      if (typeof f === "string" && BANK_FORMATS.some((x) => x.key === f)) setBankFmt(f);
    });
  }, [load, sb]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (entries ?? []).filter(
      (e) =>
        (!t || e.emp_code.toLowerCase().includes(t) || e.emp_name.toLowerCase().includes(t)) &&
        (!filter.org || String(e.org_unit_id) === filter.org) &&
        (!filter.branch || String(e.branch_id) === filter.branch) &&
        (!filter.unit || e.salary_unit === filter.unit) &&
        (!filter.pay || e.pay_method === filter.pay) &&
        (!filter.warn || (e.calc_detail?.warnings?.length ?? 0) > 0),
    );
  }, [entries, q, filter]);

  if (period === undefined) return <Spinner className="mx-auto mt-20" />;
  if (period === null) return <Empty title="ไม่พบงวดเงินเดือนนี้" action={<Link href="/payroll" className="text-jade-700 underline">กลับไปหน้างวดเงินเดือน</Link>} />;

  const st = period.status;
  const editable = st === "open" || st === "calculated";
  const all = entries ?? [];
  const warnCount = all.filter((e) => (e.calc_detail?.warnings?.length ?? 0) > 0).length;

  async function run(key: string, fn: () => Promise<{ ok: boolean; error?: string; message?: string; data?: unknown }>, ask?: string, danger?: boolean) {
    if (ask && !(await confirm(ask, { danger }))) return;
    setBusy(key);
    const r = await fn();
    setBusy(null);
    if (!r.ok) return toast.error(r.error ?? "ทำรายการไม่สำเร็จ");
    return r;
  }

  async function calculate() {
    const r = await run("calc", () => calculateAction(id), st === "calculated" ? "คำนวณใหม่ทั้งงวด? ผลการคำนวณเดิมจะถูกแทนที่" : undefined);
    if (!r) return;
    const d = r.data as { employees: number; warnings: number; ms: number };
    toast.ok(`คำนวณแล้ว ${d.employees} คน (${(d.ms / 1000).toFixed(1)} วินาที)${d.warnings ? ` · ต้องตรวจสอบ ${d.warnings} คน` : ""}`);
    setDirty(false);
    load();
  }
  async function wf(action: Parameters<typeof workflowAction>[1], ask?: string, danger?: boolean) {
    const r = await run(action, () => workflowAction(id, action), ask, danger);
    if (!r) return;
    toast.ok(String(r.data ?? "เรียบร้อย"));
    if (action === "delete") return router.push("/payroll");
    load();
  }

  const stepIndex = STATUS_STEPS.findIndex((s) => s.value === st);
  const canApprove = can("payroll", "approve");
  const canEdit = can("payroll", "edit");

  const actions = (
    <>
      {editable && canEdit && (
        <Button icon={<Calculator className="size-4" />} loading={busy === "calc"} onClick={calculate}>
          {st === "open" ? "คำนวณเงินเดือน" : "คำนวณใหม่"}
        </Button>
      )}
      {st === "calculated" && canApprove && (
        <Button variant="secondary" icon={<Check className="size-4" />} loading={busy === "approve"} onClick={() => wf("approve", `อนุมัติงวด “${period.name}”? หลังอนุมัติจะแก้ไขรายการในงวดไม่ได้จนกว่าจะเปิดแก้ไข`)} disabled={dirty}>
          อนุมัติ
        </Button>
      )}
      {(st === "approved" || st === "paid") && canApprove && (
        <Button variant="ghost" icon={<Undo2 className="size-4" />} loading={busy === "reopen"} onClick={() => wf("reopen", st === "paid" ? "เปิดแก้ไขงวดที่จ่ายแล้ว? ระบบจะยกเลิกการตัดยอดเงินกู้ เบิกล่วงหน้า และเงินประกันของงวดนี้ และซ่อนสลิปจากพนักงาน" : "เปิดแก้ไขงวดนี้? สถานะจะกลับเป็น “คำนวณแล้ว” และสลิปจะถูกซ่อนจากพนักงาน")}>
          เปิดแก้ไข
        </Button>
      )}
      {st === "approved" && canApprove && (
        <Button icon={<Banknote className="size-4" />} loading={busy === "paid"} onClick={() => wf("paid", "บันทึกว่าจ่ายเงินงวดนี้แล้ว? ระบบจะตัดยอดเงินกู้ เบิกล่วงหน้า และเงินประกันการทำงานตามรายการในงวด")}>
          บันทึกว่าจ่ายแล้ว
        </Button>
      )}
      {st === "paid" && canApprove && (
        <Button variant="secondary" icon={<Lock className="size-4" />} loading={busy === "close"} onClick={() => wf("close", "ปิดงวดนี้? หลังปิดงวดจะเปิดแก้ไขไม่ได้ และเวลาทำงานในช่วงตัดรอบจะถูกล็อก", true)}>
          ปิดงวด
        </Button>
      )}
      {["approved", "paid", "closed"].includes(st) && canApprove && (
        <Button variant={period.payslip_published ? "ghost" : "secondary"} icon={<Send className="size-4" />} loading={busy === "publish" || busy === "unpublish"} onClick={() => wf(period.payslip_published ? "unpublish" : "publish", period.payslip_published ? "ซ่อนสลิปจากพนักงาน?" : "เผยแพร่สลิปให้พนักงานดูในแอป และส่งการแจ้งเตือน?")}>
          {period.payslip_published ? "ยกเลิกเผยแพร่สลิป" : "เผยแพร่สลิป"}
        </Button>
      )}
    </>
  );

  return (
    <div>
      <PageHeader
        back={
          <Link href="/payroll" className="no-print mb-1 inline-flex items-center gap-1 text-sm text-ink-soft hover:text-jade-700">
            <ArrowLeft className="size-4" /> งวดเงินเดือน
          </Link>
        }
        title={period.name}
        description={
          <span className="num">
            {PERIOD_TYPE_LABEL[period.period_type]} · งวด {thDate(period.start_date)} – {thDate(period.end_date)} · ตัดเวลา {thDate(period.att_start_date ?? period.start_date)} – {thDate(period.att_end_date ?? period.end_date)} · จ่าย {thDate(period.pay_date, "long")}
          </span>
        }
        actions={actions}
      />

      {/* stepper */}
      <ol className="mb-4 grid grid-cols-5 overflow-hidden rounded-[var(--radius-panel)] border border-line bg-white text-sm">
        {STATUS_STEPS.map((s, i) => (
          <li key={s.value} className={clsx("flex items-center gap-2 border-r border-line-soft px-3 py-2.5 last:border-0", i < stepIndex && "text-jade-700", i === stepIndex && "bg-jade-50 font-semibold text-jade-900", i > stepIndex && "text-ink-mute")}>
            <span className={clsx("grid size-6 shrink-0 place-items-center rounded-full text-xs", i < stepIndex ? "bg-jade-600 text-white" : i === stepIndex ? "bg-jade-700 text-white" : "bg-paper text-ink-mute ring-1 ring-line")}>
              {i < stepIndex ? <CheckCheck className="size-3.5" /> : i + 1}
            </span>
            <span className="truncate">{s.label}</span>
          </li>
        ))}
      </ol>
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-ink-soft">
        <Badge color={STATUS_COLOR[st]}>{STATUS_TEXT[st]}</Badge>
        {period.payslip_published && <Badge color="green">เผยแพร่สลิปแล้ว</Badge>}
        {period.calculated_at && <span>คำนวณล่าสุด {thDateTime(period.calculated_at)}</span>}
        {period.approved_at && <span>· อนุมัติ {thDateTime(period.approved_at)}</span>}
        {dirty && editable && (
          <span className="inline-flex items-center gap-1 text-amber-ink">
            <AlertTriangle className="size-4" /> มีการแก้ไขรายการ กรุณาคำนวณใหม่ก่อนอนุมัติ
          </span>
        )}
        {editable && can("payroll", "delete") && (
          <button className="ml-auto inline-flex items-center gap-1 text-rust hover:underline" onClick={() => wf("delete", "ลบงวดนี้และผลการคำนวณทั้งหมด?", true)}>
            <Trash2 className="size-4" /> ลบงวด
          </button>
        )}
      </div>

      {/* summary */}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="พนักงาน" value={all.length.toLocaleString()} sub={warnCount ? `ต้องตรวจสอบ ${warnCount} คน` : "ไม่มีรายการต้องตรวจสอบ"} tone={warnCount ? "amber" : undefined} />
        <Stat label="รายได้รวม" value={money(sumBy(all, (e) => e.total_income), 0)} />
        <Stat label="รายการหักรวม" value={money(sumBy(all, (e) => e.total_deduction), 0)} />
        <Stat label="ภาษีหัก ณ ที่จ่าย" value={money(sumBy(all, (e) => e.tax), 0)} />
        <Stat label="ประกันสังคม" value={money(sumBy(all, (e) => Number(e.sso_employee) + Number(e.sso_employer)), 0)} sub={`ลูกจ้าง ${money(sumBy(all, (e) => e.sso_employee), 0)} · นายจ้าง ${money(sumBy(all, (e) => e.sso_employer), 0)}`} />
        <Stat label="จ่ายสุทธิ" value={money(sumBy(all, (e) => e.net_pay), 0)} sub={`โอน ${all.filter((e) => e.pay_method === "bank").length} · เงินสด ${all.filter((e) => e.pay_method !== "bank").length} คน`} />
      </div>

      <Tabs
        className="mb-4"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "entries", label: "รายการเงินเดือน", count: all.length },
          { value: "adjustments", label: "รายรับรายจ่ายงวดนี้" },
          { value: "commissions", label: "ค่าคอมมิชชั่น" },
        ]}
      />

      {tab === "entries" && (
        <Panel bodyClass="p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-soft px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full sm:w-56">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-mute" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหารหัส / ชื่อ" className="h-9 pl-8 text-sm" />
              </div>
              <Select className="h-9 max-w-52 text-sm" value={filter.org} onChange={(e) => setFilter({ ...filter, org: e.target.value })} placeholder="หน่วยงาน: ทั้งหมด">
                {[...new Set(all.map((e) => e.org_unit_id))].filter(Boolean).map((o) => (
                  <option key={o} value={String(o)}>
                    {orgs.get(o!) ?? o}
                  </option>
                ))}
              </Select>
              {branches.length > 1 && (
                <Select className="h-9 max-w-52 text-sm" value={filter.branch} onChange={(e) => setFilter({ ...filter, branch: e.target.value })} placeholder="สาขา: ทั้งหมด">
                  {branches.map((b) => (
                    <option key={b.id} value={String(b.id)}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              )}
              <Select className="h-9 max-w-52 text-sm" value={filter.unit} onChange={(e) => setFilter({ ...filter, unit: e.target.value })} placeholder="รายเดือน/รายวัน: ทั้งหมด">
                <option value="month">รายเดือน</option>
                <option value="day">รายวัน</option>
                <option value="hour">รายชั่วโมง</option>
              </Select>
              <Select className="h-9 max-w-52 text-sm" value={filter.pay} onChange={(e) => setFilter({ ...filter, pay: e.target.value })} placeholder="วิธีจ่าย: ทั้งหมด">
                <option value="bank">โอนธนาคาร</option>
                <option value="cash">เงินสด</option>
                <option value="cheque">เช็ค</option>
              </Select>
              <Button size="sm" variant={filter.warn ? "subtle" : "ghost"} icon={<AlertTriangle className="size-4" />} onClick={() => setFilter({ ...filter, warn: !filter.warn })}>
                ต้องตรวจสอบ
              </Button>
            </div>
            {all.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {can("payroll", "export") && (
                  <>
                    <Button size="sm" variant="secondary" icon={<Download className="size-4" />} onClick={() => setBankOpen(true)}>
                      ไฟล์โอนธนาคาร
                    </Button>
                    <Button size="sm" variant="secondary" icon={<FileSpreadsheet className="size-4" />} onClick={() => exportRegister(period, filtered, (o) => (o ? orgs.get(o) ?? "" : "")).catch((e) => toast.error(e.message))}>
                      ทะเบียนเงินเดือน
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<Banknote className="size-4" />}
                      onClick={() => {
                        const n = exportCashList(period, all);
                        if (!n) toast.info("ไม่มีพนักงานที่รับเงินสด");
                      }}
                    >
                      รายชื่อรับเงินสด
                    </Button>
                  </>
                )}
                <Link href={`/payroll/${id}/payslips`} target="_blank" className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-ctl)] border border-line bg-white px-2.5 text-sm font-medium hover:bg-jade-50">
                  <Printer className="size-4" /> พิมพ์สลิปทั้งหมด
                </Link>
              </div>
            )}
          </div>
          {entries === null ? (
            <Spinner className="mx-auto my-12" />
          ) : all.length === 0 ? (
            <Empty
              icon={<Calculator className="size-8" />}
              title="ยังไม่ได้คำนวณเงินเดือนงวดนี้"
              description="ตรวจสอบรายรับรายจ่ายงวดนี้และเวลาทำงานให้เรียบร้อย แล้วกด “คำนวณเงินเดือน”"
              action={editable && canEdit ? <Button icon={<Calculator className="size-4" />} loading={busy === "calc"} onClick={calculate}>คำนวณเงินเดือน</Button> : undefined}
            />
          ) : (
            <div className="thin-scroll overflow-x-auto">
              <table className="w-full text-[14px]">
                <thead>
                  <tr className="border-b border-line bg-paper/60 text-left text-[13px] text-ink-soft">
                    <th className="px-3 py-2 font-medium">รหัส</th>
                    <th className="px-3 py-2 font-medium">ชื่อ-สกุล</th>
                    <th className="px-3 py-2 font-medium">หน่วยงาน</th>
                    <th className="px-3 py-2 text-right font-medium">ฐาน</th>
                    <th className="px-3 py-2 text-right font-medium">รายได้</th>
                    <th className="px-3 py-2 text-right font-medium">รายการหัก</th>
                    <th className="px-3 py-2 text-right font-medium">ภาษี</th>
                    <th className="px-3 py-2 text-right font-medium">สปส.</th>
                    <th className="px-3 py-2 text-right font-medium">PVD</th>
                    <th className="px-3 py-2 text-right font-medium">สุทธิ</th>
                    <th className="w-8 px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((e) => {
                    const w = e.calc_detail?.warnings ?? [];
                    return (
                      <tr key={e.id} className="cursor-pointer border-b border-line-soft last:border-0 hover:bg-jade-50/40" onClick={() => setDetail(e)}>
                        <td className="px-3 py-2 text-ink-soft">{e.emp_code}</td>
                        <td className="px-3 py-2">
                          <div className="font-medium">{e.emp_name}</div>
                          <div className="text-xs text-ink-mute">{e.position_name}</div>
                        </td>
                        <td className="px-3 py-2 text-ink-soft">{orgs.get(e.org_unit_id ?? 0) ?? "-"}</td>
                        <td className="num px-3 py-2 text-right">
                          {money(e.base_salary)}
                          <span className="text-xs text-ink-mute">/{UNIT_LABEL[e.salary_unit] ?? ""}</span>
                        </td>
                        <td className="num px-3 py-2 text-right">{money(e.total_income)}</td>
                        <td className="num px-3 py-2 text-right">{money(e.total_deduction)}</td>
                        <td className="num px-3 py-2 text-right">{money(e.tax)}</td>
                        <td className="num px-3 py-2 text-right">{money(e.sso_employee)}</td>
                        <td className="num px-3 py-2 text-right">{money(e.pvd_employee)}</td>
                        <td className={clsx("num px-3 py-2 text-right font-semibold", Number(e.net_pay) < 0 && "text-rust")}>{money(e.net_pay)}</td>
                        <td className="px-2 py-2 text-center">{w.length > 0 && <AlertTriangle className="inline size-4 text-amber-ink" aria-label={w.join(", ")} />}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-line bg-paper/60 font-semibold">
                    <td className="px-3 py-2" colSpan={4}>
                      รวม {filtered.length} คน
                    </td>
                    <td className="num px-3 py-2 text-right">{money(sumBy(filtered, (e) => e.total_income))}</td>
                    <td className="num px-3 py-2 text-right">{money(sumBy(filtered, (e) => e.total_deduction))}</td>
                    <td className="num px-3 py-2 text-right">{money(sumBy(filtered, (e) => e.tax))}</td>
                    <td className="num px-3 py-2 text-right">{money(sumBy(filtered, (e) => e.sso_employee))}</td>
                    <td className="num px-3 py-2 text-right">{money(sumBy(filtered, (e) => e.pvd_employee))}</td>
                    <td className="num px-3 py-2 text-right">{money(sumBy(filtered, (e) => e.net_pay))}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </Panel>
      )}
      {tab === "adjustments" && (
        <Panel>
          <AdjustmentsTab periodId={id} editable={editable} onChanged={() => setDirty(true)} />
        </Panel>
      )}
      {tab === "commissions" && (
        <Panel>
          <CommissionsTab periodId={id} editable={editable} onChanged={() => setDirty(true)} />
        </Panel>
      )}

      <EntryDetailModal entry={detail} onClose={() => setDetail(null)} />
      <Modal
        open={bankOpen}
        onClose={() => setBankOpen(false)}
        title="ไฟล์โอนเงินเดือนเข้าธนาคาร"
        footer={
          <>
            <Button variant="secondary" onClick={() => setBankOpen(false)}>
              ยกเลิก
            </Button>
            <Button
              icon={<Download className="size-4" />}
              onClick={async () => {
                try {
                  const r = await exportBankFile(bankFmt, period, all);
                  toast.ok(`สร้างไฟล์ ${r.count} รายการ ยอดรวม ${money(r.total)} บาท${r.missing ? ` · ไม่มีเลขบัญชี ${r.missing} คน` : ""}`);
                  setBankOpen(false);
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : String(e));
                }
              }}
            >
              ดาวน์โหลด
            </Button>
          </>
        }
      >
        <p className="mb-3 text-sm text-ink-soft">รวมเฉพาะพนักงานที่รับเงินผ่านธนาคารและมียอดสุทธิมากกว่า 0 ({all.filter((e) => e.pay_method === "bank" && Number(e.net_pay) > 0).length} คน)</p>
        <div className="flex flex-col gap-2">
          {BANK_FORMATS.map((f) => (
            <label key={f.key} className={clsx("flex cursor-pointer gap-3 rounded-[var(--radius-ctl)] border px-3 py-2.5", bankFmt === f.key ? "border-jade-500 bg-jade-50" : "border-line")}>
              <input type="radio" className="mt-1 accent-jade-600" checked={bankFmt === f.key} onChange={() => setBankFmt(f.key)} />
              <span>
                <span className="font-medium">{f.label}</span>
                <span className="block text-xs text-ink-mute">{f.description}</span>
              </span>
            </label>
          ))}
        </div>
        <p className="mt-3 text-xs text-ink-mute">บัญชีบริษัทและรหัสบริษัทตั้งค่าได้ที่ ตั้งค่าเวลา / เงินเดือน / ภาษี (payroll.company_bank) · ตรวจรูปแบบไฟล์กับธนาคารก่อนใช้งานจริงครั้งแรก</p>
      </Modal>
      {dialog}
    </div>
  );
}
