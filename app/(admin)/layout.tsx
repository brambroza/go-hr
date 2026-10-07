import { redirect } from "next/navigation";
import { requireMe } from "@/lib/auth";
import { isBackOffice } from "@/lib/permissions";
import { getCompany } from "@/lib/settings";
import { AppShell } from "@/components/app/app-shell";

export default async function AdminLayout({ children }: LayoutProps<"/">) {
  const me = await requireMe();
  if (me.mustChangePassword) redirect("/account/password?first=1");
  if (!isBackOffice(me) && !me.isSupervisor) redirect("/m");
  const company = await getCompany();
  return (
    <AppShell me={me} company={{ name: company.name, logo_url: company.logo_url }}>
      {children}
    </AppShell>
  );
}
