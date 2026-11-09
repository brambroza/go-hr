"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MessageCircle, Phone, RefreshCw, Save } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useCan } from "@/components/app/me-context";
import { Badge, Button, Empty, Field, Modal, PageHeader, Panel, Select, Spinner, Textarea, errorText, toast } from "@/components/ui";
import { thDateTime } from "@/lib/format";
import { toCsv } from "@/lib/csv";

type Lead = {
  id: number;
  ref_no: string;
  company_name: string;
  contact_name: string;
  position: string | null;
  phone: string;
  email: string | null;
  line_id: string | null;
  headcount_range: string;
  industry: string | null;
  note: string | null;
  status: Status;
  sales_note: string | null;
  created_at: string;
};
type Status = "new" | "contacted" | "demo" | "trial" | "won" | "lost";

const STATUS: Record<Status, { label: string; color: string }> = {
  new: { label: "ใหม่", color: "amber" },
  contacted: { label: "ติดต่อแล้ว", color: "blue" },
  demo: { label: "นัด Demo", color: "violet" },
  trial: { label: "ทดลองใช้ 30 วัน", color: "violet" },
  won: { label: "ปิดการขาย", color: "green" },
  lost: { label: "ไม่สนใจ", color: "gray" },
};

/** Sales view of trial sign-ups from /trial (GoAlong demo server) */
export function TrialLeads() {
  const sb = supabaseBrowser();
  const can = useCan();
  const ro = !can("settings", "edit");
  const [rows, setRows] = useState<Lead[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Status | "">("");
  const [editing, setEditing] = useState<Lead | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    const { data, error } = await sb.from("trial_leads").select("*").order("created_at", { ascending: false }).limit(500);
    if (error) {
      setLoadError(error.message);
      setRows([]);
      return;
    }
    setRows((data ?? []) as Lead[]);
  }, [sb]);
  useEffect(() => {
    load();
  }, [load]);

  const shown = useMemo(() => (rows ?? []).filter((r) => !filter || r.status === filter), [rows, filter]);
  const counts = useMemo(() => {
    const c: Partial<Record<Status, number>> = {};
    for (const r of rows ?? []) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [rows]);

  const exportCsv = () => {
    const csv = toCsv([
      ["เลขที่", "วันที่", "บริษัท", "ผู้ติดต่อ", "ตำแหน่ง", "โทร", "LINE", "อีเมล", "พนักงาน", "ธุรกิจ", "หมายเหตุลูกค้า", "สถานะ", "บันทึกเซลส์"],
      ...shown.map((r) => [r.ref_no, thDateTime(r.created_at), r.company_name, r.contact_name, r.position ?? "", r.phone, r.line_id ?? "", r.email ?? "", r.headcount_range, r.industry ?? "", r.note ?? "", STATUS[r.status].label, r.sales_note ?? ""]),
    ]);
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `trial-leads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="ผู้ขอทดลองใช้"
        description="รายชื่อจากหน้า /trial ติดต่อกลับภายในวันทำการ แล้วอัปเดตสถานะ"
        actions={
          <>
            <Button variant="secondary" onClick={load}>
              <RefreshCw className="size-4" /> โหลดใหม่
            </Button>
            <Button variant="secondary" onClick={exportCsv} disabled={!shown.length}>
              ส่งออก CSV
            </Button>
          </>
        }
      />
      <Panel
        title={
          <div className="flex flex-wrap items-center gap-2">
            <Select value={filter} onChange={(e) => setFilter(e.target.value as Status | "")} className="h-11 w-48" aria-label="กรองตามสถานะ">
              <option value="">ทุกสถานะ ({rows?.length ?? 0})</option>
              {(Object.keys(STATUS) as Status[]).map((s) => (
                <option key={s} value={s}>
                  {STATUS[s].label} ({counts[s] ?? 0})
                </option>
              ))}
            </Select>
          </div>
        }
        bodyClass="p-0"
      >
        {rows === null ? (
          <div className="grid place-items-center py-12">
            <Spinner />
          </div>
        ) : loadError ? (
          <Empty
            title="โหลดข้อมูลไม่สำเร็จ"
            description={loadError.includes("trial_leads") ? "ยังไม่ได้รัน migration 20261107010000_trial_leads.sql" : loadError}
            action={<Button onClick={load}>ลองอีกครั้ง</Button>}
          />
        ) : !shown.length ? (
          <Empty title="ยังไม่มีผู้ขอทดลองใช้" description="เมื่อมีคนกรอกแบบฟอร์มที่หน้า /trial รายชื่อจะขึ้นที่นี่ และมีแจ้งเตือนถึงผู้ดูแลระบบ" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-paper text-left text-ink-soft">
                <tr>
                  <th className="px-4 py-2 font-medium">เลขที่ / วันที่</th>
                  <th className="px-4 py-2 font-medium">บริษัท</th>
                  <th className="px-4 py-2 font-medium">ผู้ติดต่อ</th>
                  <th className="px-4 py-2 font-medium">พนักงาน</th>
                  <th className="px-4 py-2 font-medium">สถานะ</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id} className="border-t border-line-soft align-top">
                    <td className="px-4 py-3">
                      <div className="num font-medium text-ink">{r.ref_no}</div>
                      <div className="text-xs text-ink-mute">{thDateTime(r.created_at)}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-ink">{r.company_name}</div>
                      <div className="text-xs text-ink-mute">{r.industry ?? "-"}</div>
                      {r.note && <div className="mt-1 max-w-xs text-xs text-ink-soft">“{r.note}”</div>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-ink">
                        {r.contact_name}
                        {r.position && <span className="text-ink-mute"> · {r.position}</span>}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-3 text-xs">
                        <a href={`tel:${r.phone}`} className="inline-flex items-center gap-1 text-jade-700 hover:underline">
                          <Phone className="size-3.5" /> {r.phone}
                        </a>
                        {r.line_id && (
                          <span className="inline-flex items-center gap-1 text-ink-soft">
                            <MessageCircle className="size-3.5" /> {r.line_id}
                          </span>
                        )}
                        {r.email && <span className="text-ink-soft">{r.email}</span>}
                      </div>
                    </td>
                    <td className="num whitespace-nowrap px-4 py-3 text-ink">{r.headcount_range}</td>
                    <td className="px-4 py-3">
                      <Badge color={STATUS[r.status].color}>{STATUS[r.status].label}</Badge>
                      {r.sales_note && <div className="mt-1 max-w-[200px] text-xs text-ink-soft">{r.sales_note}</div>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {!ro && (
                        <Button variant="secondary" onClick={() => setEditing(r)}>
                          อัปเดต
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      {editing && (
        <EditLead
          lead={editing}
          onClose={() => setEditing(null)}
          onSaved={(l) => {
            setRows((list) => list?.map((x) => (x.id === l.id ? l : x)) ?? null);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

/** Modal to change status + sales note of one lead */
function EditLead({ lead, onClose, onSaved }: { lead: Lead; onClose: () => void; onSaved: (l: Lead) => void }) {
  const sb = supabaseBrowser();
  const [status, setStatus] = useState<Status>(lead.status);
  const [note, setNote] = useState(lead.sales_note ?? "");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (note.length > 2000) return toast.error("บันทึกยาวเกิน 2,000 ตัวอักษร");
    setBusy(true);
    try {
      const { data, error } = await sb
        .from("trial_leads")
        .update({ status, sales_note: note.trim() || null })
        .eq("id", lead.id)
        .select("*")
        .single();
      if (error) throw error;
      toast.ok("บันทึกแล้ว");
      onSaved(data as Lead);
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`${lead.ref_no} · ${lead.company_name}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button onClick={save} disabled={busy}>
            <Save className="size-4" /> บันทึก
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="สถานะ">
          <Select value={status} onChange={(e) => setStatus(e.target.value as Status)} className="h-11">
            {(Object.keys(STATUS) as Status[]).map((s) => (
              <option key={s} value={s}>
                {STATUS[s].label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="บันทึกของเซลส์" hint="เช่น นัด demo วันที่, ราคาที่เสนอ, คู่แข่งที่ใช้อยู่">
          <Textarea rows={4} value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
