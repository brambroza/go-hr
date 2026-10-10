"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { Check, CircleDashed, Clock, FileText, Paperclip, Printer, X, Ban } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { signedUrl } from "@/lib/storage";
import { money, minutesToHM, num, thDate, thDateTime, thTime, bahtText } from "@/lib/format";
import { useCan, useMaybeMe } from "@/components/app/me-context";
import { Badge, Button, Field, Spinner, Textarea, clsx, toast, useConfirm } from "@/components/ui";
import { DIRECTION, DOC_LANG, LEAVE_UNIT, REQUEST_STATUS, STEP_STATUS, empName, errMsg, isPrintable, normalizeAttachments, type RequestRow } from "./lib";
import { PENDING_STATUS_LABEL } from "@/lib/payroll/pending";

export interface RequestDetailProps {
  requestId: number;
  onChanged?: () => void;
  actions?: "approver" | "admin" | "none";
}

type Lookups = { shifts: Record<string, string>; welfare: Record<string, string>; roles: Record<string, string> };
let lookupCache: Promise<Lookups> | null = null;
function loadLookups(): Promise<Lookups> {
  if (!lookupCache) {
    const sb = supabaseBrowser();
    lookupCache = Promise.all([
      sb.from("shifts").select("id, code, name"),
      sb.from("welfare_types").select("id, name"),
      sb.from("role_groups").select("code, name"),
    ]).then(([s, w, r]) => ({
      shifts: Object.fromEntries(((s.data ?? []) as { id: number; code: string; name: string }[]).map((x) => [String(x.id), x.name])),
      welfare: Object.fromEntries(((w.data ?? []) as { id: number; name: string }[]).map((x) => [String(x.id), x.name])),
      roles: Object.fromEntries(((r.data ?? []) as { code: string; name: string }[]).map((x) => [x.code, x.name])),
    }));
    lookupCache.catch(() => (lookupCache = null));
  }
  return lookupCache;
}

