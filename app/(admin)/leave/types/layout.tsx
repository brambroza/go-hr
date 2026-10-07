import { RequireAttendance } from "@/components/attendance/require-attendance";

export default function Layout({ children }: LayoutProps<"/leave/types">) {
  return <RequireAttendance>{children}</RequireAttendance>;
}
