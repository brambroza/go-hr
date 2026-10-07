"use client";

import { refColumn, refField } from "@/components/attendance/ref-field";
import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarPlus, ChevronLeft, ChevronRight } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useCan } from "@/components/app/me-context";
import { CrudPage, humanError, type QueryLike, type Row } from "@/components/crud/crud-page";
import { Badge, Button, PageHeader, Tabs, toast, useConfirm } from "@/components/ui";
import { TH_DAYS } from "@/lib/format";
import { weekday } from "@/lib/attendance/schedule";
import { invalidateAttLookups } from "@/components/attendance/lookups";

const HOLIDAY_TYPES = [
  { value: "public", label: "วันหยุดตามประเพณี" },
  { value: "company", label: "วันหยุดบริษัท" },
  { value: "special", label: "วันหยุดพิเศษเฉพาะบุคคล" },
];
const TYPE_COLOR: Record<string, string> = { public: "violet", company: "blue", special: "amber" };

const dayCell = (r: Row, key: string) => {
  const d = String(r[key] ?? "");
  if (!d) return "-";
  const [y, m, dd] = d.split("-").map(Number);
  const months = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  return (
    <span className="num inline-flex items-center gap-2 whitespace-nowrap">
      <span className="inline-flex w-14 flex-col items-center rounded-md border border-line bg-paper py-0.5 leading-tight">
        <span className="text-[11px] text-ink-soft">{months[m - 1]}</span>
        <span className="text-lg font-semibold">{dd}</span>
      </span>
      <span className="text-sm text-ink-soft">{TH_DAYS[weekday(d)]} {y + 543}</span>
    </span>
  );
};

