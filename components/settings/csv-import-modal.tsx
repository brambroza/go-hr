"use client";

import { useRef, useState, type ReactNode } from "react";
import { CheckCircle2, Download, FileUp, Upload, XCircle } from "lucide-react";
import { Button, Modal, Stat, clsx, toast } from "@/components/ui";
import { downloadCsv, parseCsv } from "@/lib/csv";
import type { ActionResult } from "@/lib/auth";

export interface PreviewRow {
  line: number;
  code: string;
  errors: string[];
  cells: ReactNode[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  intro: ReactNode;
  templateName: string;
  template: string[][];
  headers: string[];
  /** parse the CSV in the browser for the preview (the server parses again) */
  preview: (table: string[][]) => Promise<{ rows: PreviewRow[]; missing: string[] }>;
  submit: (table: string[][]) => Promise<ActionResult<{ saved: number; failed: { line: number; code: string; error: string }[] }>>;
  onDone: () => void;
}

export function CsvImportModal({ open, onClose, title, intro, templateName, template, headers, preview, submit, onDone }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [table, setTable] = useState<string[][] | null>(null);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [missing, setMissing] = useState<string[]>([]);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ saved: number; failed: { line: number; code: string; error: string }[] } | null>(null);

  const reset = () => {
    setTable(null);
    setRows([]);
    setMissing([]);
    setResult(null);
    setFileName("");
  };
  const close = () => {
    reset();
    onClose();
  };

  async function onFile(f?: File) {
    if (!f) return;
    if (!/\.(csv|txt)$/i.test(f.name)) return toast.error("รองรับไฟล์ .csv (ใน Excel เลือก “บันทึกเป็น” → CSV UTF-8)");
    if (f.size > 3 * 1024 * 1024) return toast.error("ไฟล์ใหญ่เกิน 3 MB แบ่งเป็นหลายไฟล์");
    setBusy(true);
    try {
      const t = parseCsv(await f.text());
      if (t.length < 2) throw new Error("ไม่พบข้อมูลในไฟล์ (ต้องมีหัวตารางและข้อมูลอย่างน้อย 1 แถว)");
      const p = await preview(t);
      setTable(t);
      setRows(p.rows);
      setMissing(p.missing);
      setFileName(f.name);
      setResult(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  const bad = rows.filter((r) => r.errors.length).length;
  const ok = rows.length - bad;

  async function run() {
    if (!table) return;
    setBusy(true);
    const r = await submit(table);
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    setResult(r.data!);
    toast.ok(`นำเข้าแล้ว ${r.data!.saved.toLocaleString()} รายการ`);
    onDone();
  }

  return (
    <Modal
      open={open}
      onClose={close}
      size="xl"
      title={title}
      footer={
        result ? (
          <Button onClick={close}>ปิด</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={close}>ยกเลิก</Button>
            {table && <Button variant="secondary" onClick={reset}>เลือกไฟล์ใหม่</Button>}
            {table && (
              <Button icon={<Upload className="size-4" />} loading={busy} disabled={!ok || missing.length > 0} onClick={run}>
                นำเข้า {ok.toLocaleString()} รายการ
              </Button>
            )}
          </>
        )
      }
    >
      {result ? (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Stat label="บันทึกแล้ว" value={result.saved} tone="jade" />
            <Stat label="ไม่สำเร็จ" value={result.failed.length} tone={result.failed.length ? "rust" : undefined} />
          </div>
          {result.failed.length > 0 && (
            <ul className="thin-scroll max-h-64 divide-y divide-line-soft overflow-auto rounded-[var(--radius-ctl)] border border-line text-sm">
              {result.failed.map((f, i) => (
                <li key={i} className="flex gap-3 px-3 py-2"><span className="num w-14 text-ink-mute">แถว {f.line}</span><span className="w-20 font-medium">{f.code}</span><span className="text-rust">{f.error}</span></li>
              ))}
            </ul>
          )}
        </div>
      ) : !table ? (
        <div className="flex flex-col gap-4">
          <div className="text-[15px] leading-relaxed text-ink-soft">{intro}</div>
          <div className="flex flex-col items-center gap-3 rounded-[var(--radius-panel)] border-2 border-dashed border-line px-6 py-10 text-center"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); onFile(e.dataTransfer.files[0]); }}>
            <FileUp className="size-9 text-jade-500" />
            <p className="font-medium">ลากไฟล์ CSV มาวางที่นี่ หรือ</p>
            <input ref={input} type="file" accept=".csv,text/csv" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => onFile(e.target.files?.[0])} />
            <div className="flex flex-wrap justify-center gap-2">
              <Button icon={<Upload className="size-4" />} loading={busy} onClick={() => input.current?.click()}>เลือกไฟล์</Button>
              <Button variant="secondary" icon={<Download className="size-4" />} onClick={() => downloadCsv(templateName, template)}>ดาวน์โหลดแม่แบบ</Button>
            </div>
            <p className="text-xs text-ink-mute">ไฟล์ .csv (UTF-8) · ตัวเลขใส่จุลภาคได้ · ปีใส่ พ.ศ. หรือ ค.ศ. ก็ได้</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-ink-soft">{fileName} · ทั้งหมด {rows.length.toLocaleString()} แถว · <span className="text-jade-700">พร้อมนำเข้า {ok.toLocaleString()}</span>{bad > 0 && <span className="text-rust"> · มีปัญหา {bad.toLocaleString()} (จะถูกข้าม)</span>}</p>
          {missing.length > 0 && <p className="rounded-md bg-rust-soft px-3 py-2 text-sm text-rust">ไม่พบคอลัมน์ที่จำเป็น: {missing.join(", ")} — ใช้หัวตารางตามแม่แบบ</p>}
          <div className="thin-scroll max-h-[50vh] overflow-auto rounded-[var(--radius-ctl)] border border-line">
            <table className="w-full text-[14px]">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-line text-left text-[13px] text-ink-soft">
                  <th className="px-3 py-2 font-medium">แถว</th>
                  <th className="px-3 py-2 font-medium">ผล</th>
                  {headers.map((h) => <th key={h} className="whitespace-nowrap px-3 py-2 font-medium">{h}</th>)}
                  <th className="px-3 py-2 font-medium">ปัญหา</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 500).map((r) => (
                  <tr key={r.line} className={clsx("border-b border-line-soft align-top", r.errors.length && "bg-rust-soft/40")}>
                    <td className="num px-3 py-2 text-ink-mute">{r.line}</td>
                    <td className="px-3 py-2">{r.errors.length ? <XCircle className="size-4 text-rust" aria-label="มีปัญหา" /> : <CheckCircle2 className="size-4 text-jade-600" aria-label="ถูกต้อง" />}</td>
                    {r.cells.map((c, i) => <td key={i} className="num whitespace-nowrap px-3 py-2">{c}</td>)}
                    <td className="px-3 py-2 text-[13px] text-rust">{r.errors.join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 500 && <p className="p-3 text-center text-sm text-ink-mute">แสดง 500 แถวแรก</p>}
          </div>
        </div>
      )}
    </Modal>
  );
}
