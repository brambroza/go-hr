"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Check, ChevronRight, CircleDashed, FileText, Plus, X } from "lucide-react";
import { Badge, Button, clsx, Spinner, Textarea, toast, useConfirm } from "@/components/ui";
import { useMe } from "@/components/app/me-context";
import { openStored } from "@/components/org/attachments-field";
import { supabaseBrowser } from "@/lib/supabase/client";
import { money, thDate, thDateTime, thTime } from "@/lib/format";
import { DIRECTION_LABEL, LEAVE_UNIT_LABEL, REQ_STATUS, STEP_STATUS } from "./lib";

export type ReqRow = {
  id: number;
  doc_no: string;
  request_type: string;
  request_type_name: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  start_at: string | null;
  end_at: string | null;
  days: number | null;
  minutes: number | null;
  amount: number | null;
  payload: Record<string, unknown>;
  reason: string | null;
  attachments: { name: string; url: string }[];
  result_note: string | null;
  current_step: number;
  total_steps: number;
  created_at: string;
  completed_at: string | null;
  employee_id: number;
  emp_code: string;
  first_name: string;
  last_name: string;
  nickname: string | null;
  leave_type_name: string | null;
  leave_color: string | null;
  approvals: { step: number; status: string; comment: string | null; acted_at: string | null; approver: string | null }[] | null;
};

/** One-line summary of what was requested (dates, amount, hours) */
export function reqSummary(r: Pick<ReqRow, "request_type" | "start_date" | "end_date" | "start_at" | "end_at" | "days" | "minutes" | "amount" | "payload">): string {
  const p = r.payload ?? {};
  const range = r.start_date ? (r.end_date && r.end_date !== r.start_date ? `${thDate(r.start_date)} – ${thDate(r.end_date)}` : thDate(r.start_date)) : "";
  switch (r.request_type) {
    case "leave": {
      const unit = String(p.unit ?? "full");
      const d = r.days != null ? ` · ${Number(r.days).toLocaleString("th-TH", { maximumFractionDigits: 2 })} วัน` : "";
      return `${range}${unit !== "full" ? ` (${LEAVE_UNIT_LABEL[unit]}${unit === "hours" && p.hours ? ` ${p.hours} ชม.` : ""})` : ""}${d}`;
    }
    case "ot":
      return `${range} · ${thTime(r.start_at)}–${thTime(r.end_at)}${r.minutes ? ` (${Math.floor(r.minutes / 60)}:${String(r.minutes % 60).padStart(2, "0")} ชม.)` : ""}`;
    case "time_add":
      return `${range} · ${thTime(r.start_at)} ${DIRECTION_LABEL[String(p.direction ?? "auto")] ?? ""}`;
    case "dayoff_change":
      return `มาทำงาน ${thDate(String(p.from_date ?? ""))} · หยุดแทน ${thDate(String(p.to_date ?? ""))}`;
    case "shift_change":
      return `${range}${p.shift_name ? ` · ${p.shift_name}` : ""}`;
    case "advance":
    case "petty_cash":
    case "welfare":
      return `${money(r.amount)} บาท${p.welfare_type_name ? ` · ${p.welfare_type_name}` : ""}`;
    case "resign":
      return `วันทำงานวันสุดท้าย ${range}`;
    case "complaint":
      return String(p.topic ?? "");
    default:
      return p.purpose ? String(p.purpose) : range;
  }
}

const FILTERS = [
  { v: "all", label: "ทั้งหมด" },
  { v: "pending", label: "รออนุมัติ" },
  { v: "approved", label: "อนุมัติแล้ว" },
  { v: "rejected", label: "ไม่อนุมัติ" },
  { v: "cancelled", label: "ยกเลิก" },
];

