"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useCan } from "@/components/app/me-context";
import { Button, Checkbox, Field, Input, PageHeader, Panel, Select, Spinner, Tabs, Textarea, Toggle, clsx } from "@/components/ui";
import { useSetting } from "./use-setting";

// ---------------------------------------------------------------- types & defaults (mirror supabase/seed.sql)
type Att = {
  allow_outside_area: boolean; face_threshold: number; allow_self_schedule: boolean; absent_if_no_scan: boolean; single_scan_policy: string;
  auto_ot_without_request: boolean; ot_rates: { workday: number; holiday_monthly: number; holiday_daily: number; holiday_ot: number };
  late_policy: { mode: string; free_times_per_month: number; round_to_minutes?: number };
  diligence: { enabled: boolean; pay_item_code: string; steps: number[]; reset_on: string[] };
};
const ATT: Att = {
  allow_outside_area: false, face_threshold: 0.55, allow_self_schedule: false, absent_if_no_scan: true, single_scan_policy: "missing", auto_ot_without_request: false,
  ot_rates: { workday: 1.5, holiday_monthly: 1, holiday_daily: 2, holiday_ot: 3 },
  late_policy: { mode: "deduct_minutes", free_times_per_month: 0 },
  diligence: { enabled: false, pay_item_code: "DILIGENCE", steps: [500, 600, 700], reset_on: ["late", "absent", "leave_unpaid"] },
};
type Pay = {
  daily_divisor: number; hours_per_day: number; round_mode: string; advance_limit_percent: number; prorate_new_joiner: boolean;
  deduct_absent: boolean; deduct_late: boolean; deduct_early: boolean; payslip_password: string; payslip_show_ytd?: boolean; payslip_note?: string;
  bank_file_format: string; company_bank: { bank_code: string; account: string; branch: string; company_id?: string };
};
const PAY: Pay = {
  daily_divisor: 30, hours_per_day: 8, round_mode: "satang", advance_limit_percent: 50, prorate_new_joiner: true, deduct_absent: true, deduct_late: true, deduct_early: true,
  payslip_password: "birthdate", payslip_show_ytd: true, payslip_note: "", bank_file_format: "generic", company_bank: { bank_code: "004", account: "", branch: "", company_id: "" },
};
type Bracket = { upto: number | null; rate: number };
type Deduction = { code: string; name: string; max?: number; per_unit?: number; group?: string; retirement?: boolean; donation?: boolean; multiplier?: number };
type Tax = {
  brackets: Bracket[]; expense: { rate: number; max: number }; personal_allowance: number; deductions: Deduction[];
  insurance_group_max: number; retirement_group_max: number; pvd_max_percent: number; donation_max_percent: number;
};
const TAX: Tax = { brackets: [], expense: { rate: 50, max: 100000 }, personal_allowance: 60000, deductions: [], insurance_group_max: 100000, retirement_group_max: 500000, pvd_max_percent: 15, donation_max_percent: 10 };
type Sso = { rate_employee: number; rate_employer: number; floors: { from: string; floor: number }[]; ceilings: { from: string; ceiling: number }[] };
const SSO: Sso = { rate_employee: 5, rate_employer: 5, floors: [], ceilings: [] };
type Pw = { min_length: number; require_upper: boolean; require_lower: boolean; require_digit: boolean; require_special: boolean; expire_days: number; max_failed: number; lock_minutes: number };
const PW: Pw = { min_length: 8, require_upper: true, require_lower: true, require_digit: true, require_special: true, expire_days: 0, max_failed: 5, lock_minutes: 15 };
type Pdpa = { mask_national_id: boolean; mask_bank_account: boolean; mask_salary: boolean; mask_phone?: boolean; mask_address?: boolean; consent_text: string; retention_years?: number };
const PDPA: Pdpa = { mask_national_id: true, mask_bank_account: true, mask_salary: true, mask_phone: false, mask_address: false, consent_text: "", retention_years: 10 };
type Reco = {
  probation_remind_days: number[]; contract_remind_days: number[]; document_expire_days: number[]; late_threshold_per_month: number; absent_threshold_per_month: number;
  birthday_post: boolean; work_anniversary_post: boolean; welcome_post?: boolean;
};
const RECO: Reco = { probation_remind_days: [30, 15, 7], contract_remind_days: [60, 30, 7], document_expire_days: [60, 30], late_threshold_per_month: 3, absent_threshold_per_month: 2, birthday_post: true, work_anniversary_post: true, welcome_post: true };

const BANKS: [string, string][] = [["002", "ธนาคารกรุงเทพ"], ["004", "ธนาคารกสิกรไทย"], ["006", "ธนาคารกรุงไทย"], ["011", "ธนาคารทหารไทยธนชาต"], ["014", "ธนาคารไทยพาณิชย์"], ["025", "ธนาคารกรุงศรีอยุธยา"], ["030", "ธนาคารออมสิน"], ["069", "ธนาคารเกียรตินาคินภัทร"], ["022", "ธนาคารซีไอเอ็มบี ไทย"], ["024", "ธนาคารยูโอบี"], ["034", "ธ.ก.ส."], ["073", "ธนาคารแลนด์ แอนด์ เฮ้าส์"]];

type TabKey = "attendance" | "payroll" | "tax" | "sso" | "password" | "pdpa" | "reco";

