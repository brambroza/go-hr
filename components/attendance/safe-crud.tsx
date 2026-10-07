"use client";

import { useRef, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useCan } from "@/components/app/me-context";
import { CrudPage, humanError, type CrudConfig, type Row } from "@/components/crud/crud-page";
import { FormFields, cleanValues, initialValues, useRefOptions } from "@/components/crud/form-fields";
import { Button, Modal, toast, useConfirm } from "@/components/ui";

/**
 * CrudPage for tables with column-level SELECT grants (secret columns such as qr_secret / api_key).
 * CrudPage writes with `.select()` (= select=*), which PostgREST rejects when some columns are not granted,
 * so the list is rendered by CrudPage in read-only mode and writes are done here with an explicit column list.
 */
export function SafeCrudPage({ config }: { config: CrudConfig & { select: string } }) {
  const can = useCan();
  const sb = supabaseBrowser();
  const reloadRef = useRef<() => void>(() => undefined);
  const [editing, setEditing] = useState<Row | null>(null);
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Row>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const { confirm, dialog } = useConfirm();
  const refOptions = useRefOptions(config.fields);
  const canCreate = can(config.menu, "create");
  const canEdit = can(config.menu, "edit");
  const canDelete = config.allowDelete !== false && can(config.menu, "delete");

  function openForm(row: Row | null) {
    setErrors({});
    setValues(initialValues(config.fields, row ?? config.defaults));
    setEditing(row);
    setOpen(true);
  }

  async function save() {
    const errs: Record<string, string> = {};
    for (const f of config.fields) {
      if (f.hidden?.(values) || f.hideInForm) continue;
      const v = values[f.name];
      if (f.required && (v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length))) errs[f.name] = "จำเป็นต้องกรอก";
      const custom = f.validate?.(v, values);
      if (custom) errs[f.name] = custom;
    }
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      let payload = cleanValues(config.fields, values);
      if (config.beforeSave) payload = await config.beforeSave(payload, editing);
      const res = editing
        ? await sb.from(config.table).update(payload).eq("id", editing.id).select(config.select).single()
        : await sb.from(config.table).insert(payload).select(config.select).single();
      if (res.error) throw res.error;
      await config.afterSave?.(res.data as unknown as Row);
      toast.ok(editing ? "บันทึกการแก้ไขแล้ว" : "เพิ่มข้อมูลแล้ว");
      setOpen(false);
      reloadRef.current();
    } catch (e) {
      toast.error(humanError(e));
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: Row, reload: () => void) {
    if (!(await confirm("ต้องการลบรายการนี้ใช่หรือไม่? การลบไม่สามารถย้อนกลับได้", { danger: true, confirmText: "ลบ" }))) return;
    const { error } = await sb.from(config.table).delete().eq("id", row.id);
    if (error) return toast.error(humanError(error));
    toast.ok("ลบแล้ว");
    reload();
  }

  return (
    <>
      <CrudPage
        config={{
          ...config,
          readOnly: true,
          onRowClick: canEdit ? (r) => openForm(r) : config.onRowClick,
          headerActions: (reload) => {
            reloadRef.current = reload;
            return (
              <>
                {config.headerActions?.(reload)}
                {canCreate && <Button icon={<Plus className="size-4" />} onClick={() => openForm(null)}>เพิ่ม</Button>}
              </>
            );
          },
          rowActions: (r, reload) => (
            <>
              {config.rowActions?.(r, reload)}
              {canEdit && (
                <button className="rounded p-1.5 text-ink-mute hover:bg-jade-50 hover:text-jade-700" onClick={() => openForm(r)} aria-label="แก้ไข"><Pencil className="size-4" /></button>
              )}
              {canDelete && (
                <button className="rounded p-1.5 text-ink-mute hover:bg-rust-soft hover:text-rust" onClick={() => remove(r, reload)} aria-label="ลบ"><Trash2 className="size-4" /></button>
              )}
            </>
          ),
        }}
      />
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        size={config.formSize ?? "md"}
        title={editing ? "แก้ไขข้อมูล" : "เพิ่มข้อมูล"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>ยกเลิก</Button>
            <Button loading={saving} onClick={save}>บันทึก</Button>
          </>
        }
      >
        <FormFields fields={config.fields} values={values} onChange={setValues} errors={errors} refOptions={refOptions} editing={!!editing} />
      </Modal>
      {dialog}
    </>
  );
}
