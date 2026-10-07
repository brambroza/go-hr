"use client";

import { supabaseBrowser } from "@/lib/supabase/client";
import { useCan } from "@/components/app/me-context";
import type { FieldDef } from "@/components/crud/form-fields";
import { RecordForm } from "@/components/employees/record-form";
import { BLOOD, PREFIXES, genderOptions, listOptions, maritalOptions, militaryOptions, statusOptions, typeOptions, MARITAL, MILITARY } from "@/lib/employees/labels";
import { addDays, isoDate } from "@/lib/format";
import type { TabProps } from "./types";

const emailOk = (v: unknown) => (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v)) ? "รูปแบบอีเมลไม่ถูกต้อง" : null);

const PERSONAL: FieldDef[] = [
  { name: "code", label: "รหัสพนักงาน", type: "text", required: true, section: "ชื่อ", validate: (v) => (v && !/^[A-Za-z0-9._-]+$/.test(String(v)) ? "ใช้ได้เฉพาะ A-Z 0-9 . _ -" : null) },
  { name: "prefix", label: "คำนำหน้า", type: "select", options: listOptions(PREFIXES), section: "ชื่อ" },
  { name: "nickname", label: "ชื่อเล่น", type: "text", section: "ชื่อ" },
  { name: "first_name", label: "ชื่อ", type: "text", required: true, section: "ชื่อ" },
  { name: "last_name", label: "นามสกุล", type: "text", required: true, section: "ชื่อ" },
  { name: "gender", label: "เพศ", type: "select", options: genderOptions, section: "ชื่อ" },
  { name: "first_name_en", label: "ชื่อ (อังกฤษ)", type: "text", section: "ชื่อ" },
  { name: "last_name_en", label: "นามสกุล (อังกฤษ)", type: "text", section: "ชื่อ" },
  { name: "birth_date", label: "วันเกิด", type: "date", section: "ข้อมูลบุคคล", validate: (v) => (v && String(v) > addDays(isoDate(), -15 * 365) ? "อายุต้องไม่ต่ำกว่า 15 ปี" : null) },
  { name: "nationality", label: "สัญชาติ", type: "text", section: "ข้อมูลบุคคล" },
  { name: "religion", label: "ศาสนา", type: "select", options: listOptions(["พุทธ", "คริสต์", "อิสลาม", "ฮินดู", "ซิกข์", "ไม่นับถือศาสนา", "อื่น ๆ"]), section: "ข้อมูลบุคคล" },
  { name: "marital_status", label: "สถานภาพสมรส", type: "select", options: maritalOptions, section: "ข้อมูลบุคคล" },
  { name: "blood_type", label: "กรุ๊ปเลือด", type: "select", options: listOptions(BLOOD), section: "ข้อมูลบุคคล" },
  { name: "military_status", label: "สถานภาพทางทหาร", type: "select", options: militaryOptions, section: "ข้อมูลบุคคล" },
  { name: "phone", label: "โทรศัพท์", type: "tel", section: "ติดต่อ" },
  { name: "email", label: "อีเมล", type: "email", section: "ติดต่อ", validate: emailOk },
  { name: "line_id", label: "LINE ID", type: "text", section: "ติดต่อ" },
  { name: "emergency_name", label: "ผู้ติดต่อกรณีฉุกเฉิน", type: "text", section: "ติดต่อฉุกเฉิน" },
  { name: "emergency_relation", label: "ความสัมพันธ์", type: "text", section: "ติดต่อฉุกเฉิน" },
  { name: "emergency_phone", label: "เบอร์โทรฉุกเฉิน", type: "tel", section: "ติดต่อฉุกเฉิน" },
  { name: "notes", label: "หมายเหตุ", type: "textarea", section: "อื่น ๆ" },
];

export function PersonalTab({ emp, reload }: TabProps) {
  const can = useCan();
  return (
    <RecordForm
      title="ข้อมูลส่วนตัว"
      fields={PERSONAL}
      row={emp}
      canEdit={can("employee", "edit")}
      display={{
        marital_status: (v) => MARITAL[String(v)] ?? (v ? String(v) : "-"),
        military_status: (v) => MILITARY[String(v)] ?? (v ? String(v) : "-"),
        birth_date: (v) => (v ? <BirthCell v={String(v)} /> : "-"),
      }}
      onSave={async (v) => {
        const r = await supabaseBrowser().from("employees").update(v).eq("id", emp.id);
        if (!r.error) await reload();
        return r;
      }}
    />
  );
}

function BirthCell({ v }: { v: string }) {
  const d = new Date(v + "T00:00:00");
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) age--;
  const m = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."][d.getMonth()];
  return <span className="num">{d.getDate()} {m} {d.getFullYear() + 543} <span className="text-ink-mute">(อายุ {age} ปี)</span></span>;
}

const orgLabel = (r: Record<string, unknown>) => `${"— ".repeat(Number(r.level ?? 1) - 1)}${r.name}`;

