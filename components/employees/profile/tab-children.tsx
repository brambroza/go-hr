"use client";

import { useRef, useState } from "react";
import { FileText, Upload, X } from "lucide-react";
import { CrudPage, type CrudConfig } from "@/components/crud/crud-page";
import { Badge, Button, toast } from "@/components/ui";
import { openStored } from "@/components/org/attachments-field";
import { uploadFile } from "@/lib/storage";
import { money, thDate } from "@/lib/format";
import {
  ADDRESS_TYPE, DOC_TYPES, EDU_LEVELS, EMP_STATUS, EMP_TYPE, MOVEMENT_STATUS, MOVEMENT_STATUS_COLOR, MOVEMENT_TYPE, SKILL_CAT,
  addressTypeOptions, listOptions, movementTypeOptions, relationOptions, skillCatOptions,
} from "@/lib/employees/labels";
import { validNationalId } from "@/lib/format";
import type { TabProps } from "./types";

/** CrudPage scoped to one employee */
function Child({ emp, config }: { emp: TabProps["emp"]; config: Omit<CrudConfig, "menu" | "embedded" | "baseFilter"> & { menu?: CrudConfig["menu"] } }) {
  return (
    <CrudPage
      config={{
        menu: "employee",
        pageSize: 50,
        ...config,
        embedded: true,
        exportName: `${config.exportName ?? config.table}-${emp.code}`,
        baseFilter: (q) => q.eq("employee_id", emp.id),
        defaults: { employee_id: emp.id, ...(config.defaults ?? {}) },
        beforeSave: async (v, editing) => {
          const out = config.beforeSave ? await config.beforeSave(v, editing) : v;
          return { ...out, employee_id: emp.id };
        },
      }}
    />
  );
}

const yearRange = (v: unknown) => (v !== "" && v != null && (Number(v) < 1950 || Number(v) > 2600) ? "ระบุปี ค.ศ. หรือ พ.ศ. ให้ถูกต้อง" : null);
const dateOrder = (startKey: string) => (v: unknown, all: Record<string, unknown>) => (v && all[startKey] && String(v) < String(all[startKey]) ? "ต้องไม่ก่อนวันเริ่มต้น" : null);
const nonNeg = (v: unknown) => (v !== "" && v != null && Number(v) < 0 ? "ต้องไม่ติดลบ" : null);

export function AddressTab({ emp }: TabProps) {
  return (
    <Child
      emp={emp}
      config={{
        table: "employee_addresses",
        title: "ที่อยู่",
        description: "ที่อยู่ตามทะเบียนบ้านใช้ในแบบ สปส. และหนังสือรับรอง 50 ทวิ",
        orderBy: { column: "address_type", ascending: false },
        formSize: "lg",
        columns: [
          { key: "address_type", label: "ประเภท", render: (r) => <Badge color="green">{ADDRESS_TYPE[String(r.address_type)]}</Badge> },
          {
            key: "house_no",
            label: "ที่อยู่",
            render: (r) => [r.house_no, r.moo && `หมู่ ${r.moo}`, r.village, r.soi && `ซ.${r.soi}`, r.road && `ถ.${r.road}`, r.subdistrict && `ต.${r.subdistrict}`, r.district && `อ.${r.district}`, r.province && `จ.${r.province}`, r.postcode].filter(Boolean).join(" ") || "-",
          },
          { key: "phone", label: "โทรศัพท์" },
        ],
        fields: [
          { name: "address_type", label: "ประเภทที่อยู่", type: "select", required: true, options: addressTypeOptions, default: "registered" },
          { name: "phone", label: "โทรศัพท์บ้าน", type: "tel" },
          { name: "house_no", label: "บ้านเลขที่", type: "text", required: true },
          { name: "moo", label: "หมู่ที่", type: "text" },
          { name: "village", label: "หมู่บ้าน / อาคาร", type: "text" },
          { name: "soi", label: "ซอย", type: "text" },
          { name: "road", label: "ถนน", type: "text" },
          { name: "subdistrict", label: "ตำบล / แขวง", type: "text", required: true },
          { name: "district", label: "อำเภอ / เขต", type: "text", required: true },
          { name: "province", label: "จังหวัด", type: "text", required: true },
          { name: "postcode", label: "รหัสไปรษณีย์", type: "text", validate: (v) => (v && !/^\d{5}$/.test(String(v)) ? "รหัสไปรษณีย์ 5 หลัก" : null) },
          { name: "country", label: "ประเทศ", type: "text", default: "ไทย" },
        ],
      }}
    />
  );
}

