"use client";

import { useMe } from "@/components/app/me-context";
import { FaceEnroll } from "@/components/employees/profile/tab-faces";

/** Self-enrollment card on /m/profile — rendered only when settings attendance.allow_self_face_enroll = true */
export function FaceSelfEnroll() {
  const me = useMe();
  if (!me.employeeId) return null;
  return (
    <div className="mt-4">
      <FaceEnroll
        employeeId={me.employeeId}
        canEdit
        canDelete={false}
        compact
        title="ลงทะเบียนใบหน้า"
        intro="ใช้สำหรับลงเวลาด้วยการสแกนใบหน้า ถ่าย 3 รูปขึ้นไป หน้าตรงในที่สว่าง — ต้องการลบหรือลงทะเบียนใหม่ ติดต่อฝ่ายบุคคล"
      />
    </div>
  );
}
