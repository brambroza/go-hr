import { redirect } from "next/navigation";
import { requireMe } from "@/lib/auth";
import { MPage } from "@/components/ess/shell";
import { TeamView } from "@/components/ess/team";

export const metadata = { title: "ทีมของฉัน" };

export default async function TeamPage() {
  const me = await requireMe();
  if (!me.isSupervisor) redirect("/m/more");
  return (
    <MPage title="ทีมของฉันวันนี้" back={{ href: "/m/more", label: "เมนู" }}>
      <TeamView />
    </MPage>
  );
}
