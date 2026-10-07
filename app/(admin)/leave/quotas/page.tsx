"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Download, Search, Sparkles } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useCan } from "@/components/app/me-context";
import { humanError } from "@/components/crud/crud-page";
import { Button, Checkbox, Empty, Field, Input, Modal, PageHeader, Panel, Select, Spinner, Textarea, clsx, toast, useConfirm } from "@/components/ui";
import { downloadCsv } from "@/lib/csv";
import { generateQuotasAction } from "@/lib/attendance/actions";
import { FilterBar, MiniField } from "@/components/attendance/bits";
import { empName, orgSubtree, useAttLookups, useEmployees, type EmpOpt } from "@/components/attendance/lookups";
import { fetchAllRows } from "@/components/attendance/use-days";

type LT = { id: number; code: string; name: string; color: string | null; is_unlimited: boolean; default_quota_days: number; sort_order: number; is_active: boolean };
type Bal = { id: number; employee_id: number; leave_type_id: number; quota_days: number; carried_days: number; adjust_days: number; total_days: number; used_days: number; pending_days: number; remaining_days: number };
type Quota = { id: number; note: string | null };

const n = (v: unknown) => Number(v ?? 0);
const fmt = (v: unknown) => {
  const x = n(v);
  return Number.isInteger(x) ? String(x) : x.toFixed(2).replace(/0$/, "");
};

