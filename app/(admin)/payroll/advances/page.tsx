"use client";
import { useState } from "react";
import Link from "next/link";
import { CrudPage } from "@/components/crud/crud-page";
import { Badge, Tabs } from "@/components/ui";
import { money, thDate } from "@/lib/format";

const STATUS = [
  { value: "approved", label: "รอหักในงวด" },
  { value: "paid", label: "จ่ายเงินแล้ว รอหัก" },
  { value: "deducted", label: "หักแล้ว" },
  { value: "cancelled", label: "ยกเลิก" },
];
const COLOR: Record<string, string> = { approved: "amber", paid: "blue", deducted: "green", cancelled: "gray" };
const REQ_STATUS: Record<string, [string, string]> = { pending: ["รออนุมัติ", "amber"], approved: ["อนุมัติ", "green"], rejected: ["ไม่อนุมัติ", "red"], cancelled: ["ยกเลิก", "gray"], draft: ["ร่าง", "gray"] };
const MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const name = (r: Record<string, unknown>) => {
  const e = r.employees as { code: string; first_name: string; last_name: string } | null;
  return e ? `${e.code} ${e.first_name} ${e.last_name}` : "-";
};

export default function AdvancesPage() {
  const [tab, setTab] = useState<"advances" | "requests">("advances");
  const now = new Date();
  return (
    <div>
      <Tabs className="mb-4" value={tab} onChange={setTab} tabs={[{ value: "advances", label: "รายการเบิกล่วงหน้า" }, { value: "requests", label: "ใบขอเบิกล่วงหน้า" }]} />
      {tab === "advances" ? (
        <CrudPage
          config={{
            table: "salary_advances",
            title: "เบิกล่วงหน้า",
            description: "เงินเบิกล่วงหน้าจะถูกหักอัตโนมัติในงวดเงินเดือนของเดือน/ปีที่กำหนด และเปลี่ยนเป็น “หักแล้ว” เมื่อบันทึกว่าจ่ายงวดนั้น",
            menu: "payroll",
            select: "*, employees!inner(code, first_name, last_name)",
            orderBy: { column: "advance_date", ascending: false },
            exportName: "salary-advances",
            columns: [
              { key: "employee_id", label: "พนักงาน", render: (r) => name(r), exportValue: name },
              { key: "advance_date", label: "วันที่เบิก", sortable: true },
              { key: "amount", label: "จำนวนเงิน", className: "text-right" },
              { key: "deduct_month", label: "หักในงวด", render: (r) => (r.deduct_month ? `${MONTHS[Number(r.deduct_month) - 1]} ${Number(r.deduct_year) + 543}` : "-"), exportValue: (r) => `${r.deduct_year}-${r.deduct_month}` },
              { key: "status", label: "สถานะ", render: (r) => <Badge color={COLOR[String(r.status)]}>{STATUS.find((s) => s.value === r.status)?.label}</Badge> },
              { key: "note", label: "หมายเหตุ" },
            ],
            fields: [
              { name: "employee_id", label: "พนักงาน", type: "employee", required: true, span: 2 },
              { name: "advance_date", label: "วันที่เบิก", type: "date", required: true, default: () => new Date().toISOString().slice(0, 10) },
              { name: "amount", label: "จำนวนเงิน (บาท)", type: "money", required: true, min: 0 },
              { name: "deduct_month", label: "หักในเดือน", type: "select", required: true, options: MONTHS.map((m, i) => ({ value: i + 1, label: m })), default: now.getMonth() + 1 },
              { name: "deduct_year", label: "หักในปี (ค.ศ.)", type: "select", required: true, options: [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => ({ value: y, label: String(y + 543) })), default: now.getFullYear() },
              { name: "status", label: "สถานะ", type: "select", required: true, options: STATUS, default: "approved" },
              { name: "note", label: "หมายเหตุ", type: "text" },
            ],
            filters: [
              { name: "status", label: "สถานะ", options: STATUS },
              { name: "employee_id", label: "พนักงาน", refField: "employee_id" },
            ],
            beforeSave: (v) => ({ ...v, deduct_month: Number(v.deduct_month), deduct_year: Number(v.deduct_year) }),
          }}
        />
      ) : (
        <CrudPage
          config={{
            table: "v_requests",
            title: "ใบขอเบิกล่วงหน้า",
            description: (
              <>
                ใบขอเบิกที่พนักงานยื่นผ่านแอป เมื่ออนุมัติครบทุกขั้น ระบบจะสร้างรายการเบิกล่วงหน้าให้อัตโนมัติ · อนุมัติได้ที่หน้า <Link className="text-jade-700 underline" href="/approvals">รออนุมัติ</Link>
              </>
            ),
            menu: "payroll",
            readOnly: true,
            baseFilter: (q) => q.eq("request_type", "advance"),
            orderBy: { column: "created_at", ascending: false },
            searchColumns: ["doc_no", "emp_code", "first_name", "last_name"],
            columns: [
              { key: "doc_no", label: "เลขที่" },
              { key: "emp_code", label: "พนักงาน", render: (r) => `${r.emp_code} ${r.first_name} ${r.last_name}` },
              { key: "created_at", label: "วันที่ยื่น", render: (r) => thDate(String(r.created_at)) },
              { key: "amount", label: "จำนวนเงิน", className: "text-right", render: (r) => <span className="num">{money(Number(r.amount))}</span> },
              { key: "reason", label: "เหตุผล" },
              { key: "status", label: "สถานะ", render: (r) => <Badge color={REQ_STATUS[String(r.status)]?.[1]}>{REQ_STATUS[String(r.status)]?.[0] ?? String(r.status)}</Badge> },
            ],
            fields: [],
            filters: [{ name: "status", label: "สถานะ", options: Object.entries(REQ_STATUS).map(([value, [label]]) => ({ value, label })) }],
          }}
        />
      )}
    </div>
  );
}
