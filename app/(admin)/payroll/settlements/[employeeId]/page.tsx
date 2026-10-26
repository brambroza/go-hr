import { SettlementView } from "@/components/payroll/settlement-view";

export const metadata = { title: "เคลียร์เงินพนักงานพ้นสภาพ" };

export default async function SettlementPage({ params }: { params: Promise<{ employeeId: string }> }) {
  const { employeeId } = await params;
  return <SettlementView employeeId={Number(employeeId)} />;
}