const EMPLOYMENT: FieldDef[] = [
  { name: "branch_id", label: "สาขา", type: "ref", ref: { table: "branches", select: "id, name, code", order: "code", label: "name" }, section: "สังกัด" },
  { name: "org_unit_id", label: "หน่วยงาน", type: "ref", ref: { table: "org_units", select: "id, name, level", order: "level", label: orgLabel }, section: "สังกัด" },
  { name: "position_id", label: "ตำแหน่ง", type: "ref", ref: { table: "positions", select: "id, name, code", order: "code", label: "name" }, section: "สังกัด" },
  { name: "supervisor_id", label: "หัวหน้างาน", type: "employee", section: "สังกัด" },
  { name: "employee_type", label: "ประเภทพนักงาน", type: "select", required: true, options: typeOptions, section: "สัญญาจ้าง" },
  { name: "status", label: "สถานะ", type: "select", required: true, options: statusOptions, section: "สัญญาจ้าง", hint: "การลาออก/เปลี่ยนสถานะที่มีผลย้อนหลังควรทำผ่านเมนูโอนย้าย" },
  { name: "hire_date", label: "วันเริ่มงาน", type: "date", required: true, section: "สัญญาจ้าง" },
  { name: "probation_days", label: "ระยะทดลองงาน (วัน)", type: "number", min: 0, max: 365, section: "สัญญาจ้าง" },
  { name: "probation_end_date", label: "วันครบทดลองงาน", type: "date", section: "สัญญาจ้าง" },
  { name: "confirm_date", label: "วันผ่านทดลองงาน (บรรจุ)", type: "date", section: "สัญญาจ้าง" },
  { name: "contract_end_date", label: "วันสิ้นสุดสัญญา", type: "date", section: "สัญญาจ้าง", hidden: (v) => !["contract", "intern", "parttime"].includes(String(v.employee_type)) && v.status !== "contract" },
  { name: "resign_date", label: "วันที่ลาออก", type: "date", section: "การพ้นสภาพ", hidden: (v) => v.status !== "resigned" },
  { name: "resign_type", label: "ประเภทการพ้นสภาพ", type: "select", options: listOptions(["ลาออกเอง", "เลิกจ้าง", "เกษียณ", "หมดสัญญา", "เสียชีวิต", "อื่น ๆ"]), section: "การพ้นสภาพ", hidden: (v) => v.status !== "resigned" },
  { name: "resign_reason", label: "เหตุผล", type: "textarea", section: "การพ้นสภาพ", hidden: (v) => v.status !== "resigned" },
  { name: "default_shift_id", label: "กะการทำงานเริ่มต้น", type: "ref", ref: { table: "shifts", select: "id, code, name", order: "code", label: "name" }, section: "เวลาทำงาน" },
  { name: "weekly_off_days", label: "วันหยุดประจำสัปดาห์", type: "weekdays", section: "เวลาทำงาน" },
  { name: "attendance_exempt", label: "ไม่ต้องลงเวลา (เช่น ผู้บริหาร)", type: "boolean", section: "เวลาทำงาน" },
  { name: "work_location_ids", label: "พื้นที่ลงเวลาที่อนุญาต", type: "refs", ref: { table: "work_locations", select: "id, name", order: "name", label: "name" }, span: 3, section: "เวลาทำงาน", hint: "ไม่เลือก = ใช้พื้นที่ของสาขา" },
];

export function EmploymentTab({ emp, reload }: TabProps) {
  const can = useCan();
  return (
    <RecordForm
      title="การจ้างงาน"
      fields={EMPLOYMENT}
      row={emp}
      canEdit={can("employee", "edit")}
      validate={(v) => {
        const e: Record<string, string> = {};
        if (v.supervisor_id && Number(v.supervisor_id) === emp.id) e.supervisor_id = "หัวหน้างานต้องไม่ใช่ตัวพนักงานเอง";
        if (v.probation_end_date && v.hire_date && String(v.probation_end_date) < String(v.hire_date)) e.probation_end_date = "ต้องไม่ก่อนวันเริ่มงาน";
        if (v.contract_end_date && v.hire_date && String(v.contract_end_date) < String(v.hire_date)) e.contract_end_date = "ต้องไม่ก่อนวันเริ่มงาน";
        if (v.status === "resigned" && !v.resign_date) e.resign_date = "ระบุวันที่ลาออก";
        return e;
      }}
      onSave={async (v) => {
        const payload = { ...v };
        if (payload.status !== "resigned") Object.assign(payload, { resign_date: null, resign_type: null, resign_reason: null });
        if (Array.isArray(payload.work_location_ids) && !payload.work_location_ids.length) payload.work_location_ids = null;
        if (!Array.isArray(payload.weekly_off_days)) payload.weekly_off_days = [];
        const r = await supabaseBrowser().from("employees").update(payload).eq("id", emp.id);
        if (!r.error) await reload();
        return r;
      }}
    />
  );
}
