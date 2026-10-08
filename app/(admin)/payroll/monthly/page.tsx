import { redirect } from "next/navigation";
import { requireMe } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { MonthlyFlow } from "@/components/payroll/monthly-flow";

export const metadata = { title: "งานเงินเดือนประจำเดือน" };

export default async function MonthlyPayrollPage() {
  const me = await requireMe();
  if (!can(me, "payroll")) redirect("/dashboard");
  return <MonthlyFlow />;
}
