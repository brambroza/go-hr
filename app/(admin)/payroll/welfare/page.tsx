"use client";
import { CrudPage } from "@/components/crud/crud-page";

export default function WelfareTypesPage() {
  return (
    <CrudPage
      config={{
        table: "welfare_types",
        title: "สวัสดิการ",
        description: "ประเภทสวัสดิการและวงเงิน ใช้กับใบขอสวัสดิการของพนักงาน — ถ้าจ่ายผ่านเงินเดือน ระบบจะบันทึกเป็นรายรับในงวดตามรายการที่เลือก",
        menu: "payroll",
        orderBy: { column: "name", ascending: true },
        searchColumns: ["name"],
        columns: [
          { key: "name", label: "สวัสดิการ", sortable: true },
          { key: "annual_limit", label: "วงเงินต่อปี", className: "text-right" },
          { key: "per_claim_limit", label: "วงเงินต่อครั้ง", className: "text-right" },
          { key: "min_service_months", label: "อายุงานขั้นต่ำ (เดือน)", className: "text-right" },
          { key: "pay_item_id", label: "รายการเงินเดือน" },
          { key: "pay_via_payroll", label: "จ่ายผ่านเงินเดือน" },
          { key: "is_active", label: "ใช้งาน" },
        ],
        fields: [
          { name: "name", label: "ชื่อสวัสดิการ", type: "text", required: true, span: 2 },
          { name: "annual_limit", label: "วงเงินต่อปี (บาท)", type: "money", hint: "เว้นว่าง = ไม่จำกัด" },
          { name: "per_claim_limit", label: "วงเงินต่อครั้ง (บาท)", type: "money", hint: "เว้นว่าง = ไม่จำกัด" },
          { name: "min_service_months", label: "อายุงานขั้นต่ำ (เดือน)", type: "number", default: 0 },
          { name: "pay_item_id", label: "รายการเงินเดือนที่ใช้จ่าย", type: "ref", ref: { table: "pay_items", label: "name", filter: (q) => q.eq("direction", 1).in("category", ["welfare", "income"]), order: "sort_order" } },
          { name: "pay_via_payroll", label: "จ่ายผ่านเงินเดือน", type: "boolean", default: true },
          { name: "is_active", label: "ใช้งาน", type: "boolean", default: true },
        ],
      }}
    />
  );
}
