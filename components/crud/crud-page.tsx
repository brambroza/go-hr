"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Download, Pencil, Plus, Search, Trash2, ChevronLeft, ChevronRight, ArrowUpDown } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useCan } from "@/components/app/me-context";
import type { MenuKey } from "@/lib/permissions";
import { Badge, Button, Empty, Input, PageHeader, Panel, Select, Spinner, clsx, toast, useConfirm } from "@/components/ui";
import { FormFields, type FieldDef, cleanValues, initialValues, useRefOptions } from "./form-fields";
import { Modal } from "@/components/ui";
import { downloadCsv } from "@/lib/csv";

export type Row = Record<string, unknown> & { id?: number | string };

export interface ColumnDef {
  key: string;
  label: ReactNode;
  render?: (row: Row, ctx: { refLabel: (field: string, id: unknown) => string }) => ReactNode;
  className?: string;
  sortable?: boolean;
  exportValue?: (row: Row) => unknown;
}

export interface FilterDef {
  name: string;
  label: string;
  options?: { value: string; label: string }[];
  refField?: string; // reuse options of a ref field
  apply?: (q: QueryLike, value: string) => QueryLike;
}

// minimal structural type for the PostgREST builder we chain on
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type QueryLike = any;

export interface CrudConfig {
  table: string;
  title: ReactNode;
  description?: ReactNode;
  menu: MenuKey;
  select?: string;
  orderBy?: { column: string; ascending?: boolean };
  searchColumns?: string[];
  columns: ColumnDef[];
  fields: FieldDef[];
  filters?: FilterDef[];
  baseFilter?: (q: QueryLike) => QueryLike;
  defaults?: Row;
  beforeSave?: (values: Row, editing: Row | null) => Row | Promise<Row>;
  afterSave?: (row: Row) => void | Promise<void>;
  rowActions?: (row: Row, reload: () => void) => ReactNode;
  headerActions?: (reload: () => void) => ReactNode;
  readOnly?: boolean;
  allowDelete?: boolean;
  pageSize?: number;
  exportName?: string;
  emptyText?: ReactNode;
  formSize?: "sm" | "md" | "lg" | "xl";
  onRowClick?: (row: Row) => void;
  idKey?: string;
  embedded?: boolean; // render without page header (inside tabs)
}

