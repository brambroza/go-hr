"use client";

import { ExternalLink } from "lucide-react";
import { CrudPage } from "@/components/crud/crud-page";
import { Badge } from "@/components/ui";
import { UploadUrlField } from "@/components/learning/upload-field";
import { ITEM_TYPE } from "@/components/learning/labels";

const CATEGORIES = ["ความปลอดภัย", "คุณภาพ / ISO", "ทักษะงานผลิต", "ระเบียบบริษัท", "ภาวะผู้นำ", "คอมพิวเตอร์", "ทั่วไป"];

export default function LibraryPage() {
  return (
    <CrudPage
      config={{
        table: "library_items",
        title: "คลังความรู้ (E-Library)",
        description: "เก็บวิดีโอ เอกสาร และบทความไว้ที่เดียว ใช้เป็นบทเรียนในหลักสูตร E-Learning ได้",
        menu: "learning",
        orderBy: { column: "id", ascending: false },
        searchColumns: ["title", "category"],
        formSize: "lg",
        defaults: { item_type: "youtube", is_active: true },
        filters: [
          { name: "item_type", label: "ประเภท", options: Object.entries(ITEM_TYPE).map(([value, label]) => ({ value, label })) },
          { name: "category", label: "หมวดหมู่", options: CATEGORIES.map((c) => ({ value: c, label: c })) },
        ],
        columns: [
          { key: "title", label: "ชื่อ", sortable: true, render: (r) => <span className="font-medium">{String(r.title)}</span> },
          { key: "item_type", label: "ประเภท", render: (r) => <Badge color="blue">{ITEM_TYPE[String(r.item_type)]}</Badge>, exportValue: (r) => ITEM_TYPE[String(r.item_type)] },
          { key: "category", label: "หมวดหมู่", sortable: true },
          { key: "duration_min", label: "ความยาว (นาที)", className: "text-right" },
          { key: "is_active", label: "ใช้งาน" },
          {
            key: "url",
            label: "เปิด",
            render: (r) =>
              r.url ? (
                <a href={String(r.url)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 text-jade-700 hover:underline">
                  เปิด <ExternalLink className="size-3.5" />
                </a>
              ) : (
                <span className="text-ink-mute">-</span>
              ),
          },
        ],
        fields: [
          { name: "title", label: "ชื่อ", type: "text", required: true, span: 2 },
          { name: "item_type", label: "ประเภท", type: "select", required: true, options: Object.entries(ITEM_TYPE).map(([value, label]) => ({ value, label })) },
          { name: "category", label: "หมวดหมู่", type: "select", options: CATEGORIES.map((c) => ({ value: c, label: c })) },
          {
            name: "url",
            label: "ลิงก์ / ไฟล์",
            type: "custom",
            span: 2,
            hidden: (v) => v.item_type === "article",
            hint: "YouTube: วางลิงก์วิดีโอ · PDF / สไลด์ / วิดีโอ: อัปโหลดไฟล์หรือวางลิงก์",
            render: ({ value, onChange, values }) => (
              <UploadUrlField
                value={String(value ?? "")}
                onChange={onChange}
                accept={values.item_type === "pdf" ? "application/pdf" : values.item_type === "video" ? "video/*" : values.item_type === "slide" ? ".pdf,.ppt,.pptx" : undefined}
                placeholder={values.item_type === "youtube" ? "https://www.youtube.com/watch?v=..." : "https://"}
              />
            ),
            validate: (v, vals) => (vals.item_type !== "article" && !v ? "กรุณาใส่ลิงก์หรืออัปโหลดไฟล์" : null),
          },
          { name: "content", label: "เนื้อหาบทความ / คำอธิบาย", type: "textarea", span: 2, validate: (v, vals) => (vals.item_type === "article" && !v ? "กรุณาใส่เนื้อหาบทความ" : null) },
          { name: "duration_min", label: "ความยาว (นาที)", type: "number", min: 0 },
          { name: "is_active", label: "ใช้งาน", type: "boolean" },
        ],
      }}
    />
  );
}
