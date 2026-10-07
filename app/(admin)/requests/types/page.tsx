import { RequireReqAdmin } from "@/components/requests/require-req-admin";
import { RequestTypesEditor } from "@/components/requests/request-types-editor";

export const metadata = { title: "ประเภทเอกสาร" };

export default function RequestTypesPage() {
  return (
    <RequireReqAdmin>
      <RequestTypesEditor />
    </RequireReqAdmin>
  );
}
