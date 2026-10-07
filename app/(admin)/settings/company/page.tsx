import { redirect } from "next/navigation";
import { requireMe } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { CompanyForm } from "@/components/settings/company-form";

export const metadata = { title: "ข้อมูลบริษัท" };

export default async function CompanySettingsPage() {
  const me = await requireMe();
  if (!can(me, "settings")) redirect("/dashboard");
  return <CompanyForm />;
}
