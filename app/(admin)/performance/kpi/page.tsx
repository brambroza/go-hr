"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FileUp, Pencil, Plus, Trash2 } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useCan } from "@/components/app/me-context";
import { Badge, Button, Empty, Field, Input, Modal, PageHeader, Panel, Select, Spinner, Tabs, Toggle, clsx, toast, useConfirm } from "@/components/ui";
import { humanError } from "@/components/crud/crud-page";
import { useLookups } from "@/components/employees/use-lookups";
import { useDirectory } from "@/components/recruit/use-directory";
import { ATT_METRIC, KPI_DIRECTION, KPI_SOURCE } from "@/components/performance/labels";
import { kpiScore, type ScoringStep } from "@/components/performance/scoring";
import { downloadCsv, parseCsv } from "@/lib/csv";

type Profile = { id: number; name: string; position_id: number | null; org_unit_id: number | null; description: string | null; is_active: boolean };
type Item = { id?: number; profile_id?: number; name: string; description: string | null; unit: string | null; target: number | null; weight: number; direction: string; source: string; external_key: string | null; attendance_metric: string | null; scoring: ScoringStep[] | null; sort_order: number };

const newItem = (n: number): Item => ({ name: "", description: null, unit: "", target: null, weight: 0, direction: "higher", source: "manual", external_key: null, attendance_metric: null, scoring: null, sort_order: n });

export default function KpiPage() {
  const [tab, setTab] = useState<"profiles" | "import">("profiles");
  return (
    <div>
      <PageHeader title="KPI Profile" description="กำหนดชุดตัวชี้วัด (KPI) ตามตำแหน่งหรือหน่วยงาน — เมื่อสร้างรอบการประเมิน พนักงานจะได้ KPI ตามโปรไฟล์ของตนอัตโนมัติ" />
      <Tabs className="mb-4" value={tab} onChange={setTab} tabs={[{ value: "profiles", label: "KPI Profile" }, { value: "import", label: "นำเข้าผล KPI จากระบบภายนอก" }]} />
      {tab === "profiles" ? <Profiles /> : <ImportKpi />}
    </div>
  );
}