/** Detail of one request (v_requests) with type-specific fields, attachments, approval timeline and actions. */
export function RequestDetail({ requestId, onChanged, actions = "none" }: RequestDetailProps) {
  const sb = supabaseBrowser();
  const can = useCan();
  const me = useMaybeMe();
  const [row, setRow] = useState<RequestRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [lk, setLk] = useState<Lookups>({ shifts: {}, welfare: {}, roles: {} });
  const [canAct, setCanAct] = useState(false);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | "cancel" | null>(null);
  const [cancelMode, setCancelMode] = useState(false);
  const { confirm, dialog } = useConfirm();

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data, error }, lookups] = await Promise.all([sb.from("v_requests").select("*").eq("id", requestId).maybeSingle(), loadLookups().catch(() => null)]);
    if (lookups) setLk(lookups);
    if (error || !data) {
      setNotFound(true);
      setRow(null);
    } else {
      setNotFound(false);
      setRow(data as RequestRow);
      if (actions === "approver" && data.status === "pending") {
        const { data: a } = await sb.from("v_my_approvals").select("approval_id").eq("id", requestId).limit(1);
        setCanAct(!!a?.length);
      } else setCanAct(false);
    }
    setLoading(false);
  }, [sb, requestId, actions]);

  useEffect(() => {
    load();
  }, [load]);

  async function act(action: "approve" | "reject") {
    if (action === "reject" && !comment.trim()) return toast.error("กรุณาระบุเหตุผลที่ไม่อนุมัติ");
    if (action === "reject" && !(await confirm(`ไม่อนุมัติเอกสาร ${row?.doc_no ?? ""}? ผู้ยื่นจะได้รับแจ้งพร้อมเหตุผลที่ระบุ`, { danger: true, confirmText: "ไม่อนุมัติ" }))) return;
    setBusy(action);
    const { error } = await sb.rpc("act_request", { p_request_id: requestId, p_action: action, p_comment: comment.trim() || null });
    setBusy(null);
    if (error) return toast.error(errMsg(error));
    toast.ok(action === "approve" ? "อนุมัติแล้ว" : "บันทึกไม่อนุมัติแล้ว");
    setComment("");
    await load();
    onChanged?.();
  }

  async function cancel() {
    if (!comment.trim()) return toast.error("กรุณาระบุเหตุผลที่ยกเลิก");
    if (!(await confirm(`ยกเลิกเอกสาร ${row?.doc_no ?? ""}? ${row?.status === "approved" ? "เอกสารที่อนุมัติแล้วจะถูกยกเลิก และระบบจะคืนผลที่เกี่ยวข้อง (เช่น วันลา)" : "เอกสารจะหยุดการอนุมัติทันที"}`, { danger: true, confirmText: "ยกเลิกเอกสาร" }))) return;
    setBusy("cancel");
    const { error } = await sb.rpc("cancel_request", { p_request_id: requestId, p_reason: comment.trim() });
    setBusy(null);
    if (error) return toast.error(errMsg(error));
    toast.ok("ยกเลิกเอกสารแล้ว");
    setComment("");
    setCancelMode(false);
    await load();
    onChanged?.();
  }

  if (loading && !row) return <div className="flex justify-center py-10"><Spinner /></div>;
  if (notFound || !row) return <p className="py-8 text-center text-ink-soft">ไม่พบเอกสาร หรือคุณไม่มีสิทธิ์ดูเอกสารนี้</p>;

  const st = REQUEST_STATUS[row.status] ?? { label: row.status, color: "gray" };
  const isOwn = me?.employeeId === row.employee_id || me?.userId === row.requested_by;
  const canCancel =
    actions === "admin" &&
    (row.status === "pending" ? can("request_admin", "edit") || isOwn : row.status === "approved" && can("request_admin", "edit"));
  const canPrint = actions === "admin" && row.status === "approved" && isPrintable(row.request_type) && can("request_admin", "view");

  return (
    <div className="flex flex-col gap-5">
      {/* header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-lg font-semibold">{row.request_type_name}</span>
            <Badge color={st.color}>{st.label}</Badge>
          </div>
          <div className="mt-0.5 text-sm text-ink-soft">
            <span className="num">{row.doc_no ?? "-"}</span> · ยื่นเมื่อ {thDateTime(row.created_at)}
          </div>
        </div>
        <div className="text-right">
          <div className="font-medium">{empName(row)}</div>
          <div className="text-sm text-ink-mute num">{row.emp_code}</div>
        </div>
      </div>

      {row.status === "pending" && (
        <div className="flex items-center gap-2 rounded-[var(--radius-ctl)] bg-amber-50 px-3 py-2 text-[15px] text-amber-ink">
          <Clock className="size-4 shrink-0" />
          รออนุมัติขั้นที่ {row.current_step} จาก {row.total_steps}
          {(() => {
            const cur = row.approvals?.find((a) => a.status === "pending");
            return cur?.approver ? <span className="text-amber-ink/80"> — {lk.roles[cur.approver] ?? cur.approver}</span> : null;
          })()}
        </div>
      )}
      {(row.status === "rejected" || row.status === "cancelled") && row.result_note && (
        <div className="rounded-[var(--radius-ctl)] bg-rust-soft px-3 py-2 text-[15px] text-rust">
          {row.status === "rejected" ? "เหตุผลที่ไม่อนุมัติ" : "เหตุผลที่ยกเลิก"}: {row.result_note}
        </div>
      )}

      {/* details */}
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        <PayloadFields row={row} lk={lk} />
        {row.status === "approved" && (row.request_type === "welfare" || row.request_type === "petty_cash") && <PayrollPendingNote requestId={row.id} source={row.request_type} />}
        {row.reason && <KV k={row.request_type === "complaint" ? "รายละเอียด" : "เหตุผล"} v={<span className="whitespace-pre-wrap">{row.reason}</span>} wide />}
      </dl>

      <Attachments list={row.attachments} />

      {/* timeline */}
      <section>
        <h4 className="mb-2 text-sm font-medium text-ink-soft">ลำดับการอนุมัติ</h4>
        <Timeline row={row} roles={lk.roles} />
      </section>

      {/* actions */}
      {actions === "approver" && canAct && row.status === "pending" && (
        <section className="flex flex-col gap-3 border-t border-line-soft pt-4">
          <Field label="ความเห็น" hint="จำเป็นเมื่อไม่อนุมัติ">
            <Textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} placeholder="เช่น อนุมัติ / ช่วงนี้งานเร่ง ขอเลื่อนเป็นสัปดาห์หน้า" />
          </Field>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" icon={<X className="size-4" />} loading={busy === "reject"} disabled={!!busy} onClick={() => act("reject")}>
              ไม่อนุมัติ
            </Button>
            <Button icon={<Check className="size-4" />} loading={busy === "approve"} disabled={!!busy} onClick={() => act("approve")}>
              อนุมัติ
            </Button>
          </div>
        </section>
      )}
      {actions === "approver" && !canAct && row.status === "pending" && (
        <p className="border-t border-line-soft pt-3 text-sm text-ink-mute">เอกสารนี้ยังไม่ถึงขั้นที่คุณต้องอนุมัติ หรือมีผู้อนุมัติขั้นนี้ไปแล้ว</p>
      )}

      {actions === "admin" && (canCancel || canPrint) && (
        <section className="flex flex-col gap-3 border-t border-line-soft pt-4">
          {cancelMode && (
            <Field label="เหตุผลที่ยกเลิก" required hint={row.status === "approved" ? "ระบบจะย้อนผลของเอกสารนี้ (เช่น เวลาที่เพิ่ม กะที่เปลี่ยน ยอดเบิก)" : undefined}>
              <Textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} autoFocus />
            </Field>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            {canPrint && (
              <Link href={`/requests/${row.id}/document`} target="_blank" className="inline-flex h-10 items-center gap-1.5 rounded-[var(--radius-ctl)] border border-line bg-white px-4 text-[15px] font-medium hover:bg-jade-50">
                <Printer className="size-4" /> พิมพ์เอกสาร
              </Link>
            )}
            {canCancel &&
              (cancelMode ? (
                <>
                  <Button variant="secondary" onClick={() => { setCancelMode(false); setComment(""); }}>
                    ไม่ยกเลิก
                  </Button>
                  <Button variant="danger" icon={<Ban className="size-4" />} loading={busy === "cancel"} onClick={cancel}>
                    ยืนยันยกเลิกเอกสาร
                  </Button>
                </>
              ) : (
                <Button variant="secondary" icon={<Ban className="size-4" />} onClick={() => setCancelMode(true)}>
                  ยกเลิกเอกสาร
                </Button>
              ))}
          </div>
        </section>
      )}
      {dialog}
    </div>
  );
}