export function FamilyTab({ emp }: TabProps) {
  return (
    <Child
      emp={emp}
      config={{
        table: "employee_family",
        title: "ครอบครัว",
        description: "บุตรและบิดามารดาที่ใช้สิทธิ์ลดหย่อนภาษีให้ติ๊ก “ใช้สิทธิ์ลดหย่อน”",
        orderBy: { column: "id", ascending: true },
        formSize: "lg",
        columns: [
          { key: "relation", label: "ความสัมพันธ์" },
          { key: "first_name", label: "ชื่อ-นามสกุล", render: (r) => `${r.prefix ?? ""}${r.first_name} ${r.last_name ?? ""}` },
          { key: "birth_date", label: "วันเกิด" },
          { key: "occupation", label: "อาชีพ" },
          { key: "phone", label: "โทรศัพท์" },
          {
            key: "is_tax_allowance",
            label: "สถานะ",
            render: (r) => (
              <span className="flex flex-wrap gap-1">
                {r.is_tax_allowance ? <Badge color="green">ลดหย่อน</Badge> : null}
                {r.is_studying ? <Badge color="blue">กำลังศึกษา</Badge> : null}
                {r.is_disabled ? <Badge color="violet">ผู้พิการ</Badge> : null}
                {!r.is_alive ? <Badge>เสียชีวิต</Badge> : null}
              </span>
            ),
          },
        ],
        fields: [
          { name: "relation", label: "ความสัมพันธ์", type: "select", required: true, options: relationOptions },
          { name: "prefix", label: "คำนำหน้า", type: "text" },
          { name: "first_name", label: "ชื่อ", type: "text", required: true },
          { name: "last_name", label: "นามสกุล", type: "text" },
          { name: "birth_date", label: "วันเกิด", type: "date" },
          { name: "national_id", label: "เลขประจำตัวประชาชน", type: "text", validate: (v) => (v && !validNationalId(String(v)) ? "เลขประจำตัวประชาชนไม่ถูกต้อง" : null) },
          { name: "occupation", label: "อาชีพ", type: "text" },
          { name: "phone", label: "โทรศัพท์", type: "tel" },
          { name: "child_order", label: "บุตรคนที่", type: "number", min: 1, hidden: (v) => v.relation !== "child", hint: "บุตรคนที่ 2 ขึ้นไปที่เกิดปี 2561+ ลดหย่อนได้ 60,000" },
          { name: "is_alive", label: "ยังมีชีวิตอยู่", type: "boolean", default: true },
          { name: "is_tax_allowance", label: "ใช้สิทธิ์ลดหย่อนภาษี", type: "boolean" },
          { name: "is_studying", label: "กำลังศึกษา", type: "boolean", hidden: (v) => v.relation !== "child" },
          { name: "is_disabled", label: "ผู้พิการ / ทุพพลภาพ", type: "boolean" },
        ],
      }}
    />
  );
}

