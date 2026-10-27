"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Checkbox, Field, Input, Select, Textarea, Toggle, clsx } from "@/components/ui";
import { EmployeePicker } from "./employee-picker";

export type FieldType =
  | "text" | "textarea" | "number" | "money" | "date" | "time" | "datetime" | "select" | "boolean"
  | "ref" | "refs" | "employee" | "employees" | "color" | "tags" | "email" | "tel" | "json" | "weekdays" | "custom";

export interface RefDef {
  table: string;
  label: string | ((r: Record<string, unknown>) => string);
  value?: string;
  select?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  filter?: (q: any) => any;
  order?: string;
}

export interface FieldDef {
  name: string;
  label: ReactNode;
  type: FieldType;
  required?: boolean;
  options?: { value: string | number; label: string }[];
  ref?: RefDef;
  placeholder?: string;
  hint?: ReactNode;
  span?: 1 | 2 | 3;
  default?: unknown;
  hideInForm?: boolean;
  hidden?: (values: Record<string, unknown>) => boolean;
  readOnlyOnEdit?: boolean;
  step?: string;
  min?: number;
  max?: number;
  validate?: (v: unknown, values: Record<string, unknown>) => string | null;
  render?: (props: { value: unknown; onChange: (v: unknown) => void; values: Record<string, unknown> }) => ReactNode;
  section?: string;
  /** for self-referencing refs (e.g. parent unit): hide the row being edited from its own options */
  excludeSelf?: boolean;
}

export type RefOptions = Record<string, { value: string | number; label: string; raw?: Record<string, unknown> }[]>;

