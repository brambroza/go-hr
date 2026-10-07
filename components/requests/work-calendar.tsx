"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Cake, ChevronLeft, ChevronRight, PartyPopper, Briefcase, CalendarDays } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { TH_DAYS, TH_DAYS_SHORT, isoDate, parseDate, thDate, thMonthYear } from "@/lib/format";
import { useCan } from "@/components/app/me-context";
import { Badge, Button, Checkbox, Modal, PageHeader, Panel, Select, Spinner, clsx, toast } from "@/components/ui";
import { RequestDetail } from "./request-detail";
import { LEAVE_UNIT, errMsg } from "./lib";
import { orgOptions, useReqLookups } from "./use-req-lookups";

type Ev =
  | { kind: "holiday"; date: string; title: string; sub?: string; color: string }
  | { kind: "special"; date: string; title: string; sub?: string; color: string }
  | { kind: "leave"; date: string; title: string; sub?: string; color: string; requestId: number; pending: boolean; empId: number }
  | { kind: "birthday" | "anniversary"; date: string; title: string; sub?: string; color: string };

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const ORDER: Record<Ev["kind"], number> = { holiday: 0, special: 1, leave: 2, birthday: 3, anniversary: 4 };

export function WorkCalendar() {
  const sb = supabaseBrowser();
  const can = useCan();
  const lk = useReqLookups();
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const today = isoDate();
  const [ty, tm] = today.split("-").map(Number);
  const ym = sp.get("m") ?? `${ty}-${pad(tm)}`;
  const [year, month] = ym.split("-").map(Number);
  const go = (y: number, m: number) => {
    const d = new Date(y, m - 1, 1);
    router.replace(`${pathname}?m=${d.getFullYear()}-${pad(d.getMonth() + 1)}`, { scroll: false });
  };

  const [org, setOrg] = useState("");
  const [branch, setBranch] = useState("");
  const [leaveType, setLeaveType] = useState("");
  const [showPending, setShowPending] = useState(true);
  const [showPeople, setShowPeople] = useState(true);
  const [events, setEvents] = useState<Ev[]>([]);
  const [loading, setLoading] = useState(true);
  const [day, setDay] = useState<string | null>(null);
  const [openReq, setOpenReq] = useState<number | null>(null);
  const canSeeEmployees = can("employee", "view");

  const first = ymd(year, month, 1);
  const lastDay = new Date(year, month, 0).getDate();
  const last = ymd(year, month, lastDay);

  const orgIds = useMemo(() => {
    if (!org) return null;
    const ids = new Set<number>([Number(org)]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const u of lk.orgUnits) if (u.parent_id && ids.has(u.parent_id) && !ids.has(u.id)) {
        ids.add(u.id);
        grew = true;
      }
    }
    return ids;
  }, [org, lk.orgUnits]);

  const load = useCallback(async () => {
    setLoading(true);
    const branchName = Object.fromEntries(lk.branches.map((b) => [b.id, b.name]));
    const orgName = Object.fromEntries(lk.orgUnits.map((o) => [o.id, o.name]));
    let lq = sb
      .from("v_requests")
      .select("id, employee_id, first_name, last_name, nickname, status, start_date, end_date, days, payload, leave_type_name, leave_color, org_unit_id, branch_id")
      .eq("request_type", "leave")
      .in("status", showPending ? ["approved", "pending"] : ["approved"])
      .lte("start_date", last)
      .gte("end_date", first)
      .limit(2000);
    if (orgIds) lq = lq.in("org_unit_id", [...orgIds]);
    if (branch) lq = lq.eq("branch_id", Number(branch));
    if (leaveType) lq = lq.eq("payload->>leave_type_id", leaveType);

    const [hol, spw, lv, emps] = await Promise.all([
      sb.from("holidays").select("holiday_date, name, branch_id, org_unit_id, holiday_type, employee_ids").gte("holiday_date", first).lte("holiday_date", last),
      sb.from("special_workdays").select("work_date, name, branch_id, org_unit_id").gte("work_date", first).lte("work_date", last),
      lq,
      canSeeEmployees && showPeople
        ? (() => {
            let q = sb.from("employees").select("id, first_name, last_name, nickname, birth_date, hire_date, org_unit_id, branch_id").neq("status", "resigned").limit(5000);
            if (orgIds) q = q.in("org_unit_id", [...orgIds]);
            if (branch) q = q.eq("branch_id", Number(branch));
            return q;
          })()
        : Promise.resolve({ data: [], error: null }),
    ]);
    const err = hol.error ?? spw.error ?? lv.error ?? emps.error;
    if (err) toast.error(errMsg(err));

    const out: Ev[] = [];
    const scopeOk = (b: number | null, o: number | null) => (!branch || !b || b === Number(branch)) && (!orgIds || !o || orgIds.has(o));
    for (const h of (hol.data ?? []) as { holiday_date: string; name: string; branch_id: number | null; org_unit_id: number | null; holiday_type: string; employee_ids: number[] | null }[]) {
      if (!scopeOk(h.branch_id, h.org_unit_id)) continue;
      const scope = [h.branch_id ? branchName[h.branch_id] : null, h.org_unit_id ? orgName[h.org_unit_id] : null, h.employee_ids?.length ? `${h.employee_ids.length} คน` : null].filter(Boolean).join(" · ");
      out.push({ kind: "holiday", date: h.holiday_date, title: h.name, sub: scope || (h.holiday_type === "public" ? "วันหยุดตามประเพณี" : "วันหยุดบริษัท"), color: h.holiday_type === "special" ? "#d97706" : "#7c3aed" });
    }
    for (const w of (spw.data ?? []) as { work_date: string; name: string; branch_id: number | null; org_unit_id: number | null }[]) {
      if (!scopeOk(w.branch_id, w.org_unit_id)) continue;
      out.push({ kind: "special", date: w.work_date, title: w.name, sub: ["วันทำงานพิเศษ", w.branch_id ? branchName[w.branch_id] : null, w.org_unit_id ? orgName[w.org_unit_id] : null].filter(Boolean).join(" · "), color: "#0369a1" });
    }
    for (const r of (lv.data ?? []) as { id: number; employee_id: number; first_name: string; last_name: string; nickname: string | null; status: string; start_date: string; end_date: string | null; payload: Record<string, unknown>; leave_type_name: string | null; leave_color: string | null }[]) {
      const s = r.start_date < first ? first : r.start_date;
      const e = (r.end_date ?? r.start_date) > last ? last : r.end_date ?? r.start_date;
      const unit = String(r.payload?.unit ?? "full");
      for (let d = Number(s.slice(8)); d <= Number(e.slice(8)); d++) {
        out.push({
          kind: "leave",
          date: ymd(year, month, d),
          title: `${r.nickname || r.first_name}`,
          sub: `${r.first_name} ${r.last_name} · ${r.leave_type_name ?? "ลา"}${unit !== "full" ? ` (${LEAVE_UNIT[unit] ?? unit})` : ""}${r.status === "pending" ? " · รออนุมัติ" : ""}`,
          color: r.leave_color ?? "#64748b",
          requestId: r.id,
          pending: r.status === "pending",
          empId: r.employee_id,
        });
      }
    }
    for (const e of (emps.data ?? []) as { id: number; first_name: string; last_name: string; nickname: string | null; birth_date: string | null; hire_date: string | null }[]) {
      const nm = e.nickname || e.first_name;
      if (e.birth_date && Number(e.birth_date.slice(5, 7)) === month) {
        const d = Math.min(Number(e.birth_date.slice(8)), lastDay);
        out.push({ kind: "birthday", date: ymd(year, month, d), title: nm, sub: `วันเกิด ${e.first_name} ${e.last_name}`, color: "#db2777" });
      }
      if (e.hire_date && Number(e.hire_date.slice(5, 7)) === month) {
        const yrs = year - Number(e.hire_date.slice(0, 4));
        if (yrs >= 1) {
          const d = Math.min(Number(e.hire_date.slice(8)), lastDay);
          out.push({ kind: "anniversary", date: ymd(year, month, d), title: nm, sub: `ครบ ${yrs} ปี ${e.first_name} ${e.last_name}`, color: "#0f766e" });
        }
      }
    }
    out.sort((a, b) => (a.date === b.date ? ORDER[a.kind] - ORDER[b.kind] : a.date < b.date ? -1 : 1));
    setEvents(out);
    setLoading(false);
  }, [sb, first, last, year, month, lastDay, orgIds, branch, leaveType, showPending, showPeople, canSeeEmployees, lk.branches, lk.orgUnits]);

  useEffect(() => {
    load();
  }, [load]);

  const byDate = useMemo(() => {
    const m = new Map<string, Ev[]>();
    for (const e of events) m.set(e.date, [...(m.get(e.date) ?? []), e]);
    return m;
  }, [events]);

  const startDow = new Date(year, month - 1, 1).getDay();
  const cells: (string | null)[] = [...Array(startDow).fill(null), ...Array.from({ length: lastDay }, (_, i) => ymd(year, month, i + 1))];
  while (cells.length % 7) cells.push(null);

  const leaveCount = new Set(events.filter((e) => e.kind === "leave").map((e) => (e as { requestId: number }).requestId)).size;
  const holidayCount = events.filter((e) => e.kind === "holiday").length;
  const orgOpts = useMemo(() => orgOptions(lk.orgUnits), [lk.orgUnits]);

  return (
    <>
      <PageHeader
        title="ปฏิทินการทำงาน"
        description="วันหยุด วันทำงานพิเศษ และวันลาของพนักงานที่คุณดูแล"
        actions={
          <div className="flex items-center gap-1">
            <Button variant="secondary" size="sm" onClick={() => go(year, month - 1)} aria-label="เดือนก่อน">
              <ChevronLeft className="size-4" />
            </Button>
            <span className="min-w-36 text-center text-[15px] font-medium">{thMonthYear(year, month)}</span>
            <Button variant="secondary" size="sm" onClick={() => go(year, month + 1)} aria-label="เดือนถัดไป">
              <ChevronRight className="size-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => go(ty, tm)}>
              วันนี้
            </Button>
          </div>
        }
      />

      <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3 lg:flex lg:flex-wrap lg:items-center">
        <Select value={org} onChange={(e) => setOrg(e.target.value)} placeholder="ทุกหน่วยงาน" className="lg:w-56">
          {orgOpts.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
        <Select value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="ทุกสาขา" className="lg:w-48">
          {lk.branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </Select>
        <Select value={leaveType} onChange={(e) => setLeaveType(e.target.value)} placeholder="ทุกประเภทการลา" className="lg:w-48">
          {lk.leaveTypes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
        <div className="flex flex-wrap items-center gap-4 lg:ml-2">
          <Checkbox label="แสดงใบลาที่รออนุมัติ" checked={showPending} onChange={setShowPending} />
          {canSeeEmployees && <Checkbox label="วันเกิด / ครบรอบทำงาน" checked={showPeople} onChange={setShowPeople} />}
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-soft">
        <Legend color="#7c3aed">วันหยุด</Legend>
        <Legend color="#0369a1">วันทำงานพิเศษ</Legend>
        {lk.leaveTypes
          .filter((t) => events.some((e) => e.kind === "leave" && e.color === t.color))
          .map((t) => (
            <Legend key={t.id} color={t.color ?? "#64748b"}>{t.name}</Legend>
          ))}
        <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm border border-dashed border-ink-mute" />รออนุมัติ</span>
        <span className="num ml-auto text-ink-mute">{holidayCount} วันหยุด · {leaveCount} ใบลา</span>
      </div>

      {/* month grid (tablet / desktop) */}
      <Panel bodyClass="p-0" className={clsx("hidden md:block", loading && "opacity-70")}>
        <div className="grid grid-cols-7 border-b border-line text-center text-[13px] text-ink-soft">
          {TH_DAYS.map((d, i) => (
            <div key={d} className={clsx("py-2", (i === 0 || i === 6) && "text-rust/80")}>{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((d, i) => {
            if (!d) return <div key={i} className="min-h-28 border-r border-b border-line-soft bg-paper/40 last:border-r-0" />;
            const evs = byDate.get(d) ?? [];
            const isHol = evs.some((e) => e.kind === "holiday");
            const dow = i % 7;
            const shown = evs.slice(0, 4);
            return (
              <button
                type="button"
                key={d}
                onClick={() => setDay(d)}
                className={clsx(
                  "flex min-h-28 flex-col gap-0.5 border-b border-line-soft p-1.5 text-left transition-colors hover:bg-jade-50/50",
                  dow !== 6 && "border-r",
                  (isHol || dow === 0 || dow === 6) && "bg-paper/50",
                )}
              >
                <span className={clsx("num mb-0.5 inline-grid size-6 place-items-center rounded-full text-[13px]", d === today ? "bg-jade-600 font-semibold text-white" : isHol ? "font-medium text-violet-700" : "text-ink-soft")}>
                  {Number(d.slice(8))}
                </span>
                {shown.map((e, j) => (
                  <EventChip key={j} e={e} />
                ))}
                {evs.length > shown.length && <span className="px-1 text-xs text-ink-mute">อีก {evs.length - shown.length} รายการ</span>}
              </button>
            );
          })}
        </div>
      </Panel>

      {/* list (phone) */}
      <Panel bodyClass="p-0" className="md:hidden">
        {loading ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : byDate.size === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ink-soft">ไม่มีวันหยุดหรือวันลาในเดือนนี้</p>
        ) : (
          <ul className="divide-y divide-line-soft">
            {[...byDate.entries()].map(([d, evs]) => (
              <li key={d}>
                <button type="button" onClick={() => setDay(d)} className="flex w-full gap-3 px-4 py-3 text-left">
                  <span className={clsx("flex w-12 shrink-0 flex-col items-center rounded-md border py-1 leading-tight", d === today ? "border-jade-500 bg-jade-50" : "border-line bg-paper")}>
                    <span className="text-[11px] text-ink-soft">{TH_DAYS_SHORT[parseDate(d)!.getDay()]}</span>
                    <span className="num text-lg font-semibold">{Number(d.slice(8))}</span>
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    {evs.map((e, j) => (
                      <EventChip key={j} e={e} long />
                    ))}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Modal open={!!day} onClose={() => setDay(null)} title={day ? `${TH_DAYS[parseDate(day)!.getDay()]} ${thDate(day, "long")}` : ""}>
        {day && (
          <DayList
            evs={byDate.get(day) ?? []}
            onOpen={(id) => {
              setOpenReq(id);
            }}
          />
        )}
      </Modal>
      <Modal open={!!openReq} onClose={() => setOpenReq(null)} title="รายละเอียดใบลา" size="lg">
        {openReq && <RequestDetail requestId={openReq} actions="none" />}
      </Modal>
    </>
  );
}

function Legend({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="size-2.5 rounded-sm" style={{ background: color }} />
      {children}
    </span>
  );
}

function EventChip({ e, long }: { e: Ev; long?: boolean }) {
  const pending = e.kind === "leave" && e.pending;
  const icon = e.kind === "birthday" ? <Cake className="size-3 shrink-0" /> : e.kind === "anniversary" ? <Briefcase className="size-3 shrink-0" /> : e.kind === "holiday" ? <PartyPopper className="size-3 shrink-0" /> : e.kind === "special" ? <CalendarDays className="size-3 shrink-0" /> : null;
  const solid = e.kind === "holiday" || e.kind === "special";
  return (
    <span
      title={e.sub}
      className={clsx("flex min-w-0 items-center gap-1 rounded px-1.5 py-0.5 text-xs leading-tight", pending && "border border-dashed", solid && "font-medium")}
      style={{
        background: solid ? `${e.color}1f` : pending ? "transparent" : `${e.color}24`,
        color: e.kind === "leave" ? "var(--color-ink)" : e.color,
        borderColor: pending ? e.color : undefined,
        borderLeft: e.kind === "leave" && !pending ? `3px solid ${e.color}` : undefined,
      }}
    >
      {icon}
      <span className="truncate">{long && e.sub ? `${e.title} — ${e.sub}` : e.title}</span>
    </span>
  );
}

function DayList({ evs, onOpen }: { evs: Ev[]; onOpen: (id: number) => void }) {
  if (!evs.length) return <p className="py-6 text-center text-sm text-ink-soft">วันทำงานปกติ ไม่มีวันหยุดหรือวันลา</p>;
  const groups: [string, Ev[]][] = [
    ["วันหยุด / วันทำงานพิเศษ", evs.filter((e) => e.kind === "holiday" || e.kind === "special")],
    ["ลางาน", evs.filter((e) => e.kind === "leave")],
    ["วันเกิด / ครบรอบทำงาน", evs.filter((e) => e.kind === "birthday" || e.kind === "anniversary")],
  ];
  return (
    <div className="flex flex-col gap-4">
      {groups
        .filter(([, l]) => l.length)
        .map(([title, list]) => (
          <section key={title}>
            <h4 className="mb-1.5 text-sm font-medium text-ink-soft">
              {title} <span className="num text-ink-mute">({list.length})</span>
            </h4>
            <ul className="divide-y divide-line-soft rounded-[var(--radius-ctl)] border border-line">
              {list.map((e, i) => (
                <li key={i}>
                  {e.kind === "leave" ? (
                    <button type="button" onClick={() => onOpen(e.requestId)} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-jade-50/50">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ background: e.color }} />
                      <span className="min-w-0 flex-1 text-[15px]">{e.sub}</span>
                      {e.pending ? <Badge color="amber">รออนุมัติ</Badge> : <Badge color="green">อนุมัติแล้ว</Badge>}
                    </button>
                  ) : (
                    <div className="flex items-center gap-2 px-3 py-2">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ background: e.color }} />
                      <span className="text-[15px]">{e.kind === "birthday" || e.kind === "anniversary" ? e.sub : e.title}</span>
                      {e.kind !== "birthday" && e.kind !== "anniversary" && e.sub && <span className="text-sm text-ink-mute">{e.sub}</span>}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
    </div>
  );
}
