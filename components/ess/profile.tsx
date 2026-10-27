"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ComponentType } from "react";
import { ChevronRight, KeyRound, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge, Button, Checkbox, Field, Input, Modal, Select, Spinner, Tabs, toast, useConfirm } from "@/components/ui";
import { useMe } from "@/components/app/me-context";
import { supabaseBrowser } from "@/lib/supabase/client";
import { isoDate, money, thDate } from "@/lib/format";
import { serviceText } from "./lib";

type Emp = Record<string, unknown> & {
  id: number; code: string; prefix: string | null; first_name: string; last_name: string; first_name_en: string | null; last_name_en: string | null; nickname: string | null;
  phone: string | null; email: string | null; photo_url: string | null; hire_date: string; status: string; employee_type: string; probation_end_date: string | null;
  confirm_date: string | null; contract_end_date: string | null; birth_date: string | null; supervisor_id: number | null;
};

const STATUS: Record<string, string> = { probation: "ทดลองงาน", permanent: "พนักงานประจำ", contract: "สัญญาจ้าง", suspended: "พักงาน", resigned: "ลาออก" };
const EMP_TYPE: Record<string, string> = { monthly: "รายเดือน", daily: "รายวัน", hourly: "รายชั่วโมง", contract: "สัญญาจ้าง", intern: "ฝึกงาน", parttime: "พาร์ทไทม์" };

type Tab = "work" | "address" | "family" | "education" | "skills" | "tax";

