"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, CheckCircle2, Download, FileUp, Upload, XCircle } from "lucide-react";
import { useCan } from "@/components/app/me-context";
import { Badge, Button, Empty, PageHeader, Panel, Stat, Tabs, clsx, toast } from "@/components/ui";
import { downloadCsv, parseCsv } from "@/lib/csv";
import { thDate } from "@/lib/format";
import { IMPORT_COLUMNS, mapHeaders, templateRows, validateRows, type ImportKey, type ParsedRow, type RawRow } from "@/lib/employees/import";
import { importEmployeesAction, importRefsAction, type ImportResult } from "./actions";

type Filter = "all" | "error" | "ok";

export default function ImportEmployeesPage() {
  const can = useCan();
  const input = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedRow[] | null>(null);
  const [unmapped, setUnmapped] = useState<string[]>([]);
  const [missingCols, setMissingCols] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [drag, setDrag] = useState(false);

  async function onFile(f: File | undefined) {
    if (!f) return;
    if (!/\.(csv|txt)$/i.test(f.name)) return toast.error("รองรับไฟล์ .csv (ใน Excel เลือก “บันทึกเป็น” → CSV UTF-8)");
    if (f.size > 5 * 1024 * 1024) return toast.error("ไฟล์ใหญ่เกิน 5 MB");
    setBusy(true);
    setResult(null);
    try {
      const text = await f.text();
      const table = parseCsv(text);
      if (table.length < 2) throw new Error("ไม่พบข้อมูลในไฟล์ (ต้องมีหัวตารางและข้อมูลอย่างน้อย 1 แถว)");
      const keys = mapHeaders(table[0]);
      setUnmapped(table[0].filter((_, i) => !keys[i]).filter((h) => h.trim()));
      const req = IMPORT_COLUMNS.filter((c) => "required" in c && c.required && !keys.includes(c.key)).map((c) => c.label);
      setMissingCols(req);
      const raw: RawRow[] = table.slice(1).map((r) => {
        const o: RawRow = {};
        keys.forEach((k, i) => {
          if (k) o[k as ImportKey] = r[i] ?? "";
        });
        return o;
      });
      const refs = await importRefsAction();
      if (!refs.ok) throw new Error(refs.error);
      setParsed(validateRows(raw, refs.data!));
      setFileName(f.name);
      setFilter("all");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  const stats = useMemo(() => {
    const p = parsed ?? [];
    const bad = p.filter((r) => r.errors.length).length;
    return { total: p.length, bad, ok: p.length - bad, update: p.filter((r) => !r.errors.length && r.isUpdate).length, warn: p.filter((r) => !r.errors.length && r.warnings.length).length };
  }, [parsed]);
  const shown = (parsed ?? []).filter((r) => filter === "all" || (filter === "error" ? r.errors.length : !r.errors.length));

  async function run() {
    if (!parsed) return;
    const good = parsed.filter((r) => !r.errors.length).map((r) => r.raw);
    setBusy(true);
    const r = await importEmployeesAction(good);
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    setResult(r.data!);
    toast.ok(`นำเข้าแล้ว: เพิ่ม ${r.data!.created} คน · ปรับปรุง ${r.data!.updated} คน`);
  }

  function reset() {
    setParsed(null);
    setFileName(null);
    setResult(null);
  }

  if (!can("employee", "create"))
    return <Panel><Empty title="คุณไม่มีสิทธิ์นำเข้าข้อมูลพนักงาน" description="ต้องมีสิทธิ์ “เพิ่ม” ในเมนูข้อมูลพนักงาน" /></Panel>;

  return (
    <div>
      <Link href="/employees" className="mb-3 inline-flex items-center gap-1 text-sm text-ink-soft hover:text-jade-700"><ArrowLeft className="size-4" /> รายชื่อพนักงาน</Link>
      <PageHeader
        title="นำเข้าพนักงานจากไฟล์"
        description="ถ้ารหัสพนักงานมีอยู่แล้ว ระบบจะปรับปรุงข้อมูลเฉพาะคอลัมน์ที่กรอก ถ้ายังไม่มีจะเพิ่มพนักงานใหม่"
        actions={<Button variant="secondary" icon={<Download className="size-4" />} onClick={() => downloadCsv("แม่แบบนำเข้าพนักงาน.csv", templateRows())}>ดาวน์โหลดแม่แบบ</Button>}
      />

      {result ? (
        <Panel title="ผลการนำเข้า">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="เพิ่มพนักงานใหม่" value={result.created} />
            <Stat label="ปรับปรุงข้อมูล" value={result.updated} />
            <Stat label="ไม่สำเร็จ" value={result.failed.length + stats.bad} tone={result.failed.length + stats.bad ? "rust" : undefined} />
            <Stat label="ทั้งหมดในไฟล์" value={stats.total} />
          </div>
          {result.privateSkipped && <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-ink">ข้ามข้อมูลเงินเดือน/บัญชี/เลขบัตร เพราะคุณไม่มีสิทธิ์แก้ไขข้อมูลอ่อนไหว</p>}
          {result.failed.length > 0 && (
            <ul className="mt-4 divide-y divide-line-soft rounded-[var(--radius-ctl)] border border-line text-sm">
              {result.failed.map((f, i) => (
                <li key={i} className="flex gap-3 px-3 py-2"><span className="num w-16 text-ink-mute">แถว {f.line}</span><span className="w-20 font-medium">{f.code}</span><span className="text-rust">{f.error}</span></li>
              ))}
            </ul>
          )}
          <div className="mt-4 flex gap-2">
            <Link href="/employees" className="inline-flex h-10 items-center rounded-[var(--radius-ctl)] bg-jade-600 px-4 font-medium text-white hover:bg-jade-700">ไปหน้ารายชื่อพนักงาน</Link>
            <Button variant="secondary" onClick={reset}>นำเข้าไฟล์อื่น</Button>
          </div>
        </Panel>
      ) : !parsed ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <Panel>
            <div
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); onFile(e.dataTransfer.files[0]); }}
              className={clsx("flex flex-col items-center justify-center gap-3 rounded-[var(--radius-panel)] border-2 border-dashed px-6 py-14 text-center", drag ? "border-jade-500 bg-jade-50" : "border-line")}
            >
              <FileUp className="size-10 text-jade-500" />
              <p className="font-medium">ลากไฟล์ CSV มาวางที่นี่</p>
              <p className="text-sm text-ink-soft">หรือ</p>
              <input ref={input} type="file" accept=".csv,text/csv" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => onFile(e.target.files?.[0])} />
              <Button icon={<Upload className="size-4" />} loading={busy} onClick={() => input.current?.click()}>เลือกไฟล์</Button>
              <p className="text-xs text-ink-mute">ไฟล์ .csv (UTF-8) ไม่เกิน 5 MB / 5,000 แถว</p>
            </div>
          </Panel>
          <Panel title="คอลัมน์ที่รองรับ">
            <ul className="grid grid-cols-1 gap-1 text-sm">
              {IMPORT_COLUMNS.map((c) => (
                <li key={c.key} className="flex justify-between gap-2">
                  <span>{c.label}{"required" in c && c.required && <span className="text-rust"> *</span>}</span>
                  <span className="truncate text-ink-mute">{c.example}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-ink-soft">วันที่ใช้ วว/ดด/ปปปป เป็น พ.ศ. หรือ ค.ศ. ก็ได้ หรือ ปปปป-ดด-วว · เพศ ประเภท สถานะ พิมพ์เป็นภาษาไทยได้ · ใช้รหัสสาขา/หน่วยงาน/ตำแหน่งตามที่ตั้งไว้ในระบบ</p>
          </Panel>
        </div>
      ) : (
        <Panel
          bodyClass="p-0"
          title={<span>ตรวจสอบข้อมูล <span className="text-sm font-normal text-ink-soft">{fileName}</span></span>}
          actions={
            <>
              <Button variant="secondary" onClick={reset}>เลือกไฟล์ใหม่</Button>
              <Button icon={<Upload className="size-4" />} loading={busy} disabled={!stats.ok || missingCols.length > 0} onClick={run}>
                นำเข้า {stats.ok} แถว
              </Button>
            </>
          }
        >
          <div className="grid grid-cols-2 gap-3 border-b border-line-soft p-4 sm:grid-cols-4">
            <Stat label="ทั้งหมด" value={stats.total} />
            <Stat label="พร้อมนำเข้า" value={stats.ok} sub={stats.update ? `เป็นการปรับปรุง ${stats.update} คน` : undefined} />
            <Stat label="มีข้อผิดพลาด" value={stats.bad} tone={stats.bad ? "rust" : undefined} sub={stats.bad ? "แถวเหล่านี้จะไม่ถูกนำเข้า" : undefined} />
            <Stat label="มีคำเตือน" value={stats.warn} tone={stats.warn ? "amber" : undefined} />
          </div>
          {(missingCols.length > 0 || unmapped.length > 0) && (
            <div className="flex flex-col gap-1 border-b border-line-soft px-4 py-3 text-sm">
              {missingCols.length > 0 && <p className="text-rust">ไม่พบคอลัมน์ที่จำเป็น: {missingCols.join(", ")} — ใช้หัวตารางตามแม่แบบ</p>}
              {unmapped.length > 0 && <p className="text-amber-ink">ไม่รู้จักคอลัมน์ (จะถูกข้าม): {unmapped.join(", ")}</p>}
            </div>
          )}
          <Tabs<Filter>
            className="px-3"
            value={filter}
            onChange={setFilter}
            tabs={[
              { value: "all", label: "ทั้งหมด", count: stats.total },
              { value: "error", label: "ข้อผิดพลาด", count: stats.bad },
              { value: "ok", label: "พร้อมนำเข้า", count: stats.ok },
            ]}
          />
          {shown.length === 0 ? (
            <Empty title="ไม่มีแถวในหมวดนี้" />
          ) : (
            <div className="thin-scroll max-h-[60vh] overflow-auto">
              <table className="w-full text-[14px]">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-line text-left text-[13px] text-ink-soft">
                    <th className="px-3 py-2 font-medium">แถว</th>
                    <th className="px-3 py-2 font-medium">ผล</th>
                    <th className="px-3 py-2 font-medium">รหัส</th>
                    <th className="px-3 py-2 font-medium">ชื่อ-นามสกุล</th>
                    <th className="px-3 py-2 font-medium">หน่วยงาน / ตำแหน่ง</th>
                    <th className="px-3 py-2 font-medium">วันเริ่มงาน</th>
                    <th className="px-3 py-2 font-medium">ปัญหา</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.slice(0, 500).map((r) => (
                    <tr key={r.line} className={clsx("border-b border-line-soft align-top", r.errors.length && "bg-rust-soft/40")}>
                      <td className="num px-3 py-2 text-ink-mute">{r.line}</td>
                      <td className="px-3 py-2">
                        {r.errors.length ? (
                          <XCircle className="size-4 text-rust" aria-label="ผิดพลาด" />
                        ) : r.warnings.length ? (
                          <AlertTriangle className="size-4 text-amber-ink" aria-label="มีคำเตือน" />
                        ) : (
                          <CheckCircle2 className="size-4 text-jade-600" aria-label="ถูกต้อง" />
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">{r.raw.code}{!r.errors.length && r.isUpdate && <Badge color="blue" className="ml-1">ปรับปรุง</Badge>}</td>
                      <td className="whitespace-nowrap px-3 py-2">{r.raw.first_name || r.raw.last_name ? `${r.raw.prefix ?? ""}${r.raw.first_name ?? ""} ${r.raw.last_name ?? ""}` : <span className="text-ink-mute">(ไม่เปลี่ยนชื่อ)</span>}</td>
                      <td className="px-3 py-2 text-ink-soft">{[r.raw.org_unit_code, r.raw.position_code].filter(Boolean).join(" / ") || "-"}</td>
                      <td className="num whitespace-nowrap px-3 py-2">{r.employee.hire_date ? thDate(String(r.employee.hire_date)) : r.raw.hire_date || "-"}</td>
                      <td className="px-3 py-2 text-[13px]">
                        {r.errors.map((e) => <div key={e} className="text-rust">{e}</div>)}
                        {r.warnings.map((e) => <div key={e} className="text-amber-ink">{e}</div>)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {shown.length > 500 && <p className="p-3 text-center text-sm text-ink-mute">แสดง 500 แถวแรกจาก {shown.length}</p>}
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}
