import { MPage } from "@/components/ess/shell";
import { RequestDetailView } from "@/components/ess/requests";

export const metadata = { title: "รายละเอียดเอกสาร" };

export default async function RequestDetailPage({ params }: PageProps<"/m/requests/[id]">) {
  const { id } = await params;
  return (
    <MPage back={{ href: "/m/requests", label: "เอกสารของฉัน" }}>
      <RequestDetailView id={Number(id)} />
    </MPage>
  );
}
