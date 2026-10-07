import { redirect } from "next/navigation";
import { requireMe } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getCompany } from "@/lib/settings";
import { todayBkk } from "@/lib/attendance/server";
import { isIsoDate, eachDate } from "@/lib/attendance/schedule";
import { DailyView } from "@/components/attendance/daily-view";
import { Timesheet } from "@/components/attendance/timesheet";

export const metadata = { title: "สรุปเวลารายวัน" };

export default async function AttendancePage({ searchParams }: PageProps<"/attendance">) {
  const me = await requireMe();
  if (!can(me, "attendance") && !me.isSupervisor) redirect("/dashboard");
  const sp = await searchParams;
  const today = todayBkk();
  const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

  const employee = Number(str(sp.employee));
  if (employee > 0) {
    const month = /^\d{4}-\d{2}$/.test(str(sp.month) ?? "") ? str(sp.month)! : today.slice(0, 7);
    const company = await getCompany();
    return <Timesheet employeeId={employee} month={month} companyName={company.name} />;
  }

  let from = isIsoDate(str(sp.from)) ? str(sp.from)! : isIsoDate(str(sp.date)) ? str(sp.date)! : today;
  let to = isIsoDate(str(sp.to)) ? str(sp.to)! : from;
  if (to < from) [from, to] = [to, from];
  if (eachDate(from, to).length > 62) to = eachDate(from, to)[61];
  return <DailyView from={from} to={to} today={today} />;
}
