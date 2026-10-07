"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CalendarDays, CheckCheck, ChevronRight, Clock3, FilePlus2, Megaphone, PartyPopper, Plane } from "lucide-react";
import { Badge, clsx, Spinner } from "@/components/ui";
import { useMe } from "@/components/app/me-context";
import { supabaseBrowser } from "@/lib/supabase/client";
import { isoDate, parseDate, thDate, thTime, TH_DAYS } from "@/lib/format";
import { Card } from "./shell";
import { useToday } from "./today";
import { DAY_TYPE_LABEL, DIRECTION_LABEL, LEAVE_UNIT_LABEL, REQ_STATUS } from "./lib";

type Bal = { leave_type_id: number; name: string; color: string | null; total_days: number; used_days: number; pending_days: number; remaining_days: number };
type Req = { id: number; doc_no: string; request_type_name: string; status: string; start_date: string | null; created_at: string; leave_type_name: string | null };
type Ann = { id: number; title: string; content: string | null; publish_at: string; is_pinned: boolean };
type Hol = { holiday_date: string; name: string };

function greeting() {
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Bangkok", hour: "numeric", hour12: false }).format(new Date()));
  if (h < 12) return "สวัสดีตอนเช้า";
  if (h < 17) return "สวัสดีตอนบ่าย";
  return "สวัสดีตอนเย็น";
}

