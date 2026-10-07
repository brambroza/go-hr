import { Suspense } from "react";
import { MPage } from "@/components/ess/shell";
import { Todos } from "@/components/tools/todos";

export const metadata = { title: "งานของฉัน" };

export default function MobileTodosPage() {
  return (
    <MPage title="งานของฉัน" className="pb-28">
      <Suspense>
        <Todos variant="mobile" />
      </Suspense>
    </MPage>
  );
}