function KV({ k, v, wide }: { k: ReactNode; v: ReactNode; wide?: boolean }) {
  return (
    <div className={clsx("min-w-0", wide && "sm:col-span-2")}>
      <dt className="text-sm text-ink-mute">{k}</dt>
      <dd className="mt-0.5 text-[15px] text-ink">{v ?? "-"}</dd>
    </div>
  );
}

const s = (v: unknown) => (v === null || v === undefined || v === "" ? null : String(v));
const dateRange = (a: string | null, b: string | null) => (!a ? "-" : !b || a === b ? thDate(a, "long") : `${thDate(a)} – ${thDate(b)}`);

const KNOWN_LABELS: Record<string, string> = {
  purpose: "วัตถุประสงค์",
  language: "ภาษา",
  copies: "จำนวนฉบับ",
  country: "ประเทศ",
  embassy: "สถานทูต",
  subject: "เรื่อง",
  topic: "เรื่อง",
  category: "หมวด",
  against: "ผู้ถูกร้องเรียน",
  incident_date: "วันที่เกิดเหตุ",
  note: "หมายเหตุ",
  ot_type: "ประเภทโอที",
  location: "สถานที่",
  receipt_no: "เลขที่ใบเสร็จ",
  deduct_months: "ผ่อนชำระ (เดือน)",
};
// payload keys that are rendered specifically (or internal) and must not show in the generic list
const HIDDEN_KEYS = new Set([
  "leave_type_id", "unit", "hours", "direction", "shift_id", "shift_name", "from_shift_id", "from_date", "to_date", "deduct_date",
  "items", "welfare_type_id", "welfare_type_name", "purpose", "language", "copies", "last_day", "travel_from", "travel_to", "country",
  "embassy", "document_no", "from_time", "date", "confidential", "last_working_date", "topic", "issued_at", "issued_by", "contract_start", "contract_end", "subject", "topic", "client_uuid", "offline_id",
]);