export function MyRequests() {
  const me = useMe();
  const [rows, setRows] = useState<ReqRow[] | null>(null);
  const [filter, setFilter] = useState("all");
  const [cat, setCat] = useState("all");

  useEffect(() => {
    supabaseBrowser()
      .from("v_requests")
      .select("id, doc_no, request_type, request_type_name, category, status, start_date, end_date, start_at, end_at, days, minutes, amount, payload, created_at, leave_type_name, leave_color")
      .eq("employee_id", me.employeeId!)
      .order("created_at", { ascending: false })
      .limit(200)
      .then(({ data }: { data: unknown }) => setRows((data as ReqRow[]) ?? []));
  }, [me.employeeId]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows?.length ?? 0 };
    for (const r of rows ?? []) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [rows]);
  const list = (rows ?? []).filter((r) => (filter === "all" || r.status === filter) && (cat === "all" || (cat === "leave" ? r.request_type === "leave" : r.request_type !== "leave")));

  return (
    <>
      <div className="thin-scroll -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.v}
            aria-pressed={filter === f.v}
            onClick={() => setFilter(f.v)}
            className={clsx("h-9 shrink-0 rounded-full border px-3 text-sm", filter === f.v ? "border-jade-600 bg-jade-600 text-white" : "border-line bg-white text-ink-soft")}
          >
            {f.label}
            {counts[f.v] ? <span className="num ml-1 opacity-80">{counts[f.v]}</span> : null}
          </button>
        ))}
      </div>
      <div className="mt-2 flex gap-3 text-sm">
        {[
          ["all", "ทุกประเภท"],
          ["leave", "ใบลา"],
          ["other", "เอกสารอื่น"],
        ].map(([k, l]) => (
          <button key={k} onClick={() => setCat(k)} className={clsx("h-8", cat === k ? "font-semibold text-jade-800 underline decoration-2 underline-offset-4" : "text-ink-soft")}>
            {l}
          </button>
        ))}
      </div>
      {rows === null ? (
        <div className="grid h-40 place-items-center"><Spinner /></div>
      ) : list.length === 0 ? (
        <div className="mt-3 flex flex-col items-center gap-2 rounded-[var(--radius-panel)] border border-line bg-white px-6 py-10 text-center">
          <FileText className="size-8 text-jade-400" />
          <p className="font-medium">{rows.length ? "ไม่มีเอกสารตามตัวกรองนี้" : "ยังไม่เคยยื่นเอกสาร"}</p>
          <Link href="/m/requests/new" className="mt-1 text-[15px] font-medium text-jade-700">ยื่นเอกสารใหม่</Link>
        </div>
      ) : (
        <ul className="mt-2 overflow-hidden rounded-[var(--radius-panel)] border border-line bg-white">
          {list.map((r) => (
            <li key={r.id} className="border-b border-line-soft last:border-0">
              <Link href={`/m/requests/${r.id}`} className="flex min-h-16 items-center gap-3 px-4 py-3 active:bg-jade-50">
                <span className="mt-1 size-2.5 shrink-0 self-start rounded-full" style={{ background: r.leave_color ?? "var(--color-jade-300)" }} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium text-ink">{r.leave_type_name ?? r.request_type_name}</span>
                  </div>
                  <div className="truncate text-sm text-ink-soft">{reqSummary(r)}</div>
                  <div className="text-xs text-ink-mute">{r.doc_no} · ยื่น {thDate(r.created_at)}</div>
                </div>
                <Badge color={REQ_STATUS[r.status]?.color}>{REQ_STATUS[r.status]?.label}</Badge>
                <ChevronRight className="size-5 shrink-0 text-ink-mute" />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link
        href="/m/requests/new"
        className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-[max(1rem,calc(50%-14rem+1rem))] z-20 inline-flex h-14 items-center gap-2 rounded-full bg-jade-600 pl-4 pr-5 text-[16px] font-semibold text-white shadow-lg active:bg-jade-800"
      >
        <Plus className="size-5" /> ยื่นเอกสาร
      </Link>
    </>
  );
}

/* ------------------------------------------------------------------ detail */
export function RequestDetailView({ id, mode = "mine" }: { id: number; mode?: "mine" | "approve" }) {
  const me = useMe();
  const router = useRouter();
  const [r, setR] = useState<ReqRow | null | undefined>(undefined);
  const [canAct, setCanAct] = useState(false);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const { confirm, dialog } = useConfirm();

  async function load() {
    const sb = supabaseBrowser();
    const { data } = await sb.from("v_requests").select("*").eq("id", id).maybeSingle();
    setR((data as ReqRow) ?? null);
    const { data: a } = await sb.from("v_my_approvals").select("approval_id").eq("id", id).limit(1);
    setCanAct(((a as unknown[]) ?? []).length > 0);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (r === undefined) return <div className="grid h-40 place-items-center"><Spinner /></div>;
  if (r === null) return <p className="rounded-[var(--radius-panel)] border border-line bg-white p-6 text-center text-ink-soft">ไม่พบเอกสารนี้ หรือคุณไม่มีสิทธิ์ดู</p>;

  const mine = r.employee_id === me.employeeId;
  const p = r.payload ?? {};
  const details: [string, React.ReactNode][] = [];
  if (r.request_type === "leave") {
    details.push(["ประเภทการลา", r.leave_type_name ?? "-"]);
    details.push(["ลาแบบ", LEAVE_UNIT_LABEL[String(p.unit ?? "full")] + (p.hours ? ` ${p.hours} ชม.` : "")]);
    details.push(["วันที่", r.end_date && r.end_date !== r.start_date ? `${thDate(r.start_date)} – ${thDate(r.end_date)}` : thDate(r.start_date)]);
    if (r.days != null) details.push(["จำนวน", `${Number(r.days).toLocaleString("th-TH", { maximumFractionDigits: 2 })} วัน`]);
  } else {
    details.push(["รายละเอียด", reqSummary(r) || "-"]);
    if (Array.isArray(p.items))
      details.push([
        "รายการ",
        <ul key="i" className="text-right">
          {(p.items as { desc: string; amount: number }[]).map((i, k) => (
            <li key={k} className="num">{i.desc} {money(i.amount)}</li>
          ))}
        </ul>,
      ]);
    if (p.purpose) details.push(["ใช้เพื่อ", String(p.purpose)]);
    if (p.language) details.push(["ภาษา / จำนวน", `${p.language === "en" ? "อังกฤษ" : "ไทย"} · ${p.copies ?? 1} ฉบับ`]);
    if (p.country) details.push(["ประเทศ", String(p.country)]);
  }
  if (r.reason) details.push([r.request_type === "complaint" ? "รายละเอียด" : "เหตุผล", <span key="r" className="whitespace-pre-wrap">{r.reason}</span>]);
  if (!mine) details.unshift(["พนักงาน", `${r.first_name} ${r.last_name}${r.nickname ? ` (${r.nickname})` : ""} · ${r.emp_code}`]);

  async function act(action: "approve" | "reject") {
    if (action === "reject" && !comment.trim()) {
      toast.error("กรุณาระบุเหตุผลที่ไม่อนุมัติ");
      return;
    }
    setBusy(action);
    const { error } = await supabaseBrowser().rpc("act_request", { p_request_id: r!.id, p_action: action, p_comment: comment.trim() || null });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.ok(action === "approve" ? "อนุมัติแล้ว" : "บันทึกไม่อนุมัติแล้ว");
    if (mode === "approve") router.push("/m/approvals");
    else load();
  }

  async function cancel() {
    if (!(await confirm(`ยกเลิกเอกสาร ${r!.doc_no}?`, { danger: true, confirmText: "ยกเลิกเอกสาร" }))) return;
    setBusy("cancel");
    const { error } = await supabaseBrowser().rpc("cancel_request", { p_request_id: r!.id, p_reason: "ผู้ยื่นยกเลิกเอง" });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.ok("ยกเลิกเอกสารแล้ว");
    load();
  }

  return (
    <>
      {dialog}
      <section className="rounded-[var(--radius-panel)] border border-line bg-white">
        <header className="flex items-start justify-between gap-3 border-b border-line-soft px-4 py-3.5">
          <div className="min-w-0">
            <h1 className="text-[20px] font-semibold leading-tight">{r.leave_type_name ? `ใบลา · ${r.leave_type_name}` : r.request_type_name}</h1>
            <p className="text-sm text-ink-mute">{r.doc_no} · ยื่น {thDateTime(r.created_at)}</p>
          </div>
          <Badge color={REQ_STATUS[r.status]?.color} className="mt-1">{REQ_STATUS[r.status]?.label}</Badge>
        </header>
        <dl className="px-4 py-2">
          {details.map(([k, val]) => (
            <div key={k} className="flex justify-between gap-4 border-b border-line-soft py-2.5 last:border-0">
              <dt className="shrink-0 text-[15px] text-ink-soft">{k}</dt>
              <dd className="min-w-0 text-right text-[15px] text-ink">{val}</dd>
            </div>
          ))}
        </dl>
        {r.attachments?.length > 0 && (
          <div className="border-t border-line-soft px-4 py-3">
            <div className="mb-1 text-sm text-ink-soft">เอกสารแนบ</div>
            <ul className="flex flex-col gap-1">
              {r.attachments.map((a, i) => (
                <li key={i}>
                  <button className="inline-flex min-h-10 items-center gap-2 text-[15px] text-jade-700" onClick={() => openStored(a.url)}>
                    <FileText className="size-4" /> {a.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* timeline */}
      <section className="mt-3 rounded-[var(--radius-panel)] border border-line bg-white px-4 py-3.5">
        <h2 className="mb-3 text-[15px] font-semibold">ลำดับการอนุมัติ</h2>
        <ol className="relative">
          <TimelineItem tone="done" title="ยื่นเอกสาร" sub={thDateTime(r.created_at)} />
          {(r.approvals ?? []).map((a) => (
            <TimelineItem
              key={a.step}
              tone={a.status === "approved" ? "done" : a.status === "rejected" ? "bad" : a.status === "pending" ? "now" : "wait"}
              title={`ขั้นที่ ${a.step} · ${a.approver ?? "-"}`}
              badge={<Badge color={STEP_STATUS[a.status]?.color}>{STEP_STATUS[a.status]?.label}</Badge>}
              sub={a.acted_at ? thDateTime(a.acted_at) : undefined}
              note={a.comment}
            />
          ))}
          {(r.approvals ?? []).length === 0 && <TimelineItem tone={r.status === "approved" ? "done" : "wait"} title={r.status === "approved" ? "อนุมัติอัตโนมัติ" : "ไม่มีขั้นการอนุมัติ"} />}
          {r.status === "cancelled" && <TimelineItem tone="bad" title="ยกเลิกเอกสาร" sub={r.result_note ?? undefined} />}
        </ol>
      </section>

      {/* actions */}
      {r.status === "pending" && canAct && (
        <section className="mt-3 rounded-[var(--radius-panel)] border border-line bg-white px-4 py-3.5">
          <h2 className="mb-2 text-[15px] font-semibold">พิจารณาเอกสาร</h2>
          <Textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="ความเห็น (จำเป็นเมื่อไม่อนุมัติ)" aria-label="ความเห็น" className="text-base" />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button size="lg" variant="secondary" className="h-14 text-rust" icon={<X className="size-5" />} loading={busy === "reject"} disabled={!!busy} onClick={() => act("reject")}>
              ไม่อนุมัติ
            </Button>
            <Button size="lg" className="h-14" icon={<Check className="size-5" />} loading={busy === "approve"} disabled={!!busy} onClick={() => act("approve")}>
              อนุมัติ
            </Button>
          </div>
        </section>
      )}
      {r.status === "pending" && mine && (
        <Button variant="secondary" size="lg" className="mt-3 h-12 w-full text-rust" loading={busy === "cancel"} onClick={cancel}>
          ยกเลิกเอกสารนี้
        </Button>
      )}
    </>
  );
}

function TimelineItem({ tone, title, sub, note, badge }: { tone: "done" | "now" | "wait" | "bad"; title: string; sub?: string; note?: string | null; badge?: React.ReactNode }) {
  return (
    <li className="relative pb-4 pl-8 last:pb-0 [&:last-child>span.line]:hidden">
      <span className="line absolute left-[11px] top-6 h-[calc(100%-1.25rem)] w-px bg-line" />
      <span
        className={clsx(
          "absolute left-0 top-0.5 grid size-6 place-items-center rounded-full",
          tone === "done" && "bg-jade-600 text-white",
          tone === "now" && "bg-amber-50 text-amber-ink ring-1 ring-amber-ink/30",
          tone === "wait" && "bg-paper text-ink-mute ring-1 ring-line",
          tone === "bad" && "bg-rust text-white",
        )}
      >
        {tone === "done" ? <Check className="size-3.5" /> : tone === "bad" ? <X className="size-3.5" /> : <CircleDashed className="size-3.5" />}
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[15px] text-ink">{title}</span>
        {badge}
      </div>
      {sub && <div className="text-sm text-ink-mute">{sub}</div>}
      {note && <div className="mt-1 rounded-md bg-paper px-2.5 py-1.5 text-sm text-ink-soft">“{note}”</div>}
    </li>
  );
}
