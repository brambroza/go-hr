"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Eye, ImagePlus, Megaphone, Pencil, Pin, Plus, Search, Send, Trash2, X } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useCan } from "@/components/app/me-context";
import { Badge, Button, Empty, Field, Input, Modal, PageHeader, Panel, Spinner, Tabs, Textarea, Toggle, clsx, toast, useConfirm } from "@/components/ui";
import { AttachmentsField, type Attachment } from "@/components/org/attachments-field";
import { resizeImage, uploadFile } from "@/lib/storage";
import { thDateTime } from "@/lib/format";
import { downloadCsv } from "@/lib/csv";
import { RichText } from "./rich-text";

type Audience = { all?: boolean; branch_ids?: number[]; org_unit_ids?: number[]; employee_ids?: number[] };
type Ann = {
  id: number; title: string; content: string | null; image_url: string | null; attachments: Attachment[]; audience: Audience;
  is_pinned: boolean; publish_at: string; expire_at: string | null; push_line: boolean; pushed_at: string | null; created_at: string;
};
type Stat = { announcement_id: number; audience: number; reads: number };
type Reader = { employee_id: number; code: string; name: string; org_unit_name: string | null; read_at: string | null };
type Opt = { id: number; name: string };
type EmpOpt = { id: number; code: string; first_name: string; last_name: string; nickname: string | null };

/** datetime-local value in Bangkok time ↔ ISO */
const toLocal = (iso: string | null | undefined) => {
  if (!iso) return "";
  const d = new Date(Date.parse(iso) + 7 * 3600_000);
  return d.toISOString().slice(0, 16);
};
const fromLocal = (v: string) => (v ? new Date(v + ":00+07:00").toISOString() : null);

function statusOf(a: Ann): { label: string; color: string; key: "scheduled" | "active" | "expired" } {
  const now = Date.now();
  if (Date.parse(a.publish_at) > now) return { label: "ตั้งเวลาเผยแพร่", color: "blue", key: "scheduled" };
  if (a.expire_at && Date.parse(a.expire_at) <= now) return { label: "หมดอายุ", color: "gray", key: "expired" };
  return { label: "เผยแพร่อยู่", color: "green", key: "active" };
}