// ---------------------------------------------------------------- helpers
const n = (v: string) => (v === "" ? NaN : Number(v));
function Num({ value, onChange, step, min, max, suffix, disabled, className }: { value: number | null | undefined; onChange: (v: number) => void; step?: string; min?: number; max?: number; suffix?: string; disabled?: boolean; className?: string }) {
  return (
    <div className={clsx("relative", className)}>
      <Input type="number" inputMode="decimal" step={step} min={min} max={max} disabled={disabled} value={value ?? ""} onChange={(e) => onChange(n(e.target.value))} className={clsx("num", suffix && "pr-14")} />
      {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink-mute">{suffix}</span>}
    </div>
  );
}
function DaysList({ value, onChange, disabled }: { value: number[]; onChange: (v: number[]) => void; disabled?: boolean }) {
  const [text, setText] = useState(value.join(", "));
  useEffect(() => setText(value.join(", ")), [value]);
  return (
    <Input disabled={disabled} value={text} onChange={(e) => setText(e.target.value)} placeholder="เช่น 30, 15, 7"
      onBlur={() => onChange([...new Set(text.split(/[,\s]+/).map(Number).filter((x) => Number.isInteger(x) && x >= 0))].sort((a, b) => b - a))} />
  );
}
function Row({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-line-soft py-3 last:border-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] sm:items-center sm:gap-6">
      <div>
        <div className="text-[15px] font-medium">{label}</div>
        {hint && <div className="text-sm text-ink-mute">{hint}</div>}
      </div>
      <div>{children}</div>
    </div>
  );
}
function SaveBar({ onSave, saving, error, ro }: { onSave: () => void; saving: boolean; error?: string | null; ro: boolean }) {
  if (ro) return <p className="text-sm text-ink-mute">คุณมีสิทธิ์ดูอย่างเดียว</p>;
  return (
    <div className="flex items-center justify-end gap-3">
      {error && <span className="text-sm text-rust">{error}</span>}
      <Button loading={saving} onClick={onSave}>บันทึก</Button>
    </div>
  );
}
function Loading() {
  return <div className="flex justify-center py-16"><Spinner /></div>;
}

// ---------------------------------------------------------------- page
export function RulesSettings() {
  const [tab, setTab] = useState<TabKey>("attendance");
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab") as TabKey | null;
    if (t) setTab(t);
  }, []);
  return (
    <div>
      <PageHeader title="ตั้งค่าเวลา / เงินเดือน / ภาษี" description="กติกาที่ใช้คำนวณเวลาทำงาน เงินเดือน ภาษี ประกันสังคม และนโยบายความปลอดภัยของระบบ" />
      <Tabs
        className="mb-4"
        value={tab}
        onChange={(t) => (setTab(t), window.history.replaceState(null, "", `?tab=${t}`))}
        tabs={[
          { value: "attendance", label: "เวลาทำงาน" },
          { value: "payroll", label: "เงินเดือน" },
          { value: "tax", label: "ภาษี" },
          { value: "sso", label: "ประกันสังคม" },
          { value: "password", label: "รหัสผ่าน" },
          { value: "pdpa", label: "PDPA" },
          { value: "reco", label: "คำแนะนำ" },
        ]}
      />
      {tab === "attendance" && <AttendanceTab />}
      {tab === "payroll" && <PayrollTab />}
      {tab === "tax" && <TaxTab />}
      {tab === "sso" && <SsoTab />}
      {tab === "password" && <PasswordTab />}
      {tab === "pdpa" && <PdpaTab />}
      {tab === "reco" && <RecoTab />}
    </div>
  );
}

