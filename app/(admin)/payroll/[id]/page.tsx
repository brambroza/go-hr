import { PeriodWorkspace } from "@/components/payroll/period-workspace";

export const metadata = { title: "งวดเงินเดือน" };

export default async function PayrollPeriodPage({ params }: PageProps<"/payroll/[id]">) {
  const { id } = await params;
  return <PeriodWorkspace id={Number(id)} />;
}