/** Where the approved money is on the payroll side (visible to users with payroll permission; others see nothing) */
function PayrollPendingNote({ requestId, source }: { requestId: number; source: string }) {
  const sb = supabaseBrowser();
  const [rows, setRows] = useState<{ status: string; amount: number; period: { name: string } | null }[] | null>(null);
  useEffect(() => {
    sb.from("payroll_pending_items")
      .select("status, amount, period:payroll_periods(name)")
      .eq("source", source)
      .eq("source_id", requestId)
      .then(({ data }: { data: unknown }) => setRows(((data ?? []) as unknown) as { status: string; amount: number; period: { name: string } | null }[]));
  }, [sb, requestId, source]);
  if (!rows?.length) return null;
  const r = rows[0];
  const text =
    r.status === "pending" ? "รอเข้างวดเงินเดือนรายเดือนถัดไป"
    : r.status === "applied" ? `อยู่ในงวด ${r.period?.name ?? ""} (ยังไม่จ่าย)`
    : r.status === "paid" ? `จ่ายแล้วในงวด ${r.period?.name ?? ""}`
    : "ยกเลิกแล้ว ไม่เข้าเงินเดือน";
  return (
    <KV
      k="เงินเดือน"
      v={
        <span className="inline-flex items-center gap-2">
          <Badge color={r.status === "paid" ? "green" : r.status === "cancelled" ? "gray" : "amber"}>{PENDING_STATUS_LABEL[r.status as keyof typeof PENDING_STATUS_LABEL] ?? r.status}</Badge>
          <span className="text-sm text-ink-soft">{text}</span>
        </span>
      }
      wide
    />
  );
}

