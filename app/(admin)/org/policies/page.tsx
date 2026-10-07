"use client";

import { useEffect, useMemo, useState } from "react";
import { ClipboardCheck, Download, Paperclip } from "lucide-react";
import { CrudPage } from "@/components/crud/crud-page";
import { Badge, Button, Empty, Input, Modal, Select, Spinner, Stat, toast } from "@/components/ui";
import { AttachmentsField, type Attachment } from "@/components/org/attachments-field";
import { Avatar } from "@/components/employees/avatar";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useCan, useMaybeMe } from "@/components/app/me-context";
import { thDate, thDateTime } from "@/lib/format";
import { downloadCsv } from "@/lib/csv";

const CATEGORIES = ["ระเบียบข้อบังคับ", "สวัสดิการ", "ความปลอดภัย (จป.)", "PDPA / ความเป็นส่วนตัว", "การลา / เวลาทำงาน", "จรรยาบรรณ", "อื่น ๆ"];

type Policy = { id: number; title: string; require_ack: boolean; effective_date: string | null };

export default function PoliciesPage() {
  const me = useMaybeMe();
  const [ackFor, setAckFor] = useState<Policy | null>(null);
  return (
    <>
      <CrudPage
        config={{
          table: "policies",
          title: "นโยบายบริษัท",
          description: "เผยแพร่ระเบียบและนโยบายให้พนักงานอ่าน กำหนดให้ต้องกด “รับทราบ” และติดตามว่าใครยังไม่รับทราบได้",
          menu: "org",
          orderBy: { column: "effective_date", ascending: false },
          searchColumns: ["title", "category", "content"],
          exportName: "policies",
          formSize: "lg",
          filters: [
            { name: "category", label: "หมวด", options: CATEGORIES.map((c) => ({ value: c, label: c })) },
            { name: "require_ack", label: "ต้องรับทราบ", options: [{ value: "true", label: "ต้องรับทราบ" }, { value: "false", label: "ไม่ต้องรับทราบ" }] },
          ],
          columns: [
            {
              key: "title",
              label: "หัวข้อ",
              sortable: true,
              render: (r) => (
                <span className="inline-flex items-center gap-1.5">
                  {String(r.title)}
                  {Array.isArray(r.attachments) && r.attachments.length > 0 && (
                    <span className="inline-flex items-center text-xs text-ink-mute" title="มีไฟล์แนบ">
                      <Paperclip className="size-3.5" />
                      <span className="num">{r.attachments.length}</span>
                    </span>
                  )}
                </span>
              ),
            },
            { key: "category", label: "หมวด" },
            { key: "effective_date", label: "มีผลตั้งแต่", sortable: true },
            { key: "require_ack", label: "ต้องรับทราบ", render: (r) => (r.require_ack ? <Badge color="amber">ต้องรับทราบ</Badge> : <span className="text-ink-mute">-</span>) },
            { key: "is_active", label: "เผยแพร่", render: (r) => (r.is_active ? <Badge color="green">เผยแพร่</Badge> : <Badge>ปิด</Badge>) },
          ],
          fields: [
            { name: "title", label: "หัวข้อ", type: "text", required: true, span: 2 },
            { name: "category", label: "หมวด", type: "select", options: CATEGORIES.map((c) => ({ value: c, label: c })) },
            { name: "effective_date", label: "มีผลตั้งแต่", type: "date", default: () => new Date().toISOString().slice(0, 10) },
            { name: "content", label: "เนื้อหา", type: "custom", span: 2, render: ({ value, onChange }) => <ContentEditor value={String(value ?? "")} onChange={onChange} /> },
            { name: "attachments", label: "ไฟล์แนบ", type: "custom", span: 2, default: () => [], render: ({ value, onChange }) => <AttachmentsField value={value} onChange={onChange} folder="policies" /> },
            { name: "require_ack", label: "พนักงานต้องกดรับทราบ", type: "boolean" },
            { name: "is_active", label: "เผยแพร่", type: "boolean", default: true },
          ],
          beforeSave: (v, editing) => ({ ...v, attachments: (v.attachments as Attachment[] | null) ?? [], ...(editing ? {} : { created_by: me?.userId ?? null }) }),
          rowActions: (r) =>
            r.require_ack ? (
              <Button size="sm" variant="subtle" icon={<ClipboardCheck className="size-4" />} onClick={() => setAckFor(r as unknown as Policy)}>
                การรับทราบ
              </Button>
            ) : null,
        }}
      />
      <AckReport policy={ackFor} onClose={() => setAckFor(null)} />
    </>
  );
}

function ContentEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={12}
        className="w-full rounded-[var(--radius-ctl)] border border-line bg-white px-3 py-2 text-[15px] leading-relaxed focus:border-jade-500 focus:outline-none focus:ring-2 focus:ring-jade-100"
        placeholder={"พิมพ์เนื้อหานโยบาย\n\nขึ้นบรรทัดใหม่ได้ตามปกติ ใช้ # นำหน้าเพื่อทำเป็นหัวข้อ และ - นำหน้าเพื่อทำเป็นรายการ"}
      />
      <span className="text-xs text-ink-mute"><span className="num">{value.length.toLocaleString()}</span> ตัวอักษร · รองรับ # หัวข้อ และ - รายการ</span>
    </div>
  );
}

