import { MPage } from "@/components/ess/shell";
import { ApprovalsInbox } from "@/components/ess/approvals";

export const metadata = { title: "อนุมัติเอกสาร" };

export default function ApprovalsPage() {
  return (
    <MPage title="รออนุมัติ" description="แตะเพื่อดูรายละเอียด หรือเลือกหลายรายการเพื่ออนุมัติพร้อมกัน" back={{ href: "/m/more", label: "เมนู" }}>
      <ApprovalsInbox />
    </MPage>
  );
}