export function EssHome() {
  const me = useMe();
  const { data: today, loading } = useToday();
  const [bal, setBal] = useState<Bal[] | null>(null);
  const [mine, setMine] = useState<Req[]>([]);
  const [approvals, setApprovals] = useState(0);
  const [ann, setAnn] = useState<Ann | null>(null);
  const [hol, setHol] = useState<Hol | null>(null);

  useEffect(() => {
    const sb = supabaseBrowser();
    const d = isoDate();
    (async () => {
      const [b, r, a, n, e] = await Promise.all([
        sb.rpc("my_leave_balances", { p_year: Number(d.slice(0, 4)) }),
        sb.from("v_requests").select("id, doc_no, request_type_name, status, start_date, created_at, leave_type_name").eq("employee_id", me.employeeId!).eq("status", "pending").order("created_at", { ascending: false }).limit(5),
        sb.rpc("my_pending_counts"),
        sb.from("announcements").select("id, title, content, publish_at, is_pinned").order("is_pinned", { ascending: false }).order("publish_at", { ascending: false }).limit(1),
        sb.from("employees").select("branch_id, org_unit_id").eq("id", me.employeeId!).maybeSingle(),
      ]);
      setBal((b.data as Bal[]) ?? []);
      setMine((r.data as Req[]) ?? []);
      setApprovals(Number((a.data as { to_approve?: number } | null)?.to_approve ?? 0));
      setAnn(((n.data as Ann[]) ?? [])[0] ?? null);
      const br = (e.data as { branch_id: number | null } | null)?.branch_id ?? null;
      let hq = sb.from("holidays").select("holiday_date, name").gt("holiday_date", d).order("holiday_date").limit(1);
      hq = br ? hq.or(`branch_id.is.null,branch_id.eq.${br}`) : hq.is("branch_id", null);
      const { data: h } = await hq;
      setHol(((h as Hol[]) ?? [])[0] ?? null);
    })();
  }, [me.employeeId]);

  const name = me.employee?.nickname || me.employee?.first_name || me.displayName;
  const lastScan = today?.scans.at(-1);
  const onLeave = today?.leave.find((l) => l.status === "approved");
  const isWorkDay = today && (today.day_type === "work" || today.day_type === "special");
  const todayIso = isoDate();
  const dayLabel = `วัน${TH_DAYS[parseDate(todayIso)!.getDay()]}ที่ ${thDate(todayIso, "long")}`;

  let status: { text: string; tone: "jade" | "amber" | "rust" | "gray" } = { text: "ยังไม่ได้ลงเวลา", tone: "amber" };
  if (today) {
    if (onLeave) status = { text: `ลา${LEAVE_UNIT_LABEL[onLeave.unit] === "เต็มวัน" ? "" : LEAVE_UNIT_LABEL[onLeave.unit]} (${onLeave.leave_type ?? ""})`, tone: "gray" };
    else if (!isWorkDay) status = { text: today.holiday ?? DAY_TYPE_LABEL[today.day_type], tone: "gray" };
    else if (today.first_scan && today.late_minutes > 0) status = { text: `สาย ${today.late_minutes} นาที`, tone: "rust" };
    else if (today.first_scan) status = { text: "มาตรงเวลา", tone: "jade" };
    else if (today.attendance_exempt) status = { text: "ไม่ต้องลงเวลา", tone: "gray" };
  }

  return (
    <main className="mx-auto w-full max-w-md px-4 pt-4">
      <p className="text-[15px] text-ink-soft">{greeting()}</p>
      <h1 className="text-[24px] font-semibold leading-tight tracking-tight text-ink">คุณ{name}</h1>
      <p className="mt-0.5 text-sm text-ink-mute">{dayLabel}</p>

      {/* Today */}
      <section className="mt-4 overflow-hidden rounded-[var(--radius-panel)] bg-jade-800 text-white">
        <div className="px-4 pb-4 pt-4">
          {loading ? (
            <div className="grid h-24 place-items-center"><Spinner className="text-white" /></div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm text-jade-200">{today ? DAY_TYPE_LABEL[today.day_type] : ""}{today?.holiday ? ` · ${today.holiday}` : ""}</div>
                  <div className="num mt-0.5 text-[28px] font-semibold leading-none tracking-tight">
                    {today?.shift && isWorkDay ? `${today.shift.start_time} – ${today.shift.end_time}` : "วันหยุด"}
                  </div>
                  {today?.shift && isWorkDay && <div className="mt-1 text-sm text-jade-200">{today.shift.name}</div>}
                </div>
                <span
                  className={clsx(
                    "shrink-0 rounded-full px-2.5 py-1 text-xs font-medium",
                    status.tone === "jade" && "bg-jade-500/30 text-white",
                    status.tone === "amber" && "bg-amber-50 text-amber-ink",
                    status.tone === "rust" && "bg-rust-soft text-rust",
                    status.tone === "gray" && "bg-white/15 text-white",
                  )}
                >
                  {status.text}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {(today?.scans ?? []).map((s) => (
                  <span key={s.id} className="num rounded-md bg-white/10 px-2 py-1 text-sm">
                    {thTime(s.log_time)} <span className="text-jade-200">{DIRECTION_LABEL[s.direction]}</span>
                  </span>
                ))}
                {today && today.scans.length === 0 && <span className="text-sm text-jade-200">วันนี้ยังไม่มีเวลาเข้า–ออก</span>}
              </div>
              {today?.leave.filter((l) => l.status === "pending").map((l) => (
                <div key={l.id} className="mt-2 text-sm text-amber-100">ใบลาวันนี้ ({l.leave_type}) กำลังรออนุมัติ</div>
              ))}
            </>
          )}
        </div>
        <Link href="/m/checkin" className="flex h-14 items-center justify-center gap-2 bg-jade-600 text-[17px] font-semibold active:bg-jade-700">
          <Clock3 className="size-5" />
          {lastScan ? "ลงเวลา" : "ลงเวลาเข้างาน"}
        </Link>
      </section>

      {/* Quick actions */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Quick href="/m/requests/new?type=leave" icon={<Plane className="size-5" />} label="ส่งใบลา" />
        <Quick href="/m/requests/new?type=ot" icon={<Clock3 className="size-5" />} label="ขอโอที" />
        <Quick href="/m/requests/new" icon={<FilePlus2 className="size-5" />} label="ยื่นเอกสารอื่น" />
      </div>

      {/* Pending */}
      {(approvals > 0 || mine.length > 0) && (
        <Card className="mt-3" title="รอดำเนินการ">
          <ul className="pb-1">
            {approvals > 0 && (
              <li>
                <Link href="/m/approvals" className="flex min-h-14 items-center gap-3 px-4 py-2 active:bg-jade-50">
                  <span className="grid size-9 place-items-center rounded-full bg-amber-50 text-amber-ink"><CheckCheck className="size-5" /></span>
                  <span className="flex-1 font-medium">เอกสารรอคุณอนุมัติ</span>
                  <Badge color="amber">{approvals} รายการ</Badge>
                  <ChevronRight className="size-5 text-ink-mute" />
                </Link>
              </li>
            )}
            {mine.map((r) => (
              <li key={r.id} className="border-t border-line-soft first:border-0">
                <Link href={`/m/requests/${r.id}`} className="flex min-h-14 items-center gap-3 px-4 py-2 active:bg-jade-50">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{r.leave_type_name ?? r.request_type_name}</div>
                    <div className="text-sm text-ink-mute">{r.doc_no}{r.start_date ? ` · ${thDate(r.start_date)}` : ""}</div>
                  </div>
                  <Badge color={REQ_STATUS[r.status]?.color}>{REQ_STATUS[r.status]?.label}</Badge>
                  <ChevronRight className="size-5 text-ink-mute" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Leave balance */}
      <Card className="mt-3" title="วันลาคงเหลือปีนี้" action={<Link href="/m/leave" className="text-sm text-jade-700">ดูทั้งหมด</Link>}>
        <div className="grid grid-cols-3 gap-2 px-4 pb-4 pt-2">
          {bal === null && <div className="col-span-3 grid h-14 place-items-center"><Spinner /></div>}
          {bal?.length === 0 && <p className="col-span-3 text-sm text-ink-mute">ยังไม่มีโควต้าวันลาปีนี้</p>}
          {bal?.slice(0, 3).map((b) => (
            <div key={b.leave_type_id} className="rounded-[var(--radius-ctl)] bg-paper px-2.5 py-2">
              <div className="truncate text-xs text-ink-soft">{b.name}</div>
              <div className="num text-xl font-semibold text-ink">
                {Number(b.remaining_days).toLocaleString("th-TH", { maximumFractionDigits: 1 })}
                <span className="text-xs font-normal text-ink-mute"> / {Number(b.total_days).toLocaleString("th-TH", { maximumFractionDigits: 1 })}</span>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Announcement */}
      {ann && (
        <Link href="/m/feed" className="mt-3 block rounded-[var(--radius-panel)] border border-line bg-white px-4 py-3.5 active:bg-jade-50">
          <div className="flex items-center gap-2 text-sm text-ink-soft"><Megaphone className="size-4 text-jade-600" /> ประกาศล่าสุด · {thDate(ann.publish_at)}</div>
          <div className="mt-1 font-medium text-ink">{ann.title}</div>
          {ann.content && <p className="mt-0.5 line-clamp-2 text-sm text-ink-soft">{ann.content}</p>}
        </Link>
      )}

      {/* Holiday */}
      {hol && (
        <Link href="/m/calendar" className="mt-3 flex items-center gap-3 rounded-[var(--radius-panel)] border border-line bg-white px-4 py-3.5 active:bg-jade-50">
          <span className="grid size-10 place-items-center rounded-full bg-jade-50 text-jade-700"><PartyPopper className="size-5" /></span>
          <div className="min-w-0 flex-1">
            <div className="text-sm text-ink-soft">วันหยุดถัดไป</div>
            <div className="truncate font-medium">{hol.name}</div>
          </div>
          <div className="text-right text-sm text-ink-soft">
            <CalendarDays className="ml-auto size-4" />
            {thDate(hol.holiday_date)}
          </div>
        </Link>
      )}
      <div className="h-4" />
    </main>
  );
}

function Quick({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link href={href} className="flex h-[72px] flex-col items-center justify-center gap-1 rounded-[var(--radius-panel)] border border-line bg-white text-sm text-ink active:bg-jade-50">
      <span className="text-jade-700">{icon}</span>
      {label}
    </Link>
  );
}
