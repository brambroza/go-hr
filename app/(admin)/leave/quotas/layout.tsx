import { RequireAttendance } from "@/components/attendance/require-attendance";

export default function Layout({ children }: LayoutProps<"/leave/quotas">) {
  return <RequireAttendance>{children}</RequireAttendance>;
}