export default function LeaveQuotasPage() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const can = useCan();
  const canEdit = can("attendance", "edit");
  const lk = useAttLookups();
  const { list: emps } = useEmployees();
  const year = Number(sp.get("year")) || new Date().getFullYear();
  const [types, setTypes] = useState<LT[]>([]);
  const [balState, setBal] = useState<{ year: number; rows: Bal[] } | null>(null);
  const bal = balState?.year === year ? balState.rows : null;
  const [f, setF] = useState({ org: "", q: "", type: "" });
  const [edit, setEdit] = useState<{ emp: EmpOpt; lt: LT; b: Bal | null } | null>(null);
  const [gen, setGen] = useState(false);

  const load = useCallback(async () => {
    const sb = supabaseBrowser();
    const [t, b] = await Promise.all([
      sb.from("leave_types").select("id, code, name, color, is_unlimited, default_quota_days, sort_order, is_active").eq("is_active", true).order("sort_order").order("id"),
      fetchAllRows<Bal>(() => sb.from("v_leave_balances").select("id, employee_id, leave_type_id, quota_days, carried_days, adjust_days, total_days, used_days, pending_days, remaining_days").eq("leave_year", year).order("id")),
    ]);
    if (b.error) toast.error(b.error);
    setTypes((t.data as LT[]) ?? []);
    setBal({ year, rows: b.rows });
  }, [year]);
  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  const balMap = useMemo(() => new Map((bal ?? []).map((b) => [`${b.employee_id}|${b.leave_type_id}`, b])), [bal]);
  const orgSet = useMemo(() => (f.org ? orgSubtree(lk.orgs, Number(f.org)) : null), [f.org, lk.orgs]);
  const shownTypes = useMemo(() => types.filter((t) => (!f.type ? !t.is_unlimited || (bal ?? []).some((b) => b.leave_type_id === t.id) : String(t.id) === f.type)), [types, f.type, bal]);
  const rows = useMemo(() => {
    const q = f.q.trim().toLowerCase();
    return emps.filter((e) => (!orgSet || (e.org_unit_id != null && orgSet.has(e.org_unit_id))) && (!q || `${e.code} ${e.first_name} ${e.last_name} ${e.nickname ?? ""}`.toLowerCase().includes(q)));
  }, [emps, orgSet, f.q]);

  function exportCsv() {
    const head = ["รหัส", "ชื่อ", "หน่วยงาน", ...shownTypes.flatMap((t) => [`${t.name} สิทธิ์`, `${t.name} สะสม`, `${t.name} ปรับ`, `${t.name} ใช้ไป`, `${t.name} รออนุมัติ`, `${t.name} คงเหลือ`])];
    const body = rows.map((e) => [e.code, empName(e), e.org_unit_name, ...shownTypes.flatMap((t) => {
      const b = balMap.get(`${e.id}|${t.id}`);
      return (b ? [b.quota_days, b.carried_days, b.adjust_days, b.used_days, b.pending_days, b.remaining_days] : ["", "", "", "", "", ""]) as (string | number)[];
    })]);
    downloadCsv(`leave_quotas_${year}.csv`, [head, ...body]);
  }

  return (
    <div>
      <PageHeader
        title="โควต้าการลา"
        description="สิทธิ์การลาของพนักงานแต่ละคนต่อปี — คงเหลือ = สิทธิ์ + สะสมจากปีก่อน + ปรับเพิ่ม/ลด − ใช้ไป − รออนุมัติ"
        actions={
          <>
            <div className="flex items-center gap-1">
              <Button variant="secondary" size="sm" onClick={() => router.push(`${pathname}?year=${year - 1}`)} aria-label="ปีก่อนหน้า"><ChevronLeft className="size-4" /></Button>
              <span className="num min-w-24 text-center text-lg font-semibold">ปี {year + 543}</span>
              <Button variant="secondary" size="sm" onClick={() => router.push(`${pathname}?year=${year + 1}`)} aria-label="ปีถัดไป"><ChevronRight className="size-4" /></Button>
            </div>
            {can("attendance", "export") && <Button variant="secondary" icon={<Download className="size-4" />} onClick={exportCsv} disabled={!bal}>ส่งออก CSV</Button>}
            {canEdit && <Button icon={<Sparkles className="size-4" />} onClick={() => setGen(true)}>สร้างโควต้าประจำปี</Button>}
          </>
        }
      />
      <FilterBar>
        <MiniField label="หน่วยงาน">
          <Select className="h-9 w-52 text-sm" value={f.org} onChange={(e) => setF({ ...f, org: e.target.value })} placeholder="ทั้งหมด">
            {lk.orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </Select>
        </MiniField>
        <MiniField label="ประเภทการลา">
          <Select className="h-9 w-44 text-sm" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} placeholder="ทุกประเภท">
            {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        </MiniField>
        <MiniField label="ค้นหาพนักงาน" className="min-w-40 flex-1">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-mute" />
            <Input className="h-9 pl-8 text-sm" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder="รหัส ชื่อ ชื่อเล่น" />
          </div>
        </MiniField>
      </FilterBar>

      <Panel bodyClass="p-0">
        {!bal || !emps.length ? (
          <Spinner className="mx-auto my-16" />
        ) : bal.length === 0 ? (
          <Empty title={`ยังไม่มีโควต้าการลาปี ${year + 543}`} description="กด “สร้างโควต้าประจำปี” เพื่อสร้างจากสิทธิ์ของแต่ละประเภทการลา" action={canEdit ? <Button icon={<Sparkles className="size-4" />} onClick={() => setGen(true)}>สร้างโควต้าประจำปี</Button> : undefined} />
        ) : (
          <div className="thin-scroll max-h-[calc(100dvh-17rem)] overflow-auto">
            <table className="border-separate border-spacing-0 text-[13px]">
              <thead className="sticky top-0 z-20">
                <tr>
                  <th className="sticky left-0 z-30 min-w-56 border-b border-r border-line bg-white px-3 py-2 text-left font-medium text-ink-soft">พนักงาน ({rows.length})</th>
                  {shownTypes.map((t) => (
                    <th key={t.id} className="min-w-28 border-b border-line bg-white px-2 py-2 text-center font-medium">
                      <div className="flex items-center justify-center gap-1.5"><span className="size-2.5 rounded-full" style={{ background: t.color ?? "#3b82f6" }} />{t.name}</div>
                      <div className="text-[11px] font-normal text-ink-mute">คงเหลือ / ทั้งหมด</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id} className="group">
                    <td className="sticky left-0 z-10 border-b border-r border-line-soft bg-white px-3 py-1.5 group-hover:bg-jade-50">
                      <div className="truncate font-medium">{empName(e)}</div>
                      <div className="truncate text-[11px] text-ink-mute">{e.code} · {e.org_unit_name ?? "-"}</div>
                    </td>
                    {shownTypes.map((t) => {
                      const b = balMap.get(`${e.id}|${t.id}`);
                      const low = b && n(b.total_days) > 0 && n(b.remaining_days) <= 0;
                      return (
                        <td key={t.id} className="border-b border-line-soft p-0.5 text-center">
                          <button
                            type="button"
                            disabled={!canEdit}
                            onClick={() => setEdit({ emp: e, lt: t, b: b ?? null })}
                            className={clsx("num w-full rounded px-2 py-1.5", canEdit && "hover:bg-jade-50 hover:ring-1 hover:ring-jade-300", !b && "text-ink-mute")}
                            title={b ? `สิทธิ์ ${fmt(b.quota_days)} · สะสม ${fmt(b.carried_days)} · ปรับ ${fmt(b.adjust_days)} · ใช้ไป ${fmt(b.used_days)} · รออนุมัติ ${fmt(b.pending_days)}` : "ไม่มีสิทธิ์"}
                          >
                            {b ? (
                              <>
                                <span className={clsx("font-semibold", low ? "text-rust" : "text-ink")}>{fmt(b.remaining_days)}</span>
                                <span className="text-ink-mute"> / {fmt(b.total_days)}</span>
                                {n(b.pending_days) > 0 && <span className="block text-[10px] text-amber-ink">รอ {fmt(b.pending_days)}</span>}
                              </>
                            ) : (
                              "-"
                            )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {edit && <EditQuota year={year} {...edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
      {gen && <GenerateModal year={year} onClose={() => setGen(false)} onDone={() => { setGen(false); load(); }} />}
    </div>
  );
}

function EditQuota({ year, emp, lt, b, onClose, onSaved }: { year: number; emp: EmpOpt; lt: LT; b: Bal | null; onClose: () => void; onSaved: () => void }) {
  const [v, setV] = useState({ quota: fmt(b?.quota_days ?? lt.default_quota_days), carried: fmt(b?.carried_days ?? 0), adjust: fmt(b?.adjust_days ?? 0), note: "" });
  const [busy, setBusy] = useState(false);
  const { confirm, dialog } = useConfirm();
  useEffect(() => {
    if (!b) return;
    supabaseBrowser().from("leave_quotas").select("id, note").eq("id", b.id).maybeSingle().then(({ data }: { data: unknown }) => setV((x) => ({ ...x, note: (data as Quota | null)?.note ?? "" })));
  }, [b]);
  const total = n(v.quota) + n(v.carried) + n(v.adjust);

  async function save() {
    if ([v.quota, v.carried, v.adjust].some((x) => x === "" || isNaN(Number(x)))) return toast.error("กรุณากรอกตัวเลขให้ครบ");
    setBusy(true);
    const sb = supabaseBrowser();
    const row = { employee_id: emp.id, leave_year: year, leave_type_id: lt.id, quota_days: n(v.quota), carried_days: n(v.carried), adjust_days: n(v.adjust), note: v.note || null };
    const { error } = await sb.from("leave_quotas").upsert(row, { onConflict: "employee_id,leave_year,leave_type_id" });
    setBusy(false);
    if (error) return toast.error(humanError(error));
    toast.ok("บันทึกแล้ว");
    onSaved();
  }
  async function remove() {
    if (!b) return;
    if (!(await confirm(`ลบสิทธิ์${lt.name}ปี ${year + 543} ของพนักงานคนนี้? ระบบจะกลับไปใช้สิทธิ์ตั้งต้นของประเภทการลา`, { danger: true, confirmText: "ลบสิทธิ์" }))) return;
    setBusy(true);
    const { error } = await supabaseBrowser().from("leave_quotas").delete().eq("id", b.id);
    setBusy(false);
    if (error) return toast.error(humanError(error));
    toast.ok("ลบสิทธิ์แล้ว");
    onSaved();
  }

  return (
    <Modal open onClose={onClose} size="sm" title={`${lt.name} ปี ${year + 543}`}
      footer={<>{b && <Button variant="ghost" className="mr-auto text-rust" onClick={remove} disabled={busy}>ลบสิทธิ์</Button>}<Button variant="secondary" onClick={onClose}>ยกเลิก</Button><Button loading={busy} onClick={save}>บันทึก</Button></>}>
      <p className="mb-3 text-sm text-ink-soft">{emp.code} · {empName(emp)}</p>
      <div className="grid grid-cols-3 gap-3">
        <Field label="สิทธิ์ (วัน)"><Input type="number" step="0.5" className="num" value={v.quota} onChange={(e) => setV({ ...v, quota: e.target.value })} /></Field>
        <Field label="สะสมจากปีก่อน"><Input type="number" step="0.5" className="num" value={v.carried} onChange={(e) => setV({ ...v, carried: e.target.value })} /></Field>
        <Field label="ปรับเพิ่ม/ลด"><Input type="number" step="0.5" className="num" value={v.adjust} onChange={(e) => setV({ ...v, adjust: e.target.value })} /></Field>
      </div>
      <dl className="mt-3 grid grid-cols-4 gap-2 rounded-md bg-paper p-3 text-center text-sm">
        <div><dt className="text-xs text-ink-soft">รวม</dt><dd className="num font-semibold">{fmt(total)}</dd></div>
        <div><dt className="text-xs text-ink-soft">ใช้ไป</dt><dd className="num">{fmt(b?.used_days)}</dd></div>
        <div><dt className="text-xs text-ink-soft">รออนุมัติ</dt><dd className="num">{fmt(b?.pending_days)}</dd></div>
        <div><dt className="text-xs text-ink-soft">คงเหลือ</dt><dd className={clsx("num font-semibold", total - n(b?.used_days) - n(b?.pending_days) < 0 && "text-rust")}>{fmt(total - n(b?.used_days) - n(b?.pending_days))}</dd></div>
      </dl>
      <Field label="หมายเหตุการปรับ" className="mt-3"><Textarea value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} placeholder="เช่น ให้เพิ่มตามผลงาน / ชดเชยวันหยุด" /></Field>
      {dialog}
    </Modal>
  );
}

function GenerateModal({ year, onClose, onDone }: { year: number; onClose: () => void; onDone: () => void }) {
  const [y, setY] = useState(year);
  const [carry, setCarry] = useState(true);
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    const r = await generateQuotasAction({ year: y, carryOver: carry });
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    toast.ok(`สร้าง/ปรับปรุงโควต้าแล้ว ${r.data!.toLocaleString()} รายการ`);
    onDone();
  }
  return (
    <Modal open onClose={onClose} size="sm" title="สร้างโควต้าประจำปี"
      footer={<><Button variant="secondary" onClick={onClose}>ยกเลิก</Button><Button loading={busy} onClick={run}>สร้างโควต้า</Button></>}>
      <div className="flex flex-col gap-3 text-[15px]">
        <Field label="ปี (ค.ศ.)" hint={`พ.ศ. ${y + 543}`}><Input type="number" className="num" value={y} onChange={(e) => setY(Number(e.target.value))} /></Field>
        <Checkbox label="ยกยอดวันลาที่เหลือจากปีก่อน (ตามที่ตั้งไว้ในประเภทการลา)" checked={carry} onChange={setCarry} />
        <ul className="list-disc pl-5 text-sm text-ink-soft">
          <li>ใช้สิทธิ์ต่อปีจาก “ประเภทการลา” — ข้ามประเภทที่ไม่จำกัดวัน และประเภทที่จำกัดเพศ</li>
          <li>ลาพักร้อนต้องมีอายุงานครบตามที่กำหนด (ค่าเริ่มต้น 1 ปี)</li>
          <li>รันซ้ำได้ — อัปเดตสิทธิ์และยอดสะสม แต่คงค่า “ปรับเพิ่ม/ลด” ที่แก้ไขไว้</li>
        </ul>
      </div>
    </Modal>
  );
}
