import { redirect } from "next/navigation";
import { requireMe } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { MigrationChecklist } from "@/components/settings/migration";

export const metadata = { title: "ย้ายข้อมูลเข้าระบบ" };

export default async function MigrationPage() {
  const me = await requireMe();
  if (!can(me, "settings")) redirect("/dashboard");
  return <MigrationChecklist />;
}
