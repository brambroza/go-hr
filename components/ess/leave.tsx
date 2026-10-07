"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Badge, Spinner } from "@/components/ui";
import { useMe } from "@/components/app/me-context";
import { supabaseBrowser } from "@/lib/supabase/client";
import { isoDate, thDate } from "@/lib/format";
import { LEAVE_UNIT_LABEL, REQ_STATUS } from "./lib";

type Bal = { leave_type_id: number; name: string; color: string | null; quota_days: number; carried_days: number; adjust_days: number; total_days: number; used_days: number; pending_days: number; remaining_days: number };
type Hist = { id: number; doc_no: string; status: string; start_date: string; end_date: string; days: number | null; payload: { unit?: string; hours?: number }; leave_type_name: string | null; leave_color: string | null; reason: string | null };

const d = (n: number) => Number(n ?? 0).toLocaleString("th-TH", { maximumFractionDigits: 2 });

export function LeaveView() {
  const me = useMe();
  const thisYear = Number(isoDate().slice(0, 4));
  const [year, setYear] = useState(thisYear);
  const [bal, setBal] = useState<Bal[] | null>(null);
  const [hist, setHist] = useState<Hist[] | null>(null);

  useEffect(() => {
    setBal(null);
    setHist(null);
    const sb = supabaseBrowser();
    sb.rpc("my_leave_balances", { p_year: year }).then(({ data }: { data: unknown }) => setBal((data as Bal[]) ?? []));
    sb.from("v_requests")
      .select("id, doc_no, status, start_date, end_date, days, payload, leave_type_name, leave_color, reason")
      .eq("employee_id", me.employeeId!)
      .eq("request_type", "leave")
      .gte("start_date", `${year}-01-01`)
      .lte("start_date", `${year}-12-31`)
      .order("start_date", { ascending: false })
      .then(({ data }: { data: unknown }) => setHist((data as Hist[]) ?? []));
  }, [year, me.employeeId]);

  const used = (bal ?? []).reduce((s, b) => s + Number(b.used_days), 0);

  return (
    <>
      <div className="mb-3 flex items-center justify-between rounded-[var(--radius-panel)] border border-line bg-white p-1">
        <button className="grid size-11 place-items-center rounded-md text-ink-soft active:bg-jade-50" aria-label="ปีก่อนหน้า" onClick={() => setYear(year - 1)}>
          <ChevronLeft className="size-5" />
        </button>
        <div className="text-center">
          <div className="text-[17px] font-semibold">ปี {year + 543}</div>
          <div className="num text-xs text-ink-mute">ใช้ไปแล้ว {d(used)} วัน</div>
        </div>
        <button className="grid size-11 place-items-center rounded-md text-ink-soft active:bg-jade-50 disabled:opacity-30" aria-label="ปีถัดไป" disabled={year >= thisYear + 1} onClick={() => setYear(year + 1)}>
          <ChevronRight className="size-5" />
        </button>
      </div>

      <section className="rounded-[var(--radius-panel)] border border-line bg-white">
        {bal === null ? (
          <div className="grid h-32 place-items-center"><Spinner /></div>
        ) : bal.length === 0 ? (
          <p className="px-4 py-8 text-center text-[15px] text-ink-soft">ยังไม่มีโควต้าวันลาปี {year + 543}</p>
        ) : (
          <ul>
            {bal.map((b) => {
              const total = Number(b.total_days) || 0;
              const usedPct = total ? Math.min(100, (Number(b.used_days) / total) * 100) : 0;
              const pendPct = total ? Math.min(100 - usedPct, (Number(b.pending_days) / total) * 100) : 0;
              return (
                <li key={b.leave_type_id} className="border-b border-line-soft px-4 py-3.5 last:border-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="flex items-center gap-2 font-medium">
                      <span className="size-2.5 rounded-full" style={{ background: b.color ?? "#999" }} />
                      {b.name}
                    </span>
                    <span className="num text-[15px]">
                      เหลือ <b className="text-lg text-ink">{d(b.remaining_days)}</b> <span className="text-ink-mute">/ {d(total)} วัน</span>
                    </span>
                  </div>
                  <div
                    className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-jade-50"
                    role="img"
                    aria-label={`ใช้ ${d(b.used_days)} วัน รออนุมัติ ${d(b.pending_days)} วัน จาก ${d(total)} วัน`}
                  >
                    <span className="h-full" style={{ width: `${usedPct}%`, background: b.color ?? "var(--color-jade-600)" }} />
                    <span className="h-full bg-amber-200" style={{ width: `${pendPct}%` }} />
                  </div>
                  <div className="num mt-1.5 flex flex-wrap gap-x-3 text-xs text-ink-mute">
                    <span>ใช้แล้ว {d(b.used_days)}</span>
                    {Number(b.pending_days) > 0 && <span className="text-amber-ink">รออนุมัติ {d(b.pending_days)}</span>}
                    {Number(b.carried_days) > 0 && <span>ยกมา {d(b.carried_days)}</span>}
                    {Number(b.adjust_days) !== 0 && <span>ปรับ {d(b.adjust_days)}</span>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <h2 className="mb-2 mt-5 text-[15px] font-semibold">ประวัติการลา</h2>
      {hist === null ? (
        <div className="grid h-20 place-items-center"><Spinner /></div>
      ) : hist.length === 0 ? (
        <p className="rounded-[var(--radius-panel)] border border-line bg-white px-4 py-6 text-center text-[15px] text-ink-soft">ยังไม่มีการลาในปีนี้</p>
      ) : (
        <ul className="overflow-hidden rounded-[var(--radius-panel)] border border-line bg-white">
          {hist.map((h) => (
            <li key={h.id} className="border-b border-line-soft last:border-0">
              <Link href={`/m/requests/${h.id}`} className="flex min-h-16 items-center gap-3 px-4 py-3 active:bg-jade-50">
                <span className="w-1 self-stretch rounded-full" style={{ background: h.leave_color ?? "#999" }} />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{h.leave_type_name}</div>
                  <div className="num text-sm text-ink-soft">
                    {h.end_date && h.end_date !== h.start_date ? `${thDate(h.start_date)} – ${thDate(h.end_date)}` : thDate(h.start_date)}
                    {h.payload?.unit && h.payload.unit !== "full" ? ` · ${LEAVE_UNIT_LABEL[h.payload.unit]}` : ""}
                    {h.days != null ? ` · ${d(h.days)} วัน` : ""}
                  </div>
                </div>
                <Badge color={REQ_STATUS[h.status]?.color}>{REQ_STATUS[h.status]?.label}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link href="/m/requests/new?type=leave" className="mt-4 flex h-14 items-center justify-center gap-2 rounded-[var(--radius-panel)] bg-jade-600 text-[17px] font-semibold text-white active:bg-jade-800">
        <Plus className="size-5" /> ส่งใบลา
      </Link>
    </>
  );
}
