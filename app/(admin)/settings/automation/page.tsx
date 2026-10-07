import { redirect } from "next/navigation";
import { requireMe } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { AutomationSettings } from "@/components/settings/automation";

export const metadata = { title: "Automation และแจ้งเตือน" };

export default async function AutomationPage() {
  const me = await requireMe();
  if (!can(me, "settings")) redirect("/dashboard");
  return <AutomationSettings />;
}
