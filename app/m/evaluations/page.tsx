"use client";

import { MPage } from "@/components/ess/shell";
import { MyEvaluations } from "@/components/performance/my-evaluations";

export default function Page() {
  return (
    <MPage title="แบบประเมิน" description="แบบประเมินที่ต้องทำ ผลการประเมิน และหนังสือแจ้งเตือนของคุณ">
      <MyEvaluations variant="mobile" />
    </MPage>
  );
}
