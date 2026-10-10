"use client";

import { useCallback, useEffect, useState } from "react";
import { Eye, EyeOff, ShieldAlert } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useSetting } from "@/components/settings/use-setting";
import { DEFAULT_PDPA, isMasked, type PdpaMasks } from "@/lib/pdpa";
import { useCan } from "@/components/app/me-context";
import { Button, Empty, Panel, Spinner, toast } from "@/components/ui";
import type { FieldDef } from "@/components/crud/form-fields";
import { RecordForm } from "@/components/employees/record-form";
import { BANKS, PAY_METHOD, SALARY_UNIT, TAX_METHOD, bankOptions, payMethodOptions, salaryUnitOptions, taxMethodOptions } from "@/lib/employees/labels";
import { formatNationalId, maskAccount, maskNationalId, money, thDate, validNationalId } from "@/lib/format";
import type { TabProps } from "./types";

const idCheck = (v: unknown) => (v && !validNationalId(String(v)) ? "เลขประจำตัวประชาชนไม่ถูกต้อง (ตรวจสอบหลักสุดท้าย)" : null);
const pct = (v: unknown) => (v !== "" && v != null && (Number(v) < 0 || Number(v) > 100) ? "ระบุ 0–100" : null);

const FIELDS: FieldDef[] = [
  { name: "salary", label: "เงินเดือน / ค่าจ้าง", type: "money", required: true, min: 0, section: "ค่าจ้าง", validate: (v) => (Number(v) < 0 ? "ต้องไม่ติดลบ" : null) },
  { name: "salary_unit", label: "หน่วยค่าจ้าง", type: "select", required: true, options: salaryUnitOptions, section: "ค่าจ้าง" },
  { name: "pay_method", label: "วิธีจ่าย", type: "select", required: true, options: payMethodOptions, section: "ค่าจ้าง" },
  { name: "bank_code", label: "ธนาคาร", type: "select", options: bankOptions, section: "บัญชีธนาคาร", hidden: (v) => v.pay_method !== "bank" },
  { name: "bank_branch", label: "สาขาธนาคาร", type: "text", section: "บัญชีธนาคาร", hidden: (v) => v.pay_method !== "bank" },
  { name: "bank_account", label: "เลขที่บัญชี", type: "text", section: "บัญชีธนาคาร", hidden: (v) => v.pay_method !== "bank", validate: (v, all) => (all.pay_method === "bank" && v && !/^\d{10,15}$/.test(String(v).replace(/\D/g, "")) ? "เลขที่บัญชีต้องเป็นตัวเลข 10–15 หลัก" : null) },
  { name: "bank_account_name", label: "ชื่อบัญชี", type: "text", section: "บัญชีธนาคาร", hidden: (v) => v.pay_method !== "bank" },
  { name: "national_id", label: "เลขประจำตัวประชาชน", type: "text", section: "บัตรและเอกสาร", validate: idCheck, placeholder: "13 หลัก" },
  { name: "tax_id", label: "เลขประจำตัวผู้เสียภาษี", type: "text", section: "บัตรและเอกสาร", hint: "เว้นว่าง = ใช้เลขบัตรประชาชน" },
  { name: "passport_no", label: "เลขหนังสือเดินทาง", type: "text", section: "บัตรและเอกสาร" },
  { name: "passport_expire", label: "หนังสือเดินทางหมดอายุ", type: "date", section: "บัตรและเอกสาร" },
  { name: "work_permit_no", label: "เลขใบอนุญาตทำงาน", type: "text", section: "บัตรและเอกสาร" },
  { name: "work_permit_expire", label: "ใบอนุญาตทำงานหมดอายุ", type: "date", section: "บัตรและเอกสาร" },
  { name: "visa_no", label: "เลขวีซ่า", type: "text", section: "บัตรและเอกสาร" },
  { name: "visa_expire", label: "วีซ่าหมดอายุ", type: "date", section: "บัตรและเอกสาร" },
  { name: "sso_enabled", label: "หักประกันสังคม", type: "boolean", section: "ประกันสังคม" },
  { name: "sso_no", label: "เลขที่ประกันสังคม", type: "text", section: "ประกันสังคม", hidden: (v) => !v.sso_enabled },
  { name: "sso_hospital", label: "โรงพยาบาลตามสิทธิ", type: "text", section: "ประกันสังคม", hidden: (v) => !v.sso_enabled },
  { name: "sso_hospital_code", label: "รหัสโรงพยาบาล", type: "text", section: "ประกันสังคม", hidden: (v) => !v.sso_enabled },
  { name: "pvd_enabled", label: "เป็นสมาชิกกองทุนสำรองเลี้ยงชีพ", type: "boolean", section: "กองทุนสำรองเลี้ยงชีพ" },
  { name: "pvd_no", label: "เลขสมาชิก", type: "text", section: "กองทุนสำรองเลี้ยงชีพ", hidden: (v) => !v.pvd_enabled },
  { name: "pvd_join_date", label: "วันที่เข้ากองทุน", type: "date", section: "กองทุนสำรองเลี้ยงชีพ", hidden: (v) => !v.pvd_enabled },
  { name: "pvd_employee_rate", label: "อัตราสะสมลูกจ้าง (%)", type: "number", step: "0.01", min: 0, max: 15, section: "กองทุนสำรองเลี้ยงชีพ", hidden: (v) => !v.pvd_enabled, validate: (v) => (v !== "" && v != null && (Number(v) < 2 || Number(v) > 15) ? "ตามกฎหมาย 2–15%" : null) },
  { name: "pvd_employer_rate", label: "อัตราสมทบนายจ้าง (%)", type: "number", step: "0.01", min: 0, section: "กองทุนสำรองเลี้ยงชีพ", hidden: (v) => !v.pvd_enabled, validate: pct },
  { name: "tax_method", label: "วิธีหักภาษี ณ ที่จ่าย", type: "select", required: true, options: taxMethodOptions, section: "ภาษี" },
  { name: "tax_fixed_rate", label: "อัตราคงที่ (%)", type: "number", step: "0.01", min: 0, max: 100, section: "ภาษี", hidden: (v) => v.tax_method !== "fixed_rate", validate: pct },
  { name: "tax_paid_by_employer", label: "นายจ้างออกภาษีแทน", type: "boolean", section: "ภาษี" },
  { name: "prev_employer_income", label: "เงินได้จากนายจ้างเดิม (ปีนี้)", type: "money", min: 0, section: "รายได้สะสมจากนายจ้างเดิม (ปีภาษีนี้)" },
  { name: "prev_employer_tax", label: "ภาษีที่ถูกหักแล้ว", type: "money", min: 0, section: "รายได้สะสมจากนายจ้างเดิม (ปีภาษีนี้)" },
  { name: "prev_employer_sso", label: "ประกันสังคมที่จ่ายแล้ว", type: "money", min: 0, section: "รายได้สะสมจากนายจ้างเดิม (ปีภาษีนี้)" },
  { name: "prev_employer_pvd", label: "กองทุนสำรองฯ ที่สะสมแล้ว", type: "money", min: 0, section: "รายได้สะสมจากนายจ้างเดิม (ปีภาษีนี้)" },
];

