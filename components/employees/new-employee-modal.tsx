"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Button, Field, Input, Modal, Select, toast, clsx } from "@/components/ui";
import { EmployeePicker, type EmpOption } from "@/components/crud/employee-picker";
import { humanError } from "@/components/crud/crud-page";
import { useLookups } from "./use-lookups";
import { EMP_STATUS, EMP_TYPE, GENDER, PREFIXES, type Res } from "@/lib/employees/labels";
import { addDays, isoDate, thDate } from "@/lib/format";

const WEEKDAYS = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

export function NewEmployeeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const lk = useLookups();
  const sb = supabaseBrowser();
  const blank = {
    code: "", prefix: "นาย", first_name: "", last_name: "", nickname: "", first_name_en: "", last_name_en: "", gender: "M", birth_date: "",
    phone: "", email: "", branch_id: "", org_unit_id: "", position_id: "", supervisor_id: null as number | null,
    employee_type: "monthly", status: "probation", hire_date: isoDate(), probation_days: "119", default_shift_id: "", weekly_off_days: [0] as number[],
  };
  const [v, setV] = useState(blank);
  const [err, setErr] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [emps, setEmps] = useState<EmpOption[]>([]);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount / reset form when opened
    setV(blank);
    setErr({});
    // suggest next code
    sb.from("employees").select("code").order("code", { ascending: false }).limit(200).then(({ data }: Res) => {
      const codes = ((data as { code: string }[]) ?? []).map((x) => x.code);
      const m = codes.map((c) => /^(.*?)(\d+)$/.exec(c)).find(Boolean);
      if (m) {
        const nums = codes.map((c) => /^(.*?)(\d+)$/.exec(c)).filter((x) => x && x[1] === m[1]).map((x) => Number(x![2]));
        const next = String(Math.max(...nums) + 1).padStart(m[2].length, "0");
        setV((x) => (x.code ? x : { ...x, code: m[1] + next }));
      }
    });
    sb.from("v_directory").select("id, code, first_name, last_name, nickname").order("code").limit(5000).then(({ data }: Res) => {
      setEmps(((data ?? []) as Record<string, unknown>[]).map((r) => ({ value: r.id as number, label: `${r.first_name} ${r.last_name}${r.nickname ? ` (${r.nickname})` : ""}`, raw: r })));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = (k: keyof typeof blank, val: unknown) => setV((x) => ({ ...x, [k]: val }));

  async function save() {
    const e: Record<string, string> = {};
    const code = v.code.trim();
    if (!code) e.code = "จำเป็นต้องกรอก";
    else if (!/^[A-Za-z0-9._-]+$/.test(code)) e.code = "ใช้ได้เฉพาะ A-Z 0-9 . _ - (ไม่มีช่องว่าง)";
    if (!v.first_name.trim()) e.first_name = "จำเป็นต้องกรอก";
    if (!v.last_name.trim()) e.last_name = "จำเป็นต้องกรอก";
    if (!v.hire_date) e.hire_date = "จำเป็นต้องกรอก";
    if (v.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) e.email = "รูปแบบอีเมลไม่ถูกต้อง";
    if (v.birth_date && v.birth_date > addDays(isoDate(), -15 * 365)) e.birth_date = "อายุต้องไม่ต่ำกว่า 15 ปี (พ.ร.บ.คุ้มครองแรงงาน)";
    if (!v.weekly_off_days.length && v.employee_type !== "parttime") e.weekly_off_days = "เลือกวันหยุดประจำสัปดาห์อย่างน้อย 1 วัน";
    if (!e.code) {
      const { count } = await sb.from("employees").select("id", { count: "exact", head: true }).ilike("code", code);
      if (count) e.code = "รหัสพนักงานนี้มีอยู่แล้ว";
    }
    setErr(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    const n = (x: string) => (x === "" ? null : Number(x));
    const s = (x: string) => x.trim() || null;
    const { data, error } = await sb
      .from("employees")
      .insert({
        code, prefix: s(v.prefix), first_name: v.first_name.trim(), last_name: v.last_name.trim(), nickname: s(v.nickname),
        first_name_en: s(v.first_name_en), last_name_en: s(v.last_name_en), gender: v.gender || null, birth_date: v.birth_date || null,
        phone: s(v.phone), email: s(v.email), branch_id: n(v.branch_id), org_unit_id: n(v.org_unit_id), position_id: n(v.position_id),
        supervisor_id: v.supervisor_id, employee_type: v.employee_type, status: v.status, hire_date: v.hire_date,
        probation_days: Number(v.probation_days) || 119, default_shift_id: n(v.default_shift_id), weekly_off_days: v.weekly_off_days,
      })
      .select("id")
      .single();
    setSaving(false);
    if (error) return toast.error(humanError(error));
    toast.ok("เพิ่มพนักงานแล้ว กรอกข้อมูลเพิ่มเติมได้ในหน้าประวัติ");
    onClose();
    router.push(`/employees/${(data as { id: number }).id}`);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title="เพิ่มพนักงาน"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>ยกเลิก</Button>
          <Button onClick={save} loading={saving}>บันทึกและไปหน้าประวัติ</Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <section>
          <h4 className="mb-2 border-b border-line-soft pb-1 text-sm font-semibold text-jade-800">ข้อมูลส่วนตัว</h4>
          <div className="grid gap-x-4 gap-y-3 sm:grid-cols-3">
            <Field label="รหัสพนักงาน" required error={err.code} hint="ใช้เป็นชื่อผู้ใช้เข้าระบบด้วย">
              <Input value={v.code} onChange={(e) => set("code", e.target.value.toUpperCase())} autoFocus />
            </Field>
            <Field label="คำนำหน้า">
              <Select value={v.prefix} onChange={(e) => set("prefix", e.target.value)}>
                {PREFIXES.map((p) => <option key={p} value={p}>{p}</option>)}
              </Select>
            </Field>
            <Field label="เพศ">
              <Select value={v.gender} onChange={(e) => set("gender", e.target.value)}>
                {Object.entries(GENDER).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </Select>
            </Field>
            <Field label="ชื่อ" required error={err.first_name}><Input value={v.first_name} onChange={(e) => set("first_name", e.target.value)} /></Field>
            <Field label="นามสกุล" required error={err.last_name}><Input value={v.last_name} onChange={(e) => set("last_name", e.target.value)} /></Field>
            <Field label="ชื่อเล่น"><Input value={v.nickname} onChange={(e) => set("nickname", e.target.value)} /></Field>
            <Field label="ชื่อ (อังกฤษ)"><Input value={v.first_name_en} onChange={(e) => set("first_name_en", e.target.value)} /></Field>
            <Field label="นามสกุล (อังกฤษ)"><Input value={v.last_name_en} onChange={(e) => set("last_name_en", e.target.value)} /></Field>
            <Field label="วันเกิด" error={err.birth_date}><Input type="date" value={v.birth_date} onChange={(e) => set("birth_date", e.target.value)} /></Field>
            <Field label="โทรศัพท์"><Input type="tel" value={v.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
            <Field label="อีเมล" error={err.email} className="sm:col-span-2"><Input type="email" value={v.email} onChange={(e) => set("email", e.target.value)} /></Field>
          </div>
        </section>
        <section>
          <h4 className="mb-2 border-b border-line-soft pb-1 text-sm font-semibold text-jade-800">การจ้างงาน</h4>
          <div className="grid gap-x-4 gap-y-3 sm:grid-cols-3">
            <Field label="วันเริ่มงาน" required error={err.hire_date}><Input type="date" value={v.hire_date} onChange={(e) => set("hire_date", e.target.value)} /></Field>
            <Field label="ประเภทพนักงาน">
              <Select value={v.employee_type} onChange={(e) => set("employee_type", e.target.value)}>
                {Object.entries(EMP_TYPE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </Select>
            </Field>
            <Field label="สถานะ">
              <Select value={v.status} onChange={(e) => set("status", e.target.value)}>
                {Object.entries(EMP_STATUS).filter(([k]) => k !== "resigned").map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </Select>
            </Field>
            <Field label="สาขา">
              <Select value={v.branch_id} onChange={(e) => set("branch_id", e.target.value)} placeholder="— ไม่ระบุ —">
                {lk.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </Select>
            </Field>
            <Field label="หน่วยงาน">
              <Select value={v.org_unit_id} onChange={(e) => set("org_unit_id", e.target.value)} placeholder="— ไม่ระบุ —">
                {lk.orgs.map((o) => <option key={o.id} value={o.id}>{"— ".repeat((o.level ?? 1) - 1)}{o.name}</option>)}
              </Select>
            </Field>
            <Field label="ตำแหน่ง">
              <Select value={v.position_id} onChange={(e) => set("position_id", e.target.value)} placeholder="— ไม่ระบุ —">
                {lk.positions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </Field>
            <Field label="หัวหน้างาน" className="sm:col-span-2">
              <EmployeePicker value={v.supervisor_id} onChange={(x) => set("supervisor_id", x)} options={emps} />
            </Field>
            {v.status === "probation" ? (
              <Field label="ทดลองงาน (วัน)" hint={v.hire_date ? `ครบทดลองงาน ${thDate(addDays(v.hire_date, Number(v.probation_days) || 119))}` : undefined}>
                <Input type="number" min={0} max={365} className="num" value={v.probation_days} onChange={(e) => set("probation_days", e.target.value)} />
              </Field>
            ) : <div className="hidden sm:block" />}
            <Field label="กะการทำงานเริ่มต้น">
              <Select value={v.default_shift_id} onChange={(e) => set("default_shift_id", e.target.value)} placeholder="— ไม่ระบุ —">
                {lk.shifts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
            <Field label="วันหยุดประจำสัปดาห์" error={err.weekly_off_days} className="sm:col-span-2">
              <div className="flex flex-wrap gap-1" role="group" aria-label="วันหยุดประจำสัปดาห์">
                {WEEKDAYS.map((d, i) => {
                  const on = v.weekly_off_days.includes(i);
                  return (
                    <button
                      key={i}
                      type="button"
                      aria-pressed={on}
                      onClick={() => set("weekly_off_days", on ? v.weekly_off_days.filter((x) => x !== i) : [...v.weekly_off_days, i].sort())}
                      className={clsx("h-9 w-10 rounded-md border text-sm", on ? "border-jade-600 bg-jade-600 text-white" : "border-line bg-white text-ink-soft hover:bg-jade-50")}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
            </Field>
          </div>
        </section>
        <p className="text-sm text-ink-mute">ข้อมูลเงินเดือน บัญชีธนาคาร เลขบัตรประชาชน และประกันสังคม กรอกต่อได้ในแท็บ “เงินเดือนและบัญชี” หลังบันทึก</p>
      </div>
    </Modal>
  );
}
