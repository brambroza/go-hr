"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, FileUp, RotateCcw, Upload } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useCan } from "@/components/app/me-context";
import { EmployeePicker } from "@/components/crud/employee-picker";
import { Badge, Button, Checkbox, Empty, PageHeader, Panel, Stat, Tabs, clsx, toast } from "@/components/ui";
import { thDate, thDateTime } from "@/lib/format";
import { parseCsv } from "@/lib/csv";
import { parseCsvLogs, parseZkAttlog, bkkDate, type ParsedLog } from "@/lib/attendance/parse";
import { importLogsAction, recalcAction } from "@/lib/attendance/actions";
import { DIRECTION_LABEL } from "@/components/attendance/bits";
import { empName, useEmployees } from "@/components/attendance/lookups";

type Format = "csv" | "zk";

export default function ImportLogsPage() {
  const can = useCan();
  const { list: emps } = useEmployees();
  const fileRef = useRef<HTMLInputElement>(null);
  const [format, setFormat] = useState<Format>("csv");
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedLog[] | null>(null);
  const [known, setKnown] = useState<Map<string, number>>(new Map());
  const [manual, setManual] = useState<Record<string, number | null>>({});
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ inserted: number; skipped: number; from: string | null; to: string | null } | null>(null);
  const [recalced, setRecalced] = useState(false);

  const empOptions = useMemo(() => emps.map((e) => ({ value: e.id, label: empName(e), raw: e })), [emps]);
  const empById = useMemo(() => new Map(emps.map((e) => [e.id, e])), [emps]);

  async function onFile(file: File) {
    setResult(null);
    setRecalced(false);
    setFileName(file.name);
    const text = await file.text();
    const fmt: Format = /\.(dat|txt)$/i.test(file.name) && !text.includes(",") ? "zk" : format;
    setFormat(fmt);
    const rows = fmt === "zk" ? parseZkAttlog(text) : parseCsvLogs(parseCsv(text));
    if (!rows.length) {
      setParsed(null);
      return toast.error("ไม่พบข้อมูลในไฟล์");
    }
    // resolve user ids: employee code, then saved device user maps
    const users = [...new Set(rows.filter((r) => !r.error).map((r) => r.user))];
    const sb = supabaseBrowser();
    const map = new Map<string, number>();
    const byCode = new Map(emps.map((e) => [e.code, e.id]));
    for (const u of users) if (byCode.has(u)) map.set(u, byCode.get(u)!);
    const rest = users.filter((u) => !map.has(u));
    for (let i = 0; i < rest.length; i += 200) {
      const { data } = await sb.from("device_user_maps").select("device_user_id, employee_id").in("device_user_id", rest.slice(i, i + 200));
      for (const m of (data ?? []) as { device_user_id: string; employee_id: number }[]) if (!map.has(m.device_user_id)) map.set(m.device_user_id, m.employee_id);
    }
    // ZKTeco numeric ids often equal the numeric part of the employee code (7 → E0007)
    for (const u of users.filter((x) => !map.has(x) && /^\d+$/.test(x))) {
      const hits = emps.filter((e) => e.code.replace(/\D/g, "").replace(/^0+/, "") === u.replace(/^0+/, ""));
      if (hits.length === 1) map.set(u, hits[0].id);
    }
    setKnown(map);
    setManual({});
    setParsed(rows);
  }

  const unknownUsers = useMemo(() => {
    if (!parsed) return [];
    const c = new Map<string, number>();
    for (const r of parsed) if (!r.error && !known.has(r.user)) c.set(r.user, (c.get(r.user) ?? 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1]);
  }, [parsed, known]);

  const resolved = (u: string) => known.get(u) ?? manual[u] ?? null;
  const ready = (parsed ?? []).filter((r) => !r.error && resolved(r.user));
  const invalid = (parsed ?? []).filter((r) => r.error);
  const skipped = (parsed ?? []).filter((r) => !r.error && !resolved(r.user));
  const dates = ready.map((r) => bkkDate(r.time!)).sort();

  async function doImport() {
    if (!ready.length) return toast.error("ไม่มีรายการที่พร้อมนำเข้า");
    setBusy(true);
    const mappings = remember ? Object.entries(manual).filter(([, v]) => v).map(([k, v]) => ({ device_user_id: k, employee_id: v! })) : [];
    const r = await importLogsAction({ rows: ready.map((x) => ({ employee_id: resolved(x.user)!, time: x.time!, direction: x.direction })), fileName: fileName ?? undefined, mappings });
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    setResult(r.data!);
    toast.ok(`นำเข้าแล้ว ${r.data!.inserted.toLocaleString()} รายการ`);
  }

  async function doRecalc() {
    if (!result?.from || !result.to) return;
    setBusy(true);
    const ids = [...new Set(ready.map((x) => resolved(x.user)!))];
    const r = await recalcAction({ from: result.from, to: result.to, employeeIds: ids });
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    setRecalced(true);
    toast.ok(`คำนวณใหม่แล้ว ${r.data!.days.toLocaleString()} วัน`);
  }

  function reset() {
    setParsed(null);
    setResult(null);
    setFileName(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  if (!can("attendance", "create")) return <Empty title="คุณไม่มีสิทธิ์นำเข้าเวลา" />;

  return (
    <div>
      <PageHeader title="นำเข้าเวลา" description="นำเข้าเวลาสแกนจากไฟล์ CSV หรือไฟล์ attlog ของเครื่องสแกน ZKTeco — นำเข้าซ้ำได้ ระบบจะข้ามเวลาที่มีอยู่แล้ว" />

      {!parsed ? (
        <Panel>
          <Tabs className="mb-4" value={format} onChange={setFormat} tabs={[{ value: "csv", label: "ไฟล์ CSV" }, { value: "zk", label: "ZKTeco attlog (.dat / .txt)" }]} />
          <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files[0];
                if (f) onFile(f);
              }}
              className="flex min-h-56 flex-col items-center justify-center gap-3 rounded-[var(--radius-panel)] border-2 border-dashed border-line bg-paper/50 p-8 text-center hover:border-jade-400 hover:bg-jade-50"
            >
              <FileUp className="size-10 text-jade-500" />
              <span className="text-lg font-medium">ลากไฟล์มาวาง หรือคลิกเพื่อเลือกไฟล์</span>
              <span className="text-sm text-ink-soft">{format === "csv" ? ".csv (UTF-8)" : ".dat / .txt จากเมนู USB ของเครื่องสแกน"}</span>
            </button>
            <input ref={fileRef} type="file" accept={format === "csv" ? ".csv,text/csv" : ".dat,.txt,text/plain"} className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
            <div className="text-sm text-ink-soft">
              <h3 className="mb-2 font-semibold text-ink">รูปแบบไฟล์</h3>
              {format === "csv" ? (
                <>
                  <p>คอลัมน์: รหัสพนักงาน, วันเวลา, ประเภท (ไม่บังคับ)</p>
                  <pre className="mt-2 rounded-md bg-paper p-3 font-mono text-xs text-ink">{`employee_code,datetime,direction
E0007,2026-10-07 07:55:00,in
E0007,2026-10-07 17:03:00,out
E0012,07/10/2569 08:01,`}</pre>
                  <p className="mt-2">ประเภท: in / out / break_out / break_in หรือเว้นว่าง (ระบบจัดให้อัตโนมัติ) · ปี พ.ศ. ใช้ได้</p>
                </>
              ) : (
                <>
                  <p>ไฟล์ attlog แยกคอลัมน์ด้วย Tab: รหัสบนเครื่อง, วันเวลา, วิธียืนยัน, สถานะ</p>
                  <pre className="mt-2 rounded-md bg-paper p-3 font-mono text-xs text-ink">{`      7	2026-10-07 07:55:12	1	0	1	0
     12	2026-10-07 17:01:02	1	1	1	0`}</pre>
                  <p className="mt-2">รหัสบนเครื่องที่ไม่ตรงกับรหัสพนักงาน จะให้จับคู่ก่อนนำเข้า และจำไว้ใช้ครั้งต่อไป</p>
                </>
              )}
            </div>
          </div>
        </Panel>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="รายการในไฟล์" value={parsed.length.toLocaleString()} sub={fileName ?? undefined} />
            <Stat label="พร้อมนำเข้า" value={ready.length.toLocaleString()} sub={dates.length ? `${thDate(dates[0])} – ${thDate(dates[dates.length - 1])}` : undefined} />
            <Stat label="ยังไม่จับคู่พนักงาน" value={skipped.length.toLocaleString()} tone={skipped.length ? "amber" : undefined} />
            <Stat label="รูปแบบไม่ถูกต้อง" value={invalid.length.toLocaleString()} tone={invalid.length ? "rust" : undefined} />
          </div>

          {result ? (
            <Panel>
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <CheckCircle2 className="size-12 text-jade-600" />
                <p className="text-lg font-semibold">นำเข้าแล้ว {result.inserted.toLocaleString()} รายการ</p>
                <p className="text-sm text-ink-soft">
                  {result.skipped > 0 && <>ข้าม {result.skipped.toLocaleString()} รายการที่มีอยู่แล้ว · </>}
                  {result.from && <>ช่วงวันที่ {thDate(result.from)} – {thDate(result.to)}</>}
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  {can("attendance", "edit") && result.from && (
                    recalced ? (
                      <Link href={`/attendance?from=${result.from}&to=${result.to}`} className="inline-flex h-10 items-center rounded-[var(--radius-ctl)] bg-jade-600 px-4 text-white hover:bg-jade-700">ดูผลการคำนวณ</Link>
                    ) : (
                      <Button icon={<RotateCcw className="size-4" />} loading={busy} onClick={doRecalc}>คำนวณเวลาช่วงนี้ใหม่</Button>
                    )
                  )}
                  <Button variant="secondary" onClick={reset}>นำเข้าไฟล์อื่น</Button>
                </div>
              </div>
            </Panel>
          ) : (
            <>
              {unknownUsers.length > 0 && (
                <Panel title={`จับคู่รหัสบนเครื่องกับพนักงาน (${unknownUsers.length} รหัส)`} actions={<Checkbox label="จำการจับคู่ไว้ใช้ครั้งต่อไป" checked={remember} onChange={setRemember} />}>
                  <div className="grid gap-2 md:grid-cols-2">
                    {unknownUsers.map(([u, n]) => (
                      <div key={u} className="grid grid-cols-[7rem_1fr] items-center gap-2">
                        <div><span className="font-mono font-medium">{u}</span> <span className="text-xs text-ink-mute">({n} ครั้ง)</span></div>
                        <EmployeePicker value={manual[u] ?? null} onChange={(v) => setManual({ ...manual, [u]: v })} options={empOptions} placeholder="เลือกพนักงาน (หรือข้าม)" />
                      </div>
                    ))}
                  </div>
                </Panel>
              )}
              <Panel
                bodyClass="p-0"
                title="ตัวอย่างข้อมูล"
                actions={
                  <>
                    <Button variant="secondary" onClick={reset}>เลือกไฟล์ใหม่</Button>
                    <Button icon={<Upload className="size-4" />} loading={busy} onClick={doImport} disabled={!ready.length}>นำเข้า {ready.length.toLocaleString()} รายการ</Button>
                  </>
                }
              >
                <div className="thin-scroll max-h-[28rem] overflow-auto">
                  <table className="w-full text-[14px]">
                    <thead className="sticky top-0 bg-white">
                      <tr className="border-b border-line text-left text-[13px] text-ink-soft">
                        <th className="px-3 py-2 font-medium">บรรทัด</th>
                        <th className="px-3 py-2 font-medium">รหัสในไฟล์</th>
                        <th className="px-3 py-2 font-medium">พนักงาน</th>
                        <th className="px-3 py-2 font-medium">วันเวลา</th>
                        <th className="px-3 py-2 font-medium">ประเภท</th>
                        <th className="px-3 py-2 font-medium">สถานะ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsed.slice(0, 500).map((r) => {
                        const id = r.error ? null : resolved(r.user);
                        return (
                          <tr key={r.line} className={clsx("border-b border-line-soft", r.error && "bg-rust-soft/50")}>
                            <td className="num px-3 py-1.5 text-ink-mute">{r.line}</td>
                            <td className="px-3 py-1.5 font-mono">{r.user || "-"}</td>
                            <td className="px-3 py-1.5">{id ? `${empById.get(id)?.code ?? ""} ${empName(empById.get(id))}` : <span className="text-ink-mute">-</span>}</td>
                            <td className="num px-3 py-1.5">{r.time ? thDateTime(r.time) : <span className="font-mono text-xs">{r.raw.slice(0, 40)}</span>}</td>
                            <td className="px-3 py-1.5">{DIRECTION_LABEL[r.direction]}</td>
                            <td className="px-3 py-1.5">{r.error ? <Badge color="red">{r.error}</Badge> : id ? <Badge color="green">พร้อม</Badge> : <Badge color="amber">ยังไม่จับคู่ — จะข้าม</Badge>}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {parsed.length > 500 && <p className="px-3 py-2 text-sm text-ink-soft">แสดง 500 จาก {parsed.length.toLocaleString()} รายการ</p>}
                </div>
              </Panel>
            </>
          )}
        </div>
      )}
    </div>
  );
}
