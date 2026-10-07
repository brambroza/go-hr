import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { requireMe } from "@/lib/auth";
import { can, type Action, type MenuKey } from "@/lib/permissions";

/** Server guard for talent screens (RLS still enforces data access) */
export async function RequirePerm({ menu, action = "view", supervisor, children }: { menu: MenuKey; action?: Action; supervisor?: boolean; children: ReactNode }) {
  const me = await requireMe();
  if (!can(me, menu, action) && !(supervisor && me.isSupervisor)) redirect("/dashboard");
  return <>{children}</>;
}
