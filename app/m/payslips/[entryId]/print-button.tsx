"use client";

import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <button onClick={() => window.print()} className="inline-flex h-11 items-center gap-1.5 rounded-[var(--radius-ctl)] bg-jade-600 px-4 text-[15px] font-medium text-white active:bg-jade-800">
      <Printer className="size-5" /> พิมพ์ / บันทึก PDF
    </button>
  );
}
