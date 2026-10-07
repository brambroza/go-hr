import { notFound } from "next/navigation";
import { EmployeeProfile } from "@/components/employees/profile/profile";

export const metadata = { title: "ประวัติพนักงาน" };

export default async function EmployeePage({ params }: PageProps<"/employees/[id]">) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  return <EmployeeProfile id={Number(id)} />;
}