// ---------------------------------------------------------------- attendance
function AttendanceTab() {
  const ro = !useCan()("settings", "edit");
  const { value: v, setValue, save, saving } = useSetting<Att>("attendance", ATT);
  const [err, setErr] = useState<string | null>(null);
  if (!v) return <Loading />;
  const set = (p: Partial<Att>) => setValue({ ...v, ...p });
  const submit = () => {
    const r = v.ot_rates;
    let e: string | null = null;
    if (!(v.face_threshold > 0 && v.face_threshold < 1)) e = "ค่าความเหมือนใบหน้าต้องอยู่ระหว่าง 0 ถึง 1";
    else if ([r.workday, r.holiday_monthly, r.holiday_daily, r.holiday_ot].some((x) => !(x >= 0 && x <= 10))) e = "อัตรา OT ต้องอยู่ระหว่าง 0-10 เท่า";
    else if (r.workday < 1.5 || r.holiday_ot < 3) e = "อัตรา OT ต่ำกว่าที่กฎหมายกำหนด (วันทำงาน ≥ 1.5 เท่า, OT วันหยุด ≥ 3 เท่า)";
    else if (v.diligence.enabled && (!v.diligence.steps.length || v.diligence.steps.some((x) => !(x > 0)))) e = "กรอกจำนวนเงินเบี้ยขยันแต่ละขั้นให้ถูกต้อง";
    setErr(e);
    if (!e) save(v);
  };
  return (
    <div className="flex flex-col gap-4">
      <fieldset disabled={ro} className="contents">
        <Panel title="การลงเวลา">
          <Row label="อนุญาตให้ลงเวลานอกพื้นที่" hint="บันทึกได้แต่จะถูกทำเครื่องหมายว่าอยู่นอกพื้นที่"><Toggle checked={v.allow_outside_area} onChange={(x) => set({ allow_outside_area: x })} /></Row>
          <Row label="ค่าความเหมือนใบหน้าขั้นต่ำ" hint="0.40 = ยอมรับง่าย · 0.70 = เข้มงวด (แนะนำ 0.55)"><Num value={v.face_threshold} step="0.01" min={0.3} max={0.95} onChange={(x) => set({ face_threshold: x })} /></Row>
          <Row label="พนักงานเลือกกะ/ตารางงานเองได้"><Toggle checked={v.allow_self_schedule} onChange={(x) => set({ allow_self_schedule: x })} /></Row>
          <Row label="ไม่สแกนทั้งวัน ถือว่าขาดงาน" hint="ปิด = ถือว่ามาทำงาน (เหมาะกับพนักงานที่ไม่ต้องลงเวลา)"><Toggle checked={v.absent_if_no_scan} onChange={(x) => set({ absent_if_no_scan: x })} /></Row>
          <Row label="สแกนครั้งเดียวในวัน">
            <Select value={v.single_scan_policy} onChange={(e) => set({ single_scan_policy: e.target.value })}>
              <option value="missing">ถือว่าลืมสแกน (ต้องขอเพิ่มเวลา)</option>
              <option value="absent">ถือว่าขาดงาน</option>
              <option value="present">ถือว่ามาทำงานเต็มวัน</option>
            </Select>
          </Row>
          <Row label="คิด OT อัตโนมัติโดยไม่ต้องขอ" hint="ปิด = นับ OT เฉพาะที่มีใบขอโอทีอนุมัติแล้ว"><Toggle checked={v.auto_ot_without_request} onChange={(x) => set({ auto_ot_without_request: x })} /></Row>
        </Panel>
        <Panel title="อัตราค่าล่วงเวลา (เท่าของค่าจ้างต่อชั่วโมง)">
          <div className="grid gap-4 sm:grid-cols-4">
            <Field label="OT วันทำงาน" hint="กฎหมาย ≥ 1.5"><Num value={v.ot_rates.workday} step="0.1" suffix="เท่า" onChange={(x) => set({ ot_rates: { ...v.ot_rates, workday: x } })} /></Field>
            <Field label="ทำงานวันหยุด (รายเดือน)" hint="กฎหมาย ≥ 1"><Num value={v.ot_rates.holiday_monthly} step="0.1" suffix="เท่า" onChange={(x) => set({ ot_rates: { ...v.ot_rates, holiday_monthly: x } })} /></Field>
            <Field label="ทำงานวันหยุด (รายวัน)" hint="กฎหมาย ≥ 2"><Num value={v.ot_rates.holiday_daily} step="0.1" suffix="เท่า" onChange={(x) => set({ ot_rates: { ...v.ot_rates, holiday_daily: x } })} /></Field>
            <Field label="OT ในวันหยุด" hint="กฎหมาย ≥ 3"><Num value={v.ot_rates.holiday_ot} step="0.1" suffix="เท่า" onChange={(x) => set({ ot_rates: { ...v.ot_rates, holiday_ot: x } })} /></Field>
          </div>
        </Panel>
        <Panel title="การมาสาย">
          <Row label="วิธีหักเมื่อมาสาย">
            <Select value={v.late_policy.mode} onChange={(e) => set({ late_policy: { ...v.late_policy, mode: e.target.value } })}>
              <option value="deduct_minutes">หักตามนาทีที่สายจริง</option>
              <option value="round_up">ปัดขึ้นเป็นช่วงเวลา</option>
              <option value="none">ไม่หักเงิน (บันทึกสถิติอย่างเดียว)</option>
            </Select>
          </Row>
          {v.late_policy.mode === "round_up" && (
            <Row label="ปัดขึ้นทุก ๆ"><Num value={v.late_policy.round_to_minutes ?? 15} suffix="นาที" onChange={(x) => set({ late_policy: { ...v.late_policy, round_to_minutes: x } })} /></Row>
          )}
          <Row label="สายได้โดยไม่หักเงิน" hint="จำนวนครั้งต่อเดือน"><Num value={v.late_policy.free_times_per_month} suffix="ครั้ง" min={0} onChange={(x) => set({ late_policy: { ...v.late_policy, free_times_per_month: x } })} /></Row>
        </Panel>
        <Panel title="เบี้ยขยัน">
          <Row label="จ่ายเบี้ยขยัน"><Toggle checked={v.diligence.enabled} onChange={(x) => set({ diligence: { ...v.diligence, enabled: x } })} /></Row>
          {v.diligence.enabled && (
            <>
              <Row label="จำนวนเงินแต่ละขั้น (บาท)" hint="เดือนที่ไม่ขาด/ลา/สาย จะขยับขึ้น 1 ขั้น จนถึงขั้นสูงสุด">
                <div className="flex flex-wrap items-center gap-2">
                  {v.diligence.steps.map((s, i) => (
                    <div key={i} className="flex items-center gap-1">
                      <Num className="w-24" value={s} onChange={(x) => set({ diligence: { ...v.diligence, steps: v.diligence.steps.map((y, j) => (j === i ? x : y)) } })} />
                      <button type="button" aria-label="ลบขั้น" className="p-1 text-ink-mute hover:text-rust" onClick={() => set({ diligence: { ...v.diligence, steps: v.diligence.steps.filter((_, j) => j !== i) } })}><Trash2 className="size-4" /></button>
                    </div>
                  ))}
                  <Button size="sm" variant="ghost" icon={<Plus className="size-4" />} onClick={() => set({ diligence: { ...v.diligence, steps: [...v.diligence.steps, (v.diligence.steps.at(-1) ?? 400) + 100] } })}>เพิ่มขั้น</Button>
                </div>
              </Row>
              <Row label="เริ่มนับใหม่เมื่อ">
                <div className="flex flex-wrap gap-4">
                  {([["late", "มาสาย"], ["absent", "ขาดงาน"], ["leave_unpaid", "ลาไม่รับค่าจ้าง"], ["leave_sick", "ลาป่วย"], ["leave_personal", "ลากิจ"]] as const).map(([k, l]) => (
                    <Checkbox key={k} label={l} checked={v.diligence.reset_on.includes(k)} onChange={(x) => set({ diligence: { ...v.diligence, reset_on: x ? [...v.diligence.reset_on, k] : v.diligence.reset_on.filter((y) => y !== k) } })} />
                  ))}
                </div>
              </Row>
            </>
          )}
        </Panel>
      </fieldset>
      <SaveBar onSave={submit} saving={saving} error={err} ro={ro} />
    </div>
  );
}

