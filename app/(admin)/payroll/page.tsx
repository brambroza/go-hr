"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Wallet } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useCan } from "@/components/app/me-context";
import { Badge, Button, Checkbox, Empty, Field, Input, Modal, PageHeader, Panel, Select, Spinner, toast } from "@/components/ui";
import { money, thDate } from "@/lib/format";
import { EMP_TYPES, INCLUDE_DEFAULTS, INCLUDE_LABELS, PERIOD_TYPES, PERIOD_TYPE_LABEL, STATUS_COLOR, STATUS_TEXT, cutoffRange, monthEnd, monthStart, periodName } from "@/lib/payroll/labels";
import { createPeriodAction } from "./actions";

type Period = {
  id: number; code: string; name: string; period_type: string; pay_year: number; pay_month: number; start_date: string; end_date: string;
  att_start_date: string | null; att_end_date: string | null; pay_date: string; status: string; payslip_published: boolean;
};
type Totals = { period_id: number; headcount: number; total_income: number; net_pay: number; tax: number; sso_employee: number; sso_employer: number; warnings: number };

export default function PayrollPage() {
  const sb = supabaseBrowser();
  const can = useCan();
  const router = useRouter();
  const [rows, setRows] = useState<Period[] | null>(null);
  const [totals, setTotals] = useState<Record<number, Totals>>({});
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await sb.from("payroll_periods").select("id, code, name, period_type, pay_year, pay_month, start_date, end_date, att_start_date, att_end_date, pay_date, status, payslip_published").eq("pay_year", year).order("pay_date", { ascending: false }).order("id", { ascending: false });
    if (error) toast.error(error.message);
    setRows((data as Period[]) ?? []);
    const ids = (data ?? []).map((p: Period) => p.id);
    if (ids.length) {
      const { data: t } = await sb.from("v_payroll_period_totals").select("*").in("period_id", ids);
      setTotals(Object.fromEntries(((t as Totals[]) ?? []).map((x) => [x.period_id, x])));
    } else setTotals({});
  }, [sb, year]);
  useEffect(() => {
    load();
  }, [load]);

  const years = useMemo(() => {
    const y = new Date().getFullYear();
    return [y + 1, y, y - 1, y - 2, y - 3];
  }, []);

  return (
    <div>
      <PageHeader
        title="งวดเงินเดือน"
        description="สร้างงวด คำนวณ อนุมัติ จ่าย และเผยแพร่สลิปเงินเดือน"
        actions={
          <>
            <Select className="w-32" value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="ปี">
              {years.map((y) => (
                <option key={y} value={y}>
                  ปี {y + 543}
                </option>
              ))}
            </Select>
            {can("payroll", "create") && (
              <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
                สร้างงวด
              </Button>
            )}
          </>
        }
      />
      <Panel bodyClass="p-0">
        {rows === null ? (
          <div className="py-12">
            <Spinner className="mx-auto" />
          </div>
        ) : rows.length === 0 ? (
          <Empty icon={<Wallet className="size-8" />} title={`ยังไม่มีงวดเงินเดือนในปี ${year + 543}`} description="กด “สร้างงวด” เพื่อเริ่มคำนวณเงินเดือนเดือนแรก" />
        ) : (
          <div className="thin-scroll overflow-x-auto">
            <table className="w-full text-[14px]">
              <thead>
                <tr className="border-b border-line bg-paper/60 text-left text-[13px] text-ink-soft">
                  <th className="px-3 py-2 font-medium">งวด</th>
                  <th className="px-3 py-2 font-medium">ประเภท</th>
                  <th className="px-3 py-2 font-medium">ช่วงเงินเดือน / ตัดเวลา</th>
                  <th className="px-3 py-2 font-medium">วันที่จ่าย</th>
                  <th className="px-3 py-2 font-medium">สถานะ</th>
                  <th className="px-3 py-2 text-right font-medium">คน</th>
                  <th className="px-3 py-2 text-right font-medium">รายได้รวม</th>
                  <th className="px-3 py-2 text-right font-medium">ภาษี</th>
                  <th className="px-3 py-2 text-right font-medium">ประกันสังคม</th>
                  <th className="px-3 py-2 text-right font-medium">จ่ายสุทธิ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const t = totals[p.id];
                  return (
                    <tr key={p.id} className="cursor-pointer border-b border-line-soft last:border-0 hover:bg-jade-50/40" onClick={() => router.push(`/payroll/${p.id}`)}>
                      <td className="px-3 py-2.5">
                        <div className="font-medium text-ink">{p.name}</div>
                        <div className="text-xs text-ink-mute">{p.code}</div>
                      </td>
                      <td className="px-3 py-2.5">{PERIOD_TYPE_LABEL[p.period_type] ?? p.period_type}</td>
                      <td className="num px-3 py-2.5 text-ink-soft">
                        <div>
                          {thDate(p.start_date)} – {thDate(p.end_date)}
                        </div>
                        {(p.att_start_date !== p.start_date || p.att_end_date !== p.end_date) && p.att_start_date && (
                          <div className="text-xs text-ink-mute">
                            ตัดเวลา {thDate(p.att_start_date)} – {thDate(p.att_end_date)}
                          </div>
                        )}
                      </td>
                      <td className="num px-3 py-2.5">{thDate(p.pay_date)}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          <Badge color={STATUS_COLOR[p.status]}>{STATUS_TEXT[p.status]}</Badge>
                          {p.payslip_published && <Badge color="green">เผยแพร่สลิป</Badge>}
                          {!!t?.warnings && <Badge color="amber">ตรวจสอบ {t.warnings}</Badge>}
                        </div>
                      </td>
                      <td className="num px-3 py-2.5 text-right">{t?.headcount ?? "-"}</td>
                      <td className="num px-3 py-2.5 text-right">{t ? money(t.total_income) : "-"}</td>
                      <td className="num px-3 py-2.5 text-right">{t ? money(t.tax) : "-"}</td>
                      <td className="num px-3 py-2.5 text-right">{t ? money(Number(t.sso_employee) + Number(t.sso_employer)) : "-"}</td>
                      <td className="num px-3 py-2.5 text-right font-semibold">{t ? money(t.net_pay) : "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      {creating && <CreatePeriodModal onClose={() => setCreating(false)} onCreated={(id) => router.push(`/payroll/${id}`)} />}
    </div>
  );
}

function CreatePeriodModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: number) => void }) {
  const sb = supabaseBrowser();
  const now = new Date();
  const defY = now.getFullYear();
  const defM = now.getMonth() + 1;
  const [type, setType] = useState("monthly");
  const [y, setY] = useState(defY);
  const [m, setM] = useState(defM);
  const [cutoff, setCutoff] = useState(1);
  const [name, setName] = useState(periodName("monthly", defY, defM));
  const [nameTouched, setNameTouched] = useState(false);
  const [dates, setDates] = useState(() => ({ start: monthStart(defY, defM), end: monthEnd(defY, defM), attStart: monthStart(defY, defM), attEnd: monthEnd(defY, defM), pay: monthEnd(defY, defM) }));
  const [inc, setInc] = useState<Record<string, boolean>>(INCLUDE_DEFAULTS.monthly);
  const [branches, setBranches] = useState<{ id: number; name: string }[]>([]);
  const [branchIds, setBranchIds] = useState<number[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    sb.from("branches").select("id, name").eq("is_active", true).order("code").then(({ data }: { data: unknown }) => setBranches((data as { id: number; name: string }[]) ?? []));
  }, [sb]);

  const recompute = (ty: string, yy: number, mm: number, co: number) => {
    const [as, ae] = cutoffRange(yy, mm, co);
    const half = ty === "semi_monthly";
    setDates({ start: monthStart(yy, mm), end: half ? `${yy}-${String(mm).padStart(2, "0")}-15` : monthEnd(yy, mm), attStart: as, attEnd: half ? `${yy}-${String(mm).padStart(2, "0")}-15` : ae, pay: half ? `${yy}-${String(mm).padStart(2, "0")}-15` : monthEnd(yy, mm) });
    if (!nameTouched) setName(periodName(ty, yy, mm));
  };

  async function save() {
    if (!name.trim()) return toast.error("กรุณาระบุชื่องวด");
    setSaving(true);
    const res = await createPeriodAction({
      name: name.trim(), period_type: type as never, pay_year: y, pay_month: m, start_date: dates.start, end_date: dates.end, att_start_date: dates.attStart, att_end_date: dates.attEnd, pay_date: dates.pay,
      ...inc, filter: { ...(branchIds.length ? { branch_ids: branchIds } : {}), ...(types.length ? { employee_types: types } : {}) },
    });
    setSaving(false);
    if (!res.ok) return toast.error(res.error);
    toast.ok("สร้างงวดแล้ว");
    onCreated(res.data as number);
  }

  const months = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="สร้างงวดเงินเดือน"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button loading={saving} onClick={save}>
            สร้างงวด
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="ประเภทงวด" hint={PERIOD_TYPES.find((t) => t.value === type)?.hint}>
          <Select
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              setInc(INCLUDE_DEFAULTS[e.target.value]);
              recompute(e.target.value, y, m, cutoff);
            }}
          >
            {PERIOD_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="เดือนที่จ่าย">
            <Select
              value={m}
              onChange={(e) => {
                setM(Number(e.target.value));
                recompute(type, y, Number(e.target.value), cutoff);
              }}
            >
              {months.map((n, i) => (
                <option key={i} value={i + 1}>
                  {n}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="ปี (พ.ศ.)">
            <Select
              value={y}
              onChange={(e) => {
                setY(Number(e.target.value));
                recompute(type, Number(e.target.value), m, cutoff);
              }}
            >
              {[defY - 1, defY, defY + 1].map((v) => (
                <option key={v} value={v}>
                  {v + 543}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="ชื่องวด" className="sm:col-span-2">
          <Input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setNameTouched(true);
            }}
          />
        </Field>
        <Field label="ตั้งต้นงวดเงินเดือน">
          <Input type="date" value={dates.start} onChange={(e) => setDates({ ...dates, start: e.target.value })} />
        </Field>
        <Field label="สิ้นสุดงวดเงินเดือน">
          <Input type="date" value={dates.end} onChange={(e) => setDates({ ...dates, end: e.target.value })} />
        </Field>
        <Field label="วันตัดรอบเวลาทำงาน" hint="เช่น 26 = ตัดเวลาวันที่ 26 เดือนก่อน ถึง 25 เดือนนี้ (1 = ตามเดือนปฏิทิน)">
          <Select
            value={cutoff}
            onChange={(e) => {
              setCutoff(Number(e.target.value));
              recompute(type, y, m, Number(e.target.value));
            }}
          >
            <option value={1}>ตามเดือนปฏิทิน</option>
            {[16, 20, 21, 25, 26].map((d) => (
              <option key={d} value={d}>
                วันที่ {d} – {d - 1}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="วันที่จ่ายเงิน">
          <Input type="date" value={dates.pay} onChange={(e) => setDates({ ...dates, pay: e.target.value })} />
        </Field>
        <Field label="ตัดเวลาตั้งแต่">
          <Input type="date" value={dates.attStart} onChange={(e) => setDates({ ...dates, attStart: e.target.value })} />
        </Field>
        <Field label="ตัดเวลาถึง">
          <Input type="date" value={dates.attEnd} onChange={(e) => setDates({ ...dates, attEnd: e.target.value })} />
        </Field>
      </div>
      <div className="mt-5">
        <h4 className="mb-2 border-b border-line-soft pb-1 text-sm font-semibold text-jade-800">รายการที่คำนวณในงวดนี้</h4>
        <div className="grid gap-2 sm:grid-cols-3">
          {INCLUDE_LABELS.map(([k, label]) => (
            <Checkbox key={k} label={label} checked={!!inc[k]} onChange={(v) => setInc({ ...inc, [k]: v })} />
          ))}
        </div>
        <p className="mt-1.5 text-xs text-ink-mute">รายรับรายจ่ายที่บันทึกในงวด ค่าคอมมิชชั่น เงินกู้ และเบิกล่วงหน้า รวมเสมอ</p>
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <h4 className="mb-2 border-b border-line-soft pb-1 text-sm font-semibold text-jade-800">สาขา (ไม่เลือก = ทุกสาขา)</h4>
          <div className="flex flex-col gap-1.5">
            {branches.map((b) => (
              <Checkbox key={b.id} label={b.name} checked={branchIds.includes(b.id)} onChange={(v) => setBranchIds(v ? [...branchIds, b.id] : branchIds.filter((x) => x !== b.id))} />
            ))}
          </div>
        </div>
        <div>
          <h4 className="mb-2 border-b border-line-soft pb-1 text-sm font-semibold text-jade-800">ประเภทพนักงาน (ไม่เลือก = ทุกประเภท)</h4>
          <div className="grid grid-cols-2 gap-1.5">
            {EMP_TYPES.map((t) => (
              <Checkbox key={t.value} label={t.label} checked={types.includes(t.value)} onChange={(v) => setTypes(v ? [...types, t.value] : types.filter((x) => x !== t.value))} />
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
