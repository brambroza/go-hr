"use client";
import { CrudPage } from "@/components/crud/crud-page";
import { CATEGORY_LABEL } from "@/lib/payroll/labels";

const monthLabel = (v: unknown) => {
  if (!v) return "-";
  const [y, m] = String(v).split("-").map(Number);
  return `${["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."][m - 1]} ${y + 543}`;
};
const firstOfMonth = (v: unknown) => (v ? `${String(v).slice(0, 7)}-01` : null);

export default function RecurringPayItemsPage() {
  return (
    <CrudPage
      config={{
        table: "employee_pay_items",
        title: "รายรับรายจ่ายประจำ",
        description: "ค่าตำแหน่ง ค่าเดินทาง ค่าที่พัก หักสหกรณ์ ฯลฯ ที่จ่าย/หักทุกงวดรายเดือนในช่วงเดือนที่กำหนด",
        menu: "payroll",
        select: "*, employees!inner(code, first_name, last_name), pay_items!inner(code, name, category, direction)",
        orderBy: { column: "id", ascending: false },
        exportName: "recurring-pay-items",
        columns: [
          { key: "employee_id", label: "พนักงาน", render: (r) => { const e = r.employees as { code: string; first_name: string; last_name: string }; return <span><span className="text-ink-mute">{e.code}</span> {e.first_name} {e.last_name}</span>; }, exportValue: (r) => { const e = r.employees as { code: string; first_name: string; last_name: string }; return `${e.code} ${e.first_name} ${e.last_name}`; } },
          { key: "pay_item_id", label: "รายการ", render: (r) => { const i = r.pay_items as { name: string; category: string; direction: number }; return <span>{i.direction === 1 ? "+" : "−"} {i.name} <span className="text-xs text-ink-mute">({CATEGORY_LABEL[i.category] ?? i.category})</span></span>; }, exportValue: (r) => (r.pay_items as { name: string }).name },
          { key: "amount", label: "จำนวนเงิน", className: "text-right" },
          { key: "qty", label: "จำนวน", className: "text-right" },
          { key: "start_month", label: "เริ่มเดือน", render: (r) => monthLabel(r.start_month), exportValue: (r) => r.start_month },
          { key: "end_month", label: "ถึงเดือน", render: (r) => (r.end_month ? monthLabel(r.end_month) : <span className="text-ink-mute">ไม่กำหนด</span>), exportValue: (r) => r.end_month },
          { key: "note", label: "หมายเหตุ" },
        ],
        fields: [
          { name: "employee_id", label: "พนักงาน", type: "employee", required: true, span: 2 },
          {
            name: "pay_item_id", label: "รายการ", type: "ref", required: true,
            ref: { table: "pay_items", label: (r) => `${r.direction === 1 ? "+" : "−"} ${r.name} (${CATEGORY_LABEL[String(r.category)] ?? r.category})`, filter: (q) => q.in("category", ["constant", "income", "expense", "fund", "welfare", "loan"]).eq("is_active", true), order: "sort_order" },
          },
          { name: "amount", label: "จำนวนเงิน (บาท)", type: "money", required: true, hint: "รายการแบบต่อวัน/ต่อชั่วโมง = อัตราต่อหน่วย" },
          { name: "qty", label: "จำนวนหน่วย", type: "number", hint: "เว้นว่าง = ใช้วันทำงาน/ชั่วโมงจริงสำหรับรายการต่อวัน/ต่อชั่วโมง" },
          { name: "start_month", label: "เริ่มเดือน", type: "date", hint: "ระบบใช้วันที่ 1 ของเดือน · เว้นว่าง = เริ่มทันที" },
          { name: "end_month", label: "ถึงเดือน", type: "date", hint: "เว้นว่าง = ไม่มีกำหนดสิ้นสุด" },
          { name: "note", label: "หมายเหตุ (แสดงในสลิป)", type: "text", span: 2 },
        ],
        filters: [
          { name: "pay_item_id", label: "รายการ", refField: "pay_item_id" },
          { name: "employee_id", label: "พนักงาน", refField: "employee_id" },
        ],
        beforeSave: (v) => {
          const out = { ...v, start_month: firstOfMonth(v.start_month), end_month: firstOfMonth(v.end_month) };
          if (out.start_month && out.end_month && out.end_month < out.start_month) throw new Error("เดือนสิ้นสุดต้องไม่ก่อนเดือนเริ่ม");
          return out;
        },
      }}
    />
  );
}