// ---------------------------------------------------------------- payroll
function PayrollTab() {
  const ro = !useCan()("settings", "edit");
  const { value: v, setValue, save, saving } = useSetting<Pay>("payroll", PAY);
  const [err, setErr] = useState<string | null>(null);
  if (!v) return <Loading />;
  const set = (p: Partial<Pay>) => setValue({ ...v, ...p });
  const bank = { ...PAY.company_bank, ...v.company_bank };
  const setBank = (p: Partial<Pay["company_bank"]>) => set({ company_bank: { ...bank, ...p } });
  const submit = () => {
    let e: string | null = null;
    if (!(v.daily_divisor >= 1 && v.daily_divisor <= 31)) e = "ตัวหารรายวันต้องอยู่ระหว่าง 1-31";
    else if (!(v.hours_per_day > 0 && v.hours_per_day <= 24)) e = "ชั่วโมงทำงานต่อวันไม่ถูกต้อง";
    else if (!(v.advance_limit_percent >= 0 && v.advance_limit_percent <= 100)) e = "เพดานเบิกล่วงหน้าต้องอยู่ระหว่าง 0-100%";
    else if (bank.account && !/^\d{10,12}$/.test(bank.account.replace(/\D/g, ""))) e = "เลขบัญชีบริษัทต้องเป็นตัวเลข 10-12 หลัก";
    setErr(e);
    if (!e) save({ ...v, company_bank: { ...bank, account: bank.account.replace(/\D/g, "") } });
  };
  return (
    <div className="flex flex-col gap-4">
      <fieldset disabled={ro} className="contents">
        <Panel title="การคำนวณ">
          <Row label="ตัวหารค่าจ้างรายวัน" hint="เงินเดือน ÷ ตัวหาร = ค่าจ้างต่อวัน (นิยม 30)"><Num value={v.daily_divisor} suffix="วัน" onChange={(x) => set({ daily_divisor: x })} /></Row>
          <Row label="ชั่วโมงทำงานต่อวัน" hint="ใช้คิดค่าจ้างต่อชั่วโมงและ OT"><Num value={v.hours_per_day} step="0.5" suffix="ชม." onChange={(x) => set({ hours_per_day: x })} /></Row>
          <Row label="การปัดเศษ">
            <Select value={v.round_mode} onChange={(e) => set({ round_mode: e.target.value })}>
              <option value="satang">ปัดถึงสตางค์ (2 ตำแหน่ง)</option>
              <option value="baht">ปัดเป็นบาท</option>
            </Select>
          </Row>
          <Row label="คิดเงินเดือนตามสัดส่วนวันทำงาน (พนักงานเข้าใหม่/ลาออกระหว่างเดือน)"><Toggle checked={v.prorate_new_joiner} onChange={(x) => set({ prorate_new_joiner: x })} /></Row>
          <Row label="หักเงินเมื่อขาดงาน"><Toggle checked={v.deduct_absent} onChange={(x) => set({ deduct_absent: x })} /></Row>
          <Row label="หักเงินเมื่อมาสาย"><Toggle checked={v.deduct_late} onChange={(x) => set({ deduct_late: x })} /></Row>
          <Row label="หักเงินเมื่อกลับก่อน"><Toggle checked={v.deduct_early} onChange={(x) => set({ deduct_early: x })} /></Row>
          <Row label="เพดานเบิกเงินล่วงหน้า" hint="% ของเงินเดือน"><Num value={v.advance_limit_percent} suffix="%" onChange={(x) => set({ advance_limit_percent: x })} /></Row>
        </Panel>
        <Panel title="บัญชีบริษัทและไฟล์โอนเงิน">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="ธนาคาร">
              <Select value={bank.bank_code} onChange={(e) => setBank({ bank_code: e.target.value })}>
                {BANKS.map(([c, nme]) => <option key={c} value={c}>{c} · {nme}</option>)}
              </Select>
            </Field>
            <Field label="รูปแบบไฟล์โอนเงินเดือน">
              <Select value={v.bank_file_format} onChange={(e) => set({ bank_file_format: e.target.value })}>
                <option value="generic">ทั่วไป (CSV)</option>
                <option value="kbank">กสิกรไทย (K-Cash Connect)</option>
                <option value="scb">ไทยพาณิชย์ (SCB Business Net)</option>
                <option value="bbl">กรุงเทพ (iCash)</option>
                <option value="ktb">กรุงไทย (KTB Corporate)</option>
              </Select>
            </Field>
            <Field label="เลขที่บัญชีบริษัท"><Input inputMode="numeric" value={bank.account} onChange={(e) => setBank({ account: e.target.value })} placeholder="xxx-x-xxxxx-x" /></Field>
            <Field label="สาขา"><Input value={bank.branch} onChange={(e) => setBank({ branch: e.target.value })} /></Field>
            <Field label="Company ID (รหัสบริษัทในระบบธนาคาร)" hint="ใช้ในหัวไฟล์ของบางธนาคาร"><Input value={bank.company_id ?? ""} onChange={(e) => setBank({ company_id: e.target.value })} /></Field>
          </div>
        </Panel>
        <Panel title="สลิปเงินเดือน">
          <Row label="รหัสเปิดไฟล์สลิป PDF">
            <Select value={v.payslip_password} onChange={(e) => set({ payslip_password: e.target.value })}>
              <option value="birthdate">วันเกิด (ววดดปปปป พ.ศ.)</option>
              <option value="national_id_last4">เลขบัตรประชาชน 4 หลักท้าย</option>
              <option value="none">ไม่ใส่รหัส</option>
            </Select>
          </Row>
          <Row label="แสดงยอดสะสมทั้งปี (YTD) บนสลิป"><Toggle checked={v.payslip_show_ytd ?? true} onChange={(x) => set({ payslip_show_ytd: x })} /></Row>
          <Row label="ข้อความท้ายสลิป"><Input value={v.payslip_note ?? ""} onChange={(e) => set({ payslip_note: e.target.value })} placeholder="เช่น เอกสารนี้เป็นความลับเฉพาะบุคคล" /></Row>
        </Panel>
      </fieldset>
      <SaveBar onSave={submit} saving={saving} error={err} ro={ro} />
    </div>
  );
}

