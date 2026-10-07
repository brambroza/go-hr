import { MPage } from "@/components/ess/shell";
import { MoreMenu } from "@/components/ess/more";

export const metadata = { title: "เมนู" };

export default function MorePage() {
  return (
    <MPage title="เมนู">
      <MoreMenu />
    </MPage>
  );
}
