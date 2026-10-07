import { MPage } from "@/components/ess/shell";
import { PoliciesView } from "@/components/ess/policies";

export const metadata = { title: "นโยบายบริษัท" };

export default function PoliciesPage() {
  return (
    <MPage title="นโยบายบริษัท" back={{ href: "/m/more", label: "เมนู" }}>
      <PoliciesView />
    </MPage>
  );
}
