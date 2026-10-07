import { RequireReqAdmin } from "@/components/requests/require-req-admin";
import { FlowEditor } from "@/components/requests/flow-editor";

export const metadata = { title: "ลำดับขั้นการอนุมัติ" };

export default function FlowsPage() {
  return (
    <RequireReqAdmin>
      <FlowEditor />
    </RequireReqAdmin>
  );
}
