"use client";
import { CrudPage } from "@/components/crud/crud-page";

export default function BranchesPage() {
  return (
    <CrudPage
      config={{
        table: "branches",
        title: "สาขา / สถานประกอบการ",
        description: "ใช้กับการแยกวันหยุด พื้นที่ลงเวลา และเลขที่สาขาในแบบ ภ.ง.ด. / สปส.",
        menu: "org",
        orderBy: { column: "code", ascending: true },
        searchColumns: ["code", "name"],
        columns: [
          { key: "code", label: "รหัส", sortable: true },
          { key: "name", label: "ชื่อสาขา", sortable: true },
          { key: "tax_branch_no", label: "สาขา (ภาษี)" },
          { key: "sso_account_no", label: "เลขบัญชีนายจ้าง สปส." },
          { key: "is_head_office", label: "สำนักงานใหญ่" },
          { key: "is_active", label: "ใช้งาน" },
        ],
        fields: [
          { name: "code", label: "รหัส", type: "text", required: true },
          { name: "name", label: "ชื่อสาขา", type: "text", required: true },
          { name: "name_en", label: "ชื่อภาษาอังกฤษ", type: "text" },
          { name: "phone", label: "โทรศัพท์", type: "tel" },
          { name: "address", label: "ที่อยู่", type: "textarea" },
          { name: "tax_branch_no", label: "เลขที่สาขา (ภาษี)", type: "text", default: "00000", hint: "สำนักงานใหญ่ = 00000" },
          { name: "sso_account_no", label: "เลขที่บัญชีนายจ้าง (สปส.)", type: "text" },
          { name: "sso_branch_no", label: "ลำดับที่สาขา (สปส.)", type: "text", default: "000000" },
          { name: "is_head_office", label: "สำนักงานใหญ่", type: "boolean" },
          { name: "is_active", label: "ใช้งาน", type: "boolean", default: true },
        ],
      }}
    />
  );
}