export function CrudPage({ config }: { config: CrudConfig }) {
  const can = useCan();
  const sb = supabaseBrowser();
  const idKey = config.idKey ?? "id";
  const pageSize = config.pageSize ?? 25;
  const [rows, setRows] = useState<Row[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [order, setOrder] = useState(config.orderBy ?? { column: "id", ascending: false });
  const [editing, setEditing] = useState<Row | null>(null);
  const [creating, setCreating] = useState(false);
  const [values, setValues] = useState<Row>({});
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { confirm, dialog } = useConfirm();
  const refOptions = useRefOptions(config.fields);

  const canCreate = !config.readOnly && can(config.menu, "create");
  const canEdit = !config.readOnly && can(config.menu, "edit");
  const canDelete = !config.readOnly && config.allowDelete !== false && can(config.menu, "delete");

  const buildQuery = useCallback(
    (withCount: boolean) => {
      let query: QueryLike = sb.from(config.table).select(config.select ?? "*", withCount ? { count: "exact" } : undefined);
      if (config.baseFilter) query = config.baseFilter(query);
      const term = q.trim().replace(/[%,()]/g, "");
      if (term && config.searchColumns?.length) {
        query = query.or(config.searchColumns.map((c) => `${c}.ilike.%${term}%`).join(","));
      }
      for (const f of config.filters ?? []) {
        const v = filters[f.name];
        if (!v) continue;
        query = f.apply ? f.apply(query, v) : query.eq(f.name, v);
      }
      return query.order(order.column, { ascending: order.ascending ?? true, nullsFirst: false });
    },
    [sb, config, q, filters, order],
  );

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error, count } = await buildQuery(true).range(page * pageSize, page * pageSize + pageSize - 1);
    if (error) toast.error(error.message);
    setRows((data as Row[]) ?? []);
    setCount(count ?? 0);
    setLoading(false);
  }, [buildQuery, page, pageSize]);

  useEffect(() => {
    const t = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  const refLabel = useCallback(
    (field: string, id: unknown) => {
      if (id == null || id === "") return "-";
      const opts = refOptions[field];
      if (!opts) return String(id);
      if (Array.isArray(id)) return id.map((x) => opts.find((o) => String(o.value) === String(x))?.label ?? x).join(", ");
      return opts.find((o) => String(o.value) === String(id))?.label ?? String(id);
    },
    [refOptions],
  );

  function openCreate() {
    setErrors({});
    setValues(initialValues(config.fields, config.defaults));
    setEditing(null);
    setCreating(true);
  }
  function openEdit(row: Row) {
    setErrors({});
    setValues(initialValues(config.fields, row));
    setEditing(row);
    setCreating(true);
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
        ? await sb.from(config.table).update(payload).eq(idKey, editing[idKey]).select(config.select ?? "*").single()
        : await sb.from(config.table).insert(payload).select(config.select ?? "*").single();
      if (res.error) throw res.error;
      await config.afterSave?.(res.data as Row);
      toast.ok(editing ? "บันทึกการแก้ไขแล้ว" : "เพิ่มข้อมูลแล้ว");
      setCreating(false);
      load();
    } catch (e: unknown) {
      toast.error(humanError(e));
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: Row) {
    if (!(await confirm("ต้องการลบรายการนี้ใช่หรือไม่? การลบไม่สามารถย้อนกลับได้", { danger: true, confirmText: "ลบ" }))) return;
    const { error } = await sb.from(config.table).delete().eq(idKey, row[idKey]);
    if (error) return toast.error(humanError(error));
    toast.ok("ลบแล้ว");
    load();
  }

  async function exportAll() {
    const { data, error } = await buildQuery(false).range(0, 9999);
    if (error) return toast.error(error.message);
    const cols = config.columns;
    const header = cols.map((c) => (typeof c.label === "string" ? c.label : c.key));
    const body = ((data as Row[]) ?? []).map((r) =>
      cols.map((c) => {
        if (c.exportValue) return c.exportValue(r);
        const f = config.fields.find((x) => x.name === c.key);
        if (f && (f.type === "ref" || f.type === "refs" || f.type === "employee")) return refLabel(c.key, r[c.key]);
        if (f?.type === "select") return f.options?.find((o) => String(o.value) === String(r[c.key]))?.label ?? r[c.key];
        return r[c.key];
      }),
    );
    downloadCsv(`${config.exportName ?? config.table}.csv`, [header, ...body]);
  }

  const pages = Math.max(1, Math.ceil(count / pageSize));
  const filterOptions = useMemo(
    () =>
      (config.filters ?? []).map((f) => ({
        ...f,
        options: f.options ?? (f.refField ? (refOptions[f.refField] ?? []).map((o) => ({ value: String(o.value), label: o.label })) : []),
      })),
    [config.filters, refOptions],
  );

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2">
      {config.searchColumns?.length ? (
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-mute" />
          <Input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(0);
            }}
            placeholder="ค้นหา"
            className="h-9 pl-8 text-sm"
          />
        </div>
      ) : null}
      {filterOptions.map((f) => (
        <Select
          key={f.name}
          className="h-9 !w-auto min-w-36 text-sm"
          value={filters[f.name] ?? ""}
          placeholder={`${f.label}: ทั้งหมด`}
          onChange={(e) => {
            setFilters((x) => ({ ...x, [f.name]: e.target.value }));
            setPage(0);
          }}
        >
          {f.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      ))}
    </div>
  );

  const table = (
    <Panel
      bodyClass="p-0"
      title={config.embedded ? undefined : undefined}
      actions={undefined}
      footer={
        count > pageSize ? (
          <div className="flex items-center justify-between text-sm text-ink-soft">
            <span className="num">
              {page * pageSize + 1}–{Math.min(count, (page + 1) * pageSize)} จาก {count.toLocaleString()} รายการ
            </span>
            <div className="flex gap-1">
              <Button size="sm" variant="secondary" disabled={page === 0} onClick={() => setPage((p) => p - 1)} aria-label="ก่อนหน้า">
                <ChevronLeft className="size-4" />
              </Button>
              <Button size="sm" variant="secondary" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)} aria-label="ถัดไป">
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        ) : null
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-soft px-3 py-2.5">
        {toolbar}
        <span className="num text-sm text-ink-mute">{count.toLocaleString()} รายการ</span>
      </div>
      <div className="thin-scroll overflow-x-auto">
        <table className="w-full text-[14px]">
          <thead>
            <tr className="border-b border-line bg-paper/60 text-left text-[13px] text-ink-soft">
              {config.columns.map((c) => (
                <th key={c.key} className={clsx("whitespace-nowrap px-3 py-2 font-medium", c.className)}>
                  {c.sortable ? (
                    <button
                      className="inline-flex items-center gap-1 hover:text-ink"
                      onClick={() => setOrder((o) => ({ column: c.key, ascending: o.column === c.key ? !o.ascending : true }))}
                    >
                      {c.label}
                      <ArrowUpDown className={clsx("size-3", order.column === c.key ? "text-jade-600" : "text-ink-mute")} />
                    </button>
                  ) : (
                    c.label
                  )}
                </th>
              ))}
              {(canEdit || canDelete || config.rowActions) && <th className="w-px px-3 py-2" />}
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 ? (
              <tr>
                <td colSpan={config.columns.length + 1} className="py-12 text-center">
                  <Spinner className="mx-auto" />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={config.columns.length + 1}>
                  <Empty
                    title={q || Object.values(filters).some(Boolean) ? "ไม่พบข้อมูลที่ตรงกับเงื่อนไข" : config.emptyText ?? "ยังไม่มีข้อมูล"}
                    action={canCreate && !q ? <Button icon={<Plus className="size-4" />} onClick={openCreate}>เพิ่มรายการแรก</Button> : undefined}
                  />
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr
                  key={String(r[idKey])}
                  className={clsx("border-b border-line-soft last:border-0 hover:bg-jade-50/40", (config.onRowClick || canEdit) && "cursor-pointer")}
                  onClick={() => (config.onRowClick ? config.onRowClick(r) : canEdit ? openEdit(r) : undefined)}
                >
                  {config.columns.map((c) => (
                    <td key={c.key} className={clsx("px-3 py-2 align-middle", c.className)}>
                      {c.render ? c.render(r, { refLabel }) : renderCell(config.fields.find((f) => f.name === c.key), r[c.key], (id) => refLabel(c.key, id))}
                    </td>
                  ))}
                  {(canEdit || canDelete || config.rowActions) && (
                    <td className="whitespace-nowrap px-2 py-1 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-0.5">
                        {config.rowActions?.(r, load)}
                        {canEdit && (
                          <button className="rounded p-1.5 text-ink-mute hover:bg-jade-50 hover:text-jade-700" onClick={() => openEdit(r)} aria-label="แก้ไข">
                            <Pencil className="size-4" />
                          </button>
                        )}
                        {canDelete && (
                          <button className="rounded p-1.5 text-ink-mute hover:bg-rust-soft hover:text-rust" onClick={() => remove(r)} aria-label="ลบ">
                            <Trash2 className="size-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  );

  const actions = (
    <>
      {config.headerActions?.(load)}
      {can(config.menu, "export") && (
        <Button variant="secondary" icon={<Download className="size-4" />} onClick={exportAll}>
          ส่งออก
        </Button>
      )}
      {canCreate && (
        <Button icon={<Plus className="size-4" />} onClick={openCreate}>
          เพิ่ม
        </Button>
      )}
    </>
  );

  return (
    <div>
      {config.embedded ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            {config.title && <h3 className="font-semibold">{config.title}</h3>}
            {config.description && <p className="text-sm text-ink-soft">{config.description}</p>}
          </div>
          <div className="flex gap-2">{actions}</div>
        </div>
      ) : (
        <PageHeader title={config.title} description={config.description} actions={actions} />
      )}
      {table}
      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        size={config.formSize ?? "md"}
        title={editing ? "แก้ไขข้อมูล" : "เพิ่มข้อมูล"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreating(false)}>
              ยกเลิก
            </Button>
            <Button loading={saving} onClick={save}>
              บันทึก
            </Button>
          </>
        }
      >
        <FormFields fields={config.fields} values={values} onChange={setValues} errors={errors} refOptions={refOptions} editing={!!editing} />
      </Modal>
      {dialog}
    </div>
  );
}

export function renderCell(f: FieldDef | undefined, v: unknown, refLabel: (id: unknown) => string): ReactNode {
  if (v === null || v === undefined || v === "") return <span className="text-ink-mute">-</span>;
  if (!f) return String(v);
  switch (f.type) {
    case "boolean":
      return v ? <Badge color="green">ใช่</Badge> : <Badge>ไม่</Badge>;
    case "money":
      return <span className="num">{Number(v).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>;
    case "number":
      return <span className="num">{Number(v).toLocaleString("th-TH")}</span>;
    case "date":
      return <DateCell v={String(v)} />;
    case "select":
      return f.options?.find((o) => String(o.value) === String(v))?.label ?? String(v);
    case "ref":
    case "refs":
    case "employee":
      return refLabel(v);
    case "color":
      return <span className="inline-block size-4 rounded" style={{ background: String(v) }} />;
    case "tags":
      return Array.isArray(v) ? (v as string[]).join(", ") : String(v);
    default:
      return String(v);
  }
}

function DateCell({ v }: { v: string }) {
  const d = v.slice(0, 10).split("-").map(Number);
  if (d.length !== 3) return <>{v}</>;
  const m = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."][d[1] - 1];
  return <span className="num whitespace-nowrap">{`${d[2]} ${m} ${d[0] + 543}`}</span>;
}

export function humanError(e: unknown): string {
  const msg = typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : String(e);
  if (msg.includes("duplicate key")) return "ข้อมูลซ้ำกับรายการที่มีอยู่แล้ว (เช่น รหัสซ้ำ)";
  if (msg.includes("violates foreign key") && msg.includes("delete")) return "ลบไม่ได้ เพราะมีข้อมูลอื่นอ้างอิงรายการนี้อยู่";
  if (msg.includes("violates foreign key")) return "ข้อมูลอ้างอิงไม่ถูกต้อง หรือมีข้อมูลอื่นใช้รายการนี้อยู่";
  if (msg.includes("row-level security")) return "คุณไม่มีสิทธิ์ทำรายการนี้";
  if (msg.includes("violates check constraint")) return "ค่าที่กรอกไม่อยู่ในรูปแบบที่กำหนด";
  return msg;
}
