"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Plus, Undo2, XCircle } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useCan } from "@/components/app/me-context";
import { EmployeePicker } from "@/components/crud/employee-picker";
import { Badge, Button, Checkbox, Empty, Field, Input, Modal, PageHeader, Panel, Select, Spinner, Textarea, clsx, toast } from "@/components/ui";
import { thDate, thTime } from "@/lib/format";
import { downloadCsv } from "@/lib/csv";
import { addManualLogAction, voidLogAction } from "@/lib/attendance/actions";
import { isoDate } from "@/lib/format";
import { plusDays } from "@/lib/attendance/schedule";
import { DIRECTION_LABEL, FilterBar, MiniField, SOURCE_LABEL, fromLocalInput, toLocalInput } from "@/components/attendance/bits";
import { empName, useAttLookups, useEmployees } from "@/components/attendance/lookups";
import { fetchAllRows } from "@/components/attendance/use-days";

type Log = {
  id: number; employee_id: number; log_time: string; direction: string; source: string; location_id: number | null; device_id: number | null;
  distance_m: number | null; wifi_ssid: string | null; note: string | null; is_void: boolean; void_reason: string | null; created_at: string;
};
const PAGE = 50;
const COLS = "id, employee_id, log_time, direction, source, location_id, device_id, distance_m, wifi_ssid, note, is_void, void_reason, created_at";

