import { MPage } from "@/components/ess/shell";
import { MyRequests } from "@/components/ess/requests";

export const metadata = { title: "เอกสารของฉัน" };

export default function MyRequestsPage() {
  return (
    <MPage title="เอกสารของฉัน" description="ใบลา โอที และคำขออื่น ๆ ที่คุณยื่นไว้">
      <MyRequests />
    </MPage>
  );
}
