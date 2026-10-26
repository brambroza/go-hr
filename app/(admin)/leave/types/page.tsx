"use client";

import { CrudPage } from "@/components/crud/crud-page";
import { Badge } from "@/components/ui";

const days = (v: unknown) => (v == null || v === "" ? "-" : `${Number(v).toLocaleString("th-TH")} วัน`);

export default function LeaveTypesPage() {
  return (
    <CrudPage
      config={{
        table: "leave_types",
        title: "ประเภทการลา",
        description: "สิทธิ์การลาและเงื่อนไขของแต่ละประเภท — ค่าเริ่มต้นเป็นไปตาม พ.ร.บ.คุ้มครองแรงงาน ปรับเพิ่มตามนโยบายบริษัทได้",
        menu: "attendance",
        orderBy: { column: "sort_order", ascending: true },
        searchColumns: ["code", "name", "name_en"],
        formSize: "lg",
        pageSize: 50,
        exportName: "leave_types",
        defaults: { is_paid: true, allow_full_day: true, allow_half_day: true, allow_backdate_days: 30, pay_rate_percent: 100, color: "#3b82f6", is_active: true, carry_over_max_days: 0, min_service_months: 0, min_notice_days: 0, default_quota_days: 0, allow_probation: true, sort_order: 0 },
        columns: [
          { key: "name", label: "ประเภทการลา", sortable: true, render: (r) => (
            <span className="inline-flex items-center gap-2">
              <span className="size-3 shrink-0 rounded-full" style={{ background: String(r.color ?? "#3b82f6") }} />
              <span><span className="font-medium">{String(r.name)}</span> <span className="text-xs text-ink-mute">{String(r.code)}</span></span>
            </span>
          ), exportValue: (r) => r.name },
          { key: "default_quota_days", label: "สิทธิ์/ปี", className: "text-right", render: (r) => (r.is_unlimited ? <Badge>ไม่จำกัด</Badge> : <span className="num">{days(r.default_quota_days)}</span>) },
          { key: "is_paid", label: "ได้รับค่าจ้าง", render: (r) => (r.is_paid ? <Badge color="green">{Number(r.pay_rate_percent) < 100 ? `${r.pay_rate_percent}%` : "ได้"}{r.paid_days_limit ? ` ≤ ${r.paid_days_limit} วัน` : ""}</Badge> : <Badge>ไม่ได้</Badge>) },
          { key: "units", label: "หน่วยการลา", render: (r) => <span className="text-sm">{[r.allow_full_day && "เต็มวัน", r.allow_half_day && "ครึ่งวัน", r.allow_hourly && "ชั่วโมง"].filter(Boolean).join(" · ") || "-"}</span>, exportValue: (r) => [r.allow_full_day && "full", r.allow_half_day && "half", r.allow_hourly && "hour"].filter(Boolean).join(" ") },
          { key: "rules", label: "เงื่อนไข", render: (r) => (
            <div className="flex flex-wrap gap-1">
              {Number(r.min_service_months) > 0 && <Badge>อายุงาน ≥ {String(r.min_service_months)} เดือน</Badge>}
              {Number(r.carry_over_max_days) > 0 && <Badge color="blue">สะสมได้ {String(r.carry_over_max_days)} วัน</Badge>}
              {r.gender ? <Badge color="violet">{r.gender === "F" ? "เฉพาะหญิง" : "เฉพาะชาย"}</Badge> : null}
              {!r.allow_probation && <Badge color="amber">ทดลองงานลาไม่ได้</Badge>}
              {Number(r.min_notice_days) > 0 && <Badge>ยื่นล่วงหน้า {String(r.min_notice_days)} วัน</Badge>}
              {r.attachment_over_days != null && <Badge>แนบเอกสารเมื่อเกิน {String(r.attachment_over_days)} วัน</Badge>}
            </div>
          ), exportValue: () => "" },
          { key: "is_active", label: "ใช้งาน" },
        ],
        fields: [
          { name: "code", label: "รหัส", type: "text", required: true, readOnlyOnEdit: true, section: "ข้อมูลทั่วไป", hint: "เช่น SICK, VACATION — ใช้อ้างอิงในรายงานและ API" },
          { name: "name", label: "ชื่อประเภทการลา", type: "text", required: true, section: "ข้อมูลทั่วไป" },
          { name: "name_en", label: "ชื่อภาษาอังกฤษ", type: "text", section: "ข้อมูลทั่วไป" },
          { name: "color", label: "สี (ในปฏิทิน)", type: "color", section: "ข้อมูลทั่วไป" },
          { name: "sort_order", label: "ลำดับการแสดง", type: "number", step: "1", section: "ข้อมูลทั่วไป" },
          { name: "is_active", label: "ใช้งาน", type: "boolean", section: "ข้อมูลทั่วไป" },
          { name: "description", label: "คำอธิบาย (แสดงให้พนักงานเห็นตอนยื่นลา)", type: "textarea", section: "ข้อมูลทั่วไป" },

          { name: "is_unlimited", label: "ไม่จำกัดจำนวนวัน", type: "boolean", section: "สิทธิ์และโควต้า" },
          { name: "default_quota_days", label: "สิทธิ์ต่อปี (วัน)", type: "number", step: "0.5", min: 0, section: "สิทธิ์และโควต้า", hidden: (v) => !!v.is_unlimited, hint: "ใช้สร้างโควต้าประจำปี" },
          { name: "carry_over_max_days", label: "สะสมไปปีถัดไปได้สูงสุด (วัน)", type: "number", step: "0.5", min: 0, section: "สิทธิ์และโควต้า", hint: "0 = ไม่สะสม" },
          { name: "min_service_months", label: "อายุงานขั้นต่ำ (เดือน)", type: "number", step: "1", min: 0, section: "สิทธิ์และโควต้า", hint: "พักร้อนตามกฎหมาย = 12 เดือน" },
          { name: "prorate_first_year", label: "ปีแรกที่มีสิทธิ์ ให้ตามสัดส่วนเดือนที่เหลือ", type: "boolean", span: 2, section: "สิทธิ์และโควต้า" },
          { name: "gender", label: "เฉพาะเพศ", type: "select", options: [{ value: "F", label: "หญิง" }, { value: "M", label: "ชาย" }], section: "สิทธิ์และโควต้า" },
          { name: "allow_probation", label: "พนักงานทดลองงานลาได้", type: "boolean", section: "สิทธิ์และโควต้า" },

          { name: "is_paid", label: "ได้รับค่าจ้างระหว่างลา", type: "boolean", section: "ค่าจ้าง" },
          { name: "pay_rate_percent", label: "อัตราค่าจ้างระหว่างลา (%)", type: "number", step: "0.01", min: 0, max: 100, section: "ค่าจ้าง", hidden: (v) => !v.is_paid },
          { name: "paid_days_limit", label: "จ่ายค่าจ้างไม่เกิน (วัน)", type: "number", step: "0.5", min: 0, section: "ค่าจ้าง", hidden: (v) => !v.is_paid, hint: "เช่น ลาป่วยได้ค่าจ้าง 30 วัน, ลาคลอด 60 วัน — เว้นว่าง = ไม่จำกัด" },
          { name: "paid_limit_scope", label: "นับเพดานค่าจ้าง", type: "select", section: "ค่าจ้าง", default: "year", hidden: (v) => !v.is_paid || !v.paid_days_limit, options: [{ value: "year", label: "ต่อปีปฏิทิน" }, { value: "episode", label: "ต่อครั้ง (เช่น ลาคลอดต่อการตั้งครรภ์)" }], hint: "ต่อครั้ง: วันลาประเภทนี้ที่ห่างกันเกิน 270 วันนับเป็นครั้งใหม่ — ลาคร่อมปีไม่ได้เพดานใหม่" },

          { name: "allow_full_day", label: "ลาเต็มวันได้", type: "boolean", section: "การยื่นลา" },
          { name: "allow_half_day", label: "ลาครึ่งวันได้", type: "boolean", section: "การยื่นลา" },
          { name: "allow_hourly", label: "ลาเป็นชั่วโมงได้", type: "boolean", section: "การยื่นลา" },
          { name: "count_non_workdays", label: "นับวันหยุดรวมด้วย (เช่น ลาคลอด)", type: "boolean", section: "การยื่นลา" },
          { name: "min_notice_days", label: "ต้องยื่นล่วงหน้า (วัน)", type: "number", step: "1", min: 0, section: "การยื่นลา" },
          { name: "allow_backdate_days", label: "ยื่นย้อนหลังได้ไม่เกิน (วัน)", type: "number", step: "1", min: 0, section: "การยื่นลา" },
          { name: "max_per_request_days", label: "ลาได้สูงสุดต่อครั้ง (วัน)", type: "number", step: "0.5", min: 0, section: "การยื่นลา", hint: "เว้นว่าง = ไม่จำกัด" },
          { name: "attachment_over_days", label: "ต้องแนบเอกสารเมื่อลาเกิน (วัน)", type: "number", step: "0.5", min: 0, section: "การยื่นลา", hint: "เช่น ลาป่วยเกิน 2 วันต้องมีใบรับรองแพทย์" },
        ],
        beforeSave: (v) => {
          if (v.is_unlimited) v.default_quota_days = 0;
          if (!v.allow_full_day && !v.allow_half_day && !v.allow_hourly) throw new Error("ต้องเลือกหน่วยการลาอย่างน้อย 1 แบบ");
          return v;
        },
      }}
    />
  );
}
