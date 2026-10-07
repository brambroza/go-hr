import { MPage } from "@/components/ess/shell";
import { ProfileView } from "@/components/ess/profile";
import { LineLinkCard } from "@/components/notify/line-link-card";

export const metadata = { title: "ข้อมูลของฉัน" };

export default function ProfilePage() {
  return (
    <MPage back={{ href: "/m/more", label: "เมนู" }}>
      <ProfileView LineCard={LineLinkCard} />
    </MPage>
  );
}
