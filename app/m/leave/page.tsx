import { MPage } from "@/components/ess/shell";
import { LeaveView } from "@/components/ess/leave";

export const metadata = { title: "วันลา" };

export default function LeavePage() {
  return (
    <MPage title="วันลาของฉัน" back={{ href: "/m/more", label: "เมนู" }}>
      <LeaveView />
    </MPage>
  );
}
