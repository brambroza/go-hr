"use client";

import { CrudPage, type Row } from "@/components/crud/crud-page";
import type { FieldDef } from "@/components/crud/form-fields";
import { ShiftChip } from "@/components/attendance/bits";
import { ShiftTimeline } from "@/components/attendance/shift-timeline";
import { invalidateAttLookups } from "@/components/attendance/lookups";

const time = (v: unknown) => (v ? String(v).slice(0, 5) : "-");
const min = (label: string, name: string, def: number, hint?: string, section?: string): FieldDef => ({ name, label, type: "number", default: def, min: 0, step: "1", hint, section, required: true });

function toMin(t: unknown) {
  const [h, m] = String(t ?? "").split(":").map(Number);
  return isNaN(h) ? null : h * 60 + (m || 0);
}

export default function ShiftsPage() {
  return (
    <CrudPage
      config={{
        table: "shifts",
        title: "กะการทำงาน",
        description: "เวลาเข้า-ออก เวลาพัก เกณฑ์สาย/กลับก่อน และเงื่อนไข OT ของแต่ละกะ ใช้คำนวณเวลาทุกวัน",
        menu: "attendance",
        orderBy: { column: "code", ascending: true },
        searchColumns: ["code", "name"],
        formSize: "lg",
        afterSave: () => invalidateAttLookups(),
        columns: [
          { key: "code", label: "รหัส", sortable: true, render: (r) => <ShiftChip code={String(r.code)} color={r.color as string} /> },
          { key: "name", label: "ชื่อกะ", sortable: true },
          { key: "start_time", label: "เวลา", render: (r) => <span className="num whitespace-nowrap">{time(r.start_time)}–{time(r.end_time)}{r.is_overnight ? " (+1)" : ""}</span>, exportValue: (r) => `${time(r.start_time)}-${time(r.end_time)}` },
          { key: "break_start", label: "พัก", render: (r) => <span className="num whitespace-nowrap">{r.break_start ? `${time(r.break_start)}–${time(r.break_end)}` : `${r.break_minutes} นาที`}</span> },
          { key: "timeline", label: "ภาพรวม 24 ชม.", className: "w-[34%] min-w-56", render: (r) => <ShiftTimeline s={r} compact />, exportValue: () => "" },
          { key: "late_grace_min", label: "สายได้ (นาที)", className: "text-right" },
          { key: "require_ot_request", label: "OT ต้องมีใบขอ" },
          { key: "is_active", label: "ใช้งาน" },
        ],
        defaults: { color: "#10b981", is_active: true, require_ot_request: true },
        beforeSave: (v) => {
          const { _preview, ...rest } = v as Row & { _preview?: unknown };
          void _preview;
          const s = toMin(rest.start_time);
          const e = toMin(rest.end_time);
          if (s != null && e != null && e <= s) rest.is_overnight = true;
          if (rest.break_start && rest.break_end) {
            const bs = toMin(rest.break_start)!;
            let be = toMin(rest.break_end)!;
            if (be < bs) be += 1440;
            rest.break_minutes = be - bs;
          }
          if (s != null && e != null) {
            const total = (e > s ? e - s : e + 1440 - s) - Number(rest.break_minutes ?? 0);
            if (!rest.work_minutes || Number(rest.work_minutes) <= 0) rest.work_minutes = total;
          }
          return rest;
        },
        fields: [
          { name: "code", label: "รหัสกะ", type: "text", required: true, hint: "สั้นๆ เช่น D, N, A — แสดงในตารางกะ", section: "ข้อมูลกะ" },
          { name: "name", label: "ชื่อกะ", type: "text", required: true, section: "ข้อมูลกะ" },
          { name: "color", label: "สีในตารางกะ", type: "color", section: "ข้อมูลกะ" },
          { name: "is_active", label: "ใช้งาน", type: "boolean", section: "ข้อมูลกะ" },

          { name: "start_time", label: "เวลาเข้างาน", type: "time", required: true, section: "เวลา" },
          { name: "end_time", label: "เวลาเลิกงาน", type: "time", required: true, section: "เวลา" },
          { name: "is_overnight", label: "เลิกงานวันถัดไป (กะข้ามวัน)", type: "boolean", hint: "ตั้งให้อัตโนมัติเมื่อเวลาเลิกงานน้อยกว่าเวลาเข้างาน", section: "เวลา" },
          min("ชั่วโมงทำงานต่อวัน (นาที)", "work_minutes", 480, "ไม่รวมเวลาพัก เช่น 8 ชม. = 480", "เวลา"),
          min("รับการสแกนก่อนเข้างาน (นาที)", "scan_in_before_min", 180, "สแกนก่อนช่วงนี้จะไม่นับเป็นของวันนี้", "เวลา"),
          min("รับการสแกนหลังเลิกงาน (นาที)", "scan_out_after_min", 480, "รวมช่วงทำ OT หลังเลิกงาน", "เวลา"),

          { name: "break_start", label: "เริ่มพัก", type: "time", section: "พัก" },
          { name: "break_end", label: "สิ้นสุดพัก", type: "time", section: "พัก" },
          min("เวลาพัก (นาที)", "break_minutes", 60, "คำนวณจากเวลาเริ่ม-สิ้นสุดพักอัตโนมัติถ้าระบุ", "พัก"),
          min("พักเกินได้ (นาที)", "break_over_grace_min", 0, "พักเกินกว่านี้จะถูกบันทึกว่าพักเกิน", "พัก"),

          min("สายได้ไม่เกิน (นาที)", "late_grace_min", 0, "สายไม่เกินนี้ไม่นับว่าสาย", "เกณฑ์สาย / กลับก่อน"),
          min("กลับก่อนได้ไม่เกิน (นาที)", "early_grace_min", 0, undefined, "เกณฑ์สาย / กลับก่อน"),
          min("ปัดเศษนาทีสาย (นาที)", "late_round_minutes", 1, "1 = ไม่ปัด", "เกณฑ์สาย / กลับก่อน"),

          { name: "require_ot_request", label: "OT ต้องมีใบขอ OT ที่อนุมัติแล้ว", type: "boolean", span: 2, section: "OT" },
          min("OT ก่อนเข้างาน ต้องมาก่อน (นาที)", "ot_before_min", 0, "นับ OT ก่อนเข้างานเมื่อมาก่อนเกินเวลานี้", "OT"),
          min("เริ่มนับ OT หลังเลิกงาน (นาที)", "ot_after_start_min", 30, "เช่น เลิก 17:00 + 30 = เริ่มนับ 17:30", "OT"),
          min("OT ขั้นต่ำ (นาที)", "ot_min_minutes", 30, "น้อยกว่านี้ไม่จ่าย OT", "OT"),
          min("ปัดเศษ OT ลงทีละ (นาที)", "ot_round_minutes", 15, undefined, "OT"),

          { name: "_preview", label: "ภาพรวมกะ", type: "custom", span: 2, section: "ภาพรวม", render: ({ values }) => <ShiftTimeline s={values} /> },
        ],
      }}
    />
  );
}
