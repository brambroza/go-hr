"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Check, Inbox, RefreshCw, X } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { thDateTime } from "@/lib/format";
import { Badge, Button, Empty, Field, Modal, PageHeader, Panel, Spinner, Tabs, Textarea, clsx, toast } from "@/components/ui";
import { Avatar } from "@/components/employees/avatar";
import { RequestDetail } from "./request-detail";
import { CATEGORIES, REQUEST_STATUS, STEP_STATUS, daysSince, empName, errMsg, requestSummary, type RequestRow } from "./lib";

type InboxRow = RequestRow & { approval_id: number; step: number; approval_status: string; photo_url: string | null };
type HistoryRow = { approval_id: number; step: number; status: string; comment: string | null; acted_at: string; req: RequestRow | null };
type Tab = "all" | "time" | "money" | "document" | "hr" | "history";

export function ApprovalsInbox() {
  const sb = supabaseBrowser();
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [tab, setTab] = useState<Tab>("all");
  const [rows, setRows] = useState<InboxRow[]>([]);
  const [hist, setHist] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [bulk, setBulk] = useState<"approve" | "reject" | null>(null);
  const [bulkComment, setBulkComment] = useState("");
  const [busy, setBusy] = useState(false);
  const openId = Number(sp.get("id")) || null;

  const setOpen = (id: number | null) => router.replace(id ? `${pathname}?id=${id}` : pathname, { scroll: false });

  const load = useCallback(async () => {
    setLoading(true);
    const { data: auth } = await sb.auth.getUser();
    const [inbox, mine] = await Promise.all([
      sb.from("v_my_approvals").select("*").order("created_at", { ascending: true }).limit(500),
      sb.from("request_approvals").select("id, request_id, step, status, comment, acted_at").eq("acted_by", auth.user?.id ?? "").in("status", ["approved", "rejected"]).order("acted_at", { ascending: false }).limit(200),
    ]);
    if (inbox.error) toast.error(errMsg(inbox.error));
    // the same request can only have one pending step, but dedupe defensively
    const seen = new Set<number>();
    const list = ((inbox.data ?? []) as InboxRow[]).filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
    // v_my_approvals has no leave type columns → fill from leave_types
    if (list.some((r) => r.request_type === "leave")) {
      const { data: lts } = await sb.from("leave_types").select("id, name, color");
      const lt = new Map(((lts ?? []) as { id: number; name: string; color: string | null }[]).map((x) => [String(x.id), x]));
      for (const r of list) if (r.request_type === "leave") {
        const t = lt.get(String(r.payload?.leave_type_id));
        r.leave_type_name = t?.name ?? null;
        r.leave_color = t?.color ?? null;
      }
    }
    setRows(list);
    setSel((s) => new Set([...s].filter((id) => seen.has(id))));
    const acts = (mine.data ?? []) as { id: number; request_id: number; step: number; status: string; comment: string | null; acted_at: string }[];
    const ids = [...new Set(acts.map((a) => a.request_id))];
    const reqs = ids.length ? await sb.from("v_requests").select("*").in("id", ids) : { data: [] };
    const byId = new Map(((reqs.data ?? []) as RequestRow[]).map((r) => [r.id, r]));
    setHist(acts.map((a) => ({ approval_id: a.id, step: a.step, status: a.status, comment: a.comment, acted_at: a.acted_at, req: byId.get(a.request_id) ?? null })));
    setLoading(false);
  }, [sb]);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of rows) c[r.category] = (c[r.category] ?? 0) + 1;
    return c;
  }, [rows]);
  const visible = tab === "all" ? rows : rows.filter((r) => r.category === tab);
  const allChecked = visible.length > 0 && visible.every((r) => sel.has(r.id));

  function toggleAll() {
    setSel((s) => {
      const n = new Set(s);
      if (allChecked) visible.forEach((r) => n.delete(r.id));
      else visible.forEach((r) => n.add(r.id));
      return n;
    });
  }

  async function runBulk() {
    if (!bulk) return;
    if (bulk === "reject" && !bulkComment.trim()) return toast.error("กรุณาระบุเหตุผลที่ไม่อนุมัติ");
    const ids = [...sel];
    setBusy(true);
    const { data, error } = await sb.rpc("act_requests", { p_ids: ids, p_action: bulk, p_comment: bulkComment.trim() || null });
    setBusy(false);
    if (error) return toast.error(errMsg(error));
    const n = Number(data ?? 0);
    if (n < ids.length) toast.info(`${bulk === "approve" ? "อนุมัติ" : "ไม่อนุมัติ"} ${n} จาก ${ids.length} รายการ — รายการที่เหลือคุณไม่มีสิทธิ์ในขั้นปัจจุบันหรือถูกดำเนินการไปแล้ว`);
    else toast.ok(`${bulk === "approve" ? "อนุมัติ" : "ไม่อนุมัติ"} ${n} รายการแล้ว`);
    setBulk(null);
    setBulkComment("");
    setSel(new Set());
    load();
  }

  const tabs = [
    { value: "all" as Tab, label: "ทั้งหมด", count: rows.length },
    ...CATEGORIES.map((c) => ({ value: c.value as Tab, label: c.label, count: counts[c.value] ?? 0 })),
    { value: "history" as Tab, label: "ประวัติที่ฉันอนุมัติ" },
  ];

  return (
    <>
      <PageHeader
        title="รออนุมัติ"
        description="เอกสารที่ถึงขั้นที่คุณต้องอนุมัติ เลือกหลายรายการเพื่ออนุมัติพร้อมกัน หรือเปิดดูรายละเอียดก่อนตัดสินใจ"
        actions={
          <Button variant="secondary" icon={<RefreshCw className="size-4" />} onClick={load}>
            โหลดใหม่
          </Button>
        }
      />
      <Tabs tabs={tabs} value={tab} onChange={(t) => setTab(t)} className="mb-4" />

      {tab === "history" ? (
        <Panel bodyClass="p-0">
          {loading ? (
            <div className="flex justify-center py-10"><Spinner /></div>
          ) : hist.length === 0 ? (
            <Empty icon={<Inbox className="size-8" />} title="ยังไม่มีประวัติการอนุมัติ" />
          ) : (
            <div className="thin-scroll overflow-x-auto">
              <table className="w-full text-[14px]">
                <thead>
                  <tr className="border-b border-line bg-paper/60 text-left text-[13px] text-ink-soft">
                    <th className="px-3 py-2 font-medium">วันที่ดำเนินการ</th>
                    <th className="px-3 py-2 font-medium">พนักงาน</th>
                    <th className="px-3 py-2 font-medium">เอกสาร</th>
                    <th className="px-3 py-2 font-medium">รายละเอียด</th>
                    <th className="px-3 py-2 font-medium">ผลของฉัน</th>
                    <th className="px-3 py-2 font-medium">สถานะเอกสาร</th>
                  </tr>
                </thead>
                <tbody>
                  {hist.map((h) => {
                    const r = h.req;
                    const mine = STEP_STATUS[h.status];
                    const st = r ? REQUEST_STATUS[r.status] : null;
                    return (
                      <tr key={h.approval_id} className="cursor-pointer border-b border-line-soft hover:bg-jade-50/40" onClick={() => r && setOpen(r.id)}>
                        <td className="num whitespace-nowrap px-3 py-2">{thDateTime(h.acted_at)}</td>
                        <td className="px-3 py-2">{r ? empName(r) : "-"}</td>
                        <td className="px-3 py-2">
                          {r?.request_type_name ?? "-"} <span className="num text-xs text-ink-mute">{r?.doc_no}</span>
                        </td>
                        <td className="px-3 py-2 text-ink-soft">{r ? requestSummary(r) : ""}</td>
                        <td className="px-3 py-2">
                          <Badge color={mine?.color}>{mine?.label ?? h.status}</Badge> <span className="text-xs text-ink-mute">ขั้นที่ {h.step}</span>
                          {h.comment && <div className="text-xs text-ink-mute">“{h.comment}”</div>}
                        </td>
                        <td className="px-3 py-2">{st && <Badge color={st.color}>{st.label}</Badge>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      ) : (
        <Panel bodyClass="p-0">
          {sel.size > 0 && (
            <div className="sticky top-14 z-10 flex flex-wrap items-center gap-2 border-b border-line bg-jade-50 px-4 py-2.5">
              <span className="text-[15px] font-medium text-jade-900">เลือก {sel.size} รายการ</span>
              <div className="ml-auto flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => setSel(new Set())}>
                  ล้างที่เลือก
                </Button>
                <Button size="sm" variant="secondary" icon={<X className="size-4" />} onClick={() => setBulk("reject")}>
                  ไม่อนุมัติ
                </Button>
                <Button size="sm" icon={<Check className="size-4" />} onClick={() => setBulk("approve")}>
                  อนุมัติที่เลือก
                </Button>
              </div>
            </div>
          )}
          {loading ? (
            <div className="flex justify-center py-10"><Spinner /></div>
          ) : visible.length === 0 ? (
            <Empty icon={<Inbox className="size-8" />} title="ไม่มีเอกสารรออนุมัติ" description="เมื่อมีเอกสารถึงขั้นที่คุณต้องอนุมัติ จะแสดงที่นี่และแจ้งเตือนที่กระดิ่งด้านบน" />
          ) : (
            <>
              {/* desktop table */}
              <div className="thin-scroll hidden overflow-x-auto md:block">
                <table className="w-full text-[14px]">
                  <thead>
                    <tr className="border-b border-line bg-paper/60 text-left text-[13px] text-ink-soft">
                      <th className="w-px px-3 py-2">
                        <input type="checkbox" className="size-4 accent-jade-600" checked={allChecked} onChange={toggleAll} aria-label="เลือกทั้งหมด" />
                      </th>
                      <th className="px-3 py-2 font-medium">พนักงาน</th>
                      <th className="px-3 py-2 font-medium">เอกสาร</th>
                      <th className="px-3 py-2 font-medium">วันที่ / จำนวน</th>
                      <th className="px-3 py-2 font-medium">ขั้น</th>
                      <th className="px-3 py-2 font-medium">ยื่นเมื่อ</th>
                      <th className="px-3 py-2 text-right font-medium">รอมาแล้ว</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((r) => {
                      const wait = daysSince(r.created_at);
                      return (
                        <tr key={r.id} className={clsx("cursor-pointer border-b border-line-soft hover:bg-jade-50/40", sel.has(r.id) && "bg-jade-50/60")} onClick={() => setOpen(r.id)}>
                          <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              className="size-4 accent-jade-600"
                              checked={sel.has(r.id)}
                              onChange={() => setSel((s) => { const n = new Set(s); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })}
                              aria-label={`เลือก ${r.doc_no}`}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <Avatar src={r.photo_url} name={`${r.first_name} ${r.last_name}`} size={30} />
                              <div className="min-w-0">
                                <div className="truncate">{empName(r)}</div>
                                <div className="num text-xs text-ink-mute">{r.emp_code}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <div>{r.request_type_name}</div>
                            <div className="num text-xs text-ink-mute">{r.doc_no}</div>
                          </td>
                          <td className="px-3 py-2 text-ink-soft">
                            {r.request_type === "leave" && <span className="mr-1.5 inline-block size-2 rounded-full" style={{ background: r.leave_color ?? "#94a3b8" }} />}
                            {requestSummary(r)}
                            {r.reason && <div className="max-w-72 truncate text-xs text-ink-mute">{r.reason}</div>}
                          </td>
                          <td className="num px-3 py-2 whitespace-nowrap">{r.step}/{r.total_steps}</td>
                          <td className="num whitespace-nowrap px-3 py-2 text-ink-soft">{thDateTime(r.created_at)}</td>
                          <td className="px-3 py-2 text-right">
                            <span className={clsx("num", wait >= 3 ? "font-medium text-rust" : wait >= 1 ? "text-amber-ink" : "text-ink-mute")}>{wait === 0 ? "วันนี้" : `${wait} วัน`}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {/* mobile cards */}
              <ul className="divide-y divide-line-soft md:hidden">
                <li className="flex items-center gap-2 px-4 py-2 text-sm text-ink-soft">
                  <input type="checkbox" className="size-5 accent-jade-600" checked={allChecked} onChange={toggleAll} id="selall" />
                  <label htmlFor="selall">เลือกทั้งหมด</label>
                </li>
                {visible.map((r) => (
                  <li key={r.id} className="flex items-start gap-3 px-4 py-3">
                    <input
                      type="checkbox"
                      className="mt-1 size-5 accent-jade-600"
                      checked={sel.has(r.id)}
                      onChange={() => setSel((s) => { const n = new Set(s); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })}
                      aria-label={`เลือก ${r.doc_no}`}
                    />
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setOpen(r.id)}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-medium">{empName(r)}</span>
                        <span className="num shrink-0 text-xs text-ink-mute">{daysSince(r.created_at) === 0 ? "วันนี้" : `${daysSince(r.created_at)} วัน`}</span>
                      </div>
                      <div className="text-sm">{r.request_type_name}</div>
                      <div className="text-sm text-ink-soft">{requestSummary(r)}</div>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Panel>
      )}

      <Modal open={!!openId} onClose={() => setOpen(null)} title="รายละเอียดเอกสาร" size="lg">
        {openId && <RequestDetail requestId={openId} actions="approver" onChanged={() => { load(); setOpen(null); }} />}
      </Modal>

      <Modal
        open={!!bulk}
        onClose={() => setBulk(null)}
        size="sm"
        title={bulk === "approve" ? `อนุมัติ ${sel.size} รายการ` : `ไม่อนุมัติ ${sel.size} รายการ`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setBulk(null)}>
              ยกเลิก
            </Button>
            <Button variant={bulk === "reject" ? "danger" : "primary"} loading={busy} onClick={runBulk}>
              {bulk === "approve" ? "อนุมัติทั้งหมด" : "ไม่อนุมัติทั้งหมด"}
            </Button>
          </>
        }
      >
        <Field label={bulk === "reject" ? "เหตุผลที่ไม่อนุมัติ" : "ความเห็น (ถ้ามี)"} required={bulk === "reject"}>
          <Textarea value={bulkComment} onChange={(e) => setBulkComment(e.target.value)} rows={3} />
        </Field>
        <p className="mt-2 text-sm text-ink-mute">ความเห็นนี้จะบันทึกในทุกเอกสารที่เลือก รายการที่ไม่ได้อยู่ในขั้นของคุณแล้วจะถูกข้าม</p>
      </Modal>
    </>
  );
}

