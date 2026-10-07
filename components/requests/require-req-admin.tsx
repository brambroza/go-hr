import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { requireMe } from "@/lib/auth";
import { can, type Action } from "@/lib/permissions";

/** Server guard for request_admin screens (RLS still enforces data access) */
export async function RequireReqAdmin({ action = "view", children }: { action?: Action; children: ReactNode }) {
  const me = await requireMe();
  if (!can(me, "request_admin", action)) redirect(me.isSupervisor ? "/approvals" : "/dashboard");
  return <>{children}</>;
}
