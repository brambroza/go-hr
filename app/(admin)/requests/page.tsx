import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireMe } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { RequestsList } from "@/components/requests/requests-list";

export const metadata = { title: "เอกสารทั้งหมด" };

export default async function RequestsPage() {
  const me = await requireMe();
  if (!can(me, "request_admin", "view") && !me.isSupervisor) redirect("/approvals");
  return (
    <Suspense>
      <RequestsList />
    </Suspense>
  );
}
