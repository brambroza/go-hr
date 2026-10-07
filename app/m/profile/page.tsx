import { MPage } from "@/components/ess/shell";
import { ProfileView } from "@/components/ess/profile";
import { FaceSelfEnroll } from "@/components/ess/face-self-enroll";
import { LineLinkCard } from "@/components/notify/line-link-card";
import { getSetting } from "@/lib/settings";

export const metadata = { title: "ข้อมูลของฉัน" };

export default async function ProfilePage() {
  const att = await getSetting<{ allow_self_face_enroll?: boolean }>("attendance", {});
  return (
    <MPage back={{ href: "/m/more", label: "เมนู" }}>
      <ProfileView LineCard={LineLinkCard} />
      {att.allow_self_face_enroll ? <FaceSelfEnroll /> : null}
    </MPage>
  );
}
