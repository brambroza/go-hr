"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronsUpDown, X } from "lucide-react";
import { clsx } from "@/components/ui";

export interface EmpOption {
  value: string | number;
  label: string;
  raw?: Record<string, unknown>;
}

/** Searchable single-employee select (search by name, nickname or code) */
export function EmployeePicker({ value, onChange, options, disabled, placeholder = "ค้นหาพนักงาน" }: { value: number | string | null; onChange: (v: number | null) => void; options: EmpOption[]; disabled?: boolean; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => String(o.value) === String(value ?? ""));
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    const list = t ? options.filter((o) => o.label.toLowerCase().includes(t) || String(o.raw?.code ?? "").toLowerCase().includes(t)) : options;
    return list.slice(0, 50);
  }, [q, options]);
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={clsx(
          "flex h-10 w-full items-center justify-between gap-2 rounded-[var(--radius-ctl)] border border-line bg-white px-3 text-left text-[15px] focus:border-jade-500 focus:outline-none disabled:bg-paper",
          !selected && "text-ink-mute",
        )}
      >
        <span className="truncate">{selected ? `${selected.label}${selected.raw?.code ? ` · ${selected.raw.code}` : ""}` : placeholder}</span>
        <span className="flex items-center gap-1">
          {selected && !disabled && (
            <X
              className="size-4 text-ink-mute hover:text-rust"
              onClick={(e) => {
                e.stopPropagation();
                onChange(null);
              }}
            />
          )}
          <ChevronsUpDown className="size-4 text-ink-mute" />
        </span>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-[var(--radius-ctl)] border border-line bg-white shadow-lg">
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="พิมพ์ชื่อ ชื่อเล่น หรือรหัส" className="w-full border-b border-line-soft px-3 py-2 text-sm focus:outline-none" />
          <ul className="max-h-60 overflow-y-auto">
            {filtered.length === 0 && <li className="px-3 py-3 text-sm text-ink-mute">ไม่พบพนักงาน</li>}
            {filtered.map((o) => (
              <li key={o.value}>
                <button
                  type="button"
                  className={clsx("flex w-full justify-between px-3 py-2 text-left text-sm hover:bg-jade-50", String(o.value) === String(value) && "bg-jade-50 font-medium")}
                  onClick={() => {
                    onChange(Number(o.value));
                    setOpen(false);
                    setQ("");
                  }}
                >
                  <span>{o.label}</span>
                  <span className="text-xs text-ink-mute">{String(o.raw?.code ?? "")}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
