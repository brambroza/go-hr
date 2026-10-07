import { redirect } from "next/navigation";
import { requireMe } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { LicenseSettings } from "@/components/settings/license";
import pkg from "@/package.json";

export const metadata = { title: "License / ระบบ" };

export default async function LicensePage() {
  const me = await requireMe();
  if (!can(me, "settings")) redirect("/dashboard");
  return <LicenseSettings version={pkg.version} />;
}
