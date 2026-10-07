import { redirect } from "next/navigation";
import { requireMe } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { JobsSettings } from "@/components/settings/jobs";

export const metadata = { title: "ตั้งค่าเวลารันคำสั่ง" };

export default async function JobsPage() {
  const me = await requireMe();
  if (!can(me, "settings")) redirect("/dashboard");
  return <JobsSettings />;
}