function PayloadFields({ row, lk }: { row: RequestRow; lk: Lookups }) {
  const p = row.payload ?? {};
  const out: ReactNode[] = [];
  const add = (k: string, label: ReactNode, v: ReactNode, wide?: boolean) => out.push(<KV key={k} k={label} v={v} wide={wide} />);

  switch (row.request_type) {
    case "leave": {
      const unit = s(p.unit) ?? "full";
      add("lt", "ประเภทการลา", (
        <span className="inline-flex items-center gap-2">
          <span className="size-2.5 rounded-full" style={{ background: row.leave_color ?? "#94a3b8" }} />
          {row.leave_type_name ?? "-"}
        </span>
      ));
      add("unit", "รูปแบบ", LEAVE_UNIT[unit] ?? unit);
      add("dates", "วันที่ลา", dateRange(row.start_date, row.end_date));
      add("days", "จำนวน", (
        <span className="num">
          {Number(row.days ?? 0).toLocaleString("th-TH", { maximumFractionDigits: 2 })} วัน{unit === "hours" && p.hours ? ` (${num(Number(p.hours), 1)} ชม.)` : ""}
        </span>
      ));
      if (unit === "hours" && row.start_at) add("time", "ช่วงเวลา", `${thTime(row.start_at)} – ${thTime(row.end_at)}`);
      else if (unit === "hours" && p.from_time) add("time", "เริ่มเวลา", `${String(p.from_time)} น.`);
      break;
    }
    case "ot":
      add("date", "วันที่", thDate(row.start_date, "long"));
      add("win", "ช่วงเวลา", row.start_at ? `${thTime(row.start_at)} – ${thTime(row.end_at)}${row.end_at && row.start_at && thDate(row.end_at) !== thDate(row.start_at) ? " (ข้ามวัน)" : ""}` : "-");
      add("min", "รวม", <span className="num">{minutesToHM(row.minutes)} ชม. ({num(row.minutes)} นาที)</span>);
      break;
    case "time_add":
      add("date", "วันที่", thDate(row.start_date ?? row.start_at, "long"));
      add("time", "เวลา", (
        <span className="num">
          {thTime(row.start_at)} {DIRECTION[s(p.direction) ?? "auto"] ?? s(p.direction)}
          {row.end_at ? ` · ${thTime(row.end_at)} ออกงาน` : ""}
        </span>
      ));
      break;
    case "shift_change":
      add("dates", "วันที่", dateRange(row.start_date, row.end_date));
      add("shift", "เปลี่ยนเป็นกะ", s(p.shift_name) ?? lk.shifts[String(p.shift_id)] ?? "-");
      if (p.from_shift_id) add("from", "กะเดิม", lk.shifts[String(p.from_shift_id)] ?? "-");
      break;
    case "dayoff_change":
      add("from", "วันหยุดเดิม (มาทำงาน)", p.from_date ? thDate(String(p.from_date), "long") : "-");
      add("to", "ขอหยุดแทนวันที่", thDate(s(p.to_date) ?? row.start_date, "long"));
      break;
    case "advance":
    case "petty_cash":
    case "welfare": {
      if (row.request_type === "welfare") add("wt", "ประเภทสวัสดิการ", s(p.welfare_type_name) ?? lk.welfare[String(p.welfare_type_id)] ?? "-");
      add("amt", "จำนวนเงิน", (
        <span>
          <span className="num font-semibold">{money(row.amount)} บาท</span>
          <span className="block text-xs text-ink-mute">({bahtText(Number(row.amount ?? 0))})</span>
        </span>
      ));
      if (row.request_type === "advance") add("deduct", "หักคืนงวด", p.deduct_date ? thDate(String(p.deduct_date), "long") : "งวดเดือนปัจจุบัน");
      if (row.start_date && row.request_type !== "advance") add("date", "วันที่ใช้จ่าย", thDate(row.start_date, "long"));
      const items = Array.isArray(p.items) ? (p.items as Record<string, unknown>[]) : [];
      if (items.length)
        out.push(
          <div key="items" className="sm:col-span-2">
            <dt className="mb-1 text-sm text-ink-mute">รายการ</dt>
            <dd>
              <table className="w-full text-[14px]">
                <tbody>
                  {items.map((it, i) => (
                    <tr key={i} className="border-b border-line-soft">
                      <td className="py-1.5 pr-2">{s(it.desc) ?? s(it.name) ?? s(it.description) ?? s(it.title) ?? `รายการ ${i + 1}`}{it.date ? <span className="ml-2 text-xs text-ink-mute">{thDate(String(it.date))}</span> : null}</td>
                      <td className="num py-1.5 text-right">{money(Number(it.amount ?? 0))}</td>
                    </tr>
                  ))}
                  <tr>
                    <td className="py-1.5 font-medium">รวม</td>
                    <td className="num py-1.5 text-right font-medium">{money(items.reduce((a, it) => a + Number(it.amount ?? 0), 0))}</td>
                  </tr>
                </tbody>
              </table>
            </dd>
          </div>,
        );
      break;
    }
    case "salary_cert":
    case "work_cert":
    case "visa_doc":
    case "contract":
      add("purpose", "วัตถุประสงค์", s(p.purpose) ?? "-");
      add("lang", "ภาษา", DOC_LANG[s(p.language) ?? (row.request_type === "visa_doc" ? "en" : "th")] ?? s(p.language));
      add("copies", "จำนวน", `${Number(p.copies ?? 1)} ฉบับ`);
      if (row.request_type === "visa_doc") {
        if (p.country || p.embassy) add("country", "ประเทศ / สถานทูต", [s(p.country), s(p.embassy)].filter(Boolean).join(" · "));
        if (p.travel_from) add("travel", "ช่วงเดินทาง", dateRange(s(p.travel_from), s(p.travel_to)));
      }
      if (row.start_date && !p.travel_from) add("need", "ต้องการรับเอกสารวันที่", thDate(row.start_date, "long"));
      if (row.request_type === "contract" && (p.contract_start || p.contract_end)) add("cterm", "ระยะสัญญา", dateRange(s(p.contract_start), s(p.contract_end)));
      if (p.document_no) add("docno", "เลขที่หนังสือ", <span className="num">{String(p.document_no)} ({thDate(String(p.issued_at))})</span>);
      break;
    case "complaint":
      if (p.subject || p.topic) add("subj", "เรื่อง", s(p.subject) ?? s(p.topic), true);
      if (p.confidential || p.anonymous) add("conf", "การเปิดเผยชื่อ", "ขอให้เก็บชื่อผู้ร้องเรียนเป็นความลับ");
      break;
    case "resign":
      add("last", "วันทำงานวันสุดท้าย", thDate(s(p.last_working_date) ?? s(p.last_day) ?? row.start_date, "long"));
      if (row.end_date && row.end_date !== row.start_date) add("eff", "วันที่มีผล", thDate(row.end_date, "long"));
      break;
    default:
      if (row.start_date) add("dates", "วันที่", dateRange(row.start_date, row.end_date));
      if (row.amount != null) add("amt", "จำนวนเงิน", <span className="num">{money(row.amount)} บาท</span>);
  }

  // anything else the submitter stored (forward compatible with new payload keys)
  for (const [k, v] of Object.entries(p)) {
    if (HIDDEN_KEYS.has(k) || v === null || v === "" || typeof v === "object") continue;
    const label = KNOWN_LABELS[k];
    if (!label) continue;
    add(`x-${k}`, label, typeof v === "boolean" ? (v ? "ใช่" : "ไม่ใช่") : /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? thDate(String(v), "long") : String(v));
  }
  return <>{out}</>;
}