export function EducationTab({ emp }: TabProps) {
  return (
    <Child
      emp={emp}
      config={{
        table: "employee_education",
        title: "การศึกษา",
        orderBy: { column: "year_to", ascending: false },
        columns: [
          { key: "level", label: "ระดับ" },
          { key: "institution", label: "สถาบัน" },
          { key: "faculty", label: "คณะ / สาขา", render: (r) => [r.faculty, r.major].filter(Boolean).join(" / ") || "-" },
          { key: "gpa", label: "เกรดเฉลี่ย" },
          { key: "year_to", label: "ปีที่จบ", render: (r) => (r.year_to ? <span className="num">{toBE(Number(r.year_to))}</span> : "-") },
        ],
        fields: [
          { name: "level", label: "ระดับการศึกษา", type: "select", required: true, options: listOptions(EDU_LEVELS) },
          { name: "institution", label: "สถาบัน", type: "text", required: true },
          { name: "faculty", label: "คณะ", type: "text" },
          { name: "major", label: "สาขาวิชา", type: "text" },
          { name: "gpa", label: "เกรดเฉลี่ย", type: "number", step: "0.01", min: 0, max: 4, validate: (v) => (v !== "" && v != null && (Number(v) < 0 || Number(v) > 4) ? "ระบุ 0.00–4.00" : null) },
          { name: "year_from", label: "ปีที่เข้าศึกษา (พ.ศ. หรือ ค.ศ.)", type: "number", validate: yearRange },
          { name: "year_to", label: "ปีที่จบ (พ.ศ. หรือ ค.ศ.)", type: "number", validate: (v, all) => yearRange(v) ?? (v && all.year_from && Number(v) < Number(all.year_from) ? "ต้องไม่ก่อนปีที่เข้าศึกษา" : null) },
        ],
        beforeSave: (v) => ({ ...v, year_from: toCE(v.year_from), year_to: toCE(v.year_to) }),
      }}
    />
  );
}
// years are stored as ค.ศ.; users usually type พ.ศ.
const toCE = (v: unknown) => (v == null || v === "" ? null : Number(v) > 2400 ? Number(v) - 543 : Number(v));
const toBE = (v: number) => (v < 2400 ? v + 543 : v);

export function WorkHistoryTab({ emp }: TabProps) {
  return (
    <Child
      emp={emp}
      config={{
        table: "employee_work_history",
        title: "ประวัติการทำงาน (ก่อนเข้าบริษัท)",
        orderBy: { column: "start_date", ascending: false },
        formSize: "lg",
        columns: [
          { key: "company", label: "บริษัท" },
          { key: "position", label: "ตำแหน่ง" },
          { key: "start_date", label: "ช่วงเวลา", render: (r) => <span className="num whitespace-nowrap">{thDate(r.start_date as string)} – {r.end_date ? thDate(r.end_date as string) : "ปัจจุบัน"}</span> },
          { key: "last_salary", label: "เงินเดือนล่าสุด" },
          { key: "reason_leaving", label: "สาเหตุที่ออก" },
        ],
        fields: [
          { name: "company", label: "บริษัท", type: "text", required: true },
          { name: "position", label: "ตำแหน่ง", type: "text" },
          { name: "start_date", label: "วันเริ่มงาน", type: "date" },
          { name: "end_date", label: "วันออกจากงาน", type: "date", validate: dateOrder("start_date") },
          { name: "last_salary", label: "เงินเดือนล่าสุด", type: "money", validate: nonNeg },
          { name: "reason_leaving", label: "สาเหตุที่ออก", type: "text" },
          { name: "responsibility", label: "หน้าที่ความรับผิดชอบ", type: "textarea" },
        ],
      }}
    />
  );
}

export function SkillsTab({ emp }: TabProps) {
  return (
    <Child
      emp={emp}
      config={{
        table: "employee_skills",
        title: "ความสามารถพิเศษ / ใบอนุญาต",
        orderBy: { column: "category", ascending: true },
        columns: [
          { key: "category", label: "หมวด", render: (r) => SKILL_CAT[String(r.category)] ?? String(r.category) },
          { key: "name", label: "ความสามารถ" },
          { key: "level", label: "ระดับ" },
          { key: "expire_date", label: "หมดอายุ", render: (r) => <Expiry v={r.expire_date as string | null} /> },
          { key: "note", label: "หมายเหตุ" },
        ],
        fields: [
          { name: "category", label: "หมวด", type: "select", required: true, options: skillCatOptions, default: "language" },
          { name: "name", label: "ความสามารถ", type: "text", required: true, placeholder: "เช่น ภาษาอังกฤษ, ขับรถยก (Forklift)" },
          { name: "level", label: "ระดับ", type: "select", options: listOptions(["พื้นฐาน", "พอใช้", "ดี", "ดีมาก", "เชี่ยวชาญ"]) },
          { name: "expire_date", label: "วันหมดอายุ (ถ้ามี)", type: "date" },
          { name: "note", label: "หมายเหตุ", type: "textarea" },
        ],
      }}
    />
  );
}

