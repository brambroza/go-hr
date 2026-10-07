"use client";

import { useRouter } from "next/navigation";
import { LayoutDashboard } from "lucide-react";
import { CrudPage } from "@/components/crud/crud-page";
import { Badge, Checkbox } from "@/components/ui";
import { useLookups } from "@/components/employees/use-lookups";
import { CYCLE_STATUS, CYCLE_STATUS_COLOR } from "@/components/performance/labels";
import { thDate } from "@/lib/format";

const DEFAULT_GRADES = [{ grade: "A", min: 90 }, { grade: "B", min: 80 }, { grade: "C", min: 70 }, { grade: "D", min: 60 }, { grade: "E", min: 0 }];

export default function CyclesPage() {
  const router = useRouter();
  const y = new Date().getFullYear();
  return (
    <CrudPage
      config={{
        table: "eval_cycles",
        title: "รอบการประเมิน",
        description: "สร้างรอบประเมินผลงาน (ประจำปี / ครึ่งปี) กำหนดแบบฟอร์ม ผู้ประเมิน และเกณฑ์เกรด — คลิกที่รอบเพื่อเปิดแดชบอร์ด สร้างรายการประเมิน ติดตามความคืบหน้า และสรุปผล",
        menu: "performance",
        orderBy: { column: "id", ascending: false },
        searchColumns: ["name"],
        formSize: "lg",
        onRowClick: (r) => router.push(`/performance/cycles/${r.id}`),
        defaults: { eval_year: y, start_date: `${y}-11-01`, end_date: `${y}-11-30`, period_from: `${y}-01-01`, period_to: `${y}-12-31`, self_eval: true, supervisor_eval: true, supervisor_weight: 70, upward_eval: false, grade_scale: DEFAULT_GRADES, filter: {}, status: "draft" },
        columns: [
          { key: "name", label: "รอบการประเมิน", sortable: true, render: (r) => <span className="font-medium">{String(r.name)}</span> },
          { key: "eval_year", label: "ปี", render: (r) => <span className="num">{Number(r.eval_year) + 543}</span> },
          { key: "form_id", label: "แบบประเมิน" },
          { key: "start_date", label: "ช่วงเวลาประเมิน", render: (r) => <span className="num whitespace-nowrap">{thDate(String(r.start_date))} – {thDate(String(r.end_date))}</span> },
          { key: "status", label: "สถานะ", render: (r) => <Badge color={CYCLE_STATUS_COLOR[String(r.status)]}>{CYCLE_STATUS[String(r.status)]}</Badge>, exportValue: (r) => CYCLE_STATUS[String(r.status)] },
        ],
        rowActions: (r) => (
          <button className="rounded p-1.5 text-ink-mute hover:bg-jade-50 hover:text-jade-700" title="แดชบอร์ดรอบประเมิน" aria-label="แดชบอร์ด" onClick={() => router.push(`/performance/cycles/${r.id}`)}>
            <LayoutDashboard className="size-4" />
          </button>
        ),
        fields: [
          { name: "name", label: "ชื่อรอบ", type: "text", required: true, span: 2, placeholder: "เช่น ประเมินผลงานประจำปี 2569" },
          { name: "eval_year", label: "ปีที่ประเมิน (ค.ศ.)", type: "number", required: true, hint: "เช่น 2026 = พ.ศ. 2569" },
          { name: "status", label: "สถานะ", type: "select", required: true, options: Object.entries(CYCLE_STATUS).map(([value, label]) => ({ value, label })) },
          { name: "form_id", label: "แบบประเมิน (ตนเอง / หัวหน้า)", type: "ref", required: true, ref: { table: "eval_forms", label: "name", filter: (q) => q.eq("is_active", true).neq("form_type", "probation"), order: "id" } },
          { name: "upward_form_id", label: "แบบประเมินหัวหน้า (Upward)", type: "ref", ref: { table: "eval_forms", label: "name", filter: (q) => q.eq("is_active", true), order: "id" }, hidden: (v) => !v.upward_eval },
          { name: "start_date", label: "เปิดให้ประเมิน", type: "date", required: true, section: "ช่วงเวลา" },
          { name: "end_date", label: "ปิดการประเมิน", type: "date", required: true, validate: (v, vals) => (v && vals.start_date && String(v) < String(vals.start_date) ? "ต้องไม่ก่อนวันเปิด" : null) },
          { name: "period_from", label: "ผลงานตั้งแต่", type: "date", hint: "ใช้คำนวณ KPI จากเวลาทำงาน" },
          { name: "period_to", label: "ผลงานถึง", type: "date" },
          { name: "self_eval", label: "พนักงานประเมินตนเอง", type: "boolean", section: "ผู้ประเมิน" },
          { name: "supervisor_eval", label: "หัวหน้าประเมิน", type: "boolean" },
          { name: "supervisor_weight", label: "น้ำหนักคะแนนหัวหน้า (%)", type: "number", min: 0, max: 100, hint: "ส่วนที่เหลือเป็นคะแนนประเมินตนเอง (ใช้เมื่อมีทั้งสองแบบ)" },
          { name: "upward_eval", label: "ลูกน้องประเมินหัวหน้า (Upward)", type: "boolean" },
          {
            name: "filter",
            label: "หน่วยงานที่ประเมิน",
            type: "custom",
            span: 2,
            section: "ขอบเขต",
            hint: "ไม่เลือก = ทุกหน่วยงาน",
            render: ({ value, onChange }) => <OrgPicker value={(value as { org_unit_ids?: number[] }) ?? {}} onChange={onChange} />,
          },
          { name: "grade_scale", label: "เกณฑ์เกรด (JSON)", type: "json", span: 2, hint: 'เช่น [{"grade":"A","min":90},{"grade":"B","min":80}] — คะแนนตั้งแต่ min ขึ้นไปได้เกรดนั้น' },
        ],
      }}
    />
  );
}


function OrgPicker({ value, onChange }: { value: { org_unit_ids?: number[] }; onChange: (v: unknown) => void }) {
  const lk = useLookups();
  const ids = value.org_unit_ids ?? [];
  return (
    <div className="thin-scroll grid max-h-40 gap-1 overflow-y-auto rounded-[var(--radius-ctl)] border border-line p-2 sm:grid-cols-2">
      {lk.orgs.map((o) => (
        <Checkbox key={o.id} label={o.name} checked={ids.includes(o.id)} onChange={(c) => onChange({ ...value, org_unit_ids: c ? [...ids, o.id] : ids.filter((x) => x !== o.id) })} />
      ))}
    </div>
  );
}
