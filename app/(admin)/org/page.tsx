"use client";

import { useState } from "react";
import { CrudPage } from "@/components/crud/crud-page";
import { PageHeader, Tabs, Badge } from "@/components/ui";
import { OrgChart } from "@/components/org/org-chart";
import { UNIT_TYPES, listOptions } from "@/lib/employees/labels";

type Tab = "chart" | "list";

export default function OrgPage() {
  const [tab, setTab] = useState<Tab>("chart");
  const [version, setVersion] = useState(0);
  return (
    <div>
      <PageHeader title="โครงสร้างองค์กร" description="ผังองค์กรสูงสุด 10 ชั้น กดที่หน่วยงานเพื่อดูรายชื่อพนักงาน" />
      <Tabs<Tab>
        className="mb-4"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "chart", label: "ผังองค์กร" },
          { value: "list", label: "รายการหน่วยงาน" },
        ]}
      />
      {tab === "chart" ? (
        <OrgChart key={version} />
      ) : (
        <CrudPage
          config={{
            table: "org_units",
            title: "รายการหน่วยงาน",
            description: "ชั้นของหน่วยงานคำนวณอัตโนมัติจากหน่วยงานแม่",
            menu: "org",
            embedded: true,
            orderBy: { column: "level", ascending: true },
            searchColumns: ["code", "name", "name_en", "cost_center"],
            exportName: "org_units",
            formSize: "lg",
            afterSave: () => setVersion((v) => v + 1),
            filters: [
              { name: "parent_id", label: "หน่วยงานแม่", refField: "parent_id" },
              { name: "branch_id", label: "สาขา", refField: "branch_id" },
              { name: "is_active", label: "สถานะ", options: [{ value: "true", label: "ใช้งาน" }, { value: "false", label: "ปิดใช้งาน" }] },
            ],
            columns: [
              { key: "code", label: "รหัส", sortable: true },
              {
                key: "name",
                label: "ชื่อหน่วยงาน",
                sortable: true,
                render: (r) => (
                  <span style={{ paddingLeft: (Number(r.level) - 1) * 14 }} className="inline-block">
                    {Number(r.level) > 1 && <span className="mr-1 text-ink-mute">└</span>}
                    {String(r.name)}
                  </span>
                ),
              },
              { key: "unit_type", label: "ประเภท" },
              { key: "level", label: "ชั้น", sortable: true, render: (r) => <span className="num">{String(r.level)}</span> },
              { key: "parent_id", label: "หน่วยงานแม่", render: (r, { refLabel }) => refLabel("parent_id", r.parent_id).replace(/^(— )+/, "") },
              { key: "manager_employee_id", label: "หัวหน้าหน่วยงาน" },
              { key: "branch_id", label: "สาขา" },
              { key: "cost_center", label: "Cost center" },
              { key: "is_active", label: "สถานะ", render: (r) => (r.is_active ? <Badge color="green">ใช้งาน</Badge> : <Badge>ปิดใช้งาน</Badge>) },
            ],
            fields: [
              { name: "code", label: "รหัสหน่วยงาน", type: "text", required: true, placeholder: "เช่น HR, PRD-L1", validate: (v) => (v && !/^[A-Za-z0-9._-]+$/.test(String(v)) ? "ใช้ได้เฉพาะ A-Z 0-9 . _ -" : null) },
              { name: "name", label: "ชื่อหน่วยงาน", type: "text", required: true },
              { name: "name_en", label: "ชื่อภาษาอังกฤษ", type: "text" },
              { name: "unit_type", label: "ประเภทหน่วยงาน", type: "select", options: listOptions(UNIT_TYPES) },
              {
                name: "parent_id",
                label: "หน่วยงานแม่",
                type: "ref",
                excludeSelf: true,
                hint: "เว้นว่างถ้าเป็นหน่วยงานบนสุด (บริษัท)",
                ref: { table: "org_units", select: "id, code, name, level", order: "level", label: (r) => `${"— ".repeat(Number(r.level) - 1)}${r.name} (${r.code})` },
              },
              { name: "branch_id", label: "สาขา", type: "ref", ref: { table: "branches", select: "id, code, name", order: "code", label: "name" } },
              { name: "manager_employee_id", label: "หัวหน้าหน่วยงาน", type: "employee" },
              { name: "cost_center", label: "Cost center", type: "text", hint: "ใช้แยกต้นทุนค่าแรงในรายงานบัญชี" },
              { name: "sort_order", label: "ลำดับการแสดง", type: "number", default: 0, min: 0 },
              { name: "is_active", label: "ใช้งาน", type: "boolean", default: true },
            ],
          }}
        />
      )}
    </div>
  );
}
