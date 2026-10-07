import { Suspense } from "react";
import { ApprovalsInbox } from "@/components/requests/approvals-inbox";

export const metadata = { title: "รออนุมัติ" };

export default function ApprovalsPage() {
  return (
    <Suspense>
      <ApprovalsInbox />
    </Suspense>
  );
}
