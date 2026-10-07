import { RequireAttendance } from "@/components/attendance/require-attendance";

export default function Layout({ children }: LayoutProps<"/attendance/logs">) {
  return <RequireAttendance action="view">{children}</RequireAttendance>;
}
