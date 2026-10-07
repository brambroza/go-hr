"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { FileText, GitBranch, Pencil } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useCan } from "@/components/app/me-context";
import { Badge, Button, Field, Input, Modal, PageHeader, Panel, Spinner, Textarea, Toggle, toast } from "@/components/ui";
import { CATEGORY_LABEL, errMsg, isPrintable } from "./lib";
import { loadReqLookups } from "./use-req-lookups";

interface RType {
  code: string;
  name: string;
  name_en: string | null;
  category: string;
  icon: string | null;
  is_active: boolean;
  self_service: boolean;
  needs_attachment: boolean;
  sort_order: number;
  description: string | null;
}

export function RequestTypesEditor() {
  const sb = supabaseBrowser();
  const can = useCan();
  const canEdit = can("request_admin", "edit");
  const [rows, setRows] = useState<RType[]>([]);
  const [flowCount, setFlowCount] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<RType | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data, error }, flows] = await Promise.all([
      sb.from("request_types").select("*").order("sort_order"),
      sb.from("approval_flows").select("request_type").eq("is_active", true),
    ]);
    if (error) toast.error(errMsg(error));
    setRows((data ?? []) as RType[]);
    const c: Record<string, number> = {};
    for (const f of (flows.data ?? []) as { request_type: string | null }[]) if (f.request_type) c[f.request_type] = (c[f.request_type] ?? 0) + 1;
    setFlowCount(c);
    setLoading(false);
  }, [sb]);

  useEffect(() => {
    load();
  }, [load]);

  async function patch(code: string, p: Partial<RType>) {
    setRows((r) => r.map((x) => (x.code === code ? { ...x, ...p } : x)));
    const { error } = await sb.from("request_types").update(p).eq("code", code);
    if (error) {
      toast.error(errMsg(error));
      load();
    } else loadReqLookups(true);
  }

  async function save() {
    if (!edit) return;
    if (!edit.name.trim()) return toast.error("กรุณาระบุชื่อภาษาไทย");
    setSaving(true);
    const { error } = await sb
      .from("request_types")
      .update({ name: edit.name.trim(), name_en: edit.name_en?.trim() || null, description: edit.description?.trim() || null, sort_order: Number(edit.sort_order) || 0 })
      .eq("code", edit.code);
    setSaving(false);
    if (error) return toast.error(errMsg(error));
    toast.ok("บันทึกแล้ว");
    setEdit(null);
    loadReqLookups(true);
    load();
  }

  return (
    <>
      <PageHeader
        title="ประเภทเอกสาร"
        description="เปิด/ปิดเอกสารแต่ละประเภท กำหนดว่าพนักงานยื่นเองได้หรือไม่ และต้องแนบไฟล์หรือไม่"
        actions={
          <>
            <Link href="/requests/flows" className="inline-flex h-10 items-center gap-1.5 rounded-[var(--radius-ctl)] border border-line bg-white px-4 text-[15px] font-medium hover:bg-jade-50">
              <GitBranch className="size-4" /> ลำดับขั้นการอนุมัติ
            </Link>
            <Link href="/requests/templates" className="inline-flex h-10 items-center gap-1.5 rounded-[var(--radius-ctl)] border border-line bg-white px-4 text-[15px] font-medium hover:bg-jade-50">
              <FileText className="size-4" /> แบบฟอร์มเอกสาร
            </Link>
          </>
        }
      />
      <Panel bodyClass="p-0">
        {loading ? (
          <div className="flex justify-center py-10"><Spinner /></div>
        ) : (
          <div className="thin-scroll overflow-x-auto">
            <table className="w-full text-[14px]">
              <thead>
                <tr className="border-b border-line bg-paper/60 text-left text-[13px] text-ink-soft">
                  <th className="px-3 py-2 font-medium">ลำดับ</th>
                  <th className="px-3 py-2 font-medium">เอกสาร</th>
                  <th className="px-3 py-2 font-medium">หมวด</th>
                  <th className="px-3 py-2 font-medium">ใช้งาน</th>
                  <th className="px-3 py-2 font-medium">พนักงานยื่นเองได้</th>
                  <th className="px-3 py-2 font-medium">ต้องแนบไฟล์</th>
                  <th className="px-3 py-2 font-medium">ลำดับอนุมัติเฉพาะ</th>
                  <th className="w-px px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.code} className="border-b border-line-soft align-top">
                    <td className="num px-3 py-2.5 text-ink-mute">{r.sort_order}</td>
                    <td className="px-3 py-2.5">
                      <div className="font-medium">{r.name}</div>
                      <div className="text-xs text-ink-mute">
                        {r.name_en ?? "-"} · <span className="num">{r.code}</span>
                        {isPrintable(r.code) && <Badge color="blue" className="ml-1.5">มีแบบพิมพ์</Badge>}
                      </div>
                      {r.description && <div className="mt-0.5 max-w-md text-xs text-ink-soft">{r.description}</div>}
                    </td>
                    <td className="px-3 py-2.5"><Badge>{CATEGORY_LABEL[r.category] ?? r.category}</Badge></td>
                    <td className="px-3 py-2.5"><Toggle checked={r.is_active} disabled={!canEdit} onChange={(v) => patch(r.code, { is_active: v })} /></td>
                    <td className="px-3 py-2.5"><Toggle checked={r.self_service} disabled={!canEdit} onChange={(v) => patch(r.code, { self_service: v })} /></td>
                    <td className="px-3 py-2.5"><Toggle checked={r.needs_attachment} disabled={!canEdit} onChange={(v) => patch(r.code, { needs_attachment: v })} /></td>
                    <td className="px-3 py-2.5 text-ink-soft">{flowCount[r.code] ? `${flowCount[r.code]} ลำดับ` : <span className="text-ink-mute">ใช้ลำดับทั่วไป</span>}</td>
                    <td className="px-3 py-2.5">
                      {canEdit && (
                        <Button size="sm" variant="ghost" icon={<Pencil className="size-4" />} onClick={() => setEdit({ ...r })}>
                          แก้ไข
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

      <Modal
        open={!!edit}
        onClose={() => setEdit(null)}
        title={`แก้ไขประเภทเอกสาร ${edit?.code ?? ""}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEdit(null)}>
              ยกเลิก
            </Button>
            <Button loading={saving} onClick={save}>
              บันทึก
            </Button>
          </>
        }
      >
        {edit && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="ชื่อภาษาไทย" required className="sm:col-span-2">
              <Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            </Field>
            <Field label="ชื่อภาษาอังกฤษ">
              <Input value={edit.name_en ?? ""} onChange={(e) => setEdit({ ...edit, name_en: e.target.value })} />
            </Field>
            <Field label="ลำดับการแสดง">
              <Input type="number" value={edit.sort_order} onChange={(e) => setEdit({ ...edit, sort_order: Number(e.target.value) })} />
            </Field>
            <Field label="คำอธิบาย" hint="แสดงให้พนักงานเห็นตอนยื่นเอกสาร" className="sm:col-span-2">
              <Textarea value={edit.description ?? ""} onChange={(e) => setEdit({ ...edit, description: e.target.value })} rows={3} />
            </Field>
          </div>
        )}
      </Modal>
    </>
  );
}
