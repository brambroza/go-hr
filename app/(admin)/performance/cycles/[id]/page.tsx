import { notFound } from "next/navigation";
import { CycleDashboard } from "@/components/performance/cycle-dashboard";

export const metadata = { title: "รอบการประเมิน" };

export default async function CyclePage({ params }: PageProps<"/performance/cycles/[id]">) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  return <CycleDashboard id={Number(id)} />;
}
