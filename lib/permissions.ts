// Permission model shared by UI and server.
// Mirrors app.has_perm(menu, action) in the database (RLS is the real gate; UI just hides what you can't use).

export const ACTIONS = ["view", "create", "edit", "delete", "export", "approve"] as const;
export type Action = (typeof ACTIONS)[number];

export const ACTION_LABELS: Record<Action, string> = {
  view: "ดู",
  create: "เพิ่ม",
  edit: "แก้ไข",
  delete: "ลบ",
  export: "ดาวน์โหลด",
  approve: "อนุมัติ",
};

export const MENUS = [
  { key: "org", label: "โครงสร้างองค์กร / ตำแหน่ง / นโยบาย", actions: ["view", "create", "edit", "delete", "export"] },
  { key: "employee", label: "ข้อมูลพนักงาน", actions: ["view", "create", "edit", "delete", "export"] },
  { key: "employee_private", label: "ข้อมูลอ่อนไหว (เงินเดือน บัญชี เลขบัตร) — PDPA", actions: ["view", "edit", "export"] },
  { key: "attendance", label: "เวลาทำงาน / กะ / วันหยุด / วันลา", actions: ["view", "create", "edit", "delete", "export"] },
  { key: "request_admin", label: "จัดการเอกสารและการอนุมัติ", actions: ["view", "create", "edit", "approve", "export"] },
  { key: "payroll", label: "เงินเดือน", actions: ["view", "create", "edit", "delete", "approve", "export"] },
  { key: "report", label: "รายงานและแบบฟอร์มภาครัฐ", actions: ["view", "export"] },
  { key: "recruit", label: "สรรหา / ทดลองงาน", actions: ["view", "create", "edit", "delete", "export"] },
  { key: "learning", label: "การเรียนรู้และฝึกอบรม", actions: ["view", "create", "edit", "delete", "export"] },
  { key: "performance", label: "ประเมินผล / KPI / จดหมายเตือน", actions: ["view", "create", "edit", "delete", "export"] },
  { key: "tools", label: "ประกาศ / News Feed / To-do", actions: ["view", "create", "edit", "delete"] },
  { key: "insight", label: "Dashboard / Insight", actions: ["view"] },
  { key: "settings", label: "ตั้งค่าระบบ / Automation", actions: ["view", "edit"] },
  { key: "security", label: "ผู้ใช้และกลุ่มสิทธิ์", actions: ["view", "create", "edit", "delete"] },
  { key: "audit", label: "Back Log (ประวัติการใช้งาน)", actions: ["view", "export"] },
] as const satisfies ReadonlyArray<{ key: string; label: string; actions: readonly Action[] }>;

export type MenuKey = (typeof MENUS)[number]["key"];
export type Permissions = Partial<Record<MenuKey, Action[]>>;

export interface Me {
  userId: string;
  email: string | null;
  displayName: string;
  isAdmin: boolean;
  roleCode: string | null;
  roleName: string | null;
  dataScope: string;
  permissions: Permissions;
  employeeId: number | null;
  employee: {
    id: number;
    code: string;
    first_name: string;
    last_name: string;
    nickname: string | null;
    photo_url: string | null;
    position_name: string | null;
    org_unit_name: string | null;
  } | null;
  isSupervisor: boolean;
  mustChangePassword: boolean;
}

export function can(me: Pick<Me, "isAdmin" | "permissions"> | null | undefined, menu: MenuKey, action: Action = "view"): boolean {
  if (!me) return false;
  if (me.isAdmin) return true;
  return me.permissions?.[menu]?.includes(action) ?? false;
}

/** true when the user has any back-office permission (shows the admin console) */
export function isBackOffice(me: Me | null | undefined): boolean {
  if (!me) return false;
  if (me.isAdmin) return true;
  return Object.values(me.permissions ?? {}).some((a) => (a?.length ?? 0) > 0);
}