function Attachments({ list }: { list: unknown }) {
  const items = useMemo(() => normalizeAttachments(list), [list]);
  const [urls, setUrls] = useState<Record<string, string | null>>({});
  useEffect(() => {
    let alive = true;
    Promise.all(items.map(async (a) => [a.ref, await signedUrl(a.ref).catch(() => null)] as const)).then((r) => alive && setUrls(Object.fromEntries(r)));
    return () => {
      alive = false;
    };
  }, [items]);
  if (!items.length) return null;
  return (
    <section>
      <h4 className="mb-2 text-sm font-medium text-ink-soft">ไฟล์แนบ</h4>
      <ul className="flex flex-wrap gap-2">
        {items.map((a) => {
          const url = urls[a.ref];
          const isImg = /\.(png|jpe?g|webp|gif)$/i.test(a.name) || a.type?.startsWith("image/");
          return (
            <li key={a.ref}>
              <a
                href={url ?? undefined}
                target="_blank"
                rel="noreferrer"
                className={clsx("flex items-center gap-2 rounded-[var(--radius-ctl)] border border-line bg-white p-1.5 pr-3 text-sm hover:border-jade-300", !url && "pointer-events-none opacity-60")}
              >
                {isImg && url ? (
                   
                  <img src={url} alt="" className="size-10 rounded object-cover" />
                ) : (
                  <span className="grid size-10 place-items-center rounded bg-paper text-ink-mute">
                    {isImg ? <Paperclip className="size-4" /> : <FileText className="size-4" />}
                  </span>
                )}
                <span className="max-w-48 truncate">{a.name}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Timeline({ row, roles }: { row: RequestRow; roles: Record<string, string> }) {
  const steps = row.approvals ?? [];
  if (!steps.length)
    return <p className="text-sm text-ink-mute">{row.status === "approved" ? "อนุมัติอัตโนมัติ (ไม่มีขั้นอนุมัติ)" : "ไม่มีขั้นอนุมัติ"}</p>;
  return (
    <ol className="relative flex flex-col gap-0">
      <li className="flex gap-3 pb-3">
        <Dot tone="jade"><FileText className="size-3.5" /></Dot>
        <div className="min-w-0 text-[15px]">
          <div>ยื่นเอกสาร</div>
          <div className="text-xs text-ink-mute">{thDateTime(row.created_at)}</div>
        </div>
      </li>
      {steps.map((a) => {
        const st = STEP_STATUS[a.status] ?? { label: a.status, color: "gray" };
        const tone = a.status === "approved" ? "jade" : a.status === "rejected" ? "rust" : a.status === "pending" ? "amber" : "gray";
        return (
          <li key={a.step} className="flex gap-3 pb-3 last:pb-0">
            <Dot tone={tone}>
              {a.status === "approved" ? <Check className="size-3.5" /> : a.status === "rejected" ? <X className="size-3.5" /> : a.status === "pending" ? <Clock className="size-3.5" /> : <CircleDashed className="size-3.5" />}
            </Dot>
            <div className="min-w-0 flex-1 text-[15px]">
              <div className="flex flex-wrap items-center gap-2">
                <span>ขั้นที่ {a.step}</span>
                <span className="text-ink-soft">{a.approver ? roles[a.approver] ?? a.approver : "-"}</span>
                <Badge color={st.color}>{a.status === "pending" ? `รออนุมัติขั้นที่ ${a.step}` : st.label}</Badge>
              </div>
              {a.acted_at && <div className="text-xs text-ink-mute">{thDateTime(a.acted_at)}</div>}
              {a.comment && <div className="mt-1 rounded bg-paper px-2 py-1 text-sm text-ink-soft">“{a.comment}”</div>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Dot({ tone, children }: { tone: "jade" | "rust" | "amber" | "gray"; children: ReactNode }) {
  return (
    <span
      className={clsx(
        "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full",
        tone === "jade" && "bg-jade-600 text-white",
        tone === "rust" && "bg-rust text-white",
        tone === "amber" && "bg-amber-50 text-amber-ink ring-1 ring-amber-200",
        tone === "gray" && "bg-paper text-ink-mute ring-1 ring-line",
      )}
    >
      {children}
    </span>
  );
}
