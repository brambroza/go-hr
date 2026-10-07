"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft, Download, Printer } from "lucide-react";
import { Button, Select, clsx } from "@/components/ui";
import { TH_MONTHS } from "@/lib/format";

/** Common frame for printable A4 reports: filter bar (hidden in print) + paper area */
export function ReportShell({
  title, description, filters, onCsv, extraActions, children, landscape,
}: {
  title: ReactNode; description?: ReactNode; filters?: ReactNode; onCsv?: () => void; extraActions?: ReactNode; children: ReactNode; landscape?: boolean;
}) {
  return (
    <div>
      <style>{`@media print { @page { size: A4 ${landscape ? "landscape" : "portrait"}; margin: 10mm; } main { max-width: none !important; padding: 0 !important; } .report-paper { box-shadow: none !important; border: 0 !important; padding: 0 !important; } table { page-break-inside: auto; } tr { page-break-inside: avoid; } thead { display: table-header-group; } }`}</style>
      <div className="no-print mb-4">
        <Link href="/reports" className="mb-1 inline-flex items-center gap-1 text-sm text-ink-soft hover:text-jade-700">
          <ArrowLeft className="size-4" /> รายงานทั้งหมด
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            {description && <p className="mt-1 max-w-3xl text-[15px] text-ink-soft">{description}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            {extraActions}
            {onCsv && (
              <Button variant="secondary" icon={<Download className="size-4" />} onClick={onCsv}>
                ส่งออก CSV
              </Button>
            )}
            <Button icon={<Printer className="size-4" />} onClick={() => window.print()}>
              พิมพ์
            </Button>
          </div>
        </div>
        {filters && <div className="mt-3 flex flex-wrap items-end gap-3 rounded-[var(--radius-panel)] border border-line bg-white px-4 py-3">{filters}</div>}
      </div>
      <div className={clsx("report-paper mx-auto rounded-[var(--radius-panel)] border border-line bg-white p-6 text-[13px] text-black", landscape ? "max-w-[297mm]" : "max-w-[210mm]")}>{children}</div>
    </div>
  );
}

export function YearSelect({ value, onChange, className }: { value: number; onChange: (v: number) => void; className?: string }) {
  const y = new Date().getFullYear();
  return (
    <label className={clsx("flex flex-col gap-1 text-sm text-ink-soft", className)}>
      ปีภาษี (พ.ศ.)
      <Select className="h-9 w-32" value={value} onChange={(e) => onChange(Number(e.target.value))}>
        {[y + 1, y, y - 1, y - 2, y - 3].map((v) => (
          <option key={v} value={v}>
            {v + 543}
          </option>
        ))}
      </Select>
    </label>
  );
}

export function MonthSelect({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex flex-col gap-1 text-sm text-ink-soft">
      เดือน
      <Select className="h-9 w-36" value={value} onChange={(e) => onChange(Number(e.target.value))}>
        {TH_MONTHS.map((m, i) => (
          <option key={i} value={i + 1}>
            {m}
          </option>
        ))}
      </Select>
    </label>
  );
}

export function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm text-ink-soft">
      {label}
      {children}
    </label>
  );
}

/** report header block printed at the top of the paper */
export function ReportHead({ company, title, sub }: { company?: string; title: string; sub?: ReactNode }) {
  return (
    <div className="mb-4 text-center">
      {company && <div className="text-[15px] font-semibold">{company}</div>}
      <div className="text-[16px] font-semibold">{title}</div>
      {sub && <div className="text-[13px] text-neutral-700">{sub}</div>}
    </div>
  );
}

export const tbl = "w-full border-collapse text-[12px] [&_td]:border [&_td]:border-neutral-300 [&_td]:px-1.5 [&_td]:py-1 [&_th]:border [&_th]:border-neutral-400 [&_th]:bg-neutral-100 [&_th]:px-1.5 [&_th]:py-1 [&_th]:font-semibold";