export function AnnouncementsAdmin() {
  const sb = supabaseBrowser();
  const can = useCan();
  const { confirm, dialog } = useConfirm();
  const [rows, setRows] = useState<Ann[] | null>(null);
  const [stats, setStats] = useState<Map<number, Stat>>(new Map());
  const [tab, setTab] = useState<"all" | "active" | "scheduled" | "expired">("all");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Partial<Ann> | null>(null);
  const [viewing, setViewing] = useState<Ann | null>(null);
  const [refs, setRefs] = useState<{ branches: Opt[]; orgs: Opt[]; emps: EmpOpt[] }>({ branches: [], orgs: [], emps: [] });

  const load = useCallback(async () => {
    const { data, error } = await sb.from("announcements").select("*").order("is_pinned", { ascending: false }).order("publish_at", { ascending: false }).limit(500);
    if (error) toast.error(error.message);
    const list = (data ?? []) as Ann[];
    setRows(list);
    if (list.length) {
      const { data: st } = await sb.rpc("announcement_stats", { p_ids: list.map((a) => a.id) });
      setStats(new Map(((st ?? []) as Stat[]).map((s) => [s.announcement_id, s])));
    }
  }, [sb]);

  useEffect(() => {
    load();
    (async () => {
      const [b, o, e] = await Promise.all([
        sb.from("branches").select("id, name").order("id"),
        sb.from("org_units").select("id, name").eq("is_active", true).order("id"),
        sb.from("v_directory").select("id, code, first_name, last_name, nickname").order("code").limit(5000),
      ]);
      setRefs({ branches: (b.data ?? []) as Opt[], orgs: (o.data ?? []) as Opt[], emps: (e.data ?? []) as EmpOpt[] });
    })();
  }, [load, sb]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (rows ?? []).filter((a) => (tab === "all" || statusOf(a).key === tab) && (!t || a.title.toLowerCase().includes(t) || (a.content ?? "").toLowerCase().includes(t)));
  }, [rows, tab, q]);

  const counts = useMemo(() => {
    const c = { all: 0, active: 0, scheduled: 0, expired: 0 };
    for (const a of rows ?? []) (c.all++, c[statusOf(a).key]++);
    return c;
  }, [rows]);

  const audienceText = (a: Audience) => {
    if (!a || a.all) return "พนักงานทุกคน";
    const parts: string[] = [];
    if (a.branch_ids?.length) parts.push(`สาขา: ${a.branch_ids.map((id) => refs.branches.find((b) => b.id === id)?.name ?? id).join(", ")}`);
    if (a.org_unit_ids?.length) parts.push(`หน่วยงาน: ${a.org_unit_ids.map((id) => refs.orgs.find((b) => b.id === id)?.name ?? id).join(", ")}`);
    if (a.employee_ids?.length) parts.push(`พนักงาน ${a.employee_ids.length} คน`);
    return parts.join(" · ") || "ยังไม่ได้เลือกผู้รับ";
  };

  const remove = async (a: Ann) => {
    if (!(await confirm(`ลบประกาศ "${a.title}"? สถิติการอ่านจะถูกลบด้วย`, { danger: true, confirmText: "ลบประกาศ" }))) return;
    const { error } = await sb.from("announcements").delete().eq("id", a.id);
    if (error) return toast.error(error.message);
    toast.ok("ลบประกาศแล้ว");
    load();
  };

  const togglePin = async (a: Ann) => {
    const { error } = await sb.from("announcements").update({ is_pinned: !a.is_pinned }).eq("id", a.id);
    if (error) return toast.error(error.message);
    load();
  };

  return (
    <div>
      <PageHeader
        title="ประกาศข่าวสาร"
        description="ประกาศถึงพนักงานทั้งบริษัท หรือเฉพาะสาขา หน่วยงาน หรือรายบุคคล ตั้งเวลาเผยแพร่ ปักหมุด และส่งแจ้งเตือนทาง LINE"
        actions={can("tools", "edit") && <Button icon={<Plus className="size-4" />} onClick={() => setEditing({ audience: { all: true }, attachments: [], publish_at: new Date().toISOString() })}>สร้างประกาศ</Button>}
      />
      <Panel bodyClass="p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-soft px-4 pt-2">
          <Tabs
            className="border-b-0"
            value={tab}
            onChange={setTab}
            tabs={[
              { value: "all", label: "ทั้งหมด", count: counts.all },
              { value: "active", label: "เผยแพร่อยู่", count: counts.active },
              { value: "scheduled", label: "ตั้งเวลา", count: counts.scheduled },
              { value: "expired", label: "หมดอายุ", count: counts.expired },
            ]}
          />
          <div className="relative mb-2 w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-mute" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาหัวข้อ" className="pl-9" />
          </div>
        </div>
        {!rows ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : !filtered.length ? (
          <Empty icon={<Megaphone className="size-8" />} title="ยังไม่มีประกาศ" description="สร้างประกาศแรก เช่น กำหนดการตรวจสุขภาพ หรือวันหยุดบริษัท" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[14px]">
              <thead className="text-left text-sm text-ink-soft">
                <tr className="border-b border-line-soft">
                  <th className="px-4 py-2 font-medium">หัวข้อ</th>
                  <th className="px-3 py-2 font-medium">ผู้รับ</th>
                  <th className="px-3 py-2 font-medium">เผยแพร่</th>
                  <th className="px-3 py-2 font-medium">การอ่าน</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => {
                  const s = statusOf(a);
                  const st = stats.get(a.id);
                  const pct = st && st.audience ? Math.round((st.reads / st.audience) * 100) : 0;
                  return (
                    <tr key={a.id} className="border-b border-line-soft last:border-0 hover:bg-jade-50/40">
                      <td className="max-w-md px-4 py-2.5">
                        <button type="button" onClick={() => setViewing(a)} className="flex items-center gap-1.5 text-left font-medium text-ink hover:text-jade-700">
                          {a.is_pinned && <Pin className="size-3.5 shrink-0 text-jade-600" aria-label="ปักหมุด" />}
                          <span className="truncate">{a.title}</span>
                        </button>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                          <Badge color={s.color}>{s.label}</Badge>
                          {a.push_line && <Badge color={a.pushed_at ? "green" : "gray"}>{a.pushed_at ? "ส่ง LINE แล้ว" : "รอส่ง LINE"}</Badge>}
                          {a.attachments?.length > 0 && <span className="text-xs text-ink-mute">ไฟล์แนบ {a.attachments.length}</span>}
                        </div>
                      </td>
                      <td className="max-w-56 px-3 py-2.5 text-ink-soft"><span className="line-clamp-2">{audienceText(a.audience)}</span></td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-ink-soft">
                        {thDateTime(a.publish_at)}
                        {a.expire_at && <div className="text-xs text-ink-mute">ถึง {thDateTime(a.expire_at)}</div>}
                      </td>
                      <td className="px-3 py-2.5">
                        {st ? (
                          <button type="button" onClick={() => setViewing(a)} className="group w-36 text-left">
                            <div className="num text-sm"><b>{st.reads}</b> / {st.audience} คน <span className="text-ink-mute">({pct}%)</span></div>
                            <div className="mt-1 h-1.5 rounded-full bg-line-soft"><div className="h-1.5 rounded-full bg-jade-500" style={{ width: `${pct}%` }} /></div>
                          </button>
                        ) : "-"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right">
                        <Button variant="ghost" size="sm" icon={<Eye className="size-4" />} onClick={() => setViewing(a)} aria-label="ดูสถิติ" title="ดูรายละเอียดและผู้ที่ยังไม่อ่าน" />
                        {can("tools", "edit") && (
                          <>
                            <Button variant="ghost" size="sm" icon={<Pin className={clsx("size-4", a.is_pinned && "fill-jade-600 text-jade-600")} />} onClick={() => togglePin(a)} aria-label={a.is_pinned ? "เลิกปักหมุด" : "ปักหมุด"} title={a.is_pinned ? "เลิกปักหมุด" : "ปักหมุด"} />
                            <Button variant="ghost" size="sm" icon={<Pencil className="size-4" />} onClick={() => setEditing(a)} aria-label="แก้ไข" title="แก้ไข" />
                          </>
                        )}
                        {can("tools", "delete") && <Button variant="ghost" size="sm" icon={<Trash2 className="size-4" />} onClick={() => remove(a)} aria-label="ลบ" title="ลบ" />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      {editing && <AnnouncementForm value={editing} refs={refs} onClose={() => setEditing(null)} onSaved={() => (setEditing(null), load())} />}
      {viewing && <AnnouncementView a={viewing} audience={audienceText(viewing.audience)} onClose={() => setViewing(null)} />}
      {dialog}
    </div>
  );
}

function AnnouncementView({ a, audience, onClose }: { a: Ann; audience: string; onClose: () => void }) {
  const sb = supabaseBrowser();
  const [readers, setReaders] = useState<Reader[] | null>(null);
  const [tab, setTab] = useState<"unread" | "read" | "content">("unread");
  useEffect(() => {
    sb.rpc("announcement_readers", { p_id: a.id }).then(({ data, error }: { data: unknown; error: { message: string } | null }) => {
      if (error) toast.error(error.message);
      setReaders((data ?? []) as Reader[]);
    });
  }, [sb, a.id]);
  const unread = (readers ?? []).filter((r) => !r.read_at);
  const read = (readers ?? []).filter((r) => r.read_at);
  const list = tab === "unread" ? unread : read;
  return (
    <Modal open onClose={onClose} title={a.title} size="lg"
      footer={readers && unread.length > 0 && (
        <Button variant="secondary" onClick={() => downloadCsv(`ยังไม่อ่าน-${a.id}.csv`, [["รหัส", "ชื่อ", "หน่วยงาน"], ...unread.map((r) => [r.code, r.name, r.org_unit_name ?? ""])])}>ดาวน์โหลดรายชื่อที่ยังไม่อ่าน</Button>
      )}>
      <div className="mb-3 text-sm text-ink-soft">{thDateTime(a.publish_at)} · {audience}</div>
      <Tabs value={tab} onChange={setTab} tabs={[{ value: "unread", label: "ยังไม่อ่าน", count: unread.length }, { value: "read", label: "อ่านแล้ว", count: read.length }, { value: "content", label: "เนื้อหา" }]} className="mb-3" />
      {tab === "content" ? (
        <div className="flex flex-col gap-3">
          {a.image_url && (
             
            <img src={a.image_url} alt="" className="max-h-80 w-full rounded-[var(--radius-ctl)] bg-paper object-contain" />
          )}
          <RichText text={a.content} className="text-[15px] leading-relaxed" />
        </div>
      ) : !readers ? (
        <Spinner />
      ) : !list.length ? (
        <p className="py-8 text-center text-ink-soft">{tab === "unread" ? "ทุกคนอ่านประกาศนี้แล้ว" : "ยังไม่มีผู้อ่าน"}</p>
      ) : (
        <ul className="max-h-96 divide-y divide-line-soft overflow-y-auto rounded-[var(--radius-ctl)] border border-line">
          {list.map((r) => (
            <li key={r.employee_id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span className="min-w-0"><span className="font-medium">{r.name}</span> <span className="text-ink-mute">{r.code}</span></span>
              <span className="shrink-0 text-ink-soft">{r.read_at ? thDateTime(r.read_at) : r.org_unit_name ?? ""}</span>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

function MultiPick({ label, options, value, onChange }: { label: string; options: { id: number; name: string }[]; value: number[]; onChange: (v: number[]) => void }) {
  return (
    <Field label={label}>
      <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto rounded-[var(--radius-ctl)] border border-line p-2">
        {options.map((o) => {
          const on = value.includes(o.id);
          return (
            <button key={o.id} type="button" onClick={() => onChange(on ? value.filter((x) => x !== o.id) : [...value, o.id])}
              className={clsx("rounded-full border px-2.5 py-1 text-sm", on ? "border-jade-600 bg-jade-50 text-jade-800" : "border-line text-ink-soft hover:bg-paper")}>
              {o.name}
            </button>
          );
        })}
      </div>
    </Field>
  );
}

function AnnouncementForm({ value, refs, onClose, onSaved }: { value: Partial<Ann>; refs: { branches: Opt[]; orgs: Opt[]; emps: EmpOpt[] }; onClose: () => void; onSaved: () => void }) {
  const sb = supabaseBrowser();
  const [v, setV] = useState<Partial<Ann>>(value);
  const [aud, setAud] = useState<Audience>(value.audience ?? { all: true });
  const [mode, setMode] = useState<"all" | "groups">(value.audience?.all === false || (value.audience && !value.audience.all) ? "groups" : "all");
  const [empQ, setEmpQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<Record<string, string>>({});
  const set = (p: Partial<Ann>) => setV((x) => ({ ...x, ...p }));
  const empMatches = useMemo(() => {
    const t = empQ.trim().toLowerCase();
    if (!t) return [];
    return refs.emps.filter((e) => `${e.first_name} ${e.last_name} ${e.nickname ?? ""} ${e.code}`.toLowerCase().includes(t) && !aud.employee_ids?.includes(e.id)).slice(0, 8);
  }, [empQ, refs.emps, aud.employee_ids]);

  const uploadImage = async (f: File | undefined) => {
    if (!f) return;
    setUploading(true);
    try {
      const blob = await resizeImage(f, 1600, 0.85);
      const r = await uploadFile("public", blob, { folder: "announcements", name: "cover.jpg" });
      set({ image_url: r.url });
    } catch (e) {
      toast.error(`อัปโหลดรูปไม่สำเร็จ: ${(e as Error).message}`);
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    const e: Record<string, string> = {};
    if (!v.title?.trim()) e.title = "กรอกหัวข้อประกาศ";
    const audience: Audience = mode === "all" ? { all: true } : { all: false, branch_ids: aud.branch_ids ?? [], org_unit_ids: aud.org_unit_ids ?? [], employee_ids: aud.employee_ids ?? [] };
    if (mode === "groups" && !audience.branch_ids!.length && !audience.org_unit_ids!.length && !audience.employee_ids!.length) e.audience = "เลือกสาขา หน่วยงาน หรือพนักงานอย่างน้อย 1 รายการ";
    if (v.expire_at && v.publish_at && Date.parse(v.expire_at) <= Date.parse(v.publish_at)) e.expire_at = "วันหมดอายุต้องหลังวันเผยแพร่";
    setErr(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    const row = {
      title: v.title!.trim(),
      content: v.content?.trim() || null,
      image_url: v.image_url ?? null,
      attachments: v.attachments ?? [],
      audience,
      is_pinned: !!v.is_pinned,
      publish_at: v.publish_at ?? new Date().toISOString(),
      expire_at: v.expire_at ?? null,
      push_line: !!v.push_line,
    };
    const { data: auth } = await sb.auth.getUser();
    const res = v.id ? await sb.from("announcements").update(row).eq("id", v.id) : await sb.from("announcements").insert({ ...row, created_by: auth.user?.id });
    setBusy(false);
    if (res.error) return toast.error(`บันทึกไม่ได้: ${res.error.message}`);
    toast.ok(row.push_line && !v.pushed_at ? "บันทึกแล้ว ระบบจะส่งแจ้งเตือน LINE เมื่อถึงเวลาเผยแพร่" : "บันทึกประกาศแล้ว");
    onSaved();
  };

  return (
    <Modal open onClose={onClose} size="lg" title={v.id ? "แก้ไขประกาศ" : "สร้างประกาศ"}
      footer={<><Button variant="secondary" onClick={onClose}>ยกเลิก</Button><Button loading={busy} icon={<Send className="size-4" />} onClick={save}>{v.id ? "บันทึก" : "เผยแพร่ประกาศ"}</Button></>}>
      <div className="flex flex-col gap-4">
        <Field label="หัวข้อ" required error={err.title}>
          <Input value={v.title ?? ""} onChange={(e) => set({ title: e.target.value })} maxLength={200} />
        </Field>
        <Field label="เนื้อหา" hint="ขึ้นบรรทัดใหม่ได้ ลิงก์ที่ขึ้นต้นด้วย https:// จะกดได้อัตโนมัติ">
          <Textarea value={v.content ?? ""} onChange={(e) => set({ content: e.target.value })} rows={7} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <div className="mb-1 text-sm font-medium text-ink-soft">รูปภาพประกอบ</div>
            {v.image_url ? (
              <div className="relative overflow-hidden rounded-[var(--radius-ctl)] border border-line">
                { }
                <img src={v.image_url} alt="" className="h-36 w-full bg-paper object-cover" />
                <button type="button" onClick={() => set({ image_url: null })} className="absolute right-2 top-2 rounded-full bg-black/60 p-1 text-white" aria-label="ลบรูป"><X className="size-4" /></button>
              </div>
            ) : (
              <label className="flex h-36 cursor-pointer flex-col items-center justify-center gap-1 rounded-[var(--radius-ctl)] border border-dashed border-line text-sm text-ink-soft hover:bg-paper">
                {uploading ? <Spinner /> : <ImagePlus className="size-6 text-jade-500" />}
                เลือกรูป (ย่อขนาดอัตโนมัติ)
                <input type="file" accept="image/*" hidden onChange={(e) => uploadImage(e.target.files?.[0])} />
              </label>
            )}
          </div>
          <div>
            <div className="mb-1 text-sm font-medium text-ink-soft">ไฟล์แนบ</div>
            <AttachmentsField value={v.attachments} onChange={(a) => set({ attachments: a })} bucket="public" folder="announcements" />
          </div>
        </div>

        <div>
          <div className="mb-1.5 text-sm font-medium text-ink-soft">ผู้รับประกาศ</div>
          <div className="mb-2 flex gap-4">
            <label className="inline-flex items-center gap-2 text-[15px]"><input type="radio" className="accent-jade-600" checked={mode === "all"} onChange={() => setMode("all")} /> พนักงานทุกคน</label>
            <label className="inline-flex items-center gap-2 text-[15px]"><input type="radio" className="accent-jade-600" checked={mode === "groups"} onChange={() => setMode("groups")} /> เฉพาะกลุ่ม</label>
          </div>
          {mode === "groups" && (
            <div className="flex flex-col gap-3 rounded-[var(--radius-ctl)] bg-paper p-3">
              <MultiPick label="สาขา" options={refs.branches} value={aud.branch_ids ?? []} onChange={(x) => setAud((a) => ({ ...a, branch_ids: x }))} />
              <MultiPick label="หน่วยงาน (รวมหน่วยงานย่อย)" options={refs.orgs} value={aud.org_unit_ids ?? []} onChange={(x) => setAud((a) => ({ ...a, org_unit_ids: x }))} />
              <Field label="พนักงานรายบุคคล">
                <div className="flex flex-wrap gap-1.5">
                  {(aud.employee_ids ?? []).map((id) => {
                    const e = refs.emps.find((x) => x.id === id);
                    return (
                      <span key={id} className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-sm ring-1 ring-line">
                        {e ? `${e.first_name} ${e.last_name}` : id}
                        <button type="button" aria-label="เอาออก" onClick={() => setAud((a) => ({ ...a, employee_ids: a.employee_ids?.filter((x) => x !== id) }))}><X className="size-3.5 text-ink-mute" /></button>
                      </span>
                    );
                  })}
                </div>
                <div className="relative">
                  <Input value={empQ} onChange={(e) => setEmpQ(e.target.value)} placeholder="พิมพ์ชื่อหรือรหัสพนักงานเพื่อเพิ่ม" />
                  {empMatches.length > 0 && (
                    <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-[var(--radius-ctl)] border border-line bg-white shadow-lg">
                      {empMatches.map((e) => (
                        <li key={e.id}>
                          <button type="button" className="flex w-full justify-between px-3 py-2 text-left text-sm hover:bg-jade-50" onClick={() => (setAud((a) => ({ ...a, employee_ids: [...(a.employee_ids ?? []), e.id] })), setEmpQ(""))}>
                            <span>{e.first_name} {e.last_name} {e.nickname ? `(${e.nickname})` : ""}</span><span className="text-ink-mute">{e.code}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </Field>
            </div>
          )}
          {err.audience && <p className="mt-1 text-xs text-rust">{err.audience}</p>}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="เผยแพร่เมื่อ" hint="ตั้งเวลาล่วงหน้าได้">
            <Input type="datetime-local" value={toLocal(v.publish_at)} onChange={(e) => set({ publish_at: fromLocal(e.target.value) ?? new Date().toISOString() })} />
          </Field>
          <Field label="หมดอายุเมื่อ" hint="เว้นว่าง = ไม่หมดอายุ" error={err.expire_at}>
            <Input type="datetime-local" value={toLocal(v.expire_at)} onChange={(e) => set({ expire_at: fromLocal(e.target.value) })} />
          </Field>
        </div>
        <div className="flex flex-wrap gap-6">
          <Toggle checked={!!v.is_pinned} onChange={(x) => set({ is_pinned: x })} label="ปักหมุดไว้บนสุด" />
          <Toggle checked={!!v.push_line} onChange={(x) => set({ push_line: x })} label="ส่งแจ้งเตือนทาง LINE ด้วย" />
        </div>
        {v.push_line && v.pushed_at && <p className="text-xs text-ink-mute">ส่ง LINE ไปแล้วเมื่อ {thDateTime(v.pushed_at)} (แก้ไขประกาศจะไม่ส่งซ้ำ)</p>}
      </div>
    </Modal>
  );
}