export function ProfileView({ LineCard }: { LineCard?: ComponentType | null }) {
  const me = useMe();
  const [tab, setTab] = useState<Tab>("work");
  const [emp, setEmp] = useState<Emp | null>(null);
  const [dir, setDir] = useState<{ position_name: string | null; org_unit_name: string | null; branch_name: string | null } | null>(null);
  const [boss, setBoss] = useState<string | null>(null);

  useEffect(() => {
    const sb = supabaseBrowser();
    (async () => {
      const [{ data: e }, { data: d }] = await Promise.all([
        sb.from("employees").select("*").eq("id", me.employeeId!).maybeSingle(),
        sb.from("v_directory").select("position_name, org_unit_name, branch_name").eq("id", me.employeeId!).maybeSingle(),
      ]);
      setEmp(e as Emp);
      setDir(d as typeof dir);
      const sup = (e as Emp | null)?.supervisor_id;
      if (sup) {
        const { data: b } = await sb.from("v_directory").select("first_name, last_name, nickname").eq("id", sup).maybeSingle();
        const bb = b as { first_name: string; last_name: string; nickname: string | null } | null;
        if (bb) setBoss(`${bb.first_name} ${bb.last_name}${bb.nickname ? ` (${bb.nickname})` : ""}`);
      }
    })();
  }, [me.employeeId]);

  if (!emp) return <div className="grid h-40 place-items-center"><Spinner /></div>;
  const initials = (emp.nickname || emp.first_name).slice(0, 2);

  return (
    <>
      <section className="flex items-center gap-4 rounded-[var(--radius-panel)] border border-line bg-white p-4">
        {emp.photo_url ? (
           
          <img src={emp.photo_url} alt="" className="size-16 rounded-full object-cover" />
        ) : (
          <span className="grid size-16 place-items-center rounded-full bg-jade-100 text-xl font-semibold text-jade-800">{initials}</span>
        )}
        <div className="min-w-0">
          <h1 className="text-[20px] font-semibold leading-tight">{emp.prefix ?? ""}{emp.first_name} {emp.last_name}</h1>
          {emp.nickname && <div className="text-[15px] text-ink-soft">ชื่อเล่น {emp.nickname}</div>}
          <div className="text-sm text-ink-mute">{emp.code} · {dir?.position_name ?? "-"}</div>
        </div>
      </section>

      <Tabs<Tab>
        className="-mx-4 mt-3 px-4"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "work", label: "ข้อมูลงาน" },
          { value: "address", label: "ที่อยู่" },
          { value: "family", label: "ครอบครัว" },
          { value: "education", label: "การศึกษา" },
          { value: "skills", label: "ทักษะ" },
          { value: "tax", label: "ลดหย่อนภาษี" },
        ]}
      />

      <div className="mt-3">
        {tab === "work" && (
          <>
            <dl className="rounded-[var(--radius-panel)] border border-line bg-white px-4 py-1">
              {(
                [
                  ["รหัสพนักงาน", emp.code],
                  ["ตำแหน่ง", dir?.position_name],
                  ["หน่วยงาน", dir?.org_unit_name],
                  ["สาขา", dir?.branch_name],
                  ["หัวหน้างาน", boss],
                  ["ประเภทพนักงาน", EMP_TYPE[emp.employee_type] ?? emp.employee_type],
                  ["สถานะ", STATUS[emp.status] ?? emp.status],
                  ["วันเริ่มงาน", thDate(emp.hire_date, "long")],
                  ["อายุงาน", serviceText(emp.hire_date)],
                  emp.status === "probation" && emp.probation_end_date ? ["ครบทดลองงาน", thDate(emp.probation_end_date, "long")] : null,
                  emp.contract_end_date ? ["สิ้นสุดสัญญา", thDate(emp.contract_end_date, "long")] : null,
                  ["โทรศัพท์", emp.phone],
                  ["อีเมล", emp.email],
                ].filter(Boolean) as [string, string | null][]
              ).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 border-b border-line-soft py-2.5 last:border-0">
                  <dt className="shrink-0 text-[15px] text-ink-soft">{k}</dt>
                  <dd className="min-w-0 break-words text-right text-[15px]">{v || "-"}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 px-1 text-sm text-ink-mute">ข้อมูลการจ้างงานแก้ไขได้โดยฝ่ายบุคคล หากไม่ถูกต้องให้ยื่นเรื่องที่ฝ่ายบุคคล</p>
            {LineCard && (
              <div className="mt-3">
                <LineCard />
              </div>
            )}
            <Link href="/account/password" className="mt-3 flex min-h-14 items-center gap-3 rounded-[var(--radius-panel)] border border-line bg-white px-4 active:bg-jade-50">
              <KeyRound className="size-5 text-jade-700" /> <span className="flex-1">เปลี่ยนรหัสผ่าน</span> <ChevronRight className="size-5 text-ink-mute" />
            </Link>
          </>
        )}
        {tab === "address" && <SelfList cfg={ADDRESS} />}
        {tab === "family" && <SelfList cfg={FAMILY} />}
        {tab === "education" && <SelfList cfg={EDUCATION} />}
        {tab === "skills" && <SelfList cfg={SKILLS} />}
        {tab === "tax" && <TaxForm />}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ editable self-service lists */
type FieldDef = { k: string; label: string; type?: "text" | "date" | "number" | "select" | "bool"; options?: [string, string][]; required?: boolean; half?: boolean };
type ListCfg = { table: string; title: string; empty: string; fields: FieldDef[]; order: string; render: (r: Record<string, unknown>) => { title: string; sub?: string; badge?: string } };

const ADDR_TYPE: [string, string][] = [["current", "ที่อยู่ปัจจุบัน"], ["registered", "ตามทะเบียนบ้าน"], ["contact", "ที่อยู่ติดต่อ"]];
const RELATION: [string, string][] = [["spouse", "คู่สมรส"], ["child", "บุตร"], ["father", "บิดา"], ["mother", "มารดา"], ["sibling", "พี่น้อง"], ["other", "อื่น ๆ"]];
const EDU_LEVEL: [string, string][] = [["ประถม", "ประถมศึกษา"], ["ม.3", "ม.3"], ["ม.6", "ม.6"], ["ปวช.", "ปวช."], ["ปวส.", "ปวส."], ["ป.ตรี", "ปริญญาตรี"], ["ป.โท", "ปริญญาโท"], ["ป.เอก", "ปริญญาเอก"]];
const SKILL_CAT: [string, string][] = [["language", "ภาษา"], ["computer", "คอมพิวเตอร์"], ["driving", "ใบขับขี่"], ["certificate", "ใบรับรอง/ใบอนุญาต"], ["other", "อื่น ๆ"]];
const lab = (opts: [string, string][], v: unknown) => opts.find((o) => o[0] === v)?.[1] ?? String(v ?? "");

const ADDRESS: ListCfg = {
  table: "employee_addresses",
  title: "ที่อยู่",
  empty: "ยังไม่มีที่อยู่",
  order: "address_type",
  fields: [
    { k: "address_type", label: "ประเภท", type: "select", options: ADDR_TYPE, required: true },
    { k: "house_no", label: "บ้านเลขที่", half: true },
    { k: "moo", label: "หมู่", half: true },
    { k: "village", label: "หมู่บ้าน/อาคาร" },
    { k: "soi", label: "ซอย", half: true },
    { k: "road", label: "ถนน", half: true },
    { k: "subdistrict", label: "ตำบล/แขวง", half: true },
    { k: "district", label: "อำเภอ/เขต", half: true },
    { k: "province", label: "จังหวัด", half: true },
    { k: "postcode", label: "รหัสไปรษณีย์", half: true },
    { k: "phone", label: "โทรศัพท์" },
  ],
  render: (r) => ({
    title: lab(ADDR_TYPE, r.address_type),
    sub: [r.house_no, r.moo && `ม.${r.moo}`, r.village, r.soi && `ซ.${r.soi}`, r.road && `ถ.${r.road}`, r.subdistrict, r.district, r.province, r.postcode].filter(Boolean).join(" "),
  }),
};
const FAMILY: ListCfg = {
  table: "employee_family",
  title: "สมาชิกครอบครัว",
  empty: "ยังไม่มีข้อมูลครอบครัว",
  order: "id",
  fields: [
    { k: "relation", label: "ความสัมพันธ์", type: "select", options: RELATION, required: true },
    { k: "prefix", label: "คำนำหน้า", half: true },
    { k: "first_name", label: "ชื่อ", required: true, half: true },
    { k: "last_name", label: "นามสกุล" },
    { k: "birth_date", label: "วันเกิด", type: "date", half: true },
    { k: "child_order", label: "บุตรคนที่", type: "number", half: true },
    { k: "occupation", label: "อาชีพ", half: true },
    { k: "phone", label: "โทรศัพท์", half: true },
    { k: "is_alive", label: "ยังมีชีวิตอยู่", type: "bool" },
    { k: "is_tax_allowance", label: "ใช้สิทธิ์ลดหย่อนภาษี", type: "bool" },
    { k: "is_studying", label: "กำลังศึกษา", type: "bool" },
    { k: "is_disabled", label: "ผู้พิการ/ทุพพลภาพ", type: "bool" },
  ],
  render: (r) => ({
    title: `${r.prefix ?? ""}${r.first_name} ${r.last_name ?? ""}`,
    sub: [lab(RELATION, r.relation), r.birth_date ? `เกิด ${thDate(String(r.birth_date))}` : null, r.occupation].filter(Boolean).join(" · "),
    badge: r.is_tax_allowance ? "ลดหย่อนภาษี" : undefined,
  }),
};
const EDUCATION: ListCfg = {
  table: "employee_education",
  title: "ประวัติการศึกษา",
  empty: "ยังไม่มีประวัติการศึกษา",
  order: "year_to",
  fields: [
    { k: "level", label: "ระดับ", type: "select", options: EDU_LEVEL, required: true },
    { k: "institution", label: "สถาบัน" },
    { k: "faculty", label: "คณะ", half: true },
    { k: "major", label: "สาขา", half: true },
    { k: "year_from", label: "ปีที่เริ่ม (ค.ศ.)", type: "number", half: true },
    { k: "year_to", label: "ปีที่จบ (ค.ศ.)", type: "number", half: true },
    { k: "gpa", label: "เกรดเฉลี่ย", type: "number", half: true },
  ],
  render: (r) => ({ title: `${lab(EDU_LEVEL, r.level)} ${r.major ? `· ${r.major}` : ""}`, sub: [r.institution, r.year_to ? `จบปี ${Number(r.year_to) + 543}` : null, r.gpa ? `เกรด ${r.gpa}` : null].filter(Boolean).join(" · ") }),
};
const SKILLS: ListCfg = {
  table: "employee_skills",
  title: "ทักษะและใบรับรอง",
  empty: "ยังไม่มีข้อมูลทักษะ",
  order: "category",
  fields: [
    { k: "category", label: "หมวด", type: "select", options: SKILL_CAT, required: true },
    { k: "name", label: "ชื่อทักษะ / ใบรับรอง", required: true },
    { k: "level", label: "ระดับ", half: true },
    { k: "expire_date", label: "วันหมดอายุ", type: "date", half: true },
    { k: "note", label: "หมายเหตุ" },
  ],
  render: (r) => ({ title: String(r.name), sub: [lab(SKILL_CAT, r.category), r.level, r.expire_date ? `หมดอายุ ${thDate(String(r.expire_date))}` : null].filter(Boolean).join(" · ") }),
};

function SelfList({ cfg }: { cfg: ListCfg }) {
  const me = useMe();
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
  const [edit, setEdit] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);
  const { confirm, dialog } = useConfirm();

  async function load() {
    const { data } = await supabaseBrowser().from(cfg.table).select("*").eq("employee_id", me.employeeId!).order(cfg.order);
    setRows((data as Record<string, unknown>[]) ?? []);
  }
  useEffect(() => {
    setRows(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.table]);

  async function save() {
    if (!edit) return;
    for (const f of cfg.fields) if (f.required && (edit[f.k] == null || edit[f.k] === "")) return toast.error(`กรุณากรอก${f.label}`);
    setBusy(true);
    const row: Record<string, unknown> = { employee_id: me.employeeId };
    for (const f of cfg.fields) {
      const v = edit[f.k];
      row[f.k] = f.type === "bool" ? !!v : v === "" || v === undefined ? null : f.type === "number" ? Number(v) : v;
    }
    const sb = supabaseBrowser();
    const { error } = edit.id ? await sb.from(cfg.table).update(row).eq("id", edit.id) : await sb.from(cfg.table).insert(row);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.ok("บันทึกแล้ว");
    setEdit(null);
    load();
  }

  async function remove(r: Record<string, unknown>) {
    if (!(await confirm(`ลบ “${cfg.render(r).title}”?`, { danger: true, confirmText: "ลบ" }))) return;
    const { error } = await supabaseBrowser().from(cfg.table).delete().eq("id", r.id);
    if (error) return toast.error(error.message);
    toast.ok("ลบแล้ว");
    load();
  }

  return (
    <>
      {dialog}
      {rows === null ? (
        <div className="grid h-24 place-items-center"><Spinner /></div>
      ) : (
        <ul className="overflow-hidden rounded-[var(--radius-panel)] border border-line bg-white">
          {rows.length === 0 && <li className="px-4 py-6 text-center text-[15px] text-ink-mute">{cfg.empty}</li>}
          {rows.map((r) => {
            const v = cfg.render(r);
            return (
              <li key={String(r.id)} className="flex items-center gap-2 border-b border-line-soft py-1 pl-4 pr-1 last:border-0">
                <div className="min-w-0 flex-1 py-2">
                  <div className="flex items-center gap-2 font-medium">{v.title} {v.badge && <Badge color="green">{v.badge}</Badge>}</div>
                  {v.sub && <div className="text-sm text-ink-soft">{v.sub}</div>}
                </div>
                <button className="grid size-11 place-items-center rounded-md text-ink-soft active:bg-jade-50" aria-label="แก้ไข" onClick={() => setEdit({ ...r })}>
                  <Pencil className="size-[18px]" />
                </button>
                <button className="grid size-11 place-items-center rounded-md text-ink-mute active:bg-rust-soft" aria-label="ลบ" onClick={() => remove(r)}>
                  <Trash2 className="size-[18px]" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <Button variant="secondary" size="lg" className="mt-3 w-full" icon={<Plus className="size-5" />} onClick={() => setEdit({ is_alive: true })}>
        เพิ่ม{cfg.title}
      </Button>
      <Modal
        open={!!edit}
        onClose={() => setEdit(null)}
        title={`${edit?.id ? "แก้ไข" : "เพิ่ม"}${cfg.title}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEdit(null)}>ยกเลิก</Button>
            <Button loading={busy} onClick={save}>บันทึก</Button>
          </>
        }
      >
        {edit && (
          <div className="grid grid-cols-2 gap-3">
            {cfg.fields.map((f) =>
              f.type === "bool" ? (
                <div key={f.k} className="col-span-2">
                  <Checkbox label={f.label} checked={!!edit[f.k]} onChange={(v) => setEdit({ ...edit, [f.k]: v })} />
                </div>
              ) : (
                <Field key={f.k} label={f.label} required={f.required} className={f.half ? "col-span-1" : "col-span-2"}>
                  {f.type === "select" ? (
                    <Select className="h-11" value={String(edit[f.k] ?? "")} onChange={(e) => setEdit({ ...edit, [f.k]: e.target.value })} placeholder="เลือก">
                      {f.options!.map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </Select>
                  ) : (
                    <Input className="h-11" type={f.type ?? "text"} inputMode={f.type === "number" ? "decimal" : undefined} value={String(edit[f.k] ?? "")} onChange={(e) => setEdit({ ...edit, [f.k]: e.target.value })} />
                  )}
                </Field>
              ),
            )}
          </div>
        )}
      </Modal>
    </>
  );
}

/* ------------------------------------------------------------------ ล.ย.01 */
type Ded = { code: string; name: string; max?: number; per_unit?: number; group?: string; retirement?: boolean; donation?: boolean; multiplier?: number };

function TaxForm() {
  const me = useMe();
  const thisYear = Number(isoDate().slice(0, 4));
  const [year, setYear] = useState(thisYear);
  const [defs, setDefs] = useState<Ded[] | null>(null);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [orig, setOrig] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabaseBrowser()
      .from("settings")
      .select("value")
      .eq("key", "tax_config")
      .maybeSingle()
      .then(({ data }: { data: unknown }) => setDefs(((data as { value?: { deductions?: Ded[] } } | null)?.value?.deductions ?? []) as Ded[]));
  }, []);
  useEffect(() => {
    supabaseBrowser()
      .from("employee_tax_deductions")
      .select("deduction_code, amount")
      .eq("employee_id", me.employeeId!)
      .eq("tax_year", year)
      .then(({ data }: { data: unknown }) => {
        const m: Record<string, number> = {};
        for (const r of (data as { deduction_code: string; amount: number }[]) ?? []) m[r.deduction_code] = Number(r.amount);
        setOrig(m);
        setVals(Object.fromEntries(Object.entries(m).map(([k, v]) => [k, String(v)])));
      });
  }, [year, me.employeeId]);

  const isUnit = (d: Ded) => d.per_unit != null;
  const valueOf = (d: Ded) => {
    const n = Number(vals[d.code] || 0);
    return isUnit(d) ? n * d.per_unit! : n;
  };
  const over = (d: Ded) => d.max != null && valueOf(d) > d.max;
  const total = useMemo(() => (defs ?? []).reduce((s, d) => s + Math.min(valueOf(d), d.max ?? Infinity), 0), [defs, vals]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    if (!defs) return;
    const bad = defs.find(over);
    if (bad) return toast.error(`${bad.name} เกินเพดาน ${money(bad.max, 0)} บาท`);
    setBusy(true);
    const sb = supabaseBrowser();
    const upserts = defs
      .filter((d) => vals[d.code] !== undefined && vals[d.code] !== "" && Number(vals[d.code]) > 0)
      .map((d) => ({ employee_id: me.employeeId!, tax_year: year, deduction_code: d.code, amount: Number(vals[d.code]), note: isUnit(d) ? "จำนวน (คน)" : null }));
    const removed = Object.keys(orig).filter((k) => !vals[k] || Number(vals[k]) <= 0);
    const r1 = upserts.length ? await sb.from("employee_tax_deductions").upsert(upserts, { onConflict: "employee_id,tax_year,deduction_code" }) : { error: null };
    const r2 = removed.length ? await sb.from("employee_tax_deductions").delete().eq("employee_id", me.employeeId!).eq("tax_year", year).in("deduction_code", removed) : { error: null };
    setBusy(false);
    const err = r1.error ?? r2.error;
    if (err) return toast.error(err.message);
    toast.ok("บันทึกแบบ ล.ย.01 แล้ว ระบบจะใช้คำนวณภาษีหัก ณ ที่จ่ายงวดถัดไป");
    setOrig(Object.fromEntries(upserts.map((u) => [u.deduction_code, u.amount])));
  }

  if (!defs) return <div className="grid h-24 place-items-center"><Spinner /></div>;
  return (
    <>
      <div className="mb-3 rounded-[var(--radius-panel)] border border-line bg-white px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="font-semibold">แบบแจ้งรายการลดหย่อน (ล.ย.01)</div>
            <div className="text-sm text-ink-soft">ใช้คำนวณภาษีหัก ณ ที่จ่ายจากเงินเดือน</div>
          </div>
          <Select value={String(year)} onChange={(e) => setYear(Number(e.target.value))} className="h-11 w-28" aria-label="ปีภาษี">
            {[thisYear + 1, thisYear, thisYear - 1].map((y) => (
              <option key={y} value={y}>ปี {y + 543}</option>
            ))}
          </Select>
        </div>
        <p className="mt-2 text-xs text-ink-mute">ลดหย่อนส่วนตัว 60,000 บาท และประกันสังคมคิดให้อัตโนมัติ ไม่ต้องกรอก</p>
      </div>
      <ul className="overflow-hidden rounded-[var(--radius-panel)] border border-line bg-white">
        {defs.map((d) => (
          <li key={d.code} className="border-b border-line-soft px-4 py-3 last:border-0">
            <label className="flex items-center gap-3">
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] text-ink">{d.name}</span>
                <span className="num block text-xs text-ink-mute">
                  {isUnit(d) ? `คนละ ${money(d.per_unit, 0)} บาท` : ""}
                  {d.max != null ? `${isUnit(d) ? " · " : ""}สูงสุด ${money(d.max, 0)} บาท` : ""}
                  {d.multiplier ? `ลดหย่อนได้ ${d.multiplier} เท่า (ไม่เกิน 10% ของเงินได้)` : ""}
                  {d.donation && !d.multiplier ? "ไม่เกิน 10% ของเงินได้หลังหักลดหย่อน" : ""}
                  {d.retirement ? " · รวมกลุ่มเกษียณไม่เกิน 500,000" : ""}
                </span>
                {isUnit(d) && Number(vals[d.code]) > 0 && <span className="num block text-xs text-jade-700">= {money(valueOf(d), 0)} บาท</span>}
                {over(d) && <span className="block text-xs text-rust">เกินเพดาน {money(d.max, 0)} บาท</span>}
              </span>
              <span className="relative w-32 shrink-0">
                <Input
                  type={isUnit(d) ? "number" : "money"}
                  inputMode={isUnit(d) ? "numeric" : "decimal"}
                  min={0}
                  className={`num h-11 pr-9 text-right ${over(d) ? "border-rust" : ""}`}
                  value={vals[d.code] ?? ""}
                  placeholder="0"
                  onChange={(e) => setVals({ ...vals, [d.code]: e.target.value })}
                  aria-label={d.name}
                />
                <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-ink-mute">{isUnit(d) ? "คน" : "บาท"}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] mt-3 flex items-center gap-3 rounded-[var(--radius-panel)] border border-line bg-white/95 p-3 backdrop-blur">
        <div className="num flex-1 text-sm text-ink-soft">
          รวมลดหย่อน
          <div className="text-lg font-semibold text-ink">{money(total, 0)} บาท</div>
        </div>
        <Button size="lg" loading={busy} onClick={save}>บันทึก ล.ย.01</Button>
      </div>
    </>
  );
}
