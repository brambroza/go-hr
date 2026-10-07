"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, ImageIcon, MapPin, Plus, RotateCcw, Undo2, XCircle } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Badge, Button, Field, Input, Modal, Select, Spinner, Textarea, clsx, toast } from "@/components/ui";
import { minutesToHM, thDate, thDateTime, thTime } from "@/lib/format";
import { signedUrl } from "@/lib/storage";
import { addManualLogAction, recalcAction, voidLogAction } from "@/lib/attendance/actions";
import { plusDays } from "@/lib/attendance/schedule";
import { DAY_TYPE_LABEL, DIRECTION_LABEL, DayBadges, Drawer, OtRates, SOURCE_LABEL, ShiftChip, fromLocalInput, toLocalInput, type DayRow } from "./bits";
import { empName, type EmpOpt, type ShiftOpt } from "./lookups";

export type AttDay = DayRow & {
  id: number;
  employee_id: number;
  work_date: string;
  shift_id: number | null;
  sched_in: string | null;
  sched_out: string | null;
  actual_in: string | null;
  actual_out: string | null;
  break_out: string | null;
  break_in: string | null;
  work_minutes: number;
  early_in_minutes: number;
  late_out_minutes: number;
  ot_holiday_minutes: number;
  ot_before_minutes: number;
  ot_after_minutes: number;
  break_over_minutes: number;
  leave_type_ids: number[] | null;
  note: string | null;
  calculated_at: string;
};

type Log = {
  id: number; log_time: string; direction: string; source: string; location_id: number | null; device_id: number | null;
  latitude: number | null; longitude: number | null; accuracy_m: number | null; distance_m: number | null; wifi_ssid: string | null;
  photo_url: string | null; face_score: number | null; note: string | null; is_void: boolean; void_reason: string | null; created_at: string;
};

