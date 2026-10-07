"use client";
import { useState } from "react";
import { CrudPage } from "@/components/crud/crud-page";
import { Badge, Tabs } from "@/components/ui";
import { ITEM_CATEGORIES } from "@/lib/payroll/labels";

const CALC_TYPES = [
  { value: "fixed", label: "จำนวนเงินคงที่" },
  { value: "per_day", label: "ต่อวันทำงาน" },
  { value: "per_hour", label: "ต่อชั่วโมง" },
  { value: "percent_salary", label: "% ของเงินเดือน" },
  { value: "formula", label: "สูตร" },
];

export default function PayItemsPage() {
  const [tab, setTab] = useState<"items" | "groups">("items");
  return (
    <div>
      <Tabs className="mb-4" value={tab} onChange={setTab} tabs={[{ value: "items", label: "ประเภทรายรับรายจ่าย" }, { value: "groups", label: "กลุ่มรายการ" }]} />
      {tab === "items" ? (
        <CrudPage
          config={{
            table: "pay_items",
            title: "ประเภทรายรับรายจ่าย",
            description: "กำหนดว่ารายการใดเป็นเงินได้/เงินหัก คิดภาษี นับเป็นค่าจ้างประกันสังคม หรือเป็นฐานกองทุนสำรองเลี้ยงชีพ · รายการของระบบลบไม่ได้และแก้รหัสไม่ได้",
            menu: "payroll",
            orderBy: { column: "sort_order", ascending: true },
            searchColumns: ["code", "name"],
            pageSize: 50,
            formSize: "lg",
            columns: [
              { key: "code", label: "รหัส", sortable: true },
              { key: "name", label: "ชื่อรายการ", render: (r) => <span>{String(r.name)} {r.system_key ? <Badge color="blue">ระบบ</Badge> : null}</span> },
              { key: "category", label: "หมวด" },
              { key: "direction", label: "ประเภท", render: (r) => (r.direction === 1 ? <Badge color="green">เงินได้</Badge> : <Badge color="red">เงินหัก</Badge>) },
              { key: "group_id", label: "กลุ่ม" },
              { key: "is_taxable", label: "คิดภาษี" },
              { key: "is_sso", label: "ค่าจ้าง สปส." },
              { key: "is_pvd_base", label: "ฐาน PVD" },
              { key: "is_regular", label: "เงินได้ประจำ" },
              { key: "is_active", label: "ใช้งาน" },
            ],
            fields: [
              { name: "code", label: "รหัส", type: "text", required: true, readOnlyOnEdit: true, hint: "ใช้ในการนำเข้า CSV" },
              { name: "name", label: "ชื่อรายการ", type: "text", required: true },
              { name: "name_en", label: "ชื่อภาษาอังกฤษ", type: "text" },
              { name: "category", label: "หมวด", type: "select", required: true, options: ITEM_CATEGORIES, default: "income" },
              { name: "direction", label: "ประเภท", type: "select", required: true, options: [{ value: 1, label: "เงินได้ (+)" }, { value: -1, label: "เงินหัก (−)" }], default: 1 },
              { name: "group_id", label: "กลุ่มรายการ", type: "ref", ref: { table: "pay_item_groups", label: "name", order: "sort_order" } },
              { name: "calc_type", label: "วิธีคิด", type: "select", options: CALC_TYPES, default: "fixed" },
              { name: "rate", label: "อัตรา", type: "number", hint: "ใช้กับ % ของเงินเดือน (เช่น 5 = 5%)", hidden: (v) => v.calc_type !== "percent_salary" },
              { name: "income_type", label: "ประเภทเงินได้ (ภ.ง.ด.)", type: "select", options: [{ value: "40(1)", label: "40(1) เงินเดือน ค่าจ้าง" }, { value: "40(2)", label: "40(2) ค่าคอมมิชชั่น/รับทำงานให้" }], default: "40(1)" },
              { name: "sort_order", label: "ลำดับในสลิป", type: "number", default: 50 },
              { name: "system_key", label: "รหัสระบบ", type: "text", readOnlyOnEdit: true, hideInForm: true },
              { name: "is_taxable", label: "นำไปคำนวณภาษี", type: "boolean", default: true, section: "การคำนวณ" },
              { name: "is_sso", label: "นับเป็นค่าจ้างประกันสังคม", type: "boolean" },
              { name: "is_pvd_base", label: "ฐานคำนวณกองทุนสำรองเลี้ยงชีพ", type: "boolean" },
              { name: "is_regular", label: "เงินได้ประจำ (เฉลี่ยภาษีทั้งปี)", type: "boolean", default: true },
              { name: "show_on_payslip", label: "แสดงในสลิป", type: "boolean", default: true },
              { name: "is_active", label: "ใช้งาน", type: "boolean", default: true },
            ],
            filters: [
              { name: "category", label: "หมวด", options: ITEM_CATEGORIES },
              { name: "direction", label: "ประเภท", options: [{ value: "1", label: "เงินได้" }, { value: "-1", label: "เงินหัก" }] },
            ],
            beforeSave: (v, editing) => {
              const out: Record<string, unknown> = { ...v, direction: Number(v.direction) };
              delete out.system_key;
              if (editing?.system_key) {
                // system items: code/category/direction drive the calculation → keep as is
                delete out.code;
                out.category = editing.category;
                out.direction = editing.direction;
              }
              return out;
            },
          }}
        />
      ) : (
        <CrudPage
          config={{
            table: "pay_item_groups",
            title: "กลุ่มรายการ",
            description: "ใช้จัดกลุ่มรายการในรายงานทะเบียนเงินเดือน",
            menu: "payroll",
            orderBy: { column: "sort_order", ascending: true },
            columns: [
              { key: "name", label: "ชื่อกลุ่ม" },
              { key: "sort_order", label: "ลำดับ" },
            ],
            fields: [
              { name: "name", label: "ชื่อกลุ่ม", type: "text", required: true },
              { name: "sort_order", label: "ลำดับ", type: "number", default: 0 },
            ],
          }}
        />
      )}
    </div>
  );
}
