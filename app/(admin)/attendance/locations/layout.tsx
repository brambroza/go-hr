import { RequireAttendance } from "@/components/attendance/require-attendance";

export default function Layout({ children }: LayoutProps<"/attendance/locations">) {
  return <RequireAttendance action="view">{children}</RequireAttendance>;
}
