import { redirect } from "next/navigation";
import { requireMe } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { InsightView } from "@/components/insight/insight";

export const metadata = { title: "Insight วิเคราะห์ข้อมูล" };

export default async function InsightPage() {
  const me = await requireMe();
  if (!can(me, "insight")) redirect("/dashboard");
  return <InsightView />;
}
