"use client";

import type { Res } from "@/lib/employees/labels";
import { useEffect, useState } from "react";
import { CrudPage } from "@/components/crud/crud-page";
import { Badge } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import { money } from "@/lib/format";

export default function PositionsPage() {
  const [hc, setHc] = useState<Record<number, number>>({});
  useEffect(() => {
    supabaseBrowser()
      .rpc("position_headcounts")
      .then(({ data }: Res) => {
        const m: Record<number, number> = {};
        for (const r of (data as { position_id: number; headcount: number }[]) ?? []) m[r.position_id] = Number(r.headcount);
        setHc(m);
      });
  }, []);

  return (
    <CrudPage
      config={{
        table: "positions",
        title: "ตำแหน่งงาน",
        description: "กำหนดระดับงาน 1–20 กระบอกเงินเดือน อัตรากำลังตามแผน และคุณสมบัติของแต่ละตำแหน่ง",
        menu: "org",
        orderBy: { column: "code", ascending: true },
        searchColumns: ["code", "name", "name_en", "job_grade"],
        exportName: "positions",
        formSize: "lg",
        filters: [
          { name: "org_unit_id", label: "หน่วยงาน", refField: "org_unit_id" },
          { name: "job_level", label: "ระดับ", options: Array.from({ length: 20 }, (_, i) => ({ value: String(i + 1), label: `ระดับ ${i + 1}` })) },
        ],
        columns: [
          { key: "code", label: "รหัส", sortable: true },
          { key: "name", label: "ชื่อตำแหน่ง", sortable: true },
          { key: "org_unit_id", label: "หน่วยงาน", render: (r, { refLabel }) => refLabel("org_unit_id", r.org_unit_id).replace(/^(— )+/, "") },
          { key: "parent_position_id", label: "รายงานต่อ" },
          { key: "job_level", label: "ระดับ", sortable: true, className: "text-center" },
          { key: "job_grade", label: "เกรด" },
          {
            key: "min_salary",
            label: "กระบอกเงินเดือน",
            render: (r) =>
              r.min_salary == null && r.max_salary == null ? (
                <span className="text-ink-mute">-</span>
              ) : (
                <span className="num whitespace-nowrap">{r.min_salary != null ? money(r.min_salary as number, 0) : "?"} – {r.max_salary != null ? money(r.max_salary as number, 0) : "?"}</span>
              ),
            exportValue: (r) => `${r.min_salary ?? ""}-${r.max_salary ?? ""}`,
          },
          {
            key: "headcount_plan",
            label: "คนปัจจุบัน / แผน",
            className: "text-center",
            render: (r) => {
              const cur = hc[Number(r.id)] ?? 0;
              const plan = r.headcount_plan == null ? null : Number(r.headcount_plan);
              const color = plan == null ? "gray" : cur > plan ? "red" : cur < plan ? "amber" : "green";
              return (
                <Badge color={color}>
                  <span className="num">{cur}{plan != null ? ` / ${plan}` : ""}</span>
                </Badge>
              );
            },
            exportValue: (r) => `${hc[Number(r.id)] ?? 0}/${r.headcount_plan ?? ""}`,
          },
          { key: "is_active", label: "ใช้งาน" },
        ],
        fields: [
          { name: "code", label: "รหัสตำแหน่ง", type: "text", required: true, section: "ข้อมูลตำแหน่ง" },
          { name: "name", label: "ชื่อตำแหน่ง", type: "text", required: true, section: "ข้อมูลตำแหน่ง" },
          { name: "name_en", label: "ชื่อภาษาอังกฤษ", type: "text", section: "ข้อมูลตำแหน่ง" },
          { name: "org_unit_id", label: "หน่วยงาน", type: "ref", section: "ข้อมูลตำแหน่ง", ref: { table: "org_units", select: "id, code, name, level", order: "level", label: (r) => `${"— ".repeat(Number(r.level) - 1)}${r.name}` } },
          { name: "parent_position_id", label: "ตำแหน่งที่รายงานต่อ (สายบังคับบัญชา)", type: "ref", excludeSelf: true, section: "ข้อมูลตำแหน่ง", ref: { table: "positions", select: "id, code, name", order: "code", label: (r) => `${r.name} (${r.code})` } },
          { name: "job_level", label: "ระดับงาน (1–20)", type: "number", required: true, default: 1, min: 1, max: 20, section: "ระดับและค่าตอบแทน", validate: (v) => (Number(v) < 1 || Number(v) > 20 || !Number.isInteger(Number(v)) ? "ระบุเลขจำนวนเต็ม 1 ถึง 20" : null) },
          { name: "job_grade", label: "เกรด", type: "text", placeholder: "เช่น M1, S2", section: "ระดับและค่าตอบแทน" },
          { name: "min_salary", label: "เงินเดือนต่ำสุด", type: "money", min: 0, section: "ระดับและค่าตอบแทน" },
          {
            name: "max_salary",
            label: "เงินเดือนสูงสุด",
            type: "money",
            min: 0,
            section: "ระดับและค่าตอบแทน",
            validate: (v, all) => (v !== "" && v != null && all.min_salary !== "" && all.min_salary != null && Number(v) < Number(all.min_salary) ? "ต้องไม่น้อยกว่าเงินเดือนต่ำสุด" : null),
          },
          { name: "headcount_plan", label: "อัตรากำลังตามแผน (คน)", type: "number", min: 0, section: "ระดับและค่าตอบแทน" },
          { name: "is_active", label: "ใช้งาน", type: "boolean", default: true, section: "ระดับและค่าตอบแทน" },
          { name: "description", label: "หน้าที่และความรับผิดชอบ (Job description)", type: "textarea", section: "รายละเอียด" },
          { name: "qualifications", label: "คุณสมบัติ", type: "textarea", section: "รายละเอียด" },
        ],
      }}
    />
  );
}
