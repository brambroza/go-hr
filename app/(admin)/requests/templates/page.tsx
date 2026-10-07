import { RequireReqAdmin } from "@/components/requests/require-req-admin";
import { TemplatesEditor } from "@/components/requests/templates-editor";

export const metadata = { title: "แบบฟอร์มเอกสาร" };

export default function TemplatesPage() {
  return (
    <RequireReqAdmin>
      <TemplatesEditor />
    </RequireReqAdmin>
  );
}
