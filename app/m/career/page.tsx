import { MPage } from "@/components/ess/shell";
import { CareerView } from "@/components/ess/career";

export const metadata = { title: "เส้นทางการเติบโต" };

export default function CareerPage() {
  return (
    <MPage title="เส้นทางการเติบโต" back={{ href: "/m/more", label: "เมนู" }}>
      <CareerView />
    </MPage>
  );
}
