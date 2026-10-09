"use client";

import { useState } from "react";
import { CrudPage } from "@/components/crud/crud-page";
import { PageHeader, Tabs, Badge } from "@/components/ui";
import { OrgChart } from "@/components/org/org-chart";
import { UNIT_TYPES, listOptions } from "@/lib/employees/labels";
import { ORG_CHECKIN_MODE, validateOrgPolicy, type OrgCheckinMode } from "@/lib/attendance/checkin-policy";

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
            beforeSave: (v) => ({
              ...v,
              // only "locations" mode keeps a list; an empty list is stored as null
              work_location_ids: v.checkin_mode === "locations" && Array.isArray(v.work_location_ids) && v.work_location_ids.length ? v.work_location_ids : null,
            }),
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
              {
                key: "checkin_mode",
                label: "พื้นที่ลงเวลา",
                render: (r, { refLabel }) => {
                  const mode = String(r.checkin_mode ?? "inherit") as OrgCheckinMode;
                  if (mode === "anywhere") return <Badge color="blue">ไม่จำกัดพื้นที่</Badge>;
                  if (mode === "locations") return <span className="text-sm">{refLabel("work_location_ids", r.work_location_ids) || "—"}</span>;
                  return <span className="text-sm text-ink-mute">ตามหน่วยงานแม่</span>;
                },
              },
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
              {
                name: "checkin_mode",
                label: "พื้นที่ลงเวลาของหน่วยงาน",
                type: "select",
                default: "inherit",
                section: "การลงเวลา",
                options: (Object.keys(ORG_CHECKIN_MODE) as OrgCheckinMode[]).map((value) => ({ value, label: ORG_CHECKIN_MODE[value] })),
                hint: "ใช้กับพนักงานทุกคนในหน่วยงานนี้และหน่วยงานลูกที่ตั้งเป็น “ตามหน่วยงานแม่” · ถ้าพนักงานกำหนดพื้นที่รายคนไว้ จะใช้ของพนักงานก่อน · “ไม่จำกัดพื้นที่” เหมาะกับฝ่ายขาย/งานนอกสถานที่ (บันทึกพิกัด GPS แต่ไม่ตรวจรัศมี)",
                validate: (v, values) => validateOrgPolicy(v, values.work_location_ids),
              },
              {
                name: "work_location_ids",
                label: "จุดลงเวลาที่อนุญาต",
                type: "refs",
                span: 3,
                section: "การลงเวลา",
                hidden: (values) => values.checkin_mode !== "locations",
                ref: { table: "work_locations", select: "id, name", order: "name", label: "name", filter: (q) => q.eq("is_active", true) },
                validate: (v, values) => validateOrgPolicy(values.checkin_mode, v),
              },
            ],
          }}
        />
      )}
    </div>
  );
}
