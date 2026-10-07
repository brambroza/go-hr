"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Download, FilePlus2, Inbox, Search } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { addDays, isoDate, thDate, thDateTime } from "@/lib/format";
import { downloadCsv } from "@/lib/csv";
import { useCan } from "@/components/app/me-context";
import { Badge, Button, Empty, Input, Modal, PageHeader, Panel, Select, Spinner, clsx, toast } from "@/components/ui";
import { RequestDetail } from "./request-detail";
import { ProxySubmit } from "./proxy-submit";
import { CATEGORY_LABEL, REQUEST_STATUS, empName, errMsg, requestSummary, type RequestRow } from "./lib";
import { orgOptions, useReqLookups } from "./use-req-lookups";

const PAGE = 50;
const STATUSES = ["pending", "approved", "rejected", "cancelled"] as const;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Q = any;

export function RequestsList() {
  const sb = supabaseBrowser();
  const can = useCan();
  const lk = useReqLookups();
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const openId = Number(sp.get("id")) || null;
  const setOpen = (id: number | null) => {
    const p = new URLSearchParams(sp.toString());
    if (id) p.set("id", String(id));
    else p.delete("id");
    router.replace(`${pathname}${p.size ? `?${p}` : ""}`, { scroll: false });
  };

  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState(addDays(isoDate(), -60));
  const [to, setTo] = useState(addDays(isoDate(), 60));
  const [org, setOrg] = useState("");
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [proxyOpen, setProxyOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => setPage(0), [type, status, from, to, org, qDebounced]);

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
    return [...ids];
  }, [org, lk.orgUnits]);

  const applyFilters = useCallback(
    (query: Q, withStatus: boolean) => {
      if (type) query = query.eq("request_type", type);
      if (withStatus && status) query = query.eq("status", status);
      if (orgIds) query = query.in("org_unit_id", orgIds);
      if (from && to) {
        query = query.or(`and(start_date.lte.${to},end_date.gte.${from}),and(start_date.lte.${to},end_date.is.null,start_date.gte.${from}),and(start_date.is.null,created_at.gte.${from},created_at.lt.${addDays(to, 1)})`);
      }
      if (qDebounced) {
        const s = qDebounced.replace(/[%,()*]/g, "");
        query = query.or(`first_name.ilike.*${s}*,last_name.ilike.*${s}*,nickname.ilike.*${s}*,emp_code.ilike.*${s}*,doc_no.ilike.*${s}*`);
      }
      return query;
    },
    [type, status, orgIds, from, to, qDebounced],
  );

  const load = useCallback(async () => {
    setLoading(true);
    const list = applyFilters(sb.from("v_requests").select("*", { count: "exact" }), true)
      .order("created_at", { ascending: false })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    const countQs = STATUSES.map((st) => applyFilters(sb.from("v_requests").select("id", { count: "exact", head: true }), false).eq("status", st));
    const [res, ...cs] = await Promise.all([list, ...countQs]);
    if (res.error) toast.error(errMsg(res.error));
    setRows((res.data ?? []) as RequestRow[]);
    setTotal(res.count ?? 0);
    setCounts(Object.fromEntries(STATUSES.map((st, i) => [st, cs[i].count ?? 0])));
    setLoading(false);
  }, [sb, applyFilters, page]);

  useEffect(() => {
    load();
  }, [load]);

  async function exportCsv() {
    setExporting(true);
    const all: RequestRow[] = [];
    for (let i = 0; i < 20; i++) {
      const { data, error } = await applyFilters(sb.from("v_requests").select("*"), true)
        .order("created_at", { ascending: false })
        .range(i * 1000, i * 1000 + 999);
      if (error) {
        setExporting(false);
        return toast.error(errMsg(error));
      }
      all.push(...((data ?? []) as RequestRow[]));
      if ((data ?? []).length < 1000) break;
    }
    const orgName = Object.fromEntries(lk.orgUnits.map((o) => [o.id, o.name]));
    downloadCsv(`requests_${isoDate()}.csv`, [
      ["เลขที่", "ประเภท", "หมวด", "รหัสพนักงาน", "ชื่อ-สกุล", "หน่วยงาน", "วันที่เริ่ม", "วันที่สิ้นสุด", "วัน", "นาที", "จำนวนเงิน", "รายละเอียด", "เหตุผล", "สถานะ", "ขั้นปัจจุบัน", "จำนวนขั้น", "ยื่นเมื่อ", "เสร็จสิ้นเมื่อ", "หมายเหตุผล"],
      ...all.map((r) => [
        r.doc_no, r.request_type_name, CATEGORY_LABEL[r.category] ?? r.category, r.emp_code, `${r.first_name} ${r.last_name}`, r.org_unit_id ? orgName[r.org_unit_id] ?? "" : "",
        r.start_date, r.end_date, r.days, r.minutes, r.amount, requestSummary(r), r.reason, REQUEST_STATUS[r.status]?.label ?? r.status,
        r.status === "pending" ? r.current_step : "", r.total_steps, thDateTime(r.created_at), r.completed_at ? thDateTime(r.completed_at) : "", r.result_note,
      ]),
    ]);
    setExporting(false);
  }

  const orgOpts = useMemo(() => orgOptions(lk.orgUnits), [lk.orgUnits]);
  const canProxy = can("request_admin", "create");
  const allCount = STATUSES.reduce((a, s) => a + (counts[s] ?? 0), 0);

  return (
    <>
      <PageHeader
        title="เอกสารทั้งหมด"
        description="ใบลา โอที เพิ่มเวลา เบิกเงิน หนังสือรับรอง และเอกสารอื่น ๆ ของพนักงานที่คุณดูแล"
        actions={
          <>
            {can("request_admin", "export") && (
              <Button variant="secondary" icon={<Download className="size-4" />} loading={exporting} onClick={exportCsv}>
                ดาวน์โหลด CSV
              </Button>
            )}
            {canProxy && (
              <Button icon={<FilePlus2 className="size-4" />} onClick={() => setProxyOpen(true)}>
                ยื่นแทนพนักงาน
              </Button>
            )}
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <StatusChip label="ทั้งหมด" value={allCount} active={!status} onClick={() => setStatus("")} />
        {STATUSES.map((st) => (
          <StatusChip key={st} label={REQUEST_STATUS[st].label} value={counts[st] ?? 0} tone={st} active={status === st} onClick={() => setStatus(status === st ? "" : st)} />
        ))}
      </div>

      <Panel bodyClass="p-0">
        <div className="grid grid-cols-1 gap-2 border-b border-line-soft p-3 sm:grid-cols-2 lg:grid-cols-6">
          <div className="relative lg:col-span-2">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-mute" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาชื่อ รหัสพนักงาน หรือเลขที่เอกสาร" className="pl-9" />
          </div>
          <Select value={type} onChange={(e) => setType(e.target.value)} placeholder="ทุกประเภทเอกสาร">
            {lk.types.map((t) => (
              <option key={t.code} value={t.code}>
                {t.name}
              </option>
            ))}
          </Select>
          <Select value={org} onChange={(e) => setOrg(e.target.value)} placeholder="ทุกหน่วยงาน">
            {orgOpts.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
          <div className="flex items-center gap-1.5 sm:col-span-2 lg:col-span-2">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="ตั้งแต่วันที่" className="w-auto min-w-0 flex-1" />
            <span className="text-ink-mute">–</span>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="ถึงวันที่" className="w-auto min-w-0 flex-1" />
          </div>
        </div>

        {loading && !rows.length ? (
          <div className="flex justify-center py-10"><Spinner /></div>
        ) : rows.length === 0 ? (
          <Empty icon={<Inbox className="size-8" />} title="ไม่พบเอกสาร" description="ลองขยายช่วงวันที่ หรือล้างตัวกรอง" />
        ) : (
          <>
            <div className={clsx("thin-scroll hidden overflow-x-auto md:block", loading && "opacity-60")}>
              <table className="w-full text-[14px]">
                <thead>
                  <tr className="border-b border-line bg-paper/60 text-left text-[13px] text-ink-soft">
                    <th className="px-3 py-2 font-medium">เลขที่</th>
                    <th className="px-3 py-2 font-medium">พนักงาน</th>
                    <th className="px-3 py-2 font-medium">ประเภท</th>
                    <th className="px-3 py-2 font-medium">รายละเอียด</th>
                    <th className="px-3 py-2 font-medium">ยื่นเมื่อ</th>
                    <th className="px-3 py-2 font-medium">สถานะ</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const st = REQUEST_STATUS[r.status] ?? { label: r.status, color: "gray" };
                    return (
                      <tr key={r.id} className="cursor-pointer border-b border-line-soft hover:bg-jade-50/40" onClick={() => setOpen(r.id)}>
                        <td className="num whitespace-nowrap px-3 py-2 text-ink-soft">{r.doc_no}</td>
                        <td className="px-3 py-2">
                          <div>{empName(r)}</div>
                          <div className="num text-xs text-ink-mute">{r.emp_code}</div>
                        </td>
                        <td className="px-3 py-2">{r.request_type_name}</td>
                        <td className="px-3 py-2 text-ink-soft">
                          <span className="inline-flex items-center gap-1.5">
                            {r.request_type === "leave" && <span className="size-2 rounded-full" style={{ background: r.leave_color ?? "#94a3b8" }} />}
                            {requestSummary(r)}
                          </span>
                        </td>
                        <td className="num whitespace-nowrap px-3 py-2 text-ink-soft">{thDate(r.created_at)}</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <Badge color={st.color}>{st.label}</Badge>
                          {r.status === "pending" && <span className="num ml-1.5 text-xs text-ink-mute">ขั้น {r.current_step}/{r.total_steps}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-line-soft md:hidden">
              {rows.map((r) => {
                const st = REQUEST_STATUS[r.status] ?? { label: r.status, color: "gray" };
                return (
                  <li key={r.id}>
                    <button type="button" className="w-full px-4 py-3 text-left" onClick={() => setOpen(r.id)}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-medium">{empName(r)}</span>
                        <Badge color={st.color}>{st.label}</Badge>
                      </div>
                      <div className="text-sm">{r.request_type_name} <span className="num text-xs text-ink-mute">{r.doc_no}</span></div>
                      <div className="text-sm text-ink-soft">{requestSummary(r)}</div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
        {total > PAGE && (
          <div className="flex items-center justify-between border-t border-line-soft px-4 py-2.5 text-sm text-ink-soft">
            <span className="num">
              {page * PAGE + 1}–{Math.min(total, page * PAGE + PAGE)} จาก {total}
            </span>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="ก่อนหน้า">
                <ChevronLeft className="size-4" />
              </Button>
              <Button size="sm" variant="ghost" disabled={(page + 1) * PAGE >= total} onClick={() => setPage(page + 1)} aria-label="ถัดไป">
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        )}
      </Panel>

      <Modal open={!!openId} onClose={() => setOpen(null)} title="รายละเอียดเอกสาร" size="lg">
        {openId && <RequestDetail requestId={openId} actions="admin" onChanged={load} />}
      </Modal>

      {canProxy && (
        <ProxySubmit
          open={proxyOpen}
          onClose={() => setProxyOpen(false)}
          onSubmitted={(req) => {
            setProxyOpen(false);
            toast.ok(`ยื่นเอกสาร ${req.doc_no} แล้ว`);
            load();
            setOpen(req.id);
          }}
        />
      )}
    </>
  );
}

function StatusChip({ label, value, tone, active, onClick }: { label: string; value: number; tone?: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "rounded-[var(--radius-panel)] border bg-white px-3 py-2 text-left transition-colors",
        active ? "border-jade-500 ring-2 ring-jade-100" : "border-line hover:border-jade-200",
      )}
    >
      <div className="text-sm text-ink-soft">{label}</div>
      <div className={clsx("num text-xl font-semibold", tone === "pending" ? "text-amber-ink" : tone === "rejected" ? "text-rust" : tone === "approved" ? "text-jade-700" : "text-ink")}>{value.toLocaleString("th-TH")}</div>
    </button>
  );
}