export default function TimeLogsPage() {
  const can = useCan();
  const canEdit = can("attendance", "edit");
  const sb = supabaseBrowser();
  const lk = useAttLookups();
  const { list: emps } = useEmployees();
  const today = isoDate();
  const [f, setF] = useState({ from: plusDays(today, -6), to: today, employee: null as number | null, source: "", showVoid: false });
  const [rows, setRows] = useState<Log[] | null>(null);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(0);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ employee: null as number | null, time: "", direction: "auto", note: "" });
  const [voiding, setVoiding] = useState<Log | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const empById = useMemo(() => new Map(emps.map((e) => [e.id, e])), [emps]);
  const locById = useMemo(() => new Map(lk.locations.map((l) => [l.id, l.name])), [lk.locations]);

  const query = useCallback(
    (withCount: boolean) => {
      let q = sb
        .from("time_logs")
        .select(COLS, withCount ? { count: "exact" } : undefined)
        .gte("log_time", new Date(`${f.from}T00:00:00+07:00`).toISOString())
        .lt("log_time", new Date(`${plusDays(f.to, 1)}T00:00:00+07:00`).toISOString());
      if (f.employee) q = q.eq("employee_id", f.employee);
      if (f.source) q = q.eq("source", f.source);
      if (!f.showVoid) q = q.eq("is_void", false);
      return q.order("log_time", { ascending: false }).order("id", { ascending: false });
    },
    [sb, f],
  );

  const load = useCallback(async () => {
    const { data, error, count } = await query(true).range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) toast.error(error.message);
    setRows((data as Log[]) ?? []);
    setCount(count ?? 0);
  }, [query, page]);
  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  async function exportCsv() {
    setBusy(true);
    const { rows: all, error } = await fetchAllRows<Log>(() => query(false));
    setBusy(false);
    if (error) return toast.error(error);
    const head = ["วันที่", "เวลา", "รหัส", "ชื่อ", "ประเภท", "ช่องทาง", "จุดลงเวลา", "ระยะห่าง (ม.)", "Wi-Fi", "หมายเหตุ", "ยกเลิก", "เหตุผลที่ยกเลิก"];
    downloadCsv(`time_logs_${f.from}_${f.to}.csv`, [
      head,
      ...all.map((l) => {
        const e = empById.get(l.employee_id);
        return [isoDate(new Date(l.log_time)), thTime(l.log_time), e?.code, empName(e), DIRECTION_LABEL[l.direction], SOURCE_LABEL[l.source] ?? l.source, locById.get(l.location_id ?? -1), l.distance_m != null ? Math.round(l.distance_m) : "", l.wifi_ssid, l.note, l.is_void ? "ใช่" : "", l.void_reason];
      }),
    ]);
  }

  async function save() {
    if (!form.employee || !form.time) return toast.error("กรุณาเลือกพนักงานและระบุวันเวลา");
    setBusy(true);
    const r = await addManualLogAction({ employee_id: form.employee, log_time: fromLocalInput(form.time), direction: form.direction, note: form.note });
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    toast.ok(r.message ?? "บันทึกแล้ว");
    setAdding(false);
    load();
  }

  async function doVoid(log: Log, restore: boolean) {
    setBusy(true);
    const r = await voidLogAction({ id: log.id, reason, restore });
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    toast.ok(r.message ?? "บันทึกแล้ว");
    setVoiding(null);
    load();
  }

  const empOptions = emps.map((e) => ({ value: e.id, label: empName(e), raw: e }));
  const pages = Math.max(1, Math.ceil(count / PAGE));
  const set = (patch: Partial<typeof f>) => {
    setRows(null);
    setF({ ...f, ...patch });
    setPage(0);
  };

  return (
    <div>
      <PageHeader
        title="บันทึกเวลา (Raw)"
        description="เวลาที่สแกนจากทุกช่องทางก่อนนำไปคำนวณ แก้ไขไม่ได้ — ใช้ “ยกเลิก” แล้วเพิ่มเวลาที่ถูกต้องแทน"
        actions={
          <>
            {can("attendance", "export") && <Button variant="secondary" icon={<Download className="size-4" />} loading={busy} onClick={exportCsv}>ส่งออก CSV</Button>}
            {canEdit && (
              <Button icon={<Plus className="size-4" />} onClick={() => { setForm({ employee: f.employee, time: toLocalInput(new Date()), direction: "auto", note: "" }); setAdding(true); }}>
                เพิ่มเวลา
              </Button>
            )}
          </>
        }
      />
      <FilterBar>
        <MiniField label="ตั้งแต่วันที่"><Input type="date" className="h-9 w-40 text-sm" value={f.from} onChange={(e) => e.target.value && set({ from: e.target.value })} /></MiniField>
        <MiniField label="ถึงวันที่"><Input type="date" className="h-9 w-40 text-sm" value={f.to} min={f.from} onChange={(e) => e.target.value && set({ to: e.target.value })} /></MiniField>
        <MiniField label="พนักงาน" className="w-64"><EmployeePicker value={f.employee} onChange={(v) => set({ employee: v })} options={empOptions} placeholder="ทุกคน" /></MiniField>
        <MiniField label="ช่องทาง">
          <Select className="h-9 w-40 text-sm" value={f.source} onChange={(e) => set({ source: e.target.value })} placeholder="ทั้งหมด">
            {Object.entries(SOURCE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </MiniField>
        <div className="pb-2"><Checkbox label="แสดงรายการที่ยกเลิก" checked={f.showVoid} onChange={(v) => set({ showVoid: v })} /></div>
      </FilterBar>

      <Panel
        bodyClass="p-0"
        footer={
          count > PAGE ? (
            <div className="flex items-center justify-between text-sm text-ink-soft">
              <span className="num">{page * PAGE + 1}–{Math.min(count, (page + 1) * PAGE)} จาก {count.toLocaleString()} รายการ</span>
              <div className="flex gap-1">
                <Button size="sm" variant="secondary" disabled={page === 0} onClick={() => { setRows(null); setPage(page - 1); }} aria-label="หน้าก่อนหน้า"><ChevronLeft className="size-4" /></Button>
                <Button size="sm" variant="secondary" disabled={page + 1 >= pages} onClick={() => { setRows(null); setPage(page + 1); }} aria-label="หน้าถัดไป"><ChevronRight className="size-4" /></Button>
              </div>
            </div>
          ) : count ? <span className="num text-sm text-ink-soft">{count.toLocaleString()} รายการ</span> : null
        }
      >
        <div className="thin-scroll overflow-x-auto">
          <table className="w-full text-[14px]">
            <thead>
              <tr className="border-b border-line bg-paper/60 text-left text-[13px] text-ink-soft">
                <th className="px-3 py-2 font-medium">วันเวลา</th>
                <th className="px-3 py-2 font-medium">พนักงาน</th>
                <th className="px-3 py-2 font-medium">ประเภท</th>
                <th className="px-3 py-2 font-medium">ช่องทาง</th>
                <th className="px-3 py-2 font-medium">จุดลงเวลา</th>
                <th className="px-3 py-2 font-medium">หมายเหตุ</th>
                {canEdit && <th className="w-px px-3 py-2" />}
              </tr>
            </thead>
            <tbody>
              {rows === null ? (
                <tr><td colSpan={7} className="py-12"><Spinner className="mx-auto" /></td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={7}><Empty title="ไม่พบเวลาที่สแกนในช่วงนี้" /></td></tr>
              ) : (
                rows.map((l) => {
                  const e = empById.get(l.employee_id);
                  return (
                    <tr key={l.id} className={clsx("border-b border-line-soft last:border-0", l.is_void && "bg-paper/60 text-ink-mute")}>
                      <td className={clsx("num whitespace-nowrap px-3 py-2", l.is_void && "line-through")}>
                        <span className="font-medium">{thTime(l.log_time)}</span> <span className="text-ink-soft">{thDate(l.log_time)}</span>
                      </td>
                      <td className="px-3 py-2">
                        <div>{empName(e)}</div>
                        <div className="text-xs text-ink-mute">{e?.code ?? `#${l.employee_id}`}</div>
                      </td>
                      <td className="px-3 py-2">{DIRECTION_LABEL[l.direction] ?? l.direction}</td>
                      <td className="px-3 py-2"><Badge color={l.source === "manual" || l.source === "import" ? "amber" : "blue"}>{SOURCE_LABEL[l.source] ?? l.source}</Badge></td>
                      <td className="px-3 py-2 text-ink-soft">
                        {locById.get(l.location_id ?? -1) ?? "-"}
                        {l.distance_m != null && <span className="num text-xs"> · {Math.round(l.distance_m)} ม.</span>}
                      </td>
                      <td className="max-w-xs px-3 py-2 text-sm text-ink-soft">
                        {l.note}
                        {l.is_void && <div className="text-rust">ยกเลิก: {l.void_reason}</div>}
                      </td>
                      {canEdit && (
                        <td className="px-2 py-1 text-right">
                          {l.is_void ? (
                            <button className="rounded p-1.5 text-ink-mute hover:bg-jade-50 hover:text-jade-700" onClick={() => doVoid(l, true)} aria-label="คืนค่าเวลานี้" title="คืนค่าเวลานี้"><Undo2 className="size-4" /></button>
                          ) : (
                            <button className="rounded p-1.5 text-ink-mute hover:bg-rust-soft hover:text-rust" onClick={() => { setReason(""); setVoiding(l); }} aria-label="ยกเลิกเวลานี้" title="ยกเลิกเวลานี้"><XCircle className="size-4" /></button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <Modal open={adding} onClose={() => setAdding(false)} size="sm" title="เพิ่มเวลาสแกน"
        footer={<><Button variant="secondary" onClick={() => setAdding(false)}>ยกเลิก</Button><Button loading={busy} onClick={save}>บันทึกและคำนวณใหม่</Button></>}>
        <div className="flex flex-col gap-3">
          <Field label="พนักงาน" required><EmployeePicker value={form.employee} onChange={(v) => setForm({ ...form, employee: v })} options={empOptions} /></Field>
          <Field label="วันเวลา" required><Input type="datetime-local" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} /></Field>
          <Field label="ประเภท">
            <Select value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value })}>
              {Object.entries(DIRECTION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </Field>
          <Field label="เหตุผล" required><Textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="เช่น เครื่องสแกนเสีย หัวหน้ายืนยันเวลาเข้างาน" /></Field>
        </div>
      </Modal>

      <Modal open={!!voiding} onClose={() => setVoiding(null)} size="sm" title="ยกเลิกเวลาสแกน"
        footer={<><Button variant="secondary" onClick={() => setVoiding(null)}>ไม่ยกเลิก</Button><Button variant="danger" loading={busy} onClick={() => voiding && doVoid(voiding, false)}>ยกเลิกเวลานี้</Button></>}>
        <p className="mb-3 text-[15px]">ข้อมูลจะไม่ถูกลบ แต่จะไม่นำมาคำนวณ และระบบจะคำนวณวันนั้นใหม่ทันที</p>
        <Field label="เหตุผล" required><Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="เช่น สแกนซ้ำ / สแกนผิดคน" /></Field>
      </Modal>
    </div>
  );
}
