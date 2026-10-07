"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronsUpDown } from "lucide-react";
import { clsx } from "@/components/ui";

/** Searchable select for string ids (EmployeePicker coerces ids to numbers, so it can't hold uuids) */
export function UserPicker({ value, onChange, options, placeholder = "เลือกผู้ใช้" }: { value: string | null | undefined; onChange: (v: string | null) => void; options: { id: string; label: string }[]; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.id === value);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (t ? options.filter((o) => o.label.toLowerCase().includes(t)) : options).slice(0, 50);
  }, [q, options]);
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={clsx("flex h-10 w-full items-center justify-between gap-2 rounded-[var(--radius-ctl)] border border-line bg-white px-3 text-left text-[15px]", !selected && "text-ink-mute")}
      >
        <span className="truncate">{selected?.label ?? placeholder}</span>
        <ChevronsUpDown className="size-4 shrink-0 text-ink-mute" />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-[var(--radius-ctl)] border border-line bg-white shadow-lg">
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="พิมพ์ชื่อหรือรหัส" className="w-full border-b border-line-soft px-3 py-2 text-sm focus:outline-none" />
          <ul className="max-h-60 overflow-y-auto">
            {list.length === 0 && <li className="px-3 py-3 text-sm text-ink-mute">ไม่พบผู้ใช้</li>}
            {list.map((o) => (
              <li key={o.id}>
                <button
                  type="button"
                  className={clsx("w-full px-3 py-2 text-left text-sm hover:bg-jade-50", o.id === value && "bg-jade-50 font-medium")}
                  onClick={() => {
                    onChange(o.id);
                    setOpen(false);
                    setQ("");
                  }}
                >
                  {o.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