export default function HolidaysPage() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const can = useCan();
  const now = new Date().getFullYear();
  const year = Number(sp.get("year")) || now;
  const tab = (sp.get("tab") as "holidays" | "special") || "holidays";
  const [copying, setCopying] = useState(false);
  const { confirm, dialog } = useConfirm();
  const nav = (y: number, t = tab) => router.push(`${pathname}?year=${y}&tab=${t}`);

  async function copyToNext() {
    if (!(await confirm(<>คัดลอกวันหยุดปี {year + 543} ทั้งหมดไปปี {year + 544}? วันที่จะเลื่อนเป็นวันเดียวกันของปีถัดไป — วันหยุดทางจันทรคติ (เช่น มาฆบูชา วิสาขบูชา) ต้องแก้วันที่เองภายหลัง วันที่มีวันหยุดชื่อเดียวกันอยู่แล้วจะข้าม</>, { confirmText: "คัดลอก" }))) return;
    setCopying(true);
    const sb = supabaseBrowser();
    const [{ data: src, error }, { data: dst }] = await Promise.all([
      sb.from("holidays").select("holiday_date, name, branch_id, org_unit_id, employee_ids, holiday_type, is_paid").gte("holiday_date", `${year}-01-01`).lte("holiday_date", `${year}-12-31`),
      sb.from("holidays").select("holiday_date, name").gte("holiday_date", `${year + 1}-01-01`).lte("holiday_date", `${year + 1}-12-31`),
    ]);
    if (error) {
      setCopying(false);
      return toast.error(error.message);
    }
    const exists = new Set((dst ?? []).map((h: { holiday_date: string; name: string }) => `${h.holiday_date}|${h.name}`));
    const rows = ((src ?? []) as Row[])
      .map((h) => {
        const [, m, d] = String(h.holiday_date).split("-");
        const date = m === "02" && d === "29" ? `${year + 1}-02-28` : `${year + 1}-${m}-${d}`;
        return { ...h, holiday_date: date } as Row;
      })
      .filter((h) => !exists.has(`${h.holiday_date}|${h.name}`));
    if (!rows.length) {
      setCopying(false);
      return toast.info("ปีถัดไปมีวันหยุดเหล่านี้ครบแล้ว");
    }
    const { error: e2 } = await sb.from("holidays").insert(rows, { defaultToNull: false });
    setCopying(false);
    if (e2) return toast.error(humanError(e2));
    toast.ok(`คัดลอก ${rows.length} วันไปปี ${year + 544} แล้ว`);
    invalidateAttLookups();
    nav(year + 1);
  }

  const yearFilter = (col: string) => (q: QueryLike) => q.gte(col, `${year}-01-01`).lte(col, `${year}-12-31`);

  return (
    <div>
      <PageHeader
        title="วันหยุด / วันทำงานพิเศษ"
        description="วันหยุดนักขัตฤกษ์ วันหยุดบริษัท วันหยุดเฉพาะสาขา/หน่วยงาน/บุคคล และวันที่ต้องมาทำงานชดเชย"
        actions={
          <div className="flex items-center gap-1">
            <Button variant="secondary" size="sm" onClick={() => nav(year - 1)} aria-label="ปีก่อนหน้า"><ChevronLeft className="size-4" /></Button>
            <span className="num min-w-24 text-center text-lg font-semibold">ปี {year + 543}</span>
            <Button variant="secondary" size="sm" onClick={() => nav(year + 1)} aria-label="ปีถัดไป"><ChevronRight className="size-4" /></Button>
          </div>
        }
      />
      <Tabs
        className="mb-4"
        value={tab}
        onChange={(t) => nav(year, t)}
        tabs={[
          { value: "holidays", label: "วันหยุดประจำปี" },
          { value: "special", label: "วันทำงานพิเศษ" },
        ]}
      />
      {tab === "holidays" ? (
        <CrudPage
          key={`h${year}`}
          config={{
            embedded: true,
            table: "holidays",
            title: `วันหยุดประจำปี ${year + 543}`,
            description: "ไม่ระบุสาขา/หน่วยงาน/พนักงาน = หยุดทุกคน",
            menu: "attendance",
            pageSize: 100,
            orderBy: { column: "holiday_date", ascending: true },
            baseFilter: yearFilter("holiday_date"),
            searchColumns: ["name"],
            exportName: `holidays_${year}`,
            defaults: { holiday_type: "public", is_paid: true, holiday_date: `${year}-01-01` },
            afterSave: () => invalidateAttLookups(),
            headerActions: () =>
              can("attendance", "create") ? (
                <Button variant="secondary" icon={<CalendarPlus className="size-4" />} loading={copying} onClick={copyToNext}>
                  คัดลอกไปปี {year + 544}
                </Button>
              ) : null,
            filters: [{ name: "holiday_type", label: "ประเภท", options: HOLIDAY_TYPES.map((t) => ({ value: t.value, label: t.label })) }],
            columns: [
              { key: "holiday_date", label: "วันที่", sortable: true, render: (r) => dayCell(r, "holiday_date"), exportValue: (r) => r.holiday_date },
              { key: "name", label: "ชื่อวันหยุด", sortable: true },
              { key: "holiday_type", label: "ประเภท", render: (r) => <Badge color={TYPE_COLOR[String(r.holiday_type)]}>{HOLIDAY_TYPES.find((t) => t.value === r.holiday_type)?.label}</Badge> },
              {
                key: "scope",
                label: "ใช้กับ",
                render: (r, { refLabel }) => {
                  const parts = [r.branch_id && `สาขา ${refLabel("branch_id", r.branch_id)}`, r.org_unit_id && refLabel("org_unit_id", r.org_unit_id), Array.isArray(r.employee_ids) && r.employee_ids.length && `${r.employee_ids.length} คน: ${refLabel("employee_ids", r.employee_ids)}`].filter(Boolean);
                  return parts.length ? <span className="text-sm">{parts.join(" · ")}</span> : <span className="text-ink-mute">ทุกคน</span>;
                },
              },
              { key: "is_paid", label: "ได้รับค่าจ้าง" },
            ],
            fields: [
              { name: "holiday_date", label: "วันที่", type: "date", required: true },
              { name: "name", label: "ชื่อวันหยุด", type: "text", required: true },
              { name: "holiday_type", label: "ประเภท", type: "select", required: true, options: HOLIDAY_TYPES },
              { name: "is_paid", label: "ได้รับค่าจ้าง", type: "boolean" },
              refField("branch_id", "เฉพาะสาขา", { table: "branches", label: "name", order: "code" }),
              refField("org_unit_id", "เฉพาะหน่วยงาน", { table: "org_units", label: "name", order: "name" }),
              { name: "employee_ids", label: "เฉพาะพนักงาน (วันหยุดพิเศษเฉพาะบุคคล)", type: "employees", span: 2, hint: "ไม่เลือก = ทุกคนในสาขา/หน่วยงานที่ระบุ" },
            ],
          }}
        />
      ) : (
        <CrudPage
          key={`s${year}`}
          config={{
            embedded: true,
            table: "special_workdays",
            title: `วันทำงานพิเศษ ${year + 543}`,
            description: "วันหยุดประจำสัปดาห์ที่ต้องมาทำงาน เช่น ทำงานชดเชย — นับเป็นวันทำงานปกติ (มีสาย/ขาดงาน)",
            menu: "attendance",
            pageSize: 100,
            orderBy: { column: "work_date", ascending: true },
            baseFilter: yearFilter("work_date"),
            searchColumns: ["name"],
            exportName: `special_workdays_${year}`,
            defaults: { work_date: `${year}-01-01` },
            columns: [
              { key: "work_date", label: "วันที่", sortable: true, render: (r) => dayCell(r, "work_date"), exportValue: (r) => r.work_date },
              { key: "name", label: "ชื่อ / เหตุผล", sortable: true },
              refColumn("shift_id", "กะ", "shifts", "กะประจำ"),
              refColumn("branch_id", "สาขา", "branches", "ทุกสาขา"),
              refColumn("org_unit_id", "หน่วยงาน", "org_units", "ทุกหน่วยงาน"),
            ],
            fields: [
              { name: "work_date", label: "วันที่", type: "date", required: true },
              { name: "name", label: "ชื่อ / เหตุผล", type: "text", required: true, placeholder: "เช่น ทำงานชดเชยวันหยุดสงกรานต์" },
              refField("shift_id", "กะ", { table: "shifts", label: (r) => `${r.code} · ${r.name}`, order: "code" }, { hint: "ไม่ระบุ = กะประจำของพนักงาน" }),
              refField("branch_id", "เฉพาะสาขา", { table: "branches", label: "name", order: "code" }),
              refField("org_unit_id", "เฉพาะหน่วยงาน", { table: "org_units", label: "name", order: "name" }),
            ],
          }}
        />
      )}
      {dialog}
    </div>
  );
}
