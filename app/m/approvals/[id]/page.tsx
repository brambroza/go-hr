import { MPage } from "@/components/ess/shell";
import { RequestDetailView } from "@/components/ess/requests";

export const metadata = { title: "พิจารณาเอกสาร" };

export default async function ApprovalDetailPage({ params }: PageProps<"/m/approvals/[id]">) {
  const { id } = await params;
  return (
    <MPage back={{ href: "/m/approvals", label: "รออนุมัติ" }}>
      <RequestDetailView id={Number(id)} mode="approve" />
    </MPage>
  );
}
