"use client";

import { Printer } from "lucide-react";
import { CrudPage } from "@/components/crud/crud-page";
import { Badge } from "@/components/ui";
import { UploadUrlField } from "@/components/learning/upload-field";
import { WARNING_COLOR, WARNING_LEVEL, opts } from "@/components/performance/labels";
import { addDays, isoDate, thDate } from "@/lib/format";

export default function WarningsPage() {
  return (
    <CrudPage
      config={{
        table: "warning_letters",
        title: "จดหมายเตือน",
        description: "ออกหนังสือเตือนตามข้อบังคับการทำงาน เลขที่เอกสารรันอัตโนมัติ หนังสือเตือนมีผล 1 ปีตามมาตรา 119 (4) — พนักงานเห็นและกดรับทราบได้ในแอป",
        menu: "performance",
        select: "*, employees(code, first_name, last_name)",
        orderBy: { column: "issue_date", ascending: false },
        searchColumns: ["doc_no", "offense"],
        formSize: "lg",
        exportName: "warning-letters",
        defaults: { issue_date: isoDate(), level: "written_1" },
        filters: [{ name: "level", label: "ระดับ", options: opts(WARNING_LEVEL) }],
        columns: [
          { key: "doc_no", label: "เลขที่", sortable: true, render: (r) => <span className="num">{String(r.doc_no ?? "-")}</span> },
          { key: "issue_date", label: "วันที่ออก", sortable: true },
          {
            key: "employee_id",
            label: "พนักงาน",
            render: (r) => {
              const e = r.employees as { code: string; first_name: string; last_name: string } | null;
              return e ? <span><span className="font-medium">{e.first_name} {e.last_name}</span> <span className="num text-xs text-ink-mute">{e.code}</span></span> : "-";
            },
            exportValue: (r) => {
              const e = r.employees as { code: string; first_name: string; last_name: string } | null;
              return e ? `${e.code} ${e.first_name} ${e.last_name}` : "";
            },
          },
          { key: "level", label: "ระดับ", render: (r) => <Badge color={WARNING_COLOR[String(r.level)]}>{WARNING_LEVEL[String(r.level)]}</Badge>, exportValue: (r) => WARNING_LEVEL[String(r.level)] },
          { key: "offense", label: "ความผิด", render: (r) => <span className="line-clamp-2 max-w-72">{String(r.offense)}</span> },
          {
            key: "expire_date",
            label: "มีผลถึง",
            render: (r) => (r.expire_date ? <span className={String(r.expire_date) < isoDate() ? "num text-ink-mute line-through" : "num"}>{thDate(String(r.expire_date))}</span> : <span className="text-ink-mute">-</span>),
          },
          {
            key: "acknowledged_at",
            label: "พนักงานรับทราบ",
            render: (r) => (r.acknowledged_at ? <Badge color="green">{thDate(String(r.acknowledged_at))}</Badge> : <Badge color="amber">ยังไม่รับทราบ</Badge>),
            exportValue: (r) => (r.acknowledged_at ? String(r.acknowledged_at).slice(0, 10) : ""),
          },
        ],
        rowActions: (r) => (
          <a href={`/performance/warnings/${r.id}`} className="rounded p-1.5 text-ink-mute hover:bg-jade-50 hover:text-jade-700" title="พิมพ์หนังสือเตือน" aria-label="พิมพ์หนังสือเตือน" onClick={(e) => e.stopPropagation()}>
            <Printer className="size-4" />
          </a>
        ),
        fields: [
          { name: "employee_id", label: "พนักงาน", type: "employee", required: true, span: 2, readOnlyOnEdit: true },
          { name: "issue_date", label: "วันที่ออกหนังสือ", type: "date", required: true },
          { name: "level", label: "ระดับการลงโทษ", type: "select", required: true, options: opts(WARNING_LEVEL) },
          { name: "offense", label: "ความผิด / เรื่อง", type: "text", required: true, span: 2, placeholder: "เช่น มาทำงานสายเกิน 3 ครั้งในหนึ่งเดือน" },
          { name: "incident_date", label: "วันที่เกิดเหตุ", type: "date" },
          { name: "rule_reference", label: "ข้อบังคับที่ฝ่าฝืน", type: "text", placeholder: "เช่น หมวด 7 ข้อ 3.2" },
          { name: "detail", label: "รายละเอียดการกระทำผิด", type: "textarea", span: 2 },
          { name: "penalty", label: "บทลงโทษเพิ่มเติม", type: "text", span: 2, placeholder: "เช่น ตัดเบี้ยขยันเดือนนี้" },
          { name: "suspension_days", label: "จำนวนวันพักงาน", type: "number", min: 1, max: 7, hidden: (v) => v.level !== "suspension", hint: "ไม่เกิน 7 วัน ตาม พ.ร.บ.คุ้มครองแรงงาน", validate: (v, vals) => (vals.level === "suspension" && !v ? "กรุณาระบุจำนวนวัน" : null) },
          { name: "expire_date", label: "มีผลถึง", type: "date", hint: "เว้นว่าง = 1 ปีนับจากวันที่ออก", hidden: (v) => v.level === "termination" },
          { name: "witness", label: "พยาน", type: "text" },
          {
            name: "attachment_url",
            label: "เอกสารแนบ (หลักฐาน)",
            type: "custom",
            span: 2,
            render: ({ value, onChange }) => <UploadUrlField value={String(value ?? "")} onChange={onChange} bucket="documents" maxMb={10} placeholder="อัปโหลดรูปถ่าย / เอกสาร" />,
          },
        ],
        beforeSave: (v) => ({ ...v, expire_date: v.level === "termination" ? null : v.expire_date || addDays(String(v.issue_date), 365) }),
      }}
    />
  );
}