export function GuaranteeTab({ emp }: TabProps) {
  return (
    <Child
      emp={emp}
      config={{
        table: "employee_guarantees",
        title: "เงินประกันการทำงาน",
        description: "ตาม พ.ร.บ.คุ้มครองแรงงาน มาตรา 10 ต้องคืนภายใน 30 วันหลังพ้นสภาพ",
        orderBy: { column: "start_date", ascending: false },
        columns: [
          { key: "total_amount", label: "ยอดที่ต้องเก็บ" },
          { key: "monthly_amount", label: "หักต่องวด" },
          { key: "collected_amount", label: "เก็บแล้ว", render: (r) => <span className="num">{money(r.collected_amount as number)} <span className="text-xs text-ink-mute">({r.total_amount ? Math.round((Number(r.collected_amount) / Number(r.total_amount)) * 100) : 0}%)</span></span> },
          { key: "start_date", label: "เริ่มเก็บ" },
          { key: "refunded_date", label: "คืนเงิน", render: (r) => (r.refunded_date ? <Badge color="green">คืนแล้ว {thDate(r.refunded_date as string)}</Badge> : <span className="text-ink-mute">-</span>) },
        ],
        fields: [
          { name: "total_amount", label: "ยอดเงินประกันทั้งหมด", type: "money", required: true, validate: nonNeg },
          { name: "monthly_amount", label: "หักต่องวด (0 = เก็บครั้งเดียว)", type: "money", default: 0, validate: nonNeg },
          { name: "collected_amount", label: "เก็บแล้ว", type: "money", default: 0, validate: (v, a) => nonNeg(v) ?? (Number(v) > Number(a.total_amount || 0) ? "ต้องไม่เกินยอดทั้งหมด" : null) },
          { name: "start_date", label: "วันที่เริ่มเก็บ", type: "date" },
          { name: "bank_deposit_ref", label: "เลขบัญชีเงินฝากที่นำฝาก", type: "text" },
          { name: "refunded_date", label: "วันที่คืนเงิน", type: "date" },
          { name: "refunded_amount", label: "ยอดที่คืน", type: "money", validate: nonNeg },
          { name: "note", label: "หมายเหตุ", type: "textarea" },
        ],
      }}
    />
  );
}

export function FundsTab({ emp }: TabProps) {
  return (
    <Child
      emp={emp}
      config={{
        table: "employee_funds",
        title: "กองทุนอื่น ๆ / สหกรณ์",
        description: "กองทุนสำรองเลี้ยงชีพตั้งค่าที่แท็บ “เงินเดือนและบัญชี”",
        orderBy: { column: "start_date", ascending: false },
        columns: [
          { key: "fund_name", label: "กองทุน" },
          { key: "member_no", label: "เลขสมาชิก" },
          { key: "monthly_amount", label: "หักต่อเดือน" },
          { key: "rate_percent", label: "อัตรา (%)" },
          { key: "start_date", label: "เริ่ม" },
          { key: "end_date", label: "สิ้นสุด" },
        ],
        fields: [
          { name: "fund_name", label: "ชื่อกองทุน", type: "text", required: true, placeholder: "เช่น สหกรณ์ออมทรัพย์พนักงาน" },
          { name: "member_no", label: "เลขสมาชิก", type: "text" },
          { name: "monthly_amount", label: "หักต่อเดือน (บาท)", type: "money", default: 0, validate: nonNeg },
          { name: "rate_percent", label: "หรืออัตรา (% ของเงินเดือน)", type: "number", step: "0.01", validate: (v) => (v !== "" && v != null && (Number(v) < 0 || Number(v) > 100) ? "ระบุ 0–100" : null) },
          { name: "start_date", label: "วันเริ่ม", type: "date" },
          { name: "end_date", label: "วันสิ้นสุด", type: "date", validate: dateOrder("start_date") },
          { name: "note", label: "หมายเหตุ", type: "textarea" },
        ],
      }}
    />
  );
}

