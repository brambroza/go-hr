import { redirect } from "next/navigation";
import { requireMe } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { FileFormatEditor } from "@/components/payroll/file-format-editor";

export const metadata = { title: "รูปแบบไฟล์ส่งธนาคาร / ประกันสังคม / สรรพากร" };

export default async function FileFormatsPage() {
  const me = await requireMe();
  if (!can(me, "payroll") && !can(me, "settings") && !can(me, "report")) redirect("/dashboard");
  return <FileFormatEditor />;
}
