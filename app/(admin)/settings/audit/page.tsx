import { redirect } from "next/navigation";
import { requireMe } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { AuditLog } from "@/components/settings/audit";

export const metadata = { title: "Back Log" };

export default async function AuditPage() {
  const me = await requireMe();
  if (!can(me, "audit")) redirect("/dashboard");
  return <AuditLog />;
}