export function TrainingTab({ emp }: TabProps) {
  return (
    <Child
      emp={emp}
      config={{
        table: "employee_trainings",
        title: "ประวัติการฝึกอบรม",
        description: "รวมรายการจากเมนูฝึกอบรมและ E-Learning โดยอัตโนมัติ",
        orderBy: { column: "start_date", ascending: false },
        formSize: "lg",
        columns: [
          { key: "course_name", label: "หลักสูตร" },
          { key: "provider", label: "ผู้จัด" },
          { key: "start_date", label: "วันที่" },
          { key: "hours", label: "ชั่วโมง" },
          { key: "cost", label: "ค่าใช้จ่าย" },
          { key: "result", label: "ผล" },
          { key: "certificate_url", label: "ใบประกาศ", render: (r) => (r.certificate_url ? <FileLink url={String(r.certificate_url)} label="เปิด" /> : <span className="text-ink-mute">-</span>) },
        ],
        fields: [
          { name: "course_name", label: "ชื่อหลักสูตร", type: "text", required: true },
          { name: "provider", label: "ผู้จัด / สถาบัน", type: "text" },
          { name: "start_date", label: "วันเริ่ม", type: "date" },
          { name: "end_date", label: "วันสิ้นสุด", type: "date", validate: dateOrder("start_date") },
          { name: "hours", label: "จำนวนชั่วโมง", type: "number", step: "0.5", validate: nonNeg },
          { name: "cost", label: "ค่าใช้จ่าย", type: "money", validate: nonNeg },
          { name: "result", label: "ผลการอบรม", type: "select", options: listOptions(["ผ่าน", "ไม่ผ่าน", "เข้าร่วม"]) },
          { name: "certificate_url", label: "ใบประกาศนียบัตร", type: "custom", render: ({ value, onChange }) => <SingleFile value={value as string | null} onChange={onChange} folder={`emp-${emp.id}`} /> },
        ],
      }}
    />
  );
}

export function AssetsTab({ emp }: TabProps) {
  return (
    <Child
      emp={emp}
      config={{
        table: "employee_assets",
        title: "สินทรัพย์ถือครอง",
        description: "ทรัพย์สินบริษัทที่พนักงานถือครอง ตรวจสอบการคืนเมื่อพ้นสภาพ",
        orderBy: { column: "issued_date", ascending: false },
        columns: [
          { key: "asset_code", label: "รหัส" },
          { key: "asset_name", label: "ทรัพย์สิน" },
          { key: "serial_no", label: "Serial No." },
          { key: "value", label: "มูลค่า" },
          { key: "issued_date", label: "วันที่รับ" },
          { key: "returned_date", label: "สถานะ", render: (r) => (r.returned_date ? <Badge>คืนแล้ว {thDate(r.returned_date as string)}</Badge> : <Badge color="amber">ถือครองอยู่</Badge>) },
        ],
        fields: [
          { name: "asset_code", label: "รหัสทรัพย์สิน", type: "text" },
          { name: "asset_name", label: "ชื่อทรัพย์สิน", type: "text", required: true, placeholder: "เช่น โน้ตบุ๊ก, บัตรพนักงาน, ยูนิฟอร์ม" },
          { name: "serial_no", label: "Serial No.", type: "text" },
          { name: "value", label: "มูลค่า", type: "money", validate: nonNeg },
          { name: "issued_date", label: "วันที่รับ", type: "date" },
          { name: "returned_date", label: "วันที่คืน", type: "date", validate: dateOrder("issued_date") },
          { name: "condition", label: "สภาพ", type: "text" },
          { name: "note", label: "หมายเหตุ", type: "textarea" },
        ],
      }}
    />
  );
}

