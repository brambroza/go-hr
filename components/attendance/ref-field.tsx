"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { FieldDef, RefDef } from "@/components/crud/form-fields";
import type { ColumnDef } from "@/components/crud/crud-page";
import { Select } from "@/components/ui";

const cache = new Map<string, Promise<{ value: number; label: string }[]>>();
const labels = new Map<string, Map<number, string>>(); // table → id → label (sync, for CSV export)

function loadOptions(ref: RefDef) {
  const key = `${ref.table}|${ref.select ?? ""}|${ref.order ?? ""}`;
  if (!cache.has(key)) {
    let q = supabaseBrowser().from(ref.table).select(ref.select ?? "*").limit(5000);
    if (ref.order) q = q.order(ref.order);
    cache.set(
      key,
      Promise.resolve(q).then(({ data }: { data: unknown }) =>
        ((data as Record<string, unknown>[]) ?? []).map((r) => ({
          value: Number(r[ref.value ?? "id"]),
          label: typeof ref.label === "function" ? ref.label(r) : String(r[ref.label] ?? ""),
        })),
      ).then((opts) => {
        labels.set(ref.table, new Map(opts.map((o) => [o.value, o.label])));
        return opts;
      }),
    );
  }
  return cache.get(key)!;
}

function RefSelect({ refDef, value, onChange, required }: { refDef: RefDef; value: unknown; onChange: (v: unknown) => void; required?: boolean }) {
  const [opts, setOpts] = useState<{ value: number; label: string }[]>([]);
  useEffect(() => {
    let alive = true;
    loadOptions(refDef).then((o) => alive && setOpts(o));
    return () => {
      alive = false;
    };
  }, [refDef]);
  return (
    <Select value={value == null ? "" : String(value)} onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))} placeholder={required ? "— เลือก —" : "— ไม่ระบุ —"}>
      {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </Select>
  );
}

/**
 * Foreign-key select for CrudPage forms. Works around shared FormFields "ref" inputs hiding the option whose id
 * equals the edited row's id (meant for self-references such as org_units.parent_id).
 * Keeps `ref` so CrudPage still loads labels (use refColumn() for list/CSV display).
 */
export function refField(name: string, label: string, ref: RefDef, extra: Partial<FieldDef> = {}): FieldDef {
  if (typeof window !== "undefined") void loadOptions(ref);
  return {
    name,
    label,
    type: "custom",
    ref,
    ...extra,
    render: ({ value, onChange }) => <RefSelect refDef={ref} value={value} onChange={onChange} required={extra.required} />,
  };
}

/** list column for a refField: label in the table and in CSV export */
export function refColumn(key: string, label: string, table: string, empty = "-", extra: Partial<ColumnDef> = {}): ColumnDef {
  return {
    key,
    label,
    render: (r, { refLabel }) => (r[key] == null ? <span className="text-ink-mute">{empty}</span> : refLabel(key, r[key])),
    exportValue: (r) => (r[key] == null ? "" : labels.get(table)?.get(Number(r[key])) ?? r[key]),
    ...extra,
  };
}