export function PrivateTab({ emp }: TabProps) {
  const can = useCan();
  const sb = supabaseBrowser();
  const [row, setRow] = useState<Record<string, unknown> | null | undefined>(undefined);
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  // ตั้งค่า → PDPA: ช่องไหนปิดบังเป็นค่าเริ่มต้น (กด "แสดง" เปิดทุกช่อง และบันทึก VIEW_SENSITIVE)
  const { value: pdpa } = useSetting<PdpaMasks>("pdpa", DEFAULT_PDPA);

  const load = useCallback(async () => {
    const { data, error } = await sb.from("employee_private").select("*").eq("employee_id", emp.id).maybeSingle();
    if (error) toast.error(error.message);
    setRow((data as Record<string, unknown>) ?? null);
  }, [sb, emp.id]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount / reset form when opened
    load();
  }, [load]);

  async function reveal() {
    if (shown) return setShown(false);
    setBusy(true);
    const { error } = await sb.rpc("log_sensitive_view", { p_table: "employee_private", p_record: String(emp.id), p_field: "salary,bank_account,national_id" });
    setBusy(false);
    if (error) return toast.error(`ไม่สามารถบันทึกการเข้าดูข้อมูลได้: ${error.message}`);
    setShown(true);
  }

  if (row === undefined) return <Panel><div className="py-12"><Spinner className="mx-auto" /></div></Panel>;
  if (row === null) return <Panel><Empty icon={<ShieldAlert className="size-8" />} title="ไม่มีสิทธิ์ดูข้อมูลส่วนนี้" description="ข้อมูลเงินเดือนและบัญชีเป็นข้อมูลอ่อนไหวตาม PDPA" /></Panel>;

  const mask = (s: string) => (shown ? s : "••••••");
  const hidden = (f: "national_id" | "bank_account" | "salary") => isMasked(f, pdpa, shown);
  const canEdit = can("employee_private", "edit");

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-panel)] border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-ink">
        <span className="inline-flex items-center gap-2"><ShieldAlert className="size-4" />ข้อมูลอ่อนไหว (PDPA) ซ่อนไว้โดยค่าเริ่มต้น การกด “แสดง” จะถูกบันทึกใน Back Log</span>
        <Button size="sm" variant="secondary" icon={shown ? <EyeOff className="size-4" /> : <Eye className="size-4" />} onClick={reveal} loading={busy}>
          {shown ? "ซ่อน" : "แสดง"}
        </Button>
      </div>
      <RecordForm
        title="เงินเดือนและบัญชี"
        fields={FIELDS}
        row={row}
        canEdit={canEdit}
        display={{
          salary: (v, r) => <span className="num font-medium">{hidden("salary") ? "••••••" : money(v as number)} <span className="font-normal text-ink-mute">{SALARY_UNIT[String(r.salary_unit)]}</span></span>,
          salary_unit: (v) => SALARY_UNIT[String(v)] ?? "-",
          pay_method: (v) => PAY_METHOD[String(v)] ?? "-",
          bank_code: (v) => (v ? `${v} ${BANKS[String(v)] ?? ""}` : "-"),
          bank_account: (v) => <span className="num">{v ? (hidden("bank_account") ? maskAccount(String(v)) : String(v)) : "-"}</span>,
          national_id: (v) => <span className="num">{v ? (hidden("national_id") ? maskNationalId(String(v)) : formatNationalId(String(v))) : "-"}</span>,
          tax_id: (v) => <span className="num">{v ? (hidden("national_id") ? maskNationalId(String(v)) : String(v)) : "-"}</span>,
          passport_no: (v) => (v ? mask(String(v)) : "-"),
          tax_method: (v) => TAX_METHOD[String(v)] ?? "-",
          prev_employer_income: (v) => <span className="num">{mask(money(v as number))}</span>,
          prev_employer_tax: (v) => <span className="num">{mask(money(v as number))}</span>,
          pvd_employee_rate: (v) => (v == null ? "-" : <span className="num">{String(v)}%</span>),
          pvd_employer_rate: (v) => (v == null ? "-" : <span className="num">{String(v)}%</span>),
          passport_expire: expiry,
          work_permit_expire: expiry,
          visa_expire: expiry,
        }}
        onSave={async (v) => {
          if (v.national_id) v.national_id = String(v.national_id).replace(/\D/g, "");
          if (v.bank_account) v.bank_account = String(v.bank_account).replace(/\D/g, "");
          const r = await sb.from("employee_private").update(v).eq("employee_id", emp.id);
          if (!r.error) {
            await load();
            setShown(true);
          }
          return r;
        }}
      />
    </div>
  );
}

function expiry(v: unknown) {
  if (!v) return "-";
  const s = String(v);
  const days = daysUntil(s);
  return (
    <span className="num">
      {thDate(s)} {days < 0 ? <span className="text-rust">(หมดอายุแล้ว)</span> : days <= 60 ? <span className="text-amber-ink">(อีก {days} วัน)</span> : null}
    </span>
  );
}

function daysUntil(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  const today = new Date(new Date().toDateString());
  return Math.round((new Date(y, m - 1, d).getTime() - today.getTime()) / 86400000);
}
