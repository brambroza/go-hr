import { redirect } from "next/navigation";
import { requireMe } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { AnnouncementsAdmin } from "@/components/tools/announcements";

export const metadata = { title: "ประกาศข่าวสาร" };

export default async function AnnouncementsPage() {
  const me = await requireMe();
  if (!can(me, "tools")) redirect("/feed");
  return <AnnouncementsAdmin />;
}
