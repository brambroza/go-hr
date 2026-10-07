"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { History, Search, TrendingUp } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useCan } from "@/components/app/me-context";
import { Badge, Button, Checkbox, Empty, Field, Input, Modal, PageHeader, Panel, Select, Spinner, Toggle, clsx, toast, useConfirm } from "@/components/ui";
import { humanError } from "@/components/crud/crud-page";
import { money, thDate, isoDate } from "@/lib/format";
import { fetchRows, fetchRowsIn } from "@/lib/payroll/fetch";
import { EMP_TYPE_LABEL, UNIT_LABEL } from "@/lib/payroll/labels";

type Emp = { id: number; code: string; first_name: string; last_name: string; org_unit_id: number | null; position_id: number | null; branch_id: number | null; employee_type: string; status: string };
type Priv = { employee_id: number; salary: number; salary_unit: string };
type Hist = { id: number; employee_id: number; effective_date: string; old_salary: number | null; new_salary: number; change_percent: number | null; reason: string | null };
type Mode = "percent" | "amount" | "value";

const REASONS = ["ปรับประจำปี", "ผ่านทดลองงาน", "เลื่อนตำแหน่ง", "ปรับตามค่าแรงขั้นต่ำ", "ปรับโครงสร้างเงินเดือน"];

export default function SalaryAdjustPage() {
  const sb = supabaseBrowser();
  const can = useCan();
  const { confirm, dialog } = useConfirm();
  const [emps, setEmps] = useState<Emp[] | null>(null);
  const [priv, setPriv] = useState<Map<number, Priv>>(new Map());
  const [orgs, setOrgs] = useState<{ id: number; name: string }[]>([]);
  const [positions, setPositions] = useState<{ id: number; name: string }[]>([]);
  const [pending, setPending] = useState<Map<number, { new_salary: number; effective_date: string }>>(new Map());
  const [f, setF] = useState({ q: "", org: "", position: "", type: "" });
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [mode, setMode] = useState<Mode>("percent");
  const [val, setVal] = useState("5");
  const [roundTo, setRoundTo] = useState(10);
  const [effective, setEffective] = useState(() => {
    const d = new Date();
    const y = d.getMonth() === 11 ? d.getFullYear() + 1 : d.getFullYear();
    const m = d.getMonth() === 11 ? 1 : d.getMonth() + 2;
    return `${y}-${String(m).padStart(2, "0")}-01`; // first day of next month
  });
  const [reason, setReason] = useState(REASONS[0]);
  const [applyNow, setApplyNow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<{ emp: Emp; rows: Hist[] } | null>(null);

  const load = useCallback(async () => {
    const [e, o, p] = await Promise.all([
      fetchRows<Emp>(() => sb.from("employees").select("id, code, first_name, last_name, org_unit_id, position_id, branch_id, employee_type, status").neq("status", "resigned").order("code")),
      sb.from("org_units").select("id, name").order("name"),
      sb.from("positions").select("id, name").order("name"),
    ]);
    setEmps(e);
    setOrgs((o.data as { id: number; name: string }[]) ?? []);
    setPositions((p.data as { id: number; name: string }[]) ?? []);
    const pr = await fetchRowsIn<Priv>(e.map((x) => x.id), (part) => sb.from("employee_private").select("employee_id, salary, salary_unit").in("employee_id", part).order("employee_id"));
    setPriv(new Map(pr.map((x) => [x.employee_id, x])));
    const mv = await fetchRows<{ employee_id: number; new_salary: number; effective_date: string }>(() =>
      sb.from("employee_movements").select("employee_id, new_salary, effective_date, id").in("status", ["pending", "approved"]).not("new_salary", "is", null).order("id"),
    );
    setPending(new Map(mv.map((m) => [m.employee_id, m])));
  }, [sb]);
  useEffect(() => {
    load().catch((e) => toast.error(String(e.message ?? e)));
  }, [load]);

  const orgName = useMemo(() => new Map(orgs.map((o) => [o.id, o.name])), [orgs]);
  const posName = useMemo(() => new Map(positions.map((o) => [o.id, o.name])), [positions]);
  const list = useMemo(() => {
    const t = f.q.trim().toLowerCase();
    return (emps ?? []).filter(
      (e) =>
        (!t || `${e.code} ${e.first_name} ${e.last_name}`.toLowerCase().includes(t)) &&
        (!f.org || String(e.org_unit_id) === f.org) &&
        (!f.position || String(e.position_id) === f.position) &&
        (!f.type || e.employee_type === f.type),
    );
  }, [emps, f]);

  const newSalary = (old: number) => {
    const v = Number(val) || 0;
    let n = mode === "percent" ? old * (1 + v / 100) : mode === "amount" ? old + v : v;
    if (roundTo > 0 && mode !== "value") n = Math.ceil(n / roundTo - 1e-9) * roundTo;
    return Math.round(n * 100) / 100;
  };
  const chosen = list.filter((e) => sel.has(e.id));
  const totalOld = chosen.reduce((s, e) => s + Number(priv.get(e.id)?.salary ?? 0), 0);
  const totalNew = chosen.reduce((s, e) => s + newSalary(Number(priv.get(e.id)?.salary ?? 0)), 0);

  async function submit() {
    if (!chosen.length) return toast.error("กรุณาเลือกพนักงานอย่างน้อย 1 คน");
    if (!effective) return toast.error("กรุณาระบุวันที่มีผล");
    const today = isoDate();
    const now = applyNow && effective <= today;
    if (!(await confirm(<>ปรับเงินเดือน {chosen.length} คน มีผล {thDate(effective, "long")}{now ? " และนำไปใช้ทันที" : effective > today ? " (ระบบปรับให้อัตโนมัติเมื่อถึงวันที่มีผล)" : ""}?</>))) return;
    setSaving(true);
    const rows = chosen.map((e) => ({ employee_id: e.id, movement_type: "salary_adjust", effective_date: effective, new_salary: newSalary(Number(priv.get(e.id)?.salary ?? 0)), reason, status: "approved" }));
    const { error } = await sb.from("employee_movements").insert(rows, { defaultToNull: false });
    if (error) {
      setSaving(false);
      return toast.error(humanError(error));
    }
    if (now) {
      const { error: e2 } = await sb.rpc("apply_movements", { p_until: today });
      if (e2) toast.error(`บันทึกแล้ว แต่ปรับทันทีไม่สำเร็จ: ${humanError(e2)}`);
    }
    setSaving(false);
    toast.ok(now ? `ปรับเงินเดือน ${rows.length} คนแล้ว` : `บันทึกการปรับเงินเดือน ${rows.length} คน รอวันที่มีผล`);
    setSel(new Set());
    load();
  }

  async function openHistory(e: Emp) {
    const { data } = await sb.from("salary_history").select("*").eq("employee_id", e.id).order("effective_date", { ascending: false }).order("id", { ascending: false });
    setHistory({ emp: e, rows: (data as Hist[]) ?? [] });
  }

  const allChecked = list.length > 0 && list.every((e) => sel.has(e.id));
  return (
    <div>
      <PageHeader title="ปรับเงินเดือน" description="ปรับเงินเดือนพนักงานหลายคนพร้อมกันเป็น % จำนวนเงิน หรือกำหนดค่าใหม่ ล่วงหน้าตามวันที่มีผล — ทุกการปรับบันทึกในประวัติเงินเดือน" />
      {!can("employee_private", "edit") && <p className="mb-4 rounded-[var(--radius-ctl)] bg-amber-50 px-3 py-2 text-sm text-amber-ink">คุณดูได้อย่างเดียว — การปรับเงินเดือนต้องมีสิทธิ์แก้ไขข้อมูลอ่อนไหว</p>}
      <div className="grid gap-4 xl:grid-cols-[1fr_22rem]">
        <Panel bodyClass="p-0">
          <div className="flex flex-wrap items-center gap-2 border-b border-line-soft px-3 py-2.5">
            <div className="relative w-full sm:w-56">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-mute" />
              <Input value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder="ค้นหารหัส / ชื่อ" className="h-9 pl-8 text-sm" />
            </div>
            <Select className="h-9 max-w-48 text-sm" value={f.org} onChange={(e) => setF({ ...f, org: e.target.value })} placeholder="หน่วยงาน: ทั้งหมด">
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </Select>
            <Select className="h-9 max-w-48 text-sm" value={f.position} onChange={(e) => setF({ ...f, position: e.target.value })} placeholder="ตำแหน่ง: ทั้งหมด">
              {positions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </Select>
            <Select className="h-9 max-w-40 text-sm" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} placeholder="ประเภท: ทั้งหมด">
              {Object.entries(EMP_TYPE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </div>
          {emps === null ? (
            <Spinner className="mx-auto my-12" />
          ) : list.length === 0 ? (
            <Empty title="ไม่พบพนักงาน" />
          ) : (
            <div className="thin-scroll max-h-[70vh] overflow-auto">
              <table className="w-full text-[14px]">
                <thead className="sticky top-0 z-[1] bg-paper">
                  <tr className="border-b border-line text-left text-[13px] text-ink-soft">
                    <th className="w-10 px-3 py-2">
                      <Checkbox label="" checked={allChecked} onChange={(v) => setSel(v ? new Set([...sel, ...list.map((e) => e.id)]) : new Set([...sel].filter((id) => !list.some((e) => e.id === id))))} />
                    </th>
                    <th className="px-3 py-2 font-medium">พนักงาน</th>
                    <th className="px-3 py-2 font-medium">หน่วยงาน / ตำแหน่ง</th>
                    <th className="px-3 py-2 text-right font-medium">ปัจจุบัน</th>
                    <th className="px-3 py-2 text-right font-medium">ใหม่</th>
                    <th className="px-3 py-2 text-right font-medium">เพิ่ม</th>
                    <th className="w-px" />
                  </tr>
                </thead>
                <tbody>
                  {list.map((e) => {
                    const p = priv.get(e.id);
                    const old = Number(p?.salary ?? 0);
                    const on = sel.has(e.id);
                    const nw = newSalary(old);
                    const pend = pending.get(e.id);
                    return (
                      <tr key={e.id} className={clsx("border-b border-line-soft last:border-0", on && "bg-jade-50/50")}>
                        <td className="px-3 py-2">
                          <Checkbox label="" checked={on} onChange={(v) => setSel((s) => { const n = new Set(s); if (v) n.add(e.id); else n.delete(e.id); return n; })} />
                        </td>
                        <td className="px-3 py-2">
                          <span className="text-ink-mute">{e.code}</span> {e.first_name} {e.last_name}
                          {pend && <Badge color="amber" className="ml-1">รอปรับ {money(pend.new_salary, 0)} ({thDate(pend.effective_date)})</Badge>}
                        </td>
                        <td className="px-3 py-2 text-ink-soft">
                          {orgName.get(e.org_unit_id ?? 0) ?? "-"}
                          <div className="text-xs text-ink-mute">{posName.get(e.position_id ?? 0) ?? ""}</div>
                        </td>
                        <td className="num px-3 py-2 text-right">
                          {money(old)}
                          <span className="text-xs text-ink-mute">/{UNIT_LABEL[p?.salary_unit ?? "month"]}</span>
                        </td>
                        <td className={clsx("num px-3 py-2 text-right", on ? "font-semibold text-jade-800" : "text-ink-mute")}>{on ? money(nw) : "-"}</td>
                        <td className="num px-3 py-2 text-right text-ink-soft">{on && old ? `${(((nw - old) / old) * 100).toFixed(2)}%` : ""}</td>
                        <td className="px-2">
                          <button className="rounded p-1.5 text-ink-mute hover:bg-jade-50 hover:text-jade-700" onClick={() => openHistory(e)} aria-label="ประวัติเงินเดือน" title="ประวัติเงินเดือน">
                            <History className="size-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title="กำหนดการปรับ" className="h-fit xl:sticky xl:top-20">
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-3 gap-1 rounded-[var(--radius-ctl)] bg-paper p-1 text-sm">
              {(
                [
                  ["percent", "เป็น %"],
                  ["amount", "เพิ่มเป็นบาท"],
                  ["value", "ค่าใหม่"],
                ] as [Mode, string][]
              ).map(([k, l]) => (
                <button key={k} type="button" className={clsx("rounded-md py-1.5", mode === k ? "bg-white font-medium shadow-sm" : "text-ink-soft")} onClick={() => setMode(k)}>
                  {l}
                </button>
              ))}
            </div>
            <Field label={mode === "percent" ? "เพิ่มขึ้น (%)" : mode === "amount" ? "เพิ่มขึ้น (บาท)" : "เงินเดือน/ค่าจ้างใหม่ (บาท)"}>
              <Input type="number" step="0.01" className="num" value={val} onChange={(e) => setVal(e.target.value)} />
            </Field>
            {mode !== "value" && (
              <Field label="ปัดเศษขึ้นทีละ">
                <Select value={roundTo} onChange={(e) => setRoundTo(Number(e.target.value))}>
                  <option value={0}>ไม่ปัด (สตางค์)</option>
                  <option value={1}>1 บาท</option>
                  <option value={10}>10 บาท</option>
                  <option value={100}>100 บาท</option>
                </Select>
              </Field>
            )}
            <Field label="วันที่มีผล">
              <Input type="date" value={effective} onChange={(e) => setEffective(e.target.value)} />
            </Field>
            <Field label="เหตุผล">
              <Input list="sal-reasons" value={reason} onChange={(e) => setReason(e.target.value)} />
              <datalist id="sal-reasons">
                {REASONS.map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
            </Field>
            <Toggle checked={applyNow} onChange={setApplyNow} label="นำไปใช้ทันที (เมื่อวันที่มีผลถึงแล้ว)" />
            <div className="rounded-[var(--radius-ctl)] bg-jade-50 px-3 py-2 text-sm">
              <div className="flex justify-between">
                <span>เลือก</span>
                <b className="num">{chosen.length} คน</b>
              </div>
              <div className="flex justify-between">
                <span>รวมปัจจุบัน</span>
                <span className="num">{money(totalOld)}</span>
              </div>
              <div className="flex justify-between">
                <span>รวมใหม่</span>
                <span className="num font-semibold">{money(totalNew)}</span>
              </div>
              <div className="flex justify-between text-jade-800">
                <span>ต้นทุนเพิ่มต่อเดือน*</span>
                <span className="num font-semibold">+{money(totalNew - totalOld)}</span>
              </div>
              <p className="mt-1 text-xs text-ink-mute">* รายวันคิดเป็นอัตราต่อวัน</p>
            </div>
            <Button icon={<TrendingUp className="size-4" />} loading={saving} onClick={submit} disabled={!can("employee_private", "edit") || !chosen.length}>
              บันทึกการปรับเงินเดือน
            </Button>
          </div>
        </Panel>
      </div>

      <Modal open={!!history} onClose={() => setHistory(null)} title={`ประวัติเงินเดือน — ${history?.emp.first_name ?? ""} ${history?.emp.last_name ?? ""}`}>
        {history && (history.rows.length === 0 ? <Empty title="ยังไม่มีประวัติการปรับเงินเดือน" /> : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-ink-soft">
              <tr className="border-b border-line">
                <th className="py-1.5">วันที่มีผล</th>
                <th className="py-1.5 text-right">เดิม</th>
                <th className="py-1.5 text-right">ใหม่</th>
                <th className="py-1.5 text-right">%</th>
                <th className="py-1.5 pl-3">เหตุผล</th>
              </tr>
            </thead>
            <tbody>
              {history.rows.map((h) => (
                <tr key={h.id} className="border-b border-line-soft">
                  <td className="py-1.5">{thDate(h.effective_date)}</td>
                  <td className="num py-1.5 text-right">{h.old_salary == null ? "-" : money(h.old_salary)}</td>
                  <td className="num py-1.5 text-right font-medium">{money(h.new_salary)}</td>
                  <td className="num py-1.5 text-right">{h.change_percent == null ? "-" : `${h.change_percent}%`}</td>
                  <td className="py-1.5 pl-3 text-ink-soft">{h.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}
      </Modal>
      {dialog}
    </div>
  );
}
