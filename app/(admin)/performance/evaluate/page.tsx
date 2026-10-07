"use client";

import { PageHeader } from "@/components/ui";
import { MyEvaluations } from "@/components/performance/my-evaluations";

export default function EvaluatePage() {
  return (
    <div>
      <PageHeader title="แบบประเมินที่ต้องทำ" description="ประเมินตนเอง ประเมินลูกทีม ประเมินหัวหน้า และประเมินพนักงานทดลองงาน — บันทึกร่างไว้ก่อนแล้วส่งภายหลังได้" />
      <MyEvaluations variant="desktop" />
    </div>
  );
}
