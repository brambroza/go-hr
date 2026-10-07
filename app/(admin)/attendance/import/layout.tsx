import { RequireAttendance } from "@/components/attendance/require-attendance";

export default function Layout({ children }: LayoutProps<"/attendance/import">) {
  return <RequireAttendance action="create">{children}</RequireAttendance>;
}