/** Load option lists for all ref/refs fields (master tables are small) */
export function useRefOptions(fields: FieldDef[]): RefOptions {
  const [opts, setOpts] = useState<RefOptions>({});
  const key = fields.map((f) => (f.ref ? `${f.name}:${f.ref.table}` : f.type === "employee" || f.type === "employees" ? `${f.name}:emp` : "")).join("|");
  useEffect(() => {
    let alive = true;
    (async () => {
      const sb = supabaseBrowser();
      const out: RefOptions = {};
      await Promise.all(
        fields.map(async (f) => {
          if (f.type === "employee" || f.type === "employees") {
            const { data } = await sb.from("v_directory").select("id, code, first_name, last_name, nickname").order("code").limit(5000);
            out[f.name] = ((data ?? []) as { id: number; code: string; first_name: string; last_name: string; nickname: string | null }[]).map((r) => ({ value: r.id, label: `${r.first_name} ${r.last_name}${r.nickname ? ` (${r.nickname})` : ""}`, raw: r }));
            return;
          }
          if (!f.ref) return;
          let q = sb.from(f.ref.table).select(f.ref.select ?? "*").limit(5000);
          if (f.ref.filter) q = f.ref.filter(q);
          if (f.ref.order) q = q.order(f.ref.order);
          const { data } = await q;
          const valueKey = f.ref.value ?? "id";
          const labelFn = typeof f.ref.label === "function" ? f.ref.label : (r: Record<string, unknown>) => String(r[f.ref!.label as string] ?? "");
          out[f.name] = ((data as unknown as Record<string, unknown>[]) ?? []).map((r) => ({ value: r[valueKey] as string | number, label: labelFn(r), raw: r }));
        }),
      );
      if (alive) setOpts(out);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return opts;
}

export function initialValues(fields: FieldDef[], from?: Record<string, unknown> | null): Record<string, unknown> {
  const v: Record<string, unknown> = {};
  for (const f of fields) {
    const src = from?.[f.name];
    if (src !== undefined) v[f.name] = f.type === "json" && typeof src !== "string" ? JSON.stringify(src, null, 2) : src;
    else if (f.default !== undefined) v[f.name] = typeof f.default === "function" ? (f.default as () => unknown)() : f.default;
    else v[f.name] = f.type === "boolean" ? false : f.type === "refs" || f.type === "tags" || f.type === "employees" || f.type === "weekdays" ? [] : "";
  }
  if (from?.id !== undefined) v.id = from.id;
  return v;
}

/** convert form values to DB payload ("" → null, numbers parsed, json parsed) */
export function cleanValues(fields: FieldDef[], values: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    if (f.hideInForm && values[f.name] === undefined) continue;
    if (f.type === "custom" && values[f.name] === undefined) continue;
    let v = values[f.name];
    if (v === "" || v === undefined) v = null;
    if (v !== null && (f.type === "number" || f.type === "money")) v = Number(v);
    if (v !== null && (f.type === "ref" || f.type === "employee") && /^\d+$/.test(String(v))) v = Number(v);
    if (f.type === "json" && typeof v === "string") {
      try {
        v = JSON.parse(v);
      } catch {
        throw new Error(`รูปแบบ JSON ของ "${typeof f.label === "string" ? f.label : f.name}" ไม่ถูกต้อง`);
      }
    }
    if (f.type === "datetime" && v) {
      const raw = String(v);
      v = new Date(/[zZ]$|[+-]\d\d:\d\d$/.test(raw) ? raw : `${raw.length === 16 ? raw + ":00" : raw}+07:00`).toISOString();
    }
    if (f.hidden?.(values)) continue;
    out[f.name] = v;
  }
  return out;
}

const WEEKDAYS = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

export function FormFields({
  fields,
  values,
  onChange,
  errors,
  refOptions,
  editing,
  columns = 2,
}: {
  fields: FieldDef[];
  values: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
  errors?: Record<string, string>;
  refOptions: RefOptions;
  editing?: boolean;
  columns?: 1 | 2 | 3;
}) {
  const set = (name: string, v: unknown) => onChange({ ...values, [name]: v });
  const sections = useMemo(() => {
    const s: { title?: string; fields: FieldDef[] }[] = [];
    for (const f of fields) {
      if (f.hideInForm || f.hidden?.(values)) continue;
      const last = s[s.length - 1];
      if (!last || (f.section && f.section !== last.title)) s.push({ title: f.section, fields: [f] });
      else last.fields.push(f);
    }
    return s;
  }, [fields, values]);

  return (
    <div className="flex flex-col gap-5">
      {sections.map((sec, i) => (
        <div key={i}>
          {sec.title && <h4 className="mb-2 border-b border-line-soft pb-1 text-sm font-semibold text-jade-800">{sec.title}</h4>}
          <div className={clsx("grid gap-x-4 gap-y-3", columns === 1 ? "grid-cols-1" : columns === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
            {sec.fields.map((f) => (
              <div key={f.name} className={clsx(f.span === 2 && "sm:col-span-2", f.span === 3 && "sm:col-span-3", (f.type === "textarea" || f.type === "json") && !f.span && "sm:col-span-2")}>
                <FieldInput f={f} value={values[f.name]} set={(v) => set(f.name, v)} error={errors?.[f.name]} opts={refOptions[f.name]} readOnly={editing && f.readOnlyOnEdit} values={values} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function FieldInput({
  f, value, set, error, opts, readOnly, values,
}: {
  f: FieldDef;
  value: unknown;
  set: (v: unknown) => void;
  error?: string;
  opts?: { value: string | number; label: string }[];
  readOnly?: boolean;
  values: Record<string, unknown>;
}) {
  const str = value === null || value === undefined ? "" : String(value);
  let input: ReactNode;
  switch (f.type) {
    case "custom":
      input = f.render?.({ value, onChange: set, values });
      break;
    case "textarea":
      input = <Textarea value={str} onChange={(e) => set(e.target.value)} placeholder={f.placeholder} disabled={readOnly} rows={3} />;
      break;
    case "json":
      input = <Textarea value={str} onChange={(e) => set(e.target.value)} className="font-mono text-xs" rows={8} disabled={readOnly} />;
      break;
    case "number":
    case "money":
      input = (
        <Input type={f.type} inputMode="decimal" step={f.step ?? "any"} min={f.min} max={f.max} value={str} onChange={(e) => set(e.target.value)} placeholder={f.placeholder} disabled={readOnly} className="num" />
      );
      break;
    case "date":
      input = <Input type="date" value={str.slice(0, 10)} onChange={(e) => set(e.target.value)} disabled={readOnly} />;
      break;
    case "time":
      input = <Input type="time" value={str.slice(0, 5)} onChange={(e) => set(e.target.value)} disabled={readOnly} />;
      break;
    case "datetime":
      input = <Input type="datetime-local" value={toLocalInput(str)} onChange={(e) => set(e.target.value)} disabled={readOnly} />;
      break;
    case "boolean":
      return <div className="pt-6"><Toggle checked={!!value} onChange={set} label={f.label} disabled={readOnly} /></div>;
    case "select":
      input = (
        <Select value={str} onChange={(e) => set(e.target.value)} placeholder={f.required ? "— เลือก —" : "— ไม่ระบุ —"} disabled={readOnly}>
          {f.options?.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </Select>
      );
      break;
    case "ref":
      input = (
        <Select value={str} onChange={(e) => set(e.target.value)} placeholder={f.required ? "— เลือก —" : "— ไม่ระบุ —"} disabled={readOnly}>
          {opts?.filter((o) => !f.excludeSelf || String(o.value) !== String(values.id ?? "__")).map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </Select>
      );
      break;
    case "employee":
      input = <EmployeePicker value={value as number | null} onChange={set} options={opts ?? []} disabled={readOnly} />;
      break;
    case "employees":
    case "refs": {
      const arr = Array.isArray(value) ? (value as (string | number)[]).map(String) : [];
      input = (
        <div className="thin-scroll max-h-44 overflow-y-auto rounded-[var(--radius-ctl)] border border-line p-2">
          {(opts ?? []).length === 0 && <span className="text-sm text-ink-mute">ไม่มีตัวเลือก</span>}
          <div className="grid gap-1 sm:grid-cols-2">
            {(opts ?? []).map((o) => (
              <Checkbox
                key={o.value}
                label={o.label}
                checked={arr.includes(String(o.value))}
                onChange={(c) => set(c ? [...arr, String(o.value)].map((x) => (/^\d+$/.test(x) ? Number(x) : x)) : arr.filter((x) => x !== String(o.value)).map((x) => (/^\d+$/.test(x) ? Number(x) : x)))}
              />
            ))}
          </div>
        </div>
      );
      break;
    }
    case "weekdays": {
      const arr = Array.isArray(value) ? (value as number[]) : [];
      input = (
        <div className="flex gap-1">
          {WEEKDAYS.map((d, i) => (
            <button
              type="button"
              key={i}
              onClick={() => set(arr.includes(i) ? arr.filter((x) => x !== i) : [...arr, i].sort())}
              className={clsx("h-9 w-10 rounded-md border text-sm", arr.includes(i) ? "border-jade-600 bg-jade-600 text-white" : "border-line bg-white text-ink-soft")}
            >
              {d}
            </button>
          ))}
        </div>
      );
      break;
    }
    case "tags": {
      const arr = Array.isArray(value) ? (value as string[]) : [];
      input = <Input value={arr.join(", ")} onChange={(e) => set(e.target.value.split(",").map((s) => s.trim()).filter(Boolean))} placeholder={f.placeholder ?? "คั่นด้วยเครื่องหมายจุลภาค ( , )"} disabled={readOnly} />;
      break;
    }
    case "color":
      input = <Input type="color" value={str || "#10b981"} onChange={(e) => set(e.target.value)} className="h-10 w-20 p-1" />;
      break;
    default:
      input = <Input type={f.type === "email" ? "email" : f.type === "tel" ? "tel" : "text"} value={str} onChange={(e) => set(e.target.value)} placeholder={f.placeholder} disabled={readOnly} />;
  }
  return (
    <Field label={f.label} hint={f.hint} error={error} required={f.required}>
      {input}
    </Field>
  );
}

function toLocalInput(s: string): string {
  if (!s) return "";
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  const p = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(d);
  return p.replace(" ", "T");
}
