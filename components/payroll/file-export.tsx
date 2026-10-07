"use client";
// Shared pieces for bank / SSO / RD file exports: load layouts (built-in + custom from table file_formats),
// pick a layout, show validation issues and a preview of the first lines, download.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Download, FileCog, XCircle } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Badge, Button, Modal, Select, clsx } from "@/components/ui";
import { builtinLayouts, findBuiltin, STATUS_LABEL, type FileKind, type FileLayout, type Issue, type RenderedFile } from "@/lib/payroll/files";
import { downloadBuilt } from "@/lib/payroll/files";
import { ENCODING_LABEL } from "@/lib/payroll/tis620";

export type CustomFormatRow = { id: number; key: string; kind: FileKind; label: string; layout: FileLayout; based_on: string | null; is_default: boolean; updated_at: string };

/** built-in + custom layouts of one kind; default = custom marked default, else `preferKey`, else the first */
export function useFileLayouts(kind: FileKind, preferKey?: string | null) {
  const [custom, setCustom] = useState<CustomFormatRow[] | null>(null);
  const reload = useCallback(async () => {
    const { data, error } = await supabaseBrowser().from("file_formats").select("id, key, kind, label, layout, based_on, is_default, updated_at").eq("kind", kind).order("label");
    setCustom(error ? [] : ((data ?? []) as CustomFormatRow[]));
  }, [kind]);
  useEffect(() => {
    reload();
  }, [reload]);
  const layouts = useMemo(() => [...(custom ?? []).map((c) => ({ ...c.layout, key: c.key, label: c.label, kind })), ...builtinLayouts(kind)], [custom, kind]);
  const defaultKey = useMemo(() => {
    const d = (custom ?? []).find((c) => c.is_default);
    if (d) return d.key;
    const p = preferKey ? findBuiltin(preferKey)?.key ?? (layouts.some((l) => l.key === preferKey) ? preferKey : undefined) : undefined;
    return p ?? layouts[0]?.key;
  }, [custom, preferKey, layouts]);
  return { layouts, custom, defaultKey, loading: custom === null, reload };
}

export function StatusBadge({ status }: { status: FileLayout["status"] }) {
  return <Badge color={status === "official" ? "green" : status === "secondary" ? "blue" : "amber"}>{STATUS_LABEL[status]}</Badge>;
}

export function LayoutPicker({ layouts, value, onChange, className }: { layouts: FileLayout[]; value: string; onChange: (k: string) => void; className?: string }) {
  return (
    <Select className={className} value={value} onChange={(e) => onChange(e.target.value)} aria-label="รูปแบบไฟล์">
      {layouts.map((l) => (
        <option key={l.key} value={l.key}>
          {l.key.startsWith("custom_") ? "★ " : ""}
          {l.label}
        </option>
      ))}
    </Select>
  );
}

