"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Badge, clsx, Modal, Spinner } from "@/components/ui";
import { useMe } from "@/components/app/me-context";
import { supabaseBrowser } from "@/lib/supabase/client";
import { isoDate, minutesToHM, parseDate, thDate, thMonthYear, thTime, TH_DAYS, TH_DAYS_SHORT } from "@/lib/format";
import { DAY_TYPE_LABEL, DIRECTION_LABEL, LEAVE_UNIT_LABEL, REQ_STATUS, SOURCE_LABEL } from "./lib";

type Day = { work_date: string; shift_id: number | null; day_type: string; holiday: string | null; is_override: boolean };
type Shift = { id: number; code: string; name: string; color: string | null; start_time: string; end_time: string };
type Att = { work_date: string; late_minutes: number; early_minutes: number; absent: boolean; missing_scan: boolean; work_minutes: number; actual_in: string | null; actual_out: string | null; leave_minutes: number };
type Log = { id: number; log_time: string; direction: string; source: string };
type Lv = { id: number; status: string; start_date: string; end_date: string; payload: { unit?: string }; leave_type_name: string | null; leave_color: string | null; doc_no: string };

const pad = (n: number) => String(n).padStart(2, "0");
const bkkDate = (ts: string) => isoDate(new Date(ts));

export function MyCalendar() {
  const me = useMe();
  const today = isoDate();
  const [ym, setYm] = useState(today.slice(0, 7));
  const [days, setDays] = useState<Day[] | null>(null);
  const [shifts, setShifts] = useState<Map<number, Shift>>(new Map());
  const [att, setAtt] = useState<Map<string, Att>>(new Map());
  const [logs, setLogs] = useState<Map<string, Log[]>>(new Map());
  const [leaves, setLeaves] = useState<Lv[]>([]);
  const [sel, setSel] = useState<string | null>(null);

  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(5, 7));
  const from = `${ym}-01`;
  const last = new Date(y, m, 0).getDate();
  const to = `${ym}-${pad(last)}`;

  useEffect(() => {
    const sb = supabaseBrowser();
    sb.from("shifts").select("id, code, name, color, start_time, end_time").then(({ data }: { data: unknown }) => setShifts(new Map(((data as Shift[]) ?? []).map((s) => [s.id, s]))));
  }, []);

  useEffect(() => {
    setDays(null);
    const sb = supabaseBrowser();
    const emp = me.employeeId!;
    (async () => {
      const [d, a, l, r] = await Promise.all([
        sb.rpc("my_days", { p_from: from, p_to: to }),
        sb.from("attendance_days").select("work_date, late_minutes, early_minutes, absent, missing_scan, work_minutes, actual_in, actual_out, leave_minutes").eq("employee_id", emp).gte("work_date", from).lte("work_date", to),
        sb.from("time_logs").select("id, log_time, direction, source").eq("employee_id", emp).eq("is_void", false).gte("log_time", `${from}T00:00:00+07:00`).lte("log_time", `${to}T23:59:59+07:00`).order("log_time"),
        sb.from("v_requests").select("id, status, start_date, end_date, payload, leave_type_name, leave_color, doc_no").eq("employee_id", emp).eq("request_type", "leave").in("status", ["pending", "approved"]).lte("start_date", to).gte("end_date", from),
      ]);
      setDays((d.data as Day[]) ?? []);
      setAtt(new Map(((a.data as Att[]) ?? []).map((x) => [x.work_date, x])));
      const lm = new Map<string, Log[]>();
      for (const x of (l.data as Log[]) ?? []) {
        const k = bkkDate(x.log_time);
        lm.set(k, [...(lm.get(k) ?? []), x]);
      }
      setLogs(lm);
      setLeaves((r.data as Lv[]) ?? []);
    })();
  }, [from, to, me.employeeId]);

  const leaveOn = (date: string) => leaves.filter((l) => date >= l.start_date && date <= (l.end_date ?? l.start_date));
  const firstDow = parseDate(from)!.getDay();
  const cells = useMemo(() => [...Array(firstDow).fill(null), ...(days ?? [])], [days, firstDow]);

  const move = (n: number) => {
    const d = new Date(y, m - 1 + n, 1);
    setYm(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`);
  };

  const s = sel ? days?.find((x) => x.work_date === sel) : null;

  return (
    <>
      <div className="mb-3 flex items-center justify-between rounded-[var(--radius-panel)] border border-line bg-white p-1">
        <button className="grid size-11 place-items-center rounded-md text-ink-soft active:bg-jade-50" aria-label="เดือนก่อนหน้า" onClick={() => move(-1)}>
          <ChevronLeft className="size-5" />
        </button>
        <button className="text-[17px] font-semibold" onClick={() => setYm(today.slice(0, 7))}>
          {thMonthYear(y, m)}
        </button>
        <button className="grid size-11 place-items-center rounded-md text-ink-soft active:bg-jade-50" aria-label="เดือนถัดไป" onClick={() => move(1)}>
          <ChevronRight className="size-5" />
        </button>
      </div>

      <section className="rounded-[var(--radius-panel)] border border-line bg-white p-2">
        <div className="grid grid-cols-7 text-center text-xs text-ink-mute">
          {TH_DAYS_SHORT.map((d, i) => (
            <div key={d} className={clsx("py-1.5", i === 0 && "text-rust")}>{d}</div>
          ))}
        </div>
        {days === null ? (
          <div className="grid h-72 place-items-center"><Spinner /></div>
        ) : (
          <div className="grid grid-cols-7 gap-1">
            {cells.map((c, i) => {
              if (!c) return <div key={`b${i}`} />;
              const dd = c as Day;
              const sh = dd.shift_id ? shifts.get(dd.shift_id) : null;
              const a = att.get(dd.work_date);
              const lv = leaveOn(dd.work_date);
              const off = dd.day_type === "off" || dd.day_type === "holiday";
              const past = dd.work_date < today;
              const problem = a && (a.absent || a.late_minutes > 0 || a.missing_scan);
              return (
                <button
                  key={dd.work_date}
                  onClick={() => setSel(dd.work_date)}
                  aria-label={`${thDate(dd.work_date, "long")} ${dd.holiday ?? DAY_TYPE_LABEL[dd.day_type]}`}
                  className={clsx(
                    "relative flex aspect-[4/5] flex-col items-center justify-start rounded-md pt-1 text-[15px]",
                    off ? "bg-paper" : "bg-white ring-1 ring-inset ring-line-soft",
                    dd.work_date === today && "ring-2 ring-jade-600",
                  )}
                >
                  <span className={clsx("num", dd.day_type === "holiday" ? "font-semibold text-rust" : off ? "text-ink-mute" : "text-ink", dd.work_date === today && "font-semibold")}>{Number(dd.work_date.slice(8))}</span>
                  {!off && sh && <span className="mt-0.5 rounded px-1 text-[10px] font-semibold leading-4 text-white" style={{ background: sh.color ?? "#10b981" }}>{sh.code}</span>}
                  {dd.day_type === "holiday" && <span className="mt-0.5 text-[10px] leading-3 text-rust">หยุด</span>}
                  <span className="absolute inset-x-0 bottom-1 flex justify-center gap-0.5">
                    {lv.map((l) => (
                      <span key={l.id} className={clsx("size-1.5 rounded-full", l.status === "pending" && "opacity-50")} style={{ background: l.leave_color ?? "#3b82f6" }} />
                    ))}
                    {past && problem && <span className="size-1.5 rounded-full bg-rust" />}
                    {past && !problem && (logs.get(dd.work_date)?.length ?? 0) > 0 && !lv.length && <span className="size-1.5 rounded-full bg-jade-500" />}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 px-1 text-xs text-ink-soft">
        <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-jade-500" /> มาทำงาน</span>
        <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-rust" /> สาย / ขาด / สแกนไม่ครบ</span>
        <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-sky-500" /> ลา</span>
        <span className="inline-flex items-center gap-1"><span className="size-3 rounded-sm bg-paper ring-1 ring-line" /> วันหยุด</span>
      </div>

      <Modal open={!!sel} onClose={() => setSel(null)} title={sel ? `วัน${TH_DAYS[parseDate(sel)!.getDay()]} ${thDate(sel, "long")}` : ""} size="sm">
        {s && (
          <DayDetail
            day={s}
            shift={s.shift_id ? shifts.get(s.shift_id) ?? null : null}
            att={att.get(s.work_date) ?? null}
            logs={logs.get(s.work_date) ?? []}
            leaves={leaveOn(s.work_date)}
          />
        )}
      </Modal>
    </>
  );
}

function DayDetail({ day, shift, att, logs, leaves }: { day: Day; shift: Shift | null; att: Att | null; logs: Log[]; leaves: Lv[] }) {
  const off = day.day_type === "off" || day.day_type === "holiday";
  return (
    <div className="flex flex-col gap-3 text-[15px]">
      <div className="flex flex-wrap items-center gap-2">
        <Badge color={off ? "gray" : "green"}>{day.holiday ?? DAY_TYPE_LABEL[day.day_type]}</Badge>
        {day.is_override && <Badge color="blue">ปรับตารางเฉพาะวัน</Badge>}
      </div>
      {!off && shift && (
        <div>
          <div className="text-sm text-ink-soft">กะ</div>
          <div className="num font-medium">{shift.name} ({shift.start_time.slice(0, 5)} – {shift.end_time.slice(0, 5)})</div>
        </div>
      )}
      {leaves.map((l) => (
        <div key={l.id} className="rounded-md bg-paper px-3 py-2">
          <span className="font-medium">{l.leave_type_name}</span> {l.payload?.unit && l.payload.unit !== "full" ? `(${LEAVE_UNIT_LABEL[l.payload.unit]})` : ""}{" "}
          <Badge color={REQ_STATUS[l.status]?.color}>{REQ_STATUS[l.status]?.label}</Badge>
        </div>
      ))}
      <div>
        <div className="text-sm text-ink-soft">เวลาที่บันทึก</div>
        {logs.length === 0 ? (
          <div className="text-ink-mute">ไม่มีการลงเวลา</div>
        ) : (
          <ul>
            {logs.map((l) => (
              <li key={l.id} className="num flex gap-3 py-0.5">
                <b>{thTime(l.log_time)}</b> <span className="text-ink-soft">{DIRECTION_LABEL[l.direction]} · {SOURCE_LABEL[l.source] ?? l.source}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {att && (
        <div className="flex flex-wrap gap-1.5">
          {att.absent && <Badge color="red">ขาดงาน</Badge>}
          {att.late_minutes > 0 && <Badge color="red">สาย {att.late_minutes} นาที</Badge>}
          {att.early_minutes > 0 && <Badge color="red">กลับก่อน {att.early_minutes} นาที</Badge>}
          {att.missing_scan && <Badge color="amber">สแกนไม่ครบ</Badge>}
          {att.work_minutes > 0 && <Badge color="green">ทำงาน {minutesToHM(att.work_minutes)} ชม.</Badge>}
        </div>
      )}
    </div>
  );
}
