"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CheckCheck, ChevronRight } from "lucide-react";
import { Button, Checkbox, clsx, Spinner, toast, useConfirm } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import { thDate } from "@/lib/format";
import { reqSummary, type ReqRow } from "./requests";

type Row = ReqRow & { approval_id: number; step: number };

export function ApprovalsInbox() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const { confirm, dialog } = useConfirm();

  async function load() {
    const sb = supabaseBrowser();
    const { data } = await sb.from("v_my_approvals").select("*").order("created_at", { ascending: true }).limit(200);
    const list = (data as Row[]) ?? [];
    // v_my_approvals has no leave type name — fetch from v_requests for the leave rows
    const leaveIds = list.filter((r) => r.request_type === "leave").map((r) => r.id);
    if (leaveIds.length) {
      const { data: lv } = await sb.from("v_requests").select("id, leave_type_name, leave_color").in("id", leaveIds);
      const m = new Map(((lv as { id: number; leave_type_name: string; leave_color: string }[]) ?? []).map((x) => [x.id, x]));
      for (const r of list) Object.assign(r, m.get(r.id) ?? {});
    }
    // de-duplicate (admin may see one request through several approval rows)
    const seen = new Set<number>();
    setRows(list.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true))));
    setPicked(new Set());
  }
  useEffect(() => {
    load();
  }, []);

  async function bulk() {
    const ids = [...picked];
    if (!(await confirm(`อนุมัติเอกสารที่เลือก ${ids.length} รายการ?`, { confirmText: "อนุมัติทั้งหมด" }))) return;
    setBusy(true);
    const { data, error } = await supabaseBrowser().rpc("act_requests", { p_ids: ids, p_action: "approve", p_comment: null });
    setBusy(false);
    if (error) return toast.error(error.message);
    const n = Number(data ?? 0);
    if (n < ids.length) toast.info(`อนุมัติแล้ว ${n} จาก ${ids.length} รายการ (ที่เหลือคุณไม่มีสิทธิ์ในขั้นนี้)`);
    else toast.ok(`อนุมัติแล้ว ${n} รายการ`);
    load();
  }

  if (rows === null) return <div className="grid h-40 place-items-center"><Spinner /></div>;
  if (rows.length === 0)
    return (
      <div className="flex flex-col items-center gap-2 rounded-[var(--radius-panel)] border border-line bg-white px-6 py-12 text-center">
        <CheckCheck className="size-9 text-jade-400" />
        <p className="font-medium">ไม่มีเอกสารรอคุณอนุมัติ</p>
        <p className="text-sm text-ink-soft">เมื่อลูกทีมยื่นเอกสาร จะแสดงที่นี่และแจ้งเตือนที่กระดิ่ง</p>
      </div>
    );

  const all = picked.size === rows.length;
  return (
    <>
      {dialog}
      <div className="mb-2 flex h-10 items-center justify-between px-1">
        <Checkbox label={`เลือกทั้งหมด (${rows.length})`} checked={all} onChange={(v) => setPicked(v ? new Set(rows.map((r) => r.id)) : new Set())} />
      </div>
      <ul className="overflow-hidden rounded-[var(--radius-panel)] border border-line bg-white">
        {rows.map((r) => (
          <li key={r.id} className="flex items-stretch border-b border-line-soft last:border-0">
            <label className="grid w-12 shrink-0 cursor-pointer place-items-center">
              <input
                type="checkbox"
                className="size-5 accent-jade-600"
                aria-label={`เลือก ${r.doc_no}`}
                checked={picked.has(r.id)}
                onChange={(e) => {
                  const s = new Set(picked);
                  if (e.target.checked) s.add(r.id);
                  else s.delete(r.id);
                  setPicked(s);
                }}
              />
            </label>
            <Link href={`/m/approvals/${r.id}`} className="flex min-h-[72px] min-w-0 flex-1 items-center gap-2 py-3 pr-3 active:bg-jade-50">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">
                  {r.first_name} {r.last_name}
                  {r.nickname ? <span className="font-normal text-ink-mute"> ({r.nickname})</span> : null}
                </div>
                <div className="truncate text-[15px] text-ink">{r.leave_type_name ? `ลา${r.leave_type_name.replace(/^ลา/, "")}` : r.request_type_name}</div>
                <div className="truncate text-sm text-ink-soft">{reqSummary(r)}</div>
                <div className="text-xs text-ink-mute">{r.doc_no} · ยื่น {thDate(r.created_at)}{r.total_steps > 1 ? ` · ขั้น ${r.step}/${r.total_steps}` : ""}</div>
              </div>
              <ChevronRight className="size-5 shrink-0 text-ink-mute" />
            </Link>
          </li>
        ))}
      </ul>
      <div className={clsx("fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 border-t border-line bg-white/95 px-4 py-3 backdrop-blur transition-transform", picked.size ? "translate-y-0" : "translate-y-[200%]")}>
        <div className="mx-auto max-w-md">
          <Button size="lg" className="h-13 w-full" loading={busy} onClick={bulk} icon={<CheckCheck className="size-5" />}>
            อนุมัติที่เลือก {picked.size} รายการ
          </Button>
        </div>
      </div>
    </>
  );
}
