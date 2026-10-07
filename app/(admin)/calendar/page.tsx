import { Suspense } from "react";
import { WorkCalendar } from "@/components/requests/work-calendar";

export const metadata = { title: "ปฏิทินการทำงาน" };

export default function CalendarPage() {
  return (
    <Suspense>
      <WorkCalendar />
    </Suspense>
  );
}