// ---------------------------------------------------------------- tax
function TaxTab() {
  const ro = !useCan()("settings", "edit");
  const { value: v, setValue, save, saving } = useSetting<Tax>("tax_config", TAX);
  const [err, setErr] = useState<string | null>(null);
  if (!v) return <Loading />;
  const set = (p: Partial<Tax>) => setValue({ ...v, ...p });
  const setB = (i: number, p: Partial<Bracket>) => set({ brackets: v.brackets.map((b, j) => (j === i ? { ...b, ...p } : b)) });
  const setD = (i: number, p: Partial<Deduction>) => set({ deductions: v.deductions.map((b, j) => (j === i ? { ...b, ...p } : b)) });
  const submit = () => {
    let e: string | null = null;
    const b = v.brackets;
    if (!b.length) e = "ต้องมีขั้นบันไดภาษีอย่างน้อย 1 ขั้น";
    else if (b.at(-1)!.upto !== null) e = "ขั้นสุดท้ายต้องเป็น 'ขึ้นไป' (เว้นช่องเงินได้ว่าง)";
    else
      for (let i = 0; i < b.length; i++) {
        if (!(b[i].rate >= 0 && b[i].rate <= 100)) e = `อัตราภาษีขั้นที่ ${i + 1} ต้องอยู่ระหว่าง 0-100%`;
        if (i < b.length - 1 && !(Number(b[i].upto) > (i ? Number(b[i - 1].upto) : 0))) e = `เงินได้ขั้นที่ ${i + 1} ต้องมากกว่าขั้นก่อนหน้า`;
        if (e) break;
      }
    if (!e) {
      const codes = v.deductions.map((d) => d.code.trim());
      if (codes.some((c) => !/^[a-z0-9_]+$/.test(c))) e = "รหัสค่าลดหย่อนใช้ได้เฉพาะ a-z 0-9 และ _";
      else if (new Set(codes).size !== codes.length) e = "รหัสค่าลดหย่อนซ้ำกัน";
      else if (v.deductions.some((d) => !d.name.trim())) e = "กรอกชื่อค่าลดหย่อนให้ครบ";
    }
    setErr(e);
    if (!e) save(v, "บันทึกการตั้งค่าภาษีแล้ว");
  };
  return (
    <div className="flex flex-col gap-4">
      <fieldset disabled={ro} className="contents">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,26rem)_1fr]">
          <Panel title="อัตราภาษีเงินได้บุคคลธรรมดา (ขั้นบันได)">
            <table className="w-full text-sm">
              <thead className="text-left text-ink-soft"><tr><th className="pb-1 font-medium">เงินได้สุทธิไม่เกิน (บาท)</th><th className="w-28 pb-1 font-medium">อัตรา</th><th className="w-8" /></tr></thead>
              <tbody>
                {v.brackets.map((b, i) => (
                  <tr key={i}>
                    <td className="py-1 pr-2"><Input type="number" className="num h-9" value={b.upto ?? ""} placeholder="ขึ้นไป" onChange={(e) => setB(i, { upto: e.target.value === "" ? null : Number(e.target.value) })} /></td>
                    <td className="py-1 pr-2"><Num className="[&_input]:h-9" value={b.rate} suffix="%" onChange={(x) => setB(i, { rate: x })} /></td>
                    <td><button type="button" aria-label="ลบขั้น" className="p-1 text-ink-mute hover:text-rust" onClick={() => set({ brackets: v.brackets.filter((_, j) => j !== i) })}><Trash2 className="size-4" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Button size="sm" variant="ghost" icon={<Plus className="size-4" />} onClick={() => set({ brackets: [...v.brackets.slice(0, -1), { upto: 0, rate: 0 }, ...v.brackets.slice(-1)] })}>แทรกขั้น</Button>
          </Panel>
          <Panel title="ค่าใช้จ่ายและเพดานลดหย่อน">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="หักค่าใช้จ่าย 40(1)(2)"><Num value={v.expense.rate} suffix="%" onChange={(x) => set({ expense: { ...v.expense, rate: x } })} /></Field>
              <Field label="ค่าใช้จ่ายสูงสุด"><Num value={v.expense.max} suffix="บาท" onChange={(x) => set({ expense: { ...v.expense, max: x } })} /></Field>
              <Field label="ลดหย่อนส่วนตัว"><Num value={v.personal_allowance} suffix="บาท" onChange={(x) => set({ personal_allowance: x })} /></Field>
              <Field label="เพดานกลุ่มประกันชีวิต/สุขภาพ"><Num value={v.insurance_group_max} suffix="บาท" onChange={(x) => set({ insurance_group_max: x })} /></Field>
              <Field label="เพดานกลุ่มเพื่อการเกษียณ"><Num value={v.retirement_group_max} suffix="บาท" onChange={(x) => set({ retirement_group_max: x })} /></Field>
              <Field label="PVD ลดหย่อนได้สูงสุด" hint="% ของค่าจ้าง"><Num value={v.pvd_max_percent} suffix="%" onChange={(x) => set({ pvd_max_percent: x })} /></Field>
              <Field label="เงินบริจาคสูงสุด" hint="% ของเงินได้หลังหักลดหย่อน"><Num value={v.donation_max_percent} suffix="%" onChange={(x) => set({ donation_max_percent: x })} /></Field>
            </div>
          </Panel>
        </div>
        <Panel title="รายการค่าลดหย่อน (ใช้ในหน้าลดหย่อนภาษีของพนักงาน)" bodyClass="overflow-x-auto p-4">
          <table className="w-full min-w-[56rem] text-sm">
            <thead className="text-left text-ink-soft"><tr>
              <th className="w-44 pb-1 font-medium">รหัส</th><th className="pb-1 font-medium">ชื่อ</th><th className="w-32 pb-1 font-medium">สูงสุด (บาท)</th><th className="w-32 pb-1 font-medium">ต่อหน่วย (บาท)</th>
              <th className="w-32 pb-1 font-medium">กลุ่มเพดาน</th><th className="w-8" />
            </tr></thead>
            <tbody>
              {v.deductions.map((d, i) => (
                <tr key={i}>
                  <td className="py-1 pr-2"><Input className="h-9" value={d.code} onChange={(e) => setD(i, { code: e.target.value })} /></td>
                  <td className="py-1 pr-2"><Input className="h-9" value={d.name} onChange={(e) => setD(i, { name: e.target.value })} /></td>
                  <td className="py-1 pr-2"><Input type="number" className="num h-9" value={d.max ?? ""} onChange={(e) => setD(i, { max: e.target.value === "" ? undefined : Number(e.target.value) })} /></td>
                  <td className="py-1 pr-2"><Input type="number" className="num h-9" value={d.per_unit ?? ""} onChange={(e) => setD(i, { per_unit: e.target.value === "" ? undefined : Number(e.target.value) })} /></td>
                  <td className="py-1 pr-2">
                    <Select className="h-9" value={d.group === "insurance" ? "insurance" : d.retirement ? "retirement" : d.donation ? "donation" : ""}
                      onChange={(e) => setD(i, { group: e.target.value === "insurance" ? "insurance" : undefined, retirement: e.target.value === "retirement" || undefined, donation: e.target.value === "donation" || undefined })}>
                      <option value="">-</option><option value="insurance">ประกัน</option><option value="retirement">เกษียณ</option><option value="donation">บริจาค</option>
                    </Select>
                  </td>
                  <td><button type="button" aria-label="ลบรายการ" className="p-1 text-ink-mute hover:text-rust" onClick={() => set({ deductions: v.deductions.filter((_, j) => j !== i) })}><Trash2 className="size-4" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <Button size="sm" variant="ghost" icon={<Plus className="size-4" />} onClick={() => set({ deductions: [...v.deductions, { code: "", name: "" }] })}>เพิ่มค่าลดหย่อน</Button>
        </Panel>
      </fieldset>
      <SaveBar onSave={submit} saving={saving} error={err} ro={ro} />
    </div>
  );
}

// ---------------------------------------------------------------- sso
function SsoTab() {
  const ro = !useCan()("settings", "edit");
  const { value: v, setValue, save, saving } = useSetting<Sso>("sso_config", SSO);
  const [err, setErr] = useState<string | null>(null);
  if (!v) return <Loading />;
  const set = (p: Partial<Sso>) => setValue({ ...v, ...p });
  const submit = () => {
    let e: string | null = null;
    if (!(v.rate_employee >= 0 && v.rate_employee <= 15) || !(v.rate_employer >= 0 && v.rate_employer <= 15)) e = "อัตราเงินสมทบต้องอยู่ระหว่าง 0-15%";
    else if (!v.ceilings.length) e = "ต้องมีเพดานค่าจ้างอย่างน้อย 1 ช่วง";
    else if ([...v.floors, ...v.ceilings].some((x) => !/^\d{4}-\d{2}-\d{2}$/.test(x.from))) e = "กรอกวันที่มีผลให้ครบ";
    else if (v.floors.some((f) => !(f.floor > 0)) || v.ceilings.some((c) => !(c.ceiling > 0))) e = "ค่าจ้างขั้นต่ำ/สูงสุดต้องมากกว่า 0";
    setErr(e);
    if (!e) save({ ...v, floors: [...v.floors].sort((a, b) => a.from.localeCompare(b.from)), ceilings: [...v.ceilings].sort((a, b) => a.from.localeCompare(b.from)) }, "บันทึกการตั้งค่าประกันสังคมแล้ว");
  };
  const today = new Date().toISOString().slice(0, 10);
  const current = [...v.ceilings].filter((c) => c.from <= today).sort((a, b) => b.from.localeCompare(a.from))[0];
  return (
    <div className="flex flex-col gap-4">
      <fieldset disabled={ro} className="contents">
        <Panel title="อัตราเงินสมทบ">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="ลูกจ้าง"><Num value={v.rate_employee} step="0.1" suffix="%" onChange={(x) => set({ rate_employee: x })} /></Field>
            <Field label="นายจ้าง"><Num value={v.rate_employer} step="0.1" suffix="%" onChange={(x) => set({ rate_employer: x })} /></Field>
            <div className="text-sm text-ink-soft sm:pt-6">ปัจจุบันเพดานค่าจ้าง <b className="num">{current?.ceiling?.toLocaleString("th-TH") ?? "-"}</b> บาท → สมทบสูงสุด <b className="num">{current ? Math.round((current.ceiling * v.rate_employee) / 100).toLocaleString("th-TH") : "-"}</b> บาท/เดือน</div>
          </div>
        </Panel>
        <div className="grid gap-4 lg:grid-cols-2">
          {([["floors", "floor", "ค่าจ้างขั้นต่ำที่ใช้คำนวณ"], ["ceilings", "ceiling", "เพดานค่าจ้างที่ใช้คำนวณ"]] as const).map(([key, field, title]) => (
            <Panel key={key} title={title}>
              <table className="w-full text-sm">
                <thead className="text-left text-ink-soft"><tr><th className="pb-1 font-medium">มีผลตั้งแต่</th><th className="pb-1 font-medium">ค่าจ้าง (บาท)</th><th className="w-8" /></tr></thead>
                <tbody>
                  {(v[key] as { from: string; [k: string]: number | string }[]).map((r, i) => (
                    <tr key={i}>
                      <td className="py-1 pr-2"><Input type="date" className="h-9" value={r.from} onChange={(e) => set({ [key]: v[key].map((x, j) => (j === i ? { ...x, from: e.target.value } : x)) } as Partial<Sso>)} /></td>
                      <td className="py-1 pr-2"><Input type="number" className="num h-9" value={r[field] as number} onChange={(e) => set({ [key]: v[key].map((x, j) => (j === i ? { ...x, [field]: Number(e.target.value) } : x)) } as Partial<Sso>)} /></td>
                      <td><button type="button" aria-label="ลบช่วง" className="p-1 text-ink-mute hover:text-rust" onClick={() => set({ [key]: v[key].filter((_, j) => j !== i) } as Partial<Sso>)}><Trash2 className="size-4" /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Button size="sm" variant="ghost" icon={<Plus className="size-4" />} onClick={() => set({ [key]: [...v[key], { from: today, [field]: 0 }] } as Partial<Sso>)}>เพิ่มช่วง</Button>
            </Panel>
          ))}
        </div>
      </fieldset>
      <SaveBar onSave={submit} saving={saving} error={err} ro={ro} />
    </div>
  );
}

// ---------------------------------------------------------------- password
function PasswordTab() {
  const ro = !useCan()("settings", "edit");
  const { value: v, setValue, save, saving } = useSetting<Pw>("password_policy", PW);
  const [err, setErr] = useState<string | null>(null);
  if (!v) return <Loading />;
  const set = (p: Partial<Pw>) => setValue({ ...v, ...p });
  const submit = () => {
    let e: string | null = null;
    if (!(v.min_length >= 6 && v.min_length <= 64)) e = "ความยาวรหัสผ่านต้องอยู่ระหว่าง 6-64 ตัวอักษร";
    else if (!(v.expire_days >= 0)) e = "จำนวนวันหมดอายุไม่ถูกต้อง";
    else if (!(v.max_failed >= 0 && v.lock_minutes >= 0)) e = "ค่าการล็อกบัญชีไม่ถูกต้อง";
    setErr(e);
    if (!e) save(v, "บันทึกนโยบายรหัสผ่านแล้ว");
  };
  const example = ["a".repeat(Math.max(0, v.min_length - 4)), v.require_upper ? "A" : "", v.require_lower ? "b" : "", v.require_digit ? "1" : "", v.require_special ? "!" : ""].join("");
  return (
    <div className="flex flex-col gap-4">
      <fieldset disabled={ro} className="contents">
        <Panel title="รหัสผ่านที่ปลอดภัย (Strong password)">
          <Row label="ความยาวขั้นต่ำ"><Num value={v.min_length} suffix="ตัวอักษร" onChange={(x) => set({ min_length: x })} /></Row>
          <Row label="ต้องมีตัวพิมพ์ใหญ่ (A-Z)"><Toggle checked={v.require_upper} onChange={(x) => set({ require_upper: x })} /></Row>
          <Row label="ต้องมีตัวพิมพ์เล็ก (a-z)"><Toggle checked={v.require_lower} onChange={(x) => set({ require_lower: x })} /></Row>
          <Row label="ต้องมีตัวเลข (0-9)"><Toggle checked={v.require_digit} onChange={(x) => set({ require_digit: x })} /></Row>
          <Row label="ต้องมีอักขระพิเศษ (!@#$...)"><Toggle checked={v.require_special} onChange={(x) => set({ require_special: x })} /></Row>
          <Row label="บังคับเปลี่ยนรหัสผ่านทุก" hint="0 = ไม่บังคับ"><Num value={v.expire_days} suffix="วัน" onChange={(x) => set({ expire_days: x })} /></Row>
          <Row label="ล็อกบัญชีเมื่อใส่รหัสผิด" hint="0 = ไม่ล็อก"><Num value={v.max_failed} suffix="ครั้ง" onChange={(x) => set({ max_failed: x })} /></Row>
          <Row label="ระยะเวลาล็อก"><Num value={v.lock_minutes} suffix="นาที" onChange={(x) => set({ lock_minutes: x })} /></Row>
          <p className="pt-3 text-sm text-ink-mute">ตัวอย่างรหัสผ่านที่ผ่านเกณฑ์: <code className="rounded bg-paper px-1.5 py-0.5">{example}</code></p>
        </Panel>
      </fieldset>
      <SaveBar onSave={submit} saving={saving} error={err} ro={ro} />
    </div>
  );
}

// ---------------------------------------------------------------- pdpa
function PdpaTab() {
  const ro = !useCan()("settings", "edit");
  const { value: v, setValue, save, saving } = useSetting<Pdpa>("pdpa", PDPA);
  const [err, setErr] = useState<string | null>(null);
  if (!v) return <Loading />;
  const set = (p: Partial<Pdpa>) => setValue({ ...v, ...p });
  const submit = () => {
    const e = !v.consent_text.trim() ? "กรอกข้อความขอความยินยอม" : null;
    setErr(e);
    if (!e) save(v, "บันทึกการตั้งค่า PDPA แล้ว");
  };
  return (
    <div className="flex flex-col gap-4">
      <fieldset disabled={ro} className="contents">
        <Panel title="ปกปิดข้อมูลส่วนบุคคล (PDPA Conceal)">
          <p className="mb-2 text-sm text-ink-soft">ข้อมูลที่เลือกจะแสดงแบบปิดบังเป็นค่าเริ่มต้น ผู้มีสิทธิ์ต้องกด &quot;แสดง&quot; ทุกครั้ง และระบบจะบันทึกลง Back Log (VIEW_SENSITIVE)</p>
          <Row label="เลขบัตรประชาชน" hint="1-XXXX-XXXX5-67-8"><Toggle checked={v.mask_national_id} onChange={(x) => set({ mask_national_id: x })} /></Row>
          <Row label="เลขบัญชีธนาคาร" hint="XXX-X-X1234"><Toggle checked={v.mask_bank_account} onChange={(x) => set({ mask_bank_account: x })} /></Row>
          <Row label="เงินเดือน"><Toggle checked={v.mask_salary} onChange={(x) => set({ mask_salary: x })} /></Row>
          <Row label="เบอร์โทรศัพท์ (ในสมุดรายชื่อ)"><Toggle checked={!!v.mask_phone} onChange={(x) => set({ mask_phone: x })} /></Row>
          <Row label="ที่อยู่"><Toggle checked={!!v.mask_address} onChange={(x) => set({ mask_address: x })} /></Row>
          <Row label="ระยะเวลาเก็บข้อมูลหลังพ้นสภาพ" hint="ใช้เป็นนโยบายอ้างอิงในการลบข้อมูล"><Num value={v.retention_years ?? 10} suffix="ปี" onChange={(x) => set({ retention_years: x })} /></Row>
        </Panel>
        <Panel title="ข้อความขอความยินยอม (แสดงในใบสมัครงานและหน้าพนักงาน)">
          <Textarea rows={6} value={v.consent_text} onChange={(e) => set({ consent_text: e.target.value })} />
        </Panel>
      </fieldset>
      <SaveBar onSave={submit} saving={saving} error={err} ro={ro} />
    </div>
  );
}

// ---------------------------------------------------------------- recommendations
function RecoTab() {
  const ro = !useCan()("settings", "edit");
  const { value: v, setValue, save, saving } = useSetting<Reco>("recommendations", RECO);
  const [err, setErr] = useState<string | null>(null);
  if (!v) return <Loading />;
  const set = (p: Partial<Reco>) => setValue({ ...v, ...p });
  const submit = () => {
    let e: string | null = null;
    if (!v.probation_remind_days.length) e = "กรอกวันแจ้งเตือนครบทดลองงานอย่างน้อย 1 ค่า";
    else if (!(v.late_threshold_per_month >= 1 && v.absent_threshold_per_month >= 1)) e = "เกณฑ์จำนวนครั้งต้องมากกว่า 0";
    setErr(e);
    if (!e) save(v, "บันทึกการตั้งค่าคำแนะนำแล้ว");
  };
  return (
    <div className="flex flex-col gap-4">
      <fieldset disabled={ro} className="contents">
        <Panel title="แจ้งเตือนล่วงหน้า (วัน)">
          <Row label="ครบทดลองงาน" hint="ระบบสร้างแบบประเมินและแจ้งหัวหน้าเมื่อเหลือตามจำนวนวันที่กำหนด คั่นด้วยจุลภาค"><DaysList value={v.probation_remind_days} onChange={(x) => set({ probation_remind_days: x })} /></Row>
          <Row label="สัญญาจ้างหมดอายุ"><DaysList value={v.contract_remind_days} onChange={(x) => set({ contract_remind_days: x })} /></Row>
          <Row label="เอกสารหมดอายุ" hint="พาสปอร์ต วีซ่า ใบอนุญาตทำงาน และเอกสารพนักงาน"><DaysList value={v.document_expire_days} onChange={(x) => set({ document_expire_days: x })} /></Row>
        </Panel>
        <Panel title="เกณฑ์ที่ควรติดตาม">
          <Row label="มาสายเกิน" hint="ครั้งต่อเดือน — ใช้เป็นค่าเริ่มต้นในกฎ Automation"><Num value={v.late_threshold_per_month} suffix="ครั้ง" onChange={(x) => set({ late_threshold_per_month: x })} /></Row>
          <Row label="ขาดงานเกิน" hint="ครั้งต่อเดือน"><Num value={v.absent_threshold_per_month} suffix="ครั้ง" onChange={(x) => set({ absent_threshold_per_month: x })} /></Row>
        </Panel>
        <Panel title="โพสต์อัตโนมัติใน News Feed">
          <Row label="อวยพรวันเกิด"><Toggle checked={v.birthday_post} onChange={(x) => set({ birthday_post: x })} /></Row>
          <Row label="ครบรอบปีการทำงาน"><Toggle checked={v.work_anniversary_post} onChange={(x) => set({ work_anniversary_post: x })} /></Row>
          <Row label="ต้อนรับพนักงานใหม่"><Toggle checked={v.welcome_post ?? true} onChange={(x) => set({ welcome_post: x })} /></Row>
        </Panel>
      </fieldset>
      <SaveBar onSave={submit} saving={saving} error={err} ro={ro} />
    </div>
  );
}