export function DayDetailDrawer({
  open, onClose, day, emp, shift, canEdit, onChanged, locations, leaveTypes, holidayName,
}: {
  open: boolean;
  onClose: () => void;
  day: AttDay | null;
  emp: EmpOpt | undefined;
  shift: ShiftOpt | undefined;
  canEdit: boolean;
  onChanged: () => void;
  locations: { id: number; name: string }[];
  leaveTypes: Record<number, { name: string; color: string | null }>;
  holidayName?: string;
}) {
  const [logs, setLogs] = useState<Log[] | null>(null);
  const [photos, setPhotos] = useState<Record<number, string | null>>({});
  const [adding, setAdding] = useState(false);
  const [voiding, setVoiding] = useState<Log | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ time: "", direction: "auto", note: "" });
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    if (!day) return;
    // window covers night shifts that end the next morning
    const from = new Date(`${day.work_date}T00:00:00+07:00`).toISOString();
    const to = new Date(`${plusDays(day.work_date, 1)}T14:00:00+07:00`).toISOString();
    const { data, error } = await supabaseBrowser()
      .from("time_logs")
      .select("id, log_time, direction, source, location_id, device_id, latitude, longitude, accuracy_m, distance_m, wifi_ssid, photo_url, face_score, note, is_void, void_reason, created_at")
      .eq("employee_id", day.employee_id)
      .gte("log_time", from)
      .lt("log_time", to)
      .order("log_time");
    if (error) toast.error(error.message);
    const list = (data as Log[]) ?? [];
    setLogs(list);
    const withPhoto = list.filter((l) => l.photo_url);
    if (withPhoto.length) {
      const entries = await Promise.all(withPhoto.map(async (l) => [l.id, await signedUrl(l.photo_url)] as const));
      setPhotos(Object.fromEntries(entries));
    }
  }, [day]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [open, load]);
  const dayKey = day ? `${day.employee_id}|${day.work_date}` : "";
  const [shownKey, setShownKey] = useState(dayKey);
  if (shownKey !== dayKey) {
    // switched to another day: drop the previous day's scans while loading (state update during render is allowed)
    setShownKey(dayKey);
    setLogs(null);
    setPhotos({});
  }

  if (!day) return null;
  const loc = (id: number | null) => locations.find((l) => l.id === id)?.name;

  async function addLog() {
    if (!form.time) return toast.error("กรุณาระบุวันเวลา");
    setBusy(true);
    const r = await addManualLogAction({ employee_id: day!.employee_id, log_time: fromLocalInput(form.time), direction: form.direction, note: form.note });
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    toast.ok(r.message ?? "บันทึกแล้ว");
    setAdding(false);
    load();
    onChanged();
  }

  async function doVoid(restore = false, log = voiding) {
    if (!log) return;
    setBusy(true);
    const r = await voidLogAction({ id: log.id, reason, restore });
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    toast.ok(r.message ?? "บันทึกแล้ว");
    setVoiding(null);
    setReason("");
    load();
    onChanged();
  }

  async function recalc() {
    setBusy(true);
    const r = await recalcAction({ from: day!.work_date, to: day!.work_date, employeeIds: [day!.employee_id] });
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    toast.ok("คำนวณใหม่แล้ว");
    onChanged();
  }

  const month = day.work_date.slice(0, 7);
  return (
    <>
      <Drawer
        open={open}
        onClose={onClose}
        wide
        title={
          <div>
            <div>{empName(emp)}</div>
            <div className="text-sm font-normal text-ink-soft">
              {emp?.code} · {thDate(day.work_date, "long")} · {DAY_TYPE_LABEL[day.day_type] ?? day.day_type}
            </div>
          </div>
        }
        footer={
          <>
            <Link href={`/attendance?employee=${day.employee_id}&month=${month}`} className="mr-auto inline-flex items-center gap-1.5 self-center text-sm text-jade-700 hover:underline">
              <CalendarDays className="size-4" /> ดูใบลงเวลาทั้งเดือน
            </Link>
            {canEdit && (
              <Button variant="secondary" icon={<RotateCcw className="size-4" />} loading={busy} onClick={recalc}>
                คำนวณวันนี้ใหม่
              </Button>
            )}
          </>
        }
      >
        <div className="flex flex-col gap-5">
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Info label="กะ" value={shift ? <span className="inline-flex items-center gap-1.5"><ShiftChip code={shift.code} color={shift.color} /> {shift.start_time.slice(0, 5)}–{shift.end_time.slice(0, 5)}</span> : "-"} />
            <Info label="เข้า / ออก (จริง)" value={`${thTime(day.actual_in)} – ${thTime(day.actual_out)}`} />
            <Info label="พัก" value={day.break_out || day.break_in ? `${thTime(day.break_out)} – ${thTime(day.break_in)}` : "-"} />
            <Info label="ชั่วโมงทำงาน" value={minutesToHM(day.work_minutes)} />
            <Info label="สาย" value={minutesToHM(day.late_minutes)} tone={day.late_minutes ? "amber" : undefined} />
            <Info label="กลับก่อน" value={minutesToHM(day.early_minutes)} tone={day.early_minutes ? "amber" : undefined} />
            <Info label="OT (นาทีก่อน / หลังกะ)" value={`${minutesToHM(day.ot_before_minutes)} / ${minutesToHM(day.ot_after_minutes)}`} />
            <Info label="OT อนุมัติ (ตามอัตรา)" value={<OtRates o={day.ot_approved_minutes} />} />
          </section>
          <div className="flex flex-wrap items-center gap-2">
            <DayBadges d={day} holidayName={holidayName} />
            {(day.leave_type_ids ?? []).map((id) => (
              <Badge key={id} color="blue">{leaveTypes[id]?.name ?? `ลา #${id}`} {minutesToHM(day.leave_minutes)} ชม.</Badge>
            ))}
          </div>
          <p className="text-xs text-ink-mute">คำนวณล่าสุด {thDateTime(day.calculated_at)}</p>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-semibold">เวลาที่สแกน (ข้อมูลดิบ)</h3>
              {canEdit && (
                <Button
                  size="sm"
                  variant="subtle"
                  icon={<Plus className="size-4" />}
                  onClick={() => {
                    setForm({ time: toLocalInput(day.sched_in ?? `${day.work_date}T08:00:00+07:00`), direction: "auto", note: "" });
                    setAdding(true);
                  }}
                >
                  เพิ่มเวลา
                </Button>
              )}
            </div>
            {logs === null ? (
              <Spinner className="mx-auto my-6" />
            ) : logs.length === 0 ? (
              <p className="rounded-md bg-paper px-3 py-6 text-center text-sm text-ink-soft">ไม่พบการสแกนในวันนี้</p>
            ) : (
              <ul className="divide-y divide-line-soft rounded-md border border-line">
                {logs.map((l) => (
                  <li key={l.id} className={clsx("flex gap-3 px-3 py-2.5", l.is_void && "bg-paper/70")}>
                    <div className={clsx("num w-28 shrink-0", l.is_void && "text-ink-mute line-through")}>
                      <div className="text-base font-semibold">{thTime(l.log_time)}</div>
                      <div className="text-xs text-ink-mute">{thDate(l.log_time)}</div>
                    </div>
                    <div className="min-w-0 flex-1 text-sm">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge color="blue">{SOURCE_LABEL[l.source] ?? l.source}</Badge>
                        <Badge>{DIRECTION_LABEL[l.direction] ?? l.direction}</Badge>
                        {l.is_void && <Badge color="red">ยกเลิกแล้ว</Badge>}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-ink-soft">
                        {loc(l.location_id) && <span className="inline-flex items-center gap-1"><MapPin className="size-3" />{loc(l.location_id)}</span>}
                        {l.distance_m != null && <span>ห่างจุดลงเวลา {Math.round(l.distance_m)} ม.</span>}
                        {l.accuracy_m != null && <span>ความแม่นยำ ±{Math.round(l.accuracy_m)} ม.</span>}
                        {l.wifi_ssid && <span>Wi-Fi {l.wifi_ssid}</span>}
                        {l.face_score != null && <span>ใบหน้า {Math.round(l.face_score * 100)}%</span>}
                        {l.latitude != null && l.longitude != null && (
                          <a className="text-jade-700 hover:underline" href={`https://maps.google.com/?q=${l.latitude},${l.longitude}`} target="_blank" rel="noreferrer">
                            เปิดแผนที่
                          </a>
                        )}
                      </div>
                      {l.note && <div className="mt-0.5 text-xs text-ink-soft">หมายเหตุ: {l.note}</div>}
                      {l.void_reason && <div className="mt-0.5 text-xs text-rust">เหตุผลที่ยกเลิก: {l.void_reason}</div>}
                    </div>
                    {photos[l.id] ? (
                      <a href={photos[l.id]!} target="_blank" rel="noreferrer" className="shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={photos[l.id]!} alt="รูปถ่ายขณะลงเวลา" className="size-14 rounded-md object-cover" />
                      </a>
                    ) : l.photo_url ? (
                      <ImageIcon className="size-5 text-ink-mute" aria-label="มีรูปถ่าย" />
                    ) : null}
                    {canEdit && (
                      <div className="shrink-0 self-center">
                        {l.is_void ? (
                          <button className="rounded p-1.5 text-ink-mute hover:bg-jade-50 hover:text-jade-700" onClick={() => doVoid(true, l)} aria-label="คืนค่าเวลานี้" title="คืนค่าเวลานี้">
                            <Undo2 className="size-4" />
                          </button>
                        ) : (
                          <button className="rounded p-1.5 text-ink-mute hover:bg-rust-soft hover:text-rust" onClick={() => { setReason(""); setVoiding(l); }} aria-label="ยกเลิกเวลานี้" title="ยกเลิกเวลานี้">
                            <XCircle className="size-4" />
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </Drawer>

      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        size="sm"
        title="เพิ่มเวลาสแกน"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAdding(false)}>ยกเลิก</Button>
            <Button loading={busy} onClick={addLog}>บันทึกและคำนวณใหม่</Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Field label="วันเวลา" required>
            <Input type="datetime-local" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
          </Field>
          <Field label="ประเภท">
            <Select value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value })}>
              {Object.entries(DIRECTION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </Field>
          <Field label="เหตุผล" required hint="จะถูกบันทึกไว้ใน Back Log">
            <Textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="เช่น ลืมสแกน มีหัวหน้ายืนยัน" />
          </Field>
        </div>
      </Modal>

      <Modal
        open={!!voiding}
        onClose={() => setVoiding(null)}
        size="sm"
        title="ยกเลิกเวลาสแกน"
        footer={
          <>
            <Button variant="secondary" onClick={() => setVoiding(null)}>ไม่ยกเลิก</Button>
            <Button variant="danger" loading={busy} onClick={() => doVoid(false)}>ยกเลิกเวลานี้</Button>
          </>
        }
      >
        <p className="mb-3 text-[15px]">
          ยกเลิกเวลา <b className="num">{voiding ? thDateTime(voiding.log_time) : ""}</b> ข้อมูลจะไม่ถูกลบ แต่จะไม่นำมาคำนวณ
        </p>
        <Field label="เหตุผล" required>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="เช่น สแกนซ้ำ / สแกนผิดคน" />
        </Field>
      </Modal>
    </>
  );
}

function Info({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "amber" }) {
  return (
    <div className="rounded-md bg-paper px-3 py-2">
      <div className="text-xs text-ink-soft">{label}</div>
      <div className={clsx("num mt-0.5 font-medium", tone === "amber" && "text-amber-ink")}>{value}</div>
    </div>
  );
}
