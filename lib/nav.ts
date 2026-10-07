import type { Action, MenuKey } from "./permissions";

export interface NavItem {
  href: string;
  label: string;
  perm?: [MenuKey, Action?];
  /** shown to supervisors even without the permission */
  supervisor?: boolean;
  /** shown to everyone signed in */
  everyone?: boolean;
}

export interface NavGroup {
  key: string;
  label: string;
  icon: string; // lucide icon name (resolved in AppShell)
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    key: "overview",
    label: "ภาพรวม",
    icon: "LayoutDashboard",
    items: [
      { href: "/dashboard", label: "แดชบอร์ด", everyone: true },
      { href: "/insight", label: "Insight วิเคราะห์ข้อมูล", perm: ["insight"] },
    ],
  },
  {
    key: "org",
    label: "องค์กร",
    icon: "Network",
    items: [
      { href: "/org", label: "โครงสร้างองค์กร", perm: ["org"] },
      { href: "/org/positions", label: "ตำแหน่งงาน", perm: ["org"] },
      { href: "/org/career-paths", label: "เส้นทางการเติบโต", perm: ["org"] },
      { href: "/org/branches", label: "สาขา / สถานประกอบการ", perm: ["org"] },
      { href: "/org/teams", label: "ทีมงาน", perm: ["org"] },
      { href: "/org/policies", label: "นโยบายบริษัท", perm: ["org"] },
      { href: "/org/movements", label: "โอนย้าย / แต่งตั้ง / ปรับโครงสร้าง", perm: ["employee", "edit"] },
      { href: "/directory", label: "ผู้ติดต่อภายใน", everyone: true },
    ],
  },
  {
    key: "employee",
    label: "พนักงาน",
    icon: "Users",
    items: [
      { href: "/employees", label: "ข้อมูลพนักงาน", perm: ["employee"], supervisor: true },
      { href: "/employees/import", label: "นำเข้าพนักงาน (Excel)", perm: ["employee", "create"] },
    ],
  },
  {
    key: "attendance",
    label: "เวลาทำงาน",
    icon: "Clock",
    items: [
      { href: "/attendance", label: "สรุปเวลารายวัน", perm: ["attendance"], supervisor: true },
      { href: "/attendance/logs", label: "บันทึกเวลา (Raw)", perm: ["attendance"] },
      { href: "/attendance/roster", label: "ตารางกะ / วันหยุด", perm: ["attendance"], supervisor: true },
      { href: "/attendance/manpower", label: "ผังกำลังพล", perm: ["attendance"] },
      { href: "/attendance/shifts", label: "กะการทำงาน", perm: ["attendance"] },
      { href: "/attendance/holidays", label: "วันหยุด / วันทำงานพิเศษ", perm: ["attendance"] },
      { href: "/attendance/locations", label: "พื้นที่ลงเวลา (GPS / Wi-Fi / QR)", perm: ["attendance"] },
      { href: "/attendance/devices", label: "อุปกรณ์ลงเวลา", perm: ["attendance"] },
      { href: "/attendance/import", label: "นำเข้าเวลา", perm: ["attendance", "create"] },
    ],
  },
  {
    key: "requests",
    label: "เอกสารและอนุมัติ",
    icon: "FileCheck2",
    items: [
      { href: "/approvals", label: "รออนุมัติ", everyone: true },
      { href: "/requests", label: "เอกสารทั้งหมด", perm: ["request_admin"], supervisor: true },
      { href: "/calendar", label: "ปฏิทินการทำงาน", everyone: true },
      { href: "/leave/quotas", label: "โควต้าการลา", perm: ["attendance"] },
      { href: "/leave/types", label: "ประเภทการลา", perm: ["attendance"] },
      { href: "/requests/flows", label: "ลำดับขั้นการอนุมัติ", perm: ["request_admin", "edit"] },
      { href: "/requests/types", label: "ประเภทเอกสาร", perm: ["request_admin", "edit"] },
    ],
  },
  {
    key: "payroll",
    label: "เงินเดือน",
    icon: "Wallet",
    items: [
      { href: "/payroll", label: "งวดเงินเดือน", perm: ["payroll"] },
      { href: "/payroll/recurring", label: "รายรับรายจ่ายประจำ", perm: ["payroll"] },
      { href: "/payroll/salary", label: "ปรับเงินเดือน", perm: ["employee_private", "edit"] },
      { href: "/payroll/loans", label: "ภาระหนี้สินพนักงาน", perm: ["payroll"] },
      { href: "/payroll/advances", label: "เบิกล่วงหน้า", perm: ["payroll"] },
      { href: "/payroll/commissions", label: "ค่าคอมมิชชั่น", perm: ["payroll"] },
      { href: "/payroll/items", label: "ประเภทรายรับรายจ่าย", perm: ["payroll"] },
      { href: "/payroll/welfare", label: "สวัสดิการ", perm: ["payroll"] },
    ],
  },
  {
    key: "reports",
    label: "รายงาน",
    icon: "FileBarChart",
    items: [
      { href: "/reports", label: "รายงานทั้งหมด", perm: ["report"] },
      { href: "/reports/pnd1", label: "ภ.ง.ด.1 / ภ.ง.ด.1ก", perm: ["report"] },
      { href: "/reports/sso", label: "สปส.1-10", perm: ["report"] },
      { href: "/reports/tawi50", label: "หนังสือรับรอง 50 ทวิ", perm: ["report"] },
    ],
  },
  {
    key: "recruit",
    label: "สรรหาและทดลองงาน",
    icon: "UserPlus",
    items: [
      { href: "/recruit/jobs", label: "ประกาศรับสมัครงาน", perm: ["recruit"] },
      { href: "/recruit/applicants", label: "ผู้สมัคร", perm: ["recruit"] },
      { href: "/recruit/probation", label: "ประเมินทดลองงาน", perm: ["recruit"], supervisor: true },
    ],
  },
  {
    key: "learning",
    label: "เรียนรู้และฝึกอบรม",
    icon: "GraduationCap",
    items: [
      { href: "/learning/courses", label: "หลักสูตร E-Learning", perm: ["learning"] },
      { href: "/learning/library", label: "คลังความรู้ (E-Library)", perm: ["learning"] },
      { href: "/learning/training", label: "ฝึกอบรม (Classroom)", perm: ["learning"] },
    ],
  },
  {
    key: "performance",
    label: "ประเมินผล",
    icon: "Target",
    items: [
      { href: "/performance/cycles", label: "รอบการประเมิน", perm: ["performance"] },
      { href: "/performance/forms", label: "แบบประเมิน", perm: ["performance"] },
      { href: "/performance/kpi", label: "KPI Profile", perm: ["performance"] },
      { href: "/performance/warnings", label: "จดหมายเตือน", perm: ["performance"], supervisor: true },
      { href: "/performance/evaluate", label: "แบบประเมินที่ต้องทำ", everyone: true },
    ],
  },
  {
    key: "tools",
    label: "สื่อสารและงาน",
    icon: "Megaphone",
    items: [
      { href: "/tools/announcements", label: "ประกาศข่าวสาร", perm: ["tools"] },
      { href: "/feed", label: "News Feed", everyone: true },
      { href: "/todos", label: "To-do Lists", everyone: true },
    ],
  },
  {
    key: "settings",
    label: "ตั้งค่า",
    icon: "Settings",
    items: [
      { href: "/settings/company", label: "ข้อมูลบริษัท", perm: ["settings"] },
      { href: "/settings/users", label: "ผู้ใช้งาน", perm: ["security"] },
      { href: "/settings/roles", label: "กลุ่มผู้ใช้และสิทธิ์", perm: ["security"] },
      { href: "/settings/rules", label: "ตั้งค่าเวลา / เงินเดือน / ภาษี", perm: ["settings"] },
      { href: "/settings/automation", label: "Automation และแจ้งเตือน", perm: ["settings"] },
      { href: "/settings/jobs", label: "ตั้งค่าเวลารันคำสั่ง", perm: ["settings"] },
      { href: "/settings/audit", label: "Back Log", perm: ["audit"] },
      { href: "/settings/license", label: "License / ระบบ", perm: ["settings"] },
    ],
  },
];
