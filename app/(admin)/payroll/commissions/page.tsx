"use client";
import { CrudPage } from "@/components/crud/crud-page";
import { TierEditor } from "@/components/payroll/tier-editor";
import { Badge } from "@/components/ui";
import type { CommissionTier } from "@/lib/payroll/commission";
import { money } from "@/lib/format";

const BASIS = [
  { value: "sales", label: "ยอดขาย" },
  { value: "profit", label: "กำไร" },
  { value: "units", label: "จำนวนชิ้น" },
];

function tierText(tiers: CommissionTier[]) {
  return (tiers ?? []).map((t) => `${money(t.from, 0)}${t.to ? `–${money(t.to, 0)}` : "+"}: ${t.rate}%`).join(" · ");
}

export default function CommissionPlansPage() {
  return (
    <CrudPage
      config={{
        table: "commission_plans",
        title: "ค่าคอมมิชชั่น",
        description: "แผนค่าคอมมิชชั่นแบบขั้นบันได (คิดแต่ละช่วงตามอัตราของช่วง) หรืออัตราเดียว (ยอดรวมตกขั้นไหนใช้อัตรานั้นทั้งก้อน) · บันทึกยอดขายของพนักงานในแท็บ “ค่าคอมมิชชั่น” ของงวดเงินเดือน",
        menu: "payroll",
        orderBy: { column: "name", ascending: true },
        formSize: "lg",
        columns: [
          { key: "name", label: "ชื่อแผน" },
          { key: "basis", label: "ฐาน" },
          { key: "tier_mode", label: "วิธีคิด", render: (r) => (r.tier_mode === "step" ? <Badge color="blue">ขั้นบันได</Badge> : <Badge color="violet">อัตราเดียว</Badge>) },
          { key: "tiers", label: "อัตรา", render: (r) => <span className="num text-sm text-ink-soft">{tierText(r.tiers as CommissionTier[])}</span>, exportValue: (r) => tierText(r.tiers as CommissionTier[]) },
          { key: "pay_item_id", label: "รายการเงินเดือน" },
          { key: "is_active", label: "ใช้งาน" },
        ],
        fields: [
          { name: "name", label: "ชื่อแผน", type: "text", required: true },
          { name: "basis", label: "ฐานคำนวณ", type: "select", options: BASIS, default: "sales", required: true },
          { name: "tier_mode", label: "วิธีคิด", type: "select", required: true, default: "step", options: [{ value: "step", label: "ขั้นบันได" }, { value: "flat", label: "อัตราเดียวตามยอดรวม" }] },
          { name: "pay_item_id", label: "จ่ายเป็นรายการ", type: "ref", ref: { table: "pay_items", label: "name", filter: (q) => q.eq("direction", 1).in("category", ["income", "auto"]), order: "sort_order" }, hint: "เว้นว่าง = ค่าคอมมิชชั่น" },
          {
            name: "tiers", label: "ขั้นอัตรา", type: "custom", span: 2, default: [{ from: 0, to: null, rate: 0 }],
            render: ({ value, onChange, values }) => <TierEditor value={(value as CommissionTier[]) ?? []} onChange={onChange} mode={values.tier_mode === "flat" ? "flat" : "step"} />,
            validate: (v) => (!Array.isArray(v) || !v.length ? "กรุณากำหนดอย่างน้อย 1 ขั้น" : null),
          },
          { name: "is_active", label: "ใช้งาน", type: "boolean", default: true },
        ],
      }}
    />
  );
}