function Profiles() {
  const sb = supabaseBrowser();
  const can = useCan();
  const lk = useLookups();
  const { confirm, dialog } = useConfirm();
  const [rows, setRows] = useState<(Profile & { kpi_items: Item[] })[] | null>(null);
  const [edit, setEdit] = useState<{ p: Profile; items: Item[]; removed: number[] } | null>(null);
  const [scoringFor, setScoringFor] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await sb.from("kpi_profiles").select("*, kpi_items(*)").order("id");
    if (error) toast.error(error.message);
    setRows(((data ?? []) as (Profile & { kpi_items: Item[] })[]).map((p) => ({ ...p, kpi_items: [...p.kpi_items].sort((a, b) => a.sort_order - b.sort_order) })));
  }, [sb]);
  useEffect(() => {
    load();
  }, [load]);

  const name = (list: { id: number; name: string }[], id: number | null) => list.find((x) => x.id === id)?.name ?? null;
  const totalW = edit ? edit.items.reduce((a, i) => a + Number(i.weight || 0), 0) : 0;
  const setItem = (k: number, p: Partial<Item>) => edit && setEdit({ ...edit, items: edit.items.map((x, j) => (j === k ? { ...x, ...p } : x)) });

  async function save() {
    if (!edit) return;
    if (!edit.p.name.trim()) return toast.error("กรุณาตั้งชื่อ KPI Profile");
    if (!edit.p.position_id && !edit.p.org_unit_id) return toast.error("กรุณาเลือกตำแหน่งหรือหน่วยงานที่ใช้ Profile นี้");
    if (edit.items.some((i) => !i.name.trim())) return toast.error("มี KPI ที่ยังไม่ได้ตั้งชื่อ");
    if (Math.abs(totalW - 100) > 0.001) return toast.error(`น้ำหนัก KPI รวมกันต้องเท่ากับ 100 (ตอนนี้ ${totalW})`);
    if (edit.items.some((i) => i.source === "external" && !i.external_key)) return toast.error("KPI ที่นำเข้าจากระบบภายนอกต้องมีรหัสอ้างอิง (External key)");
    if (edit.items.some((i) => i.source === "attendance" && !i.attendance_metric)) return toast.error("KPI จากระบบเวลาทำงานต้องเลือกตัววัด");
    setBusy(true);
    try {
      const { id, ...pp } = edit.p;
      let pid = id;
      if (id) {
        const r = await sb.from("kpi_profiles").update(pp).eq("id", id);
        if (r.error) throw r.error;
      } else {
        const r = await sb.from("kpi_profiles").insert(pp).select("id").single();
        if (r.error) throw r.error;
        pid = r.data.id;
      }
      if (edit.removed.length) {
        const r = await sb.from("kpi_items").delete().in("id", edit.removed);
        if (r.error) throw r.error;
      }
      for (const [n, it] of edit.items.entries()) {
        const { id: iid, ...ip } = it;
        const payload = { ...ip, profile_id: pid, sort_order: n + 1, unit: ip.unit || null, external_key: ip.source === "external" ? ip.external_key : null, attendance_metric: ip.source === "attendance" ? ip.attendance_metric : null };
        const r = iid ? await sb.from("kpi_items").update(payload).eq("id", iid) : await sb.from("kpi_items").insert(payload);
        if (r.error) throw r.error;
      }
      toast.ok("บันทึก KPI Profile แล้ว");
      setEdit(null);
      load();
    } catch (e) {
      toast.error(humanError(e));
    } finally {
      setBusy(false);
    }
  }
  async function remove(p: Profile) {
    if (!(await confirm(`ลบ KPI Profile “${p.name}” ใช่หรือไม่?`, { danger: true, confirmText: "ลบ" }))) return;
    const { error } = await sb.from("kpi_profiles").delete().eq("id", p.id);
    if (error) return toast.error(humanError(error));
    toast.ok("ลบ KPI Profile แล้ว");
    load();
  }

  const sc = edit && scoringFor !== null ? edit.items[scoringFor] : null;
  return (
    <>
      <div className="mb-3 flex justify-end">
        {can("performance", "create") && <Button icon={<Plus className="size-4" />} onClick={() => setEdit({ p: { id: 0, name: "", position_id: null, org_unit_id: null, description: null, is_active: true }, items: [newItem(1)], removed: [] })}>สร้าง KPI Profile</Button>}
      </div>
      {rows === null ? (
        <Spinner className="mx-auto mt-10" />
      ) : rows.length === 0 ? (
        <Empty title="ยังไม่มี KPI Profile" description="เช่น KPI พนักงานฝ่ายผลิต: ยอดผลิตต่อกะ, % ของเสีย, การมาสาย" />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {rows.map((p) => (
            <Panel
              key={p.id}
              title={<span className="flex items-center gap-2">{p.name}{!p.is_active && <Badge>ไม่ใช้งาน</Badge>}</span>}
              actions={
                <div className="flex">
                  {can("performance", "edit") && <button className="rounded p-1.5 text-ink-mute hover:bg-jade-50" aria-label="แก้ไข" onClick={() => setEdit({ p: { id: p.id, name: p.name, position_id: p.position_id, org_unit_id: p.org_unit_id, description: p.description, is_active: p.is_active }, items: structuredClone(p.kpi_items), removed: [] })}><Pencil className="size-4" /></button>}
                  {can("performance", "delete") && <button className="rounded p-1.5 text-ink-mute hover:bg-rust-soft hover:text-rust" aria-label="ลบ" onClick={() => remove(p)}><Trash2 className="size-4" /></button>}
                </div>
              }
              bodyClass="p-0"
            >
              <p className="px-4 pt-3 text-sm text-ink-soft">ใช้กับ: {[name(lk.positions, p.position_id) && `ตำแหน่ง ${name(lk.positions, p.position_id)}`, name(lk.orgs, p.org_unit_id) && `หน่วยงาน ${name(lk.orgs, p.org_unit_id)}`].filter(Boolean).join(" · ") || "-"}</p>
              <table className="mt-2 w-full text-[14px]">
                <thead>
                  <tr className="border-y border-line bg-paper/60 text-left text-[13px] text-ink-soft">
                    <th className="px-4 py-1.5 font-medium">KPI</th>
                    <th className="px-2 py-1.5 text-right font-medium">เป้าหมาย</th>
                    <th className="px-2 py-1.5 font-medium">ทิศทาง</th>
                    <th className="px-4 py-1.5 text-right font-medium">น้ำหนัก</th>
                  </tr>
                </thead>
                <tbody>
                  {p.kpi_items.map((i) => (
                    <tr key={i.id} className="border-b border-line-soft last:border-0">
                      <td className="px-4 py-1.5">{i.name}{i.source !== "manual" && <Badge color={i.source === "external" ? "violet" : "blue"} className="ml-1">{i.source === "external" ? `นำเข้า: ${i.external_key}` : "เวลาทำงาน"}</Badge>}</td>
                      <td className="num px-2 py-1.5 text-right">{i.target != null ? Number(i.target).toLocaleString("th-TH") : "-"} <span className="text-ink-mute">{i.unit}</span></td>
                      <td className="px-2 py-1.5 text-ink-soft">{KPI_DIRECTION[i.direction]}</td>
                      <td className="num px-4 py-1.5 text-right">{Number(i.weight)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          ))}
        </div>
      )}

      <Modal
        open={!!edit}
        onClose={() => setEdit(null)}
        size="xl"
        title={edit?.p.id ? "แก้ไข KPI Profile" : "สร้าง KPI Profile"}
        footer={
          <div className="flex w-full items-center justify-between gap-2">
            <span className={clsx("num text-sm", Math.abs(totalW - 100) > 0.001 ? "text-rust" : "text-jade-700")}>น้ำหนักรวม {totalW}%</span>
            <div className="flex gap-2"><Button variant="secondary" onClick={() => setEdit(null)}>ยกเลิก</Button><Button loading={busy} onClick={save}>บันทึก</Button></div>
          </div>
        }
      >
        {edit && (
          <div className="flex flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-4">
              <Field label="ชื่อ Profile" required className="sm:col-span-2"><Input value={edit.p.name} onChange={(e) => setEdit({ ...edit, p: { ...edit.p, name: e.target.value } })} /></Field>
              <Field label="ตำแหน่ง" hint="จับคู่ตามตำแหน่งก่อน"><Select value={edit.p.position_id ?? ""} onChange={(e) => setEdit({ ...edit, p: { ...edit.p, position_id: e.target.value ? Number(e.target.value) : null } })} placeholder="— ไม่ระบุ —">{lk.positions.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></Field>
              <Field label="หรือหน่วยงาน"><Select value={edit.p.org_unit_id ?? ""} onChange={(e) => setEdit({ ...edit, p: { ...edit.p, org_unit_id: e.target.value ? Number(e.target.value) : null } })} placeholder="— ไม่ระบุ —">{lk.orgs.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></Field>
              <Field label="คำอธิบาย" className="sm:col-span-3"><Input value={edit.p.description ?? ""} onChange={(e) => setEdit({ ...edit, p: { ...edit.p, description: e.target.value || null } })} /></Field>
              <div className="pt-6"><Toggle checked={edit.p.is_active} onChange={(v) => setEdit({ ...edit, p: { ...edit.p, is_active: v } })} label="ใช้งาน" /></div>
            </div>
            <div className="flex flex-col gap-2">
              {edit.items.map((it, k) => (
                <div key={k} className="rounded-[var(--radius-ctl)] border border-line p-3">
                  <div className="grid gap-2 sm:grid-cols-[2fr_6rem_7rem_6rem_9rem_auto]">
                    <Field label={`KPI ${k + 1}`}><Input value={it.name} onChange={(e) => setItem(k, { name: e.target.value })} placeholder="เช่น ยอดผลิตเฉลี่ยต่อกะ" className="h-9 text-sm" /></Field>
                    <Field label="หน่วย"><Input value={it.unit ?? ""} onChange={(e) => setItem(k, { unit: e.target.value })} placeholder="ชิ้น / %" className="h-9 text-sm" /></Field>
                    <Field label="เป้าหมาย"><Input type="number" value={it.target ?? ""} onChange={(e) => setItem(k, { target: e.target.value === "" ? null : Number(e.target.value) })} className="num h-9 text-sm" /></Field>
                    <Field label="น้ำหนัก %"><Input type="number" min={0} max={100} value={it.weight} onChange={(e) => setItem(k, { weight: Number(e.target.value) })} className="num h-9 text-sm" /></Field>
                    <Field label="ทิศทาง"><Select value={it.direction} onChange={(e) => setItem(k, { direction: e.target.value })} className="h-9 text-sm">{Object.entries(KPI_DIRECTION).map(([a, b]) => <option key={a} value={a}>{b}</option>)}</Select></Field>
                    <button className="mt-6 self-start rounded p-1.5 text-ink-mute hover:bg-rust-soft hover:text-rust" onClick={() => setEdit({ ...edit, items: edit.items.filter((_, j) => j !== k), removed: it.id ? [...edit.removed, it.id] : edit.removed })} aria-label="ลบ KPI"><Trash2 className="size-4" /></button>
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-[12rem_1fr_auto] sm:items-end">
                    <Field label="แหล่งข้อมูลผลงาน"><Select value={it.source} onChange={(e) => setItem(k, { source: e.target.value })} className="h-9 text-sm">{Object.entries(KPI_SOURCE).map(([a, b]) => <option key={a} value={a}>{b}</option>)}</Select></Field>
                    {it.source === "external" ? (
                      <Field label="รหัสอ้างอิง (External key) — ตรงกับคอลัมน์ในไฟล์นำเข้า"><Input value={it.external_key ?? ""} onChange={(e) => setItem(k, { external_key: e.target.value })} placeholder="เช่น PROD_OUTPUT" className="h-9 text-sm" /></Field>
                    ) : it.source === "attendance" ? (
                      <Field label="ตัววัดจากเวลาทำงาน"><Select value={it.attendance_metric ?? ""} onChange={(e) => setItem(k, { attendance_metric: e.target.value || null })} className="h-9 text-sm" placeholder="— เลือก —">{Object.entries(ATT_METRIC).map(([a, b]) => <option key={a} value={a}>{b}</option>)}</Select></Field>
                    ) : (
                      <span className="pb-2 text-xs text-ink-mute">หัวหน้า/HR กรอกผลงานจริงในหน้ารอบการประเมิน</span>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => setScoringFor(k)}>{it.scoring?.length ? `ตารางคะแนน (${it.scoring.length} ขั้น)` : "ตารางคะแนน: เทียบเป้าแบบเส้นตรง"}</Button>
                  </div>
                </div>
              ))}
              <div><Button size="sm" variant="secondary" icon={<Plus className="size-4" />} onClick={() => setEdit({ ...edit, items: [...edit.items, newItem(edit.items.length + 1)] })}>เพิ่ม KPI</Button></div>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!sc} onClose={() => setScoringFor(null)} size="sm" title="ตารางแปลงผลงานเป็นคะแนน" footer={<Button onClick={() => setScoringFor(null)}>เสร็จ</Button>}>
        {sc && scoringFor !== null && (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-ink-soft">ผลงานเทียบเป้า (%) ตั้งแต่ … ได้คะแนน … (คะแนนสูงสุดของตาราง = 100%) — ไม่กำหนดตาราง = คะแนนตาม % ที่ทำได้ (สูงสุด 100)</p>
            {(sc.scoring ?? []).map((s, j) => (
              <div key={j} className="flex items-center gap-2 text-sm">
                ≥ <Input type="number" value={s.min} onChange={(e) => setItem(scoringFor, { scoring: sc.scoring!.map((x, i) => (i === j ? { ...x, min: Number(e.target.value) } : x)) })} className="num h-9 !w-24" />% ได้
                <Input type="number" value={s.score} onChange={(e) => setItem(scoringFor, { scoring: sc.scoring!.map((x, i) => (i === j ? { ...x, score: Number(e.target.value) } : x)) })} className="num h-9 !w-20" /> คะแนน
                <button className="rounded p-1 text-ink-mute hover:text-rust" onClick={() => setItem(scoringFor, { scoring: sc.scoring!.filter((_, i) => i !== j) })} aria-label="ลบขั้น"><Trash2 className="size-4" /></button>
              </div>
            ))}
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => setItem(scoringFor, { scoring: [...(sc.scoring ?? []), { min: 0, score: 1 }] })}>เพิ่มขั้น</Button>
              {!sc.scoring?.length && <Button size="sm" variant="ghost" onClick={() => setItem(scoringFor, { scoring: [{ min: 110, score: 5 }, { min: 100, score: 4 }, { min: 90, score: 3 }, { min: 80, score: 2 }, { min: 0, score: 1 }] })}>ใช้ตัวอย่าง 5 ระดับ</Button>}
            </div>
          </div>
        )}
      </Modal>
      {dialog}
    </>
  );
}

type Cycle = { id: number; name: string; status: string };
type EK = { id: number; employee_id: number; kpi_item_id: number | null; name: string; target: number | null; direction: string; actual: number | null; score: number | null; source: string };
type Row = { line: number; code: string; key: string; actual: number | null; match?: EK; reason?: string; score?: number | null };

function ImportKpi() {
  const sb = supabaseBrowser();
  const can = useCan();
  const dir = useDirectory();
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [cycle, setCycle] = useState("");
  const [kpis, setKpis] = useState<EK[]>([]);
  const [items, setItems] = useState<Map<number, { external_key: string | null; scoring: ScoringStep[] | null }>>(new Map());
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    sb.from("eval_cycles").select("id, name, status").neq("status", "closed").order("id", { ascending: false }).then(({ data }: { data: unknown }) => {
      const c = (data as Cycle[]) ?? [];
      setCycles(c);
      if (c[0]) setCycle(String(c[0].id));
    });
    sb.from("kpi_items").select("id, external_key, scoring").then(({ data }: { data: unknown }) => setItems(new Map(((data as { id: number; external_key: string | null; scoring: ScoringStep[] | null }[]) ?? []).map((i) => [i.id, i]))));
  }, [sb]);
  useEffect(() => {
    if (!cycle) return;
    setRows(null);
    sb.from("employee_kpis").select("id, employee_id, kpi_item_id, name, target, direction, actual, score, source").eq("cycle_id", Number(cycle)).limit(50000).then(({ data }: { data: unknown }) => setKpis((data as EK[]) ?? []));
  }, [sb, cycle]);

  const byCode = useMemo(() => new Map(dir.rows.map((r) => [r.code.toUpperCase(), r.id])), [dir.rows]);

  async function onFile(f: File) {
    const text = await f.text();
    const grid = parseCsv(text);
    if (grid.length < 2) return toast.error("ไฟล์ไม่มีข้อมูล");
    const head = grid[0].map((h) => h.trim().toLowerCase());
    const ci = head.findIndex((h) => ["employee_code", "code", "รหัสพนักงาน", "รหัส"].includes(h));
    const ki = head.findIndex((h) => ["external_key", "kpi", "kpi_name", "ตัวชี้วัด", "key"].includes(h));
    const ai = head.findIndex((h) => ["actual", "ผลงาน", "value", "ผลจริง"].includes(h));
    if (ci < 0 || ki < 0 || ai < 0) return toast.error("หัวคอลัมน์ต้องมี employee_code, external_key (หรือชื่อ KPI) และ actual");
    const out: Row[] = grid.slice(1).map((r, i) => {
      const code = (r[ci] ?? "").trim();
      const key = (r[ki] ?? "").trim();
      const raw = (r[ai] ?? "").replace(/,/g, "").trim();
      const actual = raw === "" ? null : Number(raw);
      const row: Row = { line: i + 2, code, key, actual };
      const emp = byCode.get(code.toUpperCase());
      if (!emp) return { ...row, reason: "ไม่พบรหัสพนักงาน" };
      if (actual === null || isNaN(actual)) return { ...row, reason: "ค่าผลงานไม่ใช่ตัวเลข" };
      const k = kpis.find((x) => x.employee_id === emp && ((x.kpi_item_id && items.get(x.kpi_item_id)?.external_key?.toLowerCase() === key.toLowerCase()) || x.name.trim().toLowerCase() === key.toLowerCase()));
      if (!k) return { ...row, reason: "พนักงานคนนี้ไม่มี KPI นี้ในรอบที่เลือก" };
      return { ...row, match: k, score: kpiScore(actual, k.target, k.direction, k.kpi_item_id ? items.get(k.kpi_item_id)?.scoring : null) };
    });
    setRows(out);
  }

  async function apply() {
    const ok = (rows ?? []).filter((r) => r.match);
    if (!ok.length) return;
    setBusy(true);
    let n = 0;
    for (let i = 0; i < ok.length; i += 25) {
      const chunk = ok.slice(i, i + 25);
      const res = await Promise.all(chunk.map((r) => sb.from("employee_kpis").update({ actual: r.actual, score: r.score, note: "นำเข้าจากไฟล์" }).eq("id", r.match!.id)));
      const err = res.find((x) => x.error);
      if (err?.error) {
        setBusy(false);
        return toast.error(humanError(err.error));
      }
      n += chunk.length;
    }
    setBusy(false);
    toast.ok(`อัปเดตผล KPI ${n} รายการแล้ว`);
    setRows(null);
    const { data } = await sb.from("employee_kpis").select("id, employee_id, kpi_item_id, name, target, direction, actual, score, source").eq("cycle_id", Number(cycle)).limit(50000);
    setKpis((data as EK[]) ?? []);
  }

  const template = () => {
    const ext = kpis.filter((k) => k.source === "external");
    const sample = (ext.length ? ext : kpis).slice(0, 200);
    downloadCsv("kpi-import-template.csv", [["employee_code", "external_key", "actual"], ...sample.map((k) => [dir.byId.get(k.employee_id)?.code ?? "", (k.kpi_item_id && items.get(k.kpi_item_id)?.external_key) || k.name, ""])]);
  };

  const bad = (rows ?? []).filter((r) => !r.match);
  const good = (rows ?? []).filter((r) => r.match);
  return (
    <Panel title="นำเข้าผล KPI (CSV)">
      <div className="flex flex-col gap-4">
        <p className="text-[15px] text-ink-soft">
          ใช้สำหรับ KPI ที่มาจากระบบอื่น เช่น ยอดขายจาก ERP, ยอดผลิตจาก MES — ไฟล์ CSV มี 3 คอลัมน์: <code className="rounded bg-paper px-1">employee_code</code>, <code className="rounded bg-paper px-1">external_key</code> (หรือชื่อ KPI) และ <code className="rounded bg-paper px-1">actual</code>. ระบบคำนวณคะแนนจากผลเทียบเป้าและตารางคะแนนของ KPI ให้อัตโนมัติ
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <Field label="รอบการประเมิน">
            <Select value={cycle} onChange={(e) => setCycle(e.target.value)} className="!w-72" placeholder="— เลือก —">
              {cycles.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Button variant="secondary" onClick={template} disabled={!kpis.length}>ดาวน์โหลดไฟล์ตัวอย่าง</Button>
          <label className={clsx("inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-[var(--radius-ctl)] bg-jade-600 px-4 text-[15px] font-medium text-white hover:bg-jade-700", (!cycle || !can("performance", "edit")) && "pointer-events-none !bg-line !text-ink-mute")}>
            <FileUp className="size-4" /> เลือกไฟล์ CSV
            <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onFile(f); }} />
          </label>
        </div>
        {cycle && !kpis.length && <p className="text-sm text-amber-ink">รอบนี้ยังไม่มี KPI ของพนักงาน — สร้างแบบประเมินของรอบ (Generate) ก่อน</p>}
        {rows && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge color="green">จับคู่ได้ {good.length} แถว</Badge>
              {bad.length > 0 && <Badge color="red">จับคู่ไม่ได้ {bad.length} แถว</Badge>}
              <div className="ml-auto flex gap-2">
                <Button variant="secondary" onClick={() => setRows(null)}>ยกเลิก</Button>
                <Button loading={busy} disabled={!good.length} onClick={apply}>บันทึกผล {good.length} รายการ</Button>
              </div>
            </div>
            <div className="thin-scroll max-h-[480px] overflow-auto rounded-[var(--radius-ctl)] border border-line">
              <table className="w-full text-[14px]">
                <thead className="sticky top-0 bg-paper">
                  <tr className="text-left text-[13px] text-ink-soft">
                    <th className="px-3 py-2 font-medium">แถว</th>
                    <th className="px-3 py-2 font-medium">พนักงาน</th>
                    <th className="px-3 py-2 font-medium">KPI</th>
                    <th className="px-3 py-2 text-right font-medium">เป้าหมาย</th>
                    <th className="px-3 py-2 text-right font-medium">ผลงาน</th>
                    <th className="px-3 py-2 text-right font-medium">คะแนน</th>
                    <th className="px-3 py-2 font-medium">หมายเหตุ</th>
                  </tr>
                </thead>
                <tbody>
                  {[...bad, ...good].map((r) => (
                    <tr key={r.line} className={clsx("border-t border-line-soft", !r.match && "bg-rust-soft/50")}>
                      <td className="num px-3 py-1.5 text-ink-mute">{r.line}</td>
                      <td className="px-3 py-1.5">{r.code} {r.match && <span className="text-ink-soft">{dir.name(r.match.employee_id)}</span>}</td>
                      <td className="px-3 py-1.5">{r.match?.name ?? r.key}</td>
                      <td className="num px-3 py-1.5 text-right">{r.match?.target ?? "-"}</td>
                      <td className="num px-3 py-1.5 text-right">{r.actual ?? "-"}</td>
                      <td className="num px-3 py-1.5 text-right font-medium">{r.score ?? "-"}</td>
                      <td className="px-3 py-1.5 text-rust">{r.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </Panel>
  );
}
