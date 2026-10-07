import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { requireMe } from "@/lib/auth";
import { can, type Action } from "@/lib/permissions";

/** Server guard for HR-only attendance / leave screens (RLS still enforces data access) */
export async function RequireAttendance({ action = "view", children }: { action?: Action; children: ReactNode }) {
  const me = await requireMe();
  if (!can(me, "attendance", action)) redirect(me.isSupervisor ? "/attendance" : "/dashboard");
  return <>{children}</>;
}