export function IssueList({ issues, max = 12 }: { issues: Issue[]; max?: number }) {
  const [all, setAll] = useState(false);
  const errors = issues.filter((i) => i.level === "error");
  const warns = issues.filter((i) => i.level === "warn");
  const list = [...errors, ...warns];
  if (!list.length)
    return (
      <p className="flex items-center gap-1.5 text-sm text-jade-700">
        <CheckCircle2 className="size-4" /> ตรวจข้อมูลแล้ว ไม่พบปัญหา
      </p>
    );
  const shown = all ? list : list.slice(0, max);
  return (
    <div className="text-sm">
      <p className={clsx("mb-1 font-medium", errors.length ? "text-rust" : "text-amber-ink")}>
        {errors.length ? `พบข้อผิดพลาด ${errors.length} รายการ — ต้องแก้ข้อมูลก่อนจึงจะสร้างไฟล์ได้` : `มีข้อควรตรวจสอบ ${warns.length} รายการ (สร้างไฟล์ได้)`}
        {errors.length > 0 && warns.length > 0 && <span className="font-normal text-ink-soft"> · ข้อควรตรวจสอบ {warns.length}</span>}
      </p>
      <ul className="max-h-56 space-y-0.5 overflow-y-auto rounded-[var(--radius-ctl)] border border-line bg-paper/60 px-3 py-2">
        {shown.map((x, i) => (
          <li key={i} className="flex gap-1.5">
            {x.level === "error" ? <XCircle className="mt-0.5 size-4 shrink-0 text-rust" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-ink" />}
            <span>{x.message}</span>
          </li>
        ))}
      </ul>
      {list.length > max && (
        <button type="button" className="mt-1 text-xs text-jade-700 underline" onClick={() => setAll(!all)}>
          {all ? "แสดงน้อยลง" : `แสดงทั้งหมด ${list.length} รายการ`}
        </button>
      )}
    </div>
  );
}

/** first lines of a rendered file, monospace, spaces shown as · for fixed-width files */
export function FilePreview({ file, layout, lines = 6 }: { file: RenderedFile; layout: FileLayout; lines?: number }) {
  const show = file.lines.slice(0, lines);
  const widths = [...new Set(file.lines.map((l) => (layout.encoding === "tis620" ? l.length : new TextEncoder().encode(l).length)))];
  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-mute">
        <span>
          ไฟล์ <b className="text-ink-soft">{file.filename}</b>
        </span>
        <span>{file.lines.length} บรรทัด</span>
        <span>{file.bytes.length.toLocaleString()} ไบต์</span>
        <span>{ENCODING_LABEL[layout.encoding]}</span>
        <span>{layout.lineEnding === "CRLF" ? "CRLF" : "LF"}</span>
        {layout.mode === "fixed" && <span>ความยาวบรรทัด (ไบต์): {widths.join(", ")}</span>}
      </div>
      <pre className="thin-scroll max-h-48 overflow-auto rounded-[var(--radius-ctl)] border border-line bg-paper px-3 py-2 font-mono text-[11.5px] leading-5 text-ink">
        {show.map((l, i) => (
          <div key={i} className="whitespace-pre">
            {layout.mode === "fixed" ? l.replace(/ /g, "·") : l}
          </div>
        ))}
        {file.lines.length > lines && <div className="text-ink-mute">… อีก {file.lines.length - lines} บรรทัด</div>}
      </pre>
    </div>
  );
}

/** modal: issues + preview + download (download disabled while there are errors) */
export function ExportReviewModal({
  open, onClose, title, layout, file, extra,
}: {
  open: boolean; onClose: () => void; title: string; layout: FileLayout | undefined; file: (RenderedFile & { ok: boolean }) | null; extra?: React.ReactNode;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={title}
      footer={
        <>
          <Link href="/settings/file-formats" className="mr-auto inline-flex h-10 items-center gap-1.5 rounded-[var(--radius-ctl)] px-3 text-sm text-ink-soft hover:bg-paper hover:text-ink">
            <FileCog className="size-4" /> ปรับรูปแบบไฟล์
          </Link>
          <Button variant="secondary" onClick={onClose}>
            ปิด
          </Button>
          <Button icon={<Download className="size-4" />} disabled={!file?.ok} onClick={() => file && downloadBuilt(file)}>
            ดาวน์โหลดไฟล์
          </Button>
        </>
      }
    >
      {layout && (
        <div className="mb-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <b>{layout.label}</b>
            <StatusBadge status={layout.status} />
          </div>
          {layout.description && <p className="mt-1 text-ink-soft">{layout.description}</p>}
          {layout.status === "unverified" && <p className="mt-1 text-amber-ink">รูปแบบนี้ยังไม่ได้ยืนยันกับธนาคาร — ส่งไฟล์ตัวอย่างให้เจ้าหน้าที่ธนาคารตรวจก่อนใช้ครั้งแรก หรือปรับแม่แบบให้ตรงสเปกที่ธนาคารให้มา</p>}
        </div>
      )}
      {extra}
      {file && (
        <div className="space-y-3">
          <IssueList issues={file.issues} />
          <FilePreview file={file} layout={layout!} />
        </div>
      )}
    </Modal>
  );
}
