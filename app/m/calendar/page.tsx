import { MPage } from "@/components/ess/shell";
import { MyCalendar } from "@/components/ess/calendar";

export const metadata = { title: "ปฏิทินของฉัน" };

export default function CalendarPage() {
  return (
    <MPage title="ปฏิทินของฉัน" description="กะทำงาน วันหยุด วันลา และเวลาที่ลงไว้ แตะวันเพื่อดูรายละเอียด" back={{ href: "/m/more", label: "เมนู" }}>
      <MyCalendar />
    </MPage>
  );
}
