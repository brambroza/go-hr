"use client";

import { Printer } from "lucide-react";
import type { ReactNode } from "react";

/** sticky toolbar for print pages (hidden when printing) */
export function PrintBar({ title, children, back }: { title: ReactNode; children?: ReactNode; back?: ReactNode }) {
  return (
    <div className="no-print sticky top-0 z-10 mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-line bg-white/95 px-4 py-2.5 backdrop-blur">
      <div className="flex items-center gap-3">
        {back}
        <h1 className="text-lg font-semibold">{title}</h1>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {children}
        <button onClick={() => window.print()} className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-ctl)] bg-jade-600 px-3 text-sm font-medium text-white hover:bg-jade-700">
          <Printer className="size-4" /> พิมพ์ / บันทึก PDF
        </button>
      </div>
    </div>
  );
}
