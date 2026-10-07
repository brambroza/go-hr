import { redirect } from "next/navigation";
import { requireMe } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { RulesSettings } from "@/components/settings/rules";

export const metadata = { title: "ตั้งค่าเวลา / เงินเดือน / ภาษี" };

export default async function RulesPage() {
  const me = await requireMe();
  if (!can(me, "settings")) redirect("/dashboard");
  return <RulesSettings />;
}