export function DocumentsTab({ emp }: TabProps) {
  return (
    <Child
      emp={emp}
      config={{
        table: "employee_documents",
        title: "เอกสาร",
        description: "ระบบแจ้งเตือนเอกสารใกล้หมดอายุตามที่ตั้งค่าไว้",
        orderBy: { column: "created_at", ascending: false },
        columns: [
          { key: "doc_type", label: "ประเภท" },
          { key: "title", label: "ชื่อเอกสาร", render: (r) => (r.file_url ? <FileLink url={String(r.file_url)} label={String(r.title)} /> : String(r.title)) },
          { key: "issue_date", label: "วันที่ออก" },
          { key: "expire_date", label: "หมดอายุ", render: (r) => <Expiry v={r.expire_date as string | null} /> },
          { key: "note", label: "หมายเหตุ" },
        ],
        fields: [
          { name: "doc_type", label: "ประเภทเอกสาร", type: "select", required: true, options: listOptions(DOC_TYPES) },
          { name: "title", label: "ชื่อเอกสาร", type: "text", required: true },
          { name: "file_url", label: "ไฟล์", type: "custom", span: 2, render: ({ value, onChange }) => <SingleFile value={value as string | null} onChange={onChange} folder={`emp-${emp.id}`} /> },
          { name: "issue_date", label: "วันที่ออก", type: "date" },
          { name: "expire_date", label: "วันหมดอายุ", type: "date", validate: dateOrder("issue_date") },
          { name: "note", label: "หมายเหตุ", type: "textarea" },
        ],
      }}
    />
  );
}

export function SalaryHistoryTab({ emp }: TabProps) {
  return (
    <Child
      emp={emp}
      config={{
        table: "salary_history",
        title: "ประวัติเงินเดือน",
        description: "บันทึกอัตโนมัติทุกครั้งที่เงินเดือนเปลี่ยน (แก้ไขไม่ได้)",
        menu: "employee_private",
        readOnly: true,
        orderBy: { column: "effective_date", ascending: false },
        columns: [
          { key: "effective_date", label: "วันที่มีผล" },
          { key: "old_salary", label: "เดิม" },
          { key: "new_salary", label: "ใหม่" },
          {
            key: "change_percent",
            label: "เปลี่ยนแปลง",
            render: (r) => (r.change_percent == null ? <span className="text-ink-mute">-</span> : <span className={`num ${Number(r.change_percent) >= 0 ? "text-jade-700" : "text-rust"}`}>{Number(r.change_percent) > 0 ? "+" : ""}{String(r.change_percent)}%</span>),
          },
          { key: "reason", label: "เหตุผล" },
        ],
        fields: [
          { name: "effective_date", label: "วันที่มีผล", type: "date" },
          { name: "old_salary", label: "เดิม", type: "money" },
          { name: "new_salary", label: "ใหม่", type: "money" },
          { name: "reason", label: "เหตุผล", type: "text" },
        ],
        emptyText: "ยังไม่มีการเปลี่ยนแปลงเงินเดือน",
      }}
    />
  );
}