type AckRow = { id: number; code: string; first_name: string; last_name: string; nickname: string | null; photo_url: string | null; org_unit_name: string | null; position_name: string | null; acked_at: string | null };

function AckReport({ policy, onClose }: { policy: Policy | null; onClose: () => void }) {
  const can = useCan();
  const [rows, setRows] = useState<AckRow[] | null>(null);
  const [filter, setFilter] = useState<"all" | "acked" | "pending">("pending");
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!policy) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount / reset form when opened
    setRows(null);
    const sb = supabaseBrowser();
    Promise.all([
      sb.from("v_directory").select("id, code, first_name, last_name, nickname, photo_url, org_unit_name, position_name").order("code").limit(10000),
      sb.from("policy_acks").select("employee_id, acked_at").eq("policy_id", policy.id).limit(10000),
    ]).then(([e, a]) => {
      if (e.error || a.error) toast.error((e.error ?? a.error)!.message);
      const acks = new Map(((a.data as { employee_id: number; acked_at: string }[]) ?? []).map((x) => [x.employee_id, x.acked_at]));
      setRows(((e.data as Omit<AckRow, "acked_at">[]) ?? []).map((r) => ({ ...r, acked_at: acks.get(r.id) ?? null })));
    });
  }, [policy]);

  const stats = useMemo(() => {
    const total = rows?.length ?? 0;
    const acked = rows?.filter((r) => r.acked_at).length ?? 0;
    return { total, acked, pending: total - acked, pct: total ? Math.round((acked / total) * 100) : 0 };
  }, [rows]);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (rows ?? []).filter(
      (r) =>
        (filter === "all" || (filter === "acked" ? r.acked_at : !r.acked_at)) &&
        (!t || `${r.code} ${r.first_name} ${r.last_name} ${r.nickname ?? ""} ${r.org_unit_name ?? ""}`.toLowerCase().includes(t)),
    );
  }, [rows, filter, q]);

  function exportCsv() {
    if (!rows || !policy) return;
    downloadCsv(`policy-ack-${policy.id}.csv`, [
      ["รหัส", "ชื่อ", "นามสกุล", "หน่วยงาน", "ตำแหน่ง", "สถานะ", "รับทราบเมื่อ"],
      ...rows.map((r) => [r.code, r.first_name, r.last_name, r.org_unit_name, r.position_name, r.acked_at ? "รับทราบแล้ว" : "ยังไม่รับทราบ", r.acked_at ? thDateTime(r.acked_at) : ""]),
    ]);
  }

  return (
    <Modal open={!!policy} onClose={onClose} size="lg" title={policy ? `การรับทราบ: ${policy.title}` : ""}>
      {!rows ? (
        <div className="py-10"><Spinner className="mx-auto" /></div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-3 gap-2">
            <Stat label="พนักงานปัจจุบัน" value={stats.total} />
            <Stat label="รับทราบแล้ว" value={stats.acked} sub={`${stats.pct}%`} />
            <Stat label="ยังไม่รับทราบ" value={stats.pending} tone={stats.pending ? "amber" : undefined} />
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-paper" role="progressbar" aria-valuenow={stats.pct} aria-valuemin={0} aria-valuemax={100} aria-label="สัดส่วนผู้รับทราบ">
            <div className="h-full bg-jade-500" style={{ width: `${stats.pct}%` }} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select className="h-9 sm:w-auto text-sm" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} aria-label="กรองสถานะ">
              <option value="pending">ยังไม่รับทราบ</option>
              <option value="acked">รับทราบแล้ว</option>
              <option value="all">ทั้งหมด</option>
            </Select>
            <Input className="h-9 w-full text-sm sm:w-56" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาชื่อ รหัส หน่วยงาน" aria-label="ค้นหา" />
            <span className="num ml-auto text-sm text-ink-mute">{shown.length} คน</span>
            {can("org", "export") && (
              <Button size="sm" variant="secondary" icon={<Download className="size-4" />} onClick={exportCsv}>
                ส่งออก
              </Button>
            )}
          </div>
          {shown.length === 0 ? (
            <Empty title={filter === "pending" ? "ทุกคนรับทราบแล้ว" : "ไม่มีรายการ"} />
          ) : (
            <ul className="divide-y divide-line-soft">
              {shown.slice(0, 300).map((r) => (
                <li key={r.id} className="flex items-center gap-3 py-2">
                  <Avatar src={r.photo_url} name={`${r.first_name} ${r.last_name}`} size={32} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px]">{r.first_name} {r.last_name}{r.nickname && <span className="text-ink-mute"> ({r.nickname})</span>}</div>
                    <div className="truncate text-xs text-ink-mute">{[r.code, r.org_unit_name].filter(Boolean).join(" · ")}</div>
                  </div>
                  {r.acked_at ? <Badge color="green">รับทราบ {thDate(r.acked_at)}</Badge> : <Badge color="amber">ยังไม่รับทราบ</Badge>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Modal>
  );
}
