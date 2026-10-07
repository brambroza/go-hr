import { MPage } from "@/components/ess/shell";
import { NewRequest } from "./new-request";

export const metadata = { title: "ยื่นเอกสาร" };

export default async function NewRequestPage({ searchParams }: PageProps<"/m/requests/new">) {
  const sp = await searchParams;
  const type = typeof sp.type === "string" ? sp.type : undefined;
  return (
    <MPage title={type === "leave" ? "ส่งใบลา" : "ยื่นเอกสาร"} description={type ? undefined : "เลือกประเภทเอกสารที่ต้องการยื่น"} back={{ href: "/m/requests", label: "เอกสารของฉัน" }}>
      <NewRequest type={type} />
    </MPage>
  );
}