export function MovementsTab({ emp }: TabProps) {
  return (
    <Child
      emp={emp}
      config={{
        table: "employee_movements",
        title: "ประวัติการเคลื่อนไหว",
        description: "โอนย้าย เลื่อนตำแหน่ง ผ่านทดลองงาน และการเปลี่ยนสถานะ (สร้างรายการใหม่ที่เมนูโอนย้าย / แต่งตั้ง)",
        readOnly: true,
        orderBy: { column: "effective_date", ascending: false },
        select: "*, org:new_org_unit_id(name), pos:new_position_id(name), br:new_branch_id(name)",
        columns: [
          { key: "doc_no", label: "เลขที่" },
          { key: "movement_type", label: "ประเภท", render: (r) => <Badge color="violet">{MOVEMENT_TYPE[String(r.movement_type)]}</Badge> },
          { key: "effective_date", label: "วันที่มีผล" },
          {
            key: "detail",
            label: "รายละเอียด",
            render: (r) => {
              const rel = (k: string) => (r[k] as { name?: string } | null)?.name;
              const items = [
                rel("br") && `สาขา: ${rel("br")}`,
                rel("org") && `หน่วยงาน: ${rel("org")}`,
                rel("pos") && `ตำแหน่ง: ${rel("pos")}`,
                r.new_employee_type && `ประเภท: ${EMP_TYPE[String(r.new_employee_type)]}`,
                r.new_status && `สถานะ: ${EMP_STATUS[String(r.new_status)]}`,
                r.new_salary != null && "ปรับเงินเดือน",
              ].filter(Boolean);
              return <span className="text-[13px]">{items.join(" · ") || "-"}{r.reason ? <span className="block text-ink-mute">{String(r.reason)}</span> : null}</span>;
            },
            exportValue: (r) => String(r.reason ?? ""),
          },
          { key: "status", label: "สถานะ", render: (r) => <Badge color={MOVEMENT_STATUS_COLOR[String(r.status)]}>{MOVEMENT_STATUS[String(r.status)]}</Badge> },
        ],
        fields: [
          { name: "doc_no", label: "เลขที่", type: "text" },
          { name: "movement_type", label: "ประเภท", type: "select", options: movementTypeOptions },
          { name: "effective_date", label: "วันที่มีผล", type: "date" },
        ],
        emptyText: "ยังไม่มีประวัติการเคลื่อนไหว",
      }}
    />
  );
}

// ---------------------------------------------------------------- helpers

function Expiry({ v }: { v: string | null }) {
  if (!v) return <span className="text-ink-mute">-</span>;
  const days = daysUntil(v);
  return (
    <span className="num whitespace-nowrap">
      {thDate(v)} {days < 0 ? <Badge color="red">หมดอายุ</Badge> : days <= 60 ? <Badge color="amber">อีก {days} วัน</Badge> : null}
    </span>
  );
}

function FileLink({ url, label }: { url: string; label: string }) {
  return (
    <button type="button" className="inline-flex items-center gap-1 text-left text-jade-800 hover:underline" onClick={(e) => { e.stopPropagation(); openStored(url); }}>
      <FileText className="size-4 shrink-0" />
      {label}
    </button>
  );
}

function SingleFile({ value, onChange, folder }: { value: string | null; onChange: (v: string | null) => void; folder: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  async function pick(f?: File) {
    if (!f) return;
    if (f.size > 20 * 1024 * 1024) return toast.error("ไฟล์ใหญ่เกิน 20 MB");
    setBusy(true);
    try {
      const r = await uploadFile("documents", f, { folder });
      onChange(r.url);
    } catch (e) {
      toast.error(`อัปโหลดไม่สำเร็จ: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input ref={input} type="file" className="sr-only" tabIndex={-1} aria-hidden accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx" onChange={(e) => pick(e.target.files?.[0])} />
      {value ? (
        <>
          <FileLink url={value} label={decodeURIComponent(value.split("/").pop() ?? "ไฟล์")} />
          <button type="button" className="rounded p-1 text-ink-mute hover:bg-rust-soft hover:text-rust" aria-label="นำไฟล์ออก" onClick={() => onChange(null)}>
            <X className="size-4" />
          </button>
        </>
      ) : null}
      <Button size="sm" variant="secondary" icon={<Upload className="size-4" />} loading={busy} onClick={() => input.current?.click()}>
        {value ? "เปลี่ยนไฟล์" : "อัปโหลดไฟล์"}
      </Button>
    </div>
  );
}

function daysUntil(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  const today = new Date(new Date().toDateString());
  return Math.round((new Date(y, m - 1, d).getTime() - today.getTime()) / 86400000);
}
