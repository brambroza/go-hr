import { Suspense } from "react";
import { PageHeader } from "@/components/ui";
import { Todos } from "@/components/tools/todos";

export const metadata = { title: "To-do Lists" };

export default function TodosPage() {
  return (
    <div>
      <PageHeader title="To-do Lists" description="งานของฉัน งานของทีม และงานที่มอบหมายให้ผู้อื่น ลากการ์ดเพื่อเปลี่ยนสถานะ" />
      <Suspense>
        <Todos variant="desktop" />
      </Suspense>
    </div>
  );
}
