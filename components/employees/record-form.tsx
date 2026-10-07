"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Pencil } from "lucide-react";
import { Button, Panel, clsx, toast } from "@/components/ui";
import { FormFields, cleanValues, initialValues, useRefOptions, type FieldDef } from "@/components/crud/form-fields";
import { humanError, renderCell } from "@/components/crud/crud-page";

type Values = Record<string, unknown>;

/**
 * Read view + inline edit for a single record (one row of a table).
 * View mode shows a label/value grid grouped by field.section; edit mode uses the shared FormFields.
 */
export function RecordForm({
  title, fields, row, canEdit, onSave, actions, display, columns = 3, validate,
}: {
  title?: ReactNode;
  fields: FieldDef[];
  row: Values | null;
  canEdit: boolean;
  onSave: (values: Values) => Promise<{ error?: unknown } | void>;
  actions?: ReactNode;
  /** custom renderers for view mode */
  display?: Record<string, (v: unknown, row: Values) => ReactNode>;
  columns?: 2 | 3;
  validate?: (v: Values) => Record<string, string>;
}) {
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<Values>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const refOptions = useRefOptions(fields);

  const sections = useMemo(() => {
    const s: { title?: string; fields: FieldDef[] }[] = [];
    for (const f of fields) {
      if (f.hideInForm) continue;
      const last = s[s.length - 1];
      if (!last || (f.section && f.section !== last.title)) s.push({ title: f.section, fields: [f] });
      else last.fields.push(f);
    }
    return s;
  }, [fields]);

  function start() {
    setValues(initialValues(fields, row));
    setErrors({});
    setEditing(true);
  }

  async function save() {
    const errs: Record<string, string> = {};
    for (const f of fields) {
      if (f.hidden?.(values) || f.hideInForm) continue;
      const v = values[f.name];
      if (f.required && (v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length))) errs[f.name] = "จำเป็นต้องกรอก";
      const c = f.validate?.(v, values);
      if (c) errs[f.name] = c;
    }
    Object.assign(errs, validate?.(values) ?? {});
    setErrors(errs);
    if (Object.keys(errs).length) {
      toast.error("กรุณาตรวจสอบข้อมูลที่ไฮไลต์");
      return;
    }
    setSaving(true);
    try {
      const payload = cleanValues(fields, values);
      delete payload.id;
      const r = await onSave(payload);
      if (r && r.error) throw r.error;
      toast.ok("บันทึกแล้ว");
      setEditing(false);
    } catch (e) {
      toast.error(humanError(e));
    } finally {
      setSaving(false);
    }
  }

  const refLabel = (field: string) => (id: unknown) => {
    const opts = refOptions[field];
    if (Array.isArray(id)) return id.map((x) => opts?.find((o) => String(o.value) === String(x))?.label ?? String(x)).join(", ");
    return opts?.find((o) => String(o.value) === String(id))?.label ?? (id == null ? "-" : String(id));
  };

  return (
    <Panel
      title={title}
      actions={
        <>
          {actions}
          {canEdit && !editing && (
            <Button size="sm" variant="secondary" icon={<Pencil className="size-4" />} onClick={start} disabled={!row}>
              แก้ไข
            </Button>
          )}
        </>
      }
      footer={
        editing ? (
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditing(false)}>ยกเลิก</Button>
            <Button onClick={save} loading={saving}>บันทึก</Button>
          </div>
        ) : undefined
      }
    >
      {editing ? (
        <FormFields fields={fields} values={values} onChange={setValues} errors={errors} refOptions={refOptions} columns={columns} />
      ) : (
        <div className="flex flex-col gap-5">
          {sections.map((s, i) => (
            <div key={i}>
              {s.title && <h4 className="mb-2 border-b border-line-soft pb-1 text-sm font-semibold text-jade-800">{s.title}</h4>}
              <dl className={clsx("grid gap-x-6 gap-y-3", columns === 3 ? "sm:grid-cols-2 lg:grid-cols-3" : "sm:grid-cols-2")}>
                {s.fields
                  .filter((f) => !f.hidden?.(row ?? {}))
                  .map((f) => (
                    <div key={f.name} className={clsx("min-w-0", (f.type === "textarea" || f.span === 2) && "sm:col-span-2", f.span === 3 && "sm:col-span-full")}>
                      <dt className="text-[13px] text-ink-mute">{f.label}</dt>
                      <dd className="mt-0.5 break-words text-[15px] text-ink">
                        {display?.[f.name]
                          ? display[f.name](row?.[f.name], row ?? {})
                          : f.type === "weekdays"
                            ? weekdays(row?.[f.name])
                            : f.type === "textarea"
                              ? <span className="whitespace-pre-line">{String(row?.[f.name] ?? "") || <span className="text-ink-mute">-</span>}</span>
                              : renderCell(f, row?.[f.name], refLabel(f.name))}
                      </dd>
                    </div>
                  ))}
              </dl>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

const DAYS = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
function weekdays(v: unknown) {
  const a = Array.isArray(v) ? (v as number[]) : [];
  return a.length ? a.map((d) => DAYS[d]).join(", ") : <span className="text-ink-mute">-</span>;
}
