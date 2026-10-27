"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Info, Pencil, Plus, Trash2 } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useCan } from "@/components/app/me-context";
import { BarList, ColumnChart, Donut } from "@/components/charts";
import { Avatar } from "@/components/employees/avatar";
import { Badge, Button, Empty, Field, Input, Modal, PageHeader, Panel, Select, Spinner, Stat, Tabs, clsx, toast } from "@/components/ui";
import { TH_MONTHS_SHORT, money, num, thDate } from "@/lib/format";
import { STARTER_BENCHMARK, bandOf, validateBenchmark, type IndustryBenchmark } from "./benchmark";

type Named = { name: string; count: number };
type Dash = {
  headcount: number; probation: number; resigned_12m: number; avg_headcount_12m: number; new_this_month: number; resigned_this_month: number;
  by_org: Named[]; by_type: Named[]; by_gender: Named[]; tenure: Named[];
  headcount_trend: { month: string; count: number; hired: number; resigned: number }[];
};
type Extra = {
  age_bands: Named[]; avg_tenure_years: number | null; resign_reasons: Named[];
  attendance_monthly: { month: string; late_count: number; late_minutes: number; absent: number; missing_scan: number; work_days: number }[];
  avg_salary_by_level: { job_level: number; avg: number; count: number }[];
  daily_wage_avg: number | null;
  salary_range_flags: { position_id: number; below: number; above: number; count: number }[];
  position_levels: { name: string; job_level: number; min: number | null; max: number | null }[];
};
type Payroll = {
  monthly: { month: number; income: number; net: number; sso_er: number; pvd_er: number; headcount: number }[];
  by_org: { name: string; cost: number }[];
  avg_salary_by_position: { position: string; avg: number; min: number; max: number; count: number; range_min: number | null; range_max: number | null }[];
};
type Signal = {
  employee_id: number; code: string; name: string; org_unit_name: string | null; position_name: string | null; photo_url: string | null; hire_date: string;
  late_recent: number; late_prev: number; absent_recent: number; short_leaves_recent: number; short_leaves_prev: number; last_raise: string | null; risk_score: number;
};

const TYPE_LABEL: Record<string, string> = { monthly: "รายเดือน", daily: "รายวัน", hourly: "รายชั่วโมง", contract: "สัญญาจ้าง", intern: "นักศึกษาฝึกงาน", parttime: "พาร์ทไทม์" };
const GENDER_LABEL: Record<string, string> = { M: "ชาย", F: "หญิง", X: "ไม่ระบุ", "-": "ไม่ระบุ" };
const mLabel = (ym: string) => TH_MONTHS_SHORT[Number(ym.slice(5, 7)) - 1];
const kBaht = (v: number) => (v >= 1_000_000 ? `${(v / 1_000_000).toFixed(2)} ลบ.` : `${Math.round(v / 1000).toLocaleString("th-TH")}K`);

type TabKey = "workforce" | "cost" | "salary" | "industry" | "resign" | "attendance";

export function InsightView() {
  const sb = supabaseBrowser();
  const can = useCan();
  const [tab, setTab] = useState<TabKey>("workforce");
  const [dash, setDash] = useState<Dash | null>(null);
  const [extra, setExtra] = useState<Extra | null>(null);
  const [year, setYear] = useState(new Date().getFullYear());
  const [payroll, setPayroll] = useState<Payroll | null>(null);
  const [signals, setSignals] = useState<Signal[] | null>(null);
  const [bench, setBench] = useState<IndustryBenchmark | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab") as TabKey | null;
    if (t && ["workforce", "cost", "salary", "industry", "resign", "attendance"].includes(t)) setTab(t);
  }, []);

  useEffect(() => {
    (async () => {
      const [d, x, s, b] = await Promise.all([
        sb.rpc("dashboard_stats"),
        sb.rpc("insight_extra", { p_months: 12 }),
        sb.rpc("insight_resignation_signals"),
        sb.from("settings").select("value").eq("key", "industry_benchmark").maybeSingle(),
      ]);
      if (d.error || x.error) setErr((d.error ?? x.error)!.message);
      setDash(d.data as Dash);
      setExtra(x.data as Extra);
      setSignals((s.data ?? []) as Signal[]);
      const v = b.data?.value as Partial<IndustryBenchmark> | undefined;
      setBench(v && Array.isArray(v.bands) && v.bands.length ? { ...STARTER_BENCHMARK, ...v } as IndustryBenchmark : STARTER_BENCHMARK);
    })();
  }, [sb]);

  useEffect(() => {
    setPayroll(null);
    sb.rpc("payroll_insight", { p_year: year }).then(({ data, error }: { data: unknown; error: { message: string } | null }) => {
      if (error) toast.error(error.message);
      setPayroll((data ?? { monthly: [], by_org: [], avg_salary_by_position: [] }) as Payroll);
    });
  }, [sb, year]);

  const turnover = dash && dash.avg_headcount_12m ? Math.round((dash.resigned_12m / dash.avg_headcount_12m) * 1000) / 10 : 0;

  return (
    <div>
      <PageHeader title="Insight วิเคราะห์ข้อมูล" description="ภาพรวมกำลังคน ต้นทุนพนักงาน โครงสร้างเงินเดือน สัญญาณการลาออก และแนวโน้มการมาทำงาน" />
      <Tabs
        className="mb-4"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "workforce", label: "ภาพรวมกำลังคน" },
          { value: "cost", label: "ต้นทุนพนักงาน" },
          { value: "salary", label: "เงินเดือนเฉลี่ยตามตำแหน่ง" },
          { value: "industry", label: "Industry Insight" },
          { value: "resign", label: "Resignation Signal", count: signals ? signals.filter((s) => s.risk_score >= 40).length : undefined },
          { value: "attendance", label: "แนวโน้มการมาทำงาน" },
        ]}
      />
      {err && <div className="mb-4 rounded-[var(--radius-panel)] border border-rust/40 bg-rust-soft px-4 py-3 text-rust">โหลดข้อมูลไม่ได้: {err}</div>}
      {!dash || !extra ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : tab === "workforce" ? (
        <Workforce dash={dash} extra={extra} turnover={turnover} />
      ) : tab === "cost" ? (
        <Cost payroll={payroll} year={year} setYear={setYear} />
      ) : tab === "salary" ? (
        <SalaryByPosition payroll={payroll} year={year} />
      ) : tab === "industry" ? (
        bench && <Industry bench={bench} setBench={setBench} canEdit={can("settings", "edit")} extra={extra} turnover={turnover} payroll={payroll} />
      ) : tab === "resign" ? (
        <Resign signals={signals} />
      ) : (
        <Attendance extra={extra} />
      )}
    </div>
  );
}

// ------------------------------------------------------------------ workforce
function Workforce({ dash, extra, turnover }: { dash: Dash; extra: Extra; turnover: number }) {
  const trend = dash.headcount_trend;
  const turnoverTrend = trend.map((m) => (m.count ? Math.round((m.resigned / m.count) * 1000) / 10 : 0));
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <Stat label="พนักงานปัจจุบัน" value={num(dash.headcount)} sub={`ทดลองงาน ${dash.probation} คน`} />
        <Stat label="เข้าใหม่เดือนนี้" value={dash.new_this_month} />
        <Stat label="ลาออกเดือนนี้" value={dash.resigned_this_month} tone={dash.resigned_this_month ? "amber" : undefined} />
        <Stat label="อัตราลาออก 12 เดือน" value={`${turnover}%`} sub={`ลาออก ${dash.resigned_12m} คน`} tone={turnover > 20 ? "rust" : undefined} />
        <Stat label="อายุงานเฉลี่ย" value={`${extra.avg_tenure_years ?? 0} ปี`} />
        <Stat label="ค่าจ้างรายวันเฉลี่ย" value={extra.daily_wage_avg ? `${money(extra.daily_wage_avg, 0)} ฿` : "-"} />
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="จำนวนพนักงานและการเข้า-ออก 12 เดือน" className="xl:col-span-2">
          <ColumnChart
            labels={trend.map((m) => mLabel(m.month))}
            series={[
              { name: "เข้าใหม่", values: trend.map((m) => m.hired), color: "#10b981" },
              { name: "ลาออก", values: trend.map((m) => m.resigned), color: "#f43f5e" },
            ]}
          />
        </Panel>
        <Panel title="อัตราลาออกรายเดือน (%)">
          {turnoverTrend.some((v) => v > 0) ? (
            <ColumnChart labels={trend.map((m) => mLabel(m.month))} series={[{ name: "อัตราลาออก %", values: turnoverTrend, color: "#f59e0b" }]} format={(v) => `${v}%`} height={180} />
          ) : (
            <p className="py-10 text-center text-sm text-ink-mute">ไม่มีพนักงานลาออกในช่วง 12 เดือน</p>
          )}
          <p className="mt-2 text-xs text-ink-mute">ลาออกในเดือน ÷ จำนวนพนักงานสิ้นเดือน</p>
        </Panel>
        <Panel title="พนักงานตามหน่วยงาน"><BarList data={dash.by_org.map((x) => ({ name: x.name, value: x.count }))} /></Panel>
        <Panel title="ประเภทการจ้าง"><Donut data={dash.by_type.map((x) => ({ name: TYPE_LABEL[x.name] ?? x.name, value: x.count }))} /></Panel>
        <Panel title="เพศ"><Donut data={dash.by_gender.map((x) => ({ name: GENDER_LABEL[x.name] ?? x.name, value: x.count }))} /></Panel>
        <Panel title="ช่วงอายุ"><BarList data={extra.age_bands.map((x) => ({ name: x.name, value: x.count }))} /></Panel>
        <Panel title="อายุงาน"><BarList data={dash.tenure.map((x) => ({ name: x.name, value: x.count }))} /></Panel>
        <Panel title="เหตุผลการลาออก 12 เดือน">
          {extra.resign_reasons.length ? <BarList data={extra.resign_reasons.map((x) => ({ name: x.name, value: x.count }))} /> : <p className="text-sm text-ink-mute">ไม่มีพนักงานลาออกในช่วง 12 เดือน</p>}
        </Panel>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ cost
function YearSelect({ year, setYear }: { year: number; setYear: (y: number) => void }) {
  const now = new Date().getFullYear();
  return (
    <div className="w-36 shrink-0">
      <Select value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="ปี">
        {[now + 1, now, now - 1, now - 2, now - 3].map((y) => <option key={y} value={y}>ปี {y + 543}</option>)}
      </Select>
    </div>
  );
}

function Cost({ payroll, year, setYear }: { payroll: Payroll | null; year: number; setYear: (y: number) => void }) {
  if (!payroll) return <div className="flex justify-center py-16"><Spinner /></div>;
  const months = Array.from({ length: 12 }, (_, i) => payroll.monthly.find((m) => Number(m.month) === i + 1));
  const total = payroll.monthly.reduce((s, m) => s + Number(m.income) + Number(m.sso_er) + Number(m.pvd_er), 0);
  const income = payroll.monthly.reduce((s, m) => s + Number(m.income), 0);
  const er = payroll.monthly.reduce((s, m) => s + Number(m.sso_er) + Number(m.pvd_er), 0);
  const heads = payroll.monthly.reduce((s, m) => s + Number(m.headcount), 0);
  const perHead = heads ? total / heads : 0;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-ink-soft">นับเฉพาะงวดที่อนุมัติ/จ่ายแล้ว ต้นทุน = รายได้รวม + ประกันสังคมส่วนนายจ้าง + กองทุนสำรองเลี้ยงชีพส่วนนายจ้าง</p>
        <YearSelect year={year} setYear={setYear} />
      </div>
      {!payroll.monthly.length ? (
        <Panel><Empty title={`ยังไม่มีงวดเงินเดือนที่อนุมัติในปี ${year + 543}`} description="ข้อมูลจะแสดงเมื่อมีงวดเงินเดือนสถานะอนุมัติ จ่ายแล้ว หรือปิดงวด" /></Panel>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="ต้นทุนพนักงานรวม" value={`${money(total, 0)} ฿`} sub={`${payroll.monthly.length} งวด`} />
            <Stat label="รายได้พนักงานรวม" value={`${money(income, 0)} ฿`} />
            <Stat label="สมทบนายจ้าง (สปส. + PVD)" value={`${money(er, 0)} ฿`} sub={income ? `${((er / income) * 100).toFixed(1)}% ของรายได้` : undefined} />
            <Stat label="ต้นทุนเฉลี่ยต่อคนต่อเดือน" value={`${money(perHead, 0)} ฿`} />
          </div>
          <div className="grid gap-4 xl:grid-cols-3">
            <Panel title="ต้นทุนรายเดือน" className="xl:col-span-2">
              <ColumnChart
                labels={TH_MONTHS_SHORT}
                format={(v) => `${money(v, 0)} ฿`}
                series={[
                  { name: "รายได้พนักงาน", values: months.map((m) => Number(m?.income ?? 0)), color: "#10b981" },
                  { name: "สปส. นายจ้าง", values: months.map((m) => Number(m?.sso_er ?? 0)), color: "#f59e0b" },
                  { name: "PVD นายจ้าง", values: months.map((m) => Number(m?.pvd_er ?? 0)), color: "#0ea5e9" },
                ]}
              />
            </Panel>
            <Panel title="ต้นทุนตามหน่วยงาน"><BarList data={payroll.by_org.map((x) => ({ name: x.name, value: Number(x.cost) }))} valueFormat={kBaht} /></Panel>
          </div>
          <Panel title="รายละเอียดรายเดือน" bodyClass="overflow-x-auto">
            <table className="w-full text-[14px]">
              <thead className="text-left text-sm text-ink-soft"><tr className="border-b border-line-soft">
                <th className="px-4 py-2 font-medium">เดือน</th><th className="px-3 py-2 text-right font-medium">จำนวนคน</th><th className="px-3 py-2 text-right font-medium">รายได้</th>
                <th className="px-3 py-2 text-right font-medium">สปส. นายจ้าง</th><th className="px-3 py-2 text-right font-medium">PVD นายจ้าง</th><th className="px-3 py-2 text-right font-medium">ต้นทุนรวม</th><th className="px-4 py-2 text-right font-medium">ต่อคน</th>
              </tr></thead>
              <tbody>
                {payroll.monthly.map((m) => {
                  const t = Number(m.income) + Number(m.sso_er) + Number(m.pvd_er);
                  return (
                    <tr key={m.month} className="num border-b border-line-soft last:border-0">
                      <td className="px-4 py-2">{TH_MONTHS_SHORT[m.month - 1]} {year + 543}</td><td className="px-3 py-2 text-right">{m.headcount}</td>
                      <td className="px-3 py-2 text-right">{money(m.income)}</td><td className="px-3 py-2 text-right">{money(m.sso_er)}</td><td className="px-3 py-2 text-right">{money(m.pvd_er)}</td>
                      <td className="px-3 py-2 text-right font-medium">{money(t)}</td><td className="px-4 py-2 text-right">{money(m.headcount ? t / m.headcount : 0)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Panel>
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ salary by position
function SalaryByPosition({ payroll, year }: { payroll: Payroll | null; year: number }) {
  if (!payroll) return <div className="flex justify-center py-16"><Spinner /></div>;
  const rows = payroll.avg_salary_by_position;
  if (!rows.length) return <Panel><Empty title="ยังไม่มีข้อมูลเงินเดือน" description="ต้องมีพนักงานรายเดือนที่บันทึกเงินเดือนแล้ว" /></Panel>;
  const maxAll = Math.max(...rows.map((r) => Math.max(Number(r.max), Number(r.range_max ?? 0))), 1);
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-ink-soft">เงินเดือนปัจจุบันของพนักงานรายเดือน (ไม่รวมพนักงานรายวัน) เทียบกับกระบอกเงินเดือนของตำแหน่ง · ข้อมูล ณ วันนี้ ไม่ขึ้นกับปี {year + 543}</p>
      <Panel bodyClass="overflow-x-auto p-0">
        <table className="w-full text-[14px]">
          <thead className="text-left text-sm text-ink-soft"><tr className="border-b border-line-soft">
            <th className="px-4 py-2 font-medium">ตำแหน่ง</th><th className="px-3 py-2 text-right font-medium">คน</th><th className="px-3 py-2 text-right font-medium">ต่ำสุด</th>
            <th className="px-3 py-2 text-right font-medium">เฉลี่ย</th><th className="px-3 py-2 text-right font-medium">สูงสุด</th><th className="px-3 py-2 font-medium">กระบอกเงินเดือน</th><th className="w-64 px-4 py-2 font-medium">เทียบกระบอก</th>
          </tr></thead>
          <tbody>
            {rows.map((r) => {
              const below = r.range_min != null && Number(r.min) < Number(r.range_min);
              const above = r.range_max != null && Number(r.max) > Number(r.range_max);
              const pos = (v: number) => `${Math.min(100, (v / maxAll) * 100)}%`;
              return (
                <tr key={r.position} className="border-b border-line-soft last:border-0">
                  <td className="px-4 py-2.5">
                    <div className="font-medium">{r.position}</div>
                    <div className="mt-0.5 flex gap-1">
                      {below && <Badge color="amber">มีคนต่ำกว่ากระบอก</Badge>}
                      {above && <Badge color="red">มีคนเกินกระบอก</Badge>}
                      {!below && !above && r.range_min != null && <Badge color="green">อยู่ในกระบอก</Badge>}
                    </div>
                  </td>
                  <td className="num px-3 py-2.5 text-right">{r.count}</td>
                  <td className={clsx("num px-3 py-2.5 text-right", below && "font-medium text-amber-ink")}>{money(r.min, 0)}</td>
                  <td className="num px-3 py-2.5 text-right font-medium">{money(r.avg, 0)}</td>
                  <td className={clsx("num px-3 py-2.5 text-right", above && "font-medium text-rust")}>{money(r.max, 0)}</td>
                  <td className="num whitespace-nowrap px-3 py-2.5 text-ink-soft">{r.range_min != null ? `${money(r.range_min, 0)} – ${money(r.range_max, 0)}` : "ไม่ได้กำหนด"}</td>
                  <td className="px-4 py-2.5">
                    <div className="relative h-5" aria-hidden>
                      <div className="absolute top-2 h-1 w-full rounded bg-line-soft" />
                      {r.range_min != null && r.range_max != null && <div className="absolute top-1.5 h-2 rounded bg-jade-100" style={{ left: pos(Number(r.range_min)), width: `calc(${pos(Number(r.range_max))} - ${pos(Number(r.range_min))})` }} />}
                      <div className="absolute top-2 h-1 rounded bg-jade-500/50" style={{ left: pos(Number(r.min)), width: `calc(${pos(Number(r.max))} - ${pos(Number(r.min))} + 2px)` }} />
                      <div className="absolute top-0.5 h-4 w-1 rounded bg-jade-700" style={{ left: pos(Number(r.avg)) }} title={`เฉลี่ย ${money(r.avg, 0)}`} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>
      <p className="text-xs text-ink-mute">แถบสีอ่อน = กระบอกเงินเดือนของตำแหน่ง · เส้นเข้ม = ช่วงต่ำสุด–สูงสุดของพนักงานจริง · ขีดตั้ง = ค่าเฉลี่ย · ปรับกระบอกได้ที่ องค์กร &gt; ตำแหน่งงาน</p>
    </div>
  );
}

// ------------------------------------------------------------------ industry
function Industry({ bench, setBench, canEdit, extra, turnover, payroll }: { bench: IndustryBenchmark; setBench: (b: IndustryBenchmark) => void; canEdit: boolean; extra: Extra; turnover: number; payroll: Payroll | null }) {
  const [editing, setEditing] = useState(false);
  const levels = extra.avg_salary_by_level;
  const rows = bench.bands.map((b) => {
    const inBand = levels.filter((l) => l.job_level >= b.level_min && l.job_level <= b.level_max);
    const cnt = inBand.reduce((s, l) => s + l.count, 0);
    const avg = cnt ? inBand.reduce((s, l) => s + Number(l.avg) * l.count, 0) / cnt : null;
    const diff = avg != null ? ((avg - b.median) / b.median) * 100 : null;
    return { ...b, cnt, avg, diff };
  });
  const att = extra.attendance_monthly.slice(-3);
  const workDays = att.reduce((s, m) => s + m.work_days, 0);
  const absentRate = workDays ? (att.reduce((s, m) => s + m.absent, 0) / workDays) * 100 : 0;
  const lateRate = workDays ? (att.reduce((s, m) => s + m.late_count, 0) / workDays) * 100 : 0;
  const income = payroll?.monthly.reduce((s, m) => s + Number(m.income), 0) ?? 0;
  const er = payroll?.monthly.reduce((s, m) => s + Number(m.sso_er) + Number(m.pvd_er), 0) ?? 0;
  const costRatio = income ? (income + er) / income : null;
  const unlevelled = extra.position_levels.filter((p) => !bandOf(bench, p.job_level));

  const cmp = (company: number | null, market: number, higherIsBad = true, unit = "%") => {
    if (company == null) return <span className="text-ink-mute">ไม่มีข้อมูล</span>;
    const d = company - market;
    const bad = higherIsBad ? d > 0 : d < 0;
    return <Badge color={Math.abs(d) < 0.05 * Math.max(1, market) ? "gray" : bad ? "amber" : "green"}>{d >= 0 ? "+" : ""}{d.toFixed(unit ? 1 : 2)}{unit}</Badge>;
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3 rounded-[var(--radius-panel)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-ink">
        <Info className="mt-0.5 size-4 shrink-0" />
        <div>
          <b>ตัวเลขอ้างอิงที่แก้ไขได้ ไม่ใช่ข้อมูลทางการ</b> — {bench.source} ({bench.industry}, ปรับปรุง {thDate(bench.updated)}). ใช้เพื่อเปรียบเทียบเบื้องต้นเท่านั้น ควรแทนที่ด้วยผลสำรวจค่าจ้างที่บริษัทซื้อหรือเข้าร่วม
        </div>
        {canEdit && <Button size="sm" variant="secondary" icon={<Pencil className="size-4" />} className="ml-auto shrink-0" onClick={() => setEditing(true)}>แก้ไขข้อมูลอ้างอิง</Button>}
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="เงินเดือนเฉลี่ยเทียบตลาด ตามระดับงาน" className="xl:col-span-2" bodyClass="overflow-x-auto p-0">
          <table className="w-full text-[14px]">
            <thead className="text-left text-sm text-ink-soft"><tr className="border-b border-line-soft">
              <th className="px-4 py-2 font-medium">กลุ่มระดับงาน</th><th className="px-3 py-2 font-medium">Job level</th><th className="px-3 py-2 text-right font-medium">คน</th>
              <th className="px-3 py-2 text-right font-medium">บริษัท (เฉลี่ย)</th><th className="px-3 py-2 text-right font-medium">ตลาด (ค่ากลาง)</th><th className="px-4 py-2 text-right font-medium">ต่าง</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label} className="border-b border-line-soft last:border-0">
                  <td className="px-4 py-2.5 font-medium">{r.label}</td>
                  <td className="num px-3 py-2.5 text-ink-soft">{r.level_min}–{r.level_max}</td>
                  <td className="num px-3 py-2.5 text-right">{r.cnt || "-"}</td>
                  <td className="num px-3 py-2.5 text-right">{r.avg != null ? money(r.avg, 0) : "-"}</td>
                  <td className="num px-3 py-2.5 text-right text-ink-soft">{money(r.median, 0)}</td>
                  <td className="px-4 py-2.5 text-right">
                    {r.diff == null ? <span className="text-ink-mute">-</span> : <Badge color={r.diff < -10 ? "amber" : r.diff > 15 ? "blue" : "green"}>{r.diff >= 0 ? "+" : ""}{r.diff.toFixed(1)}%</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {unlevelled.length > 0 && <p className="border-t border-line-soft px-4 py-2 text-xs text-ink-mute">ตำแหน่งที่ไม่อยู่ในกลุ่มใด: {unlevelled.map((p) => `${p.name} (L${p.job_level})`).join(", ")}</p>}
        </Panel>
        <Panel title="ตัวชี้วัดเทียบตลาด">
          <ul className="flex flex-col gap-3 text-sm">
            <li className="flex items-center justify-between gap-2"><span>อัตราลาออกต่อปี<div className="text-xs text-ink-mute">บริษัท {turnover}% · ตลาด {bench.turnover_annual_percent}%</div></span>{cmp(turnover, bench.turnover_annual_percent)}</li>
            <li className="flex items-center justify-between gap-2"><span>อัตราขาดงาน (3 เดือน)<div className="text-xs text-ink-mute">บริษัท {absentRate.toFixed(1)}% · ตลาด {bench.absent_rate_percent}%</div></span>{cmp(workDays ? absentRate : null, bench.absent_rate_percent)}</li>
            <li className="flex items-center justify-between gap-2"><span>อัตรามาสาย (3 เดือน)<div className="text-xs text-ink-mute">บริษัท {lateRate.toFixed(1)}% · ตลาด {bench.late_rate_percent}%</div></span>{cmp(workDays ? lateRate : null, bench.late_rate_percent)}</li>
            <li className="flex items-center justify-between gap-2"><span>ต้นทุนรวม ÷ รายได้<div className="text-xs text-ink-mute">บริษัท {costRatio ? costRatio.toFixed(2) : "-"} · ตลาด {bench.employer_cost_ratio}</div></span>{cmp(costRatio, bench.employer_cost_ratio, true, "")}</li>
          </ul>
          <p className="mt-3 text-xs text-ink-mute">สีส้ม = แย่กว่าค่าอ้างอิง · สีเขียว = ดีกว่า</p>
        </Panel>
      </div>
      {editing && <BenchmarkEditor value={bench} onClose={() => setEditing(false)} onSaved={(b) => (setBench(b), setEditing(false))} />}
    </div>
  );
}

function BenchmarkEditor({ value, onClose, onSaved }: { value: IndustryBenchmark; onClose: () => void; onSaved: (b: IndustryBenchmark) => void }) {
  const sb = supabaseBrowser();
  const [v, setV] = useState<IndustryBenchmark>(structuredClone(value));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const setBand = (i: number, p: Partial<IndustryBenchmark["bands"][number]>) => setV((x) => ({ ...x, bands: x.bands.map((b, j) => (j === i ? { ...b, ...p } : b)) }));
  const save = async () => {
    const e = validateBenchmark(v);
    setErr(e);
    if (e) return;
    setBusy(true);
    const { error } = await sb.from("settings").upsert({ key: "industry_benchmark", value: v, is_public: false });
    setBusy(false);
    if (error) return toast.error(`บันทึกไม่ได้: ${error.message}`);
    toast.ok("บันทึกข้อมูลอ้างอิงแล้ว");
    onSaved(v);
  };
  return (
    <Modal open onClose={onClose} size="xl" title="แก้ไขข้อมูลอ้างอิงอุตสาหกรรม"
      footer={<><Button variant="ghost" className="mr-auto" onClick={() => setV(structuredClone(STARTER_BENCHMARK))}>คืนค่าตั้งต้น</Button><Button variant="secondary" onClick={onClose}>ยกเลิก</Button><Button loading={busy} onClick={save}>บันทึก</Button></>}>
      <div className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="แหล่งข้อมูล" className="sm:col-span-2"><Input value={v.source} onChange={(e) => setV({ ...v, source: e.target.value })} /></Field>
          <Field label="ข้อมูล ณ วันที่"><Input type="date" value={v.updated} onChange={(e) => setV({ ...v, updated: e.target.value })} /></Field>
          <Field label="อุตสาหกรรม" className="sm:col-span-3"><Input value={v.industry} onChange={(e) => setV({ ...v, industry: e.target.value })} /></Field>
        </div>
        <div>
          <div className="mb-1 text-sm font-medium text-ink-soft">ค่ากลางเงินเดือนตลาด (บาท/เดือน) ตามช่วง Job level ของตำแหน่ง</div>
          <table className="w-full text-sm">
            <thead className="text-left text-ink-soft"><tr><th className="py-1 pr-2 font-medium">กลุ่มระดับงาน</th><th className="w-24 py-1 pr-2 font-medium">Level จาก</th><th className="w-24 py-1 pr-2 font-medium">ถึง</th><th className="w-36 py-1 pr-2 font-medium">ค่ากลางตลาด</th><th className="w-10" /></tr></thead>
            <tbody>
              {v.bands.map((b, i) => (
                <tr key={i}>
                  <td className="py-1 pr-2"><Input value={b.label} onChange={(e) => setBand(i, { label: e.target.value })} className="h-9" /></td>
                  <td className="py-1 pr-2"><Input type="number" value={b.level_min} onChange={(e) => setBand(i, { level_min: Number(e.target.value) })} className="h-9" /></td>
                  <td className="py-1 pr-2"><Input type="number" value={b.level_max} onChange={(e) => setBand(i, { level_max: Number(e.target.value) })} className="h-9" /></td>
                  <td className="py-1 pr-2"><Input type="money" value={b.median} onChange={(e) => setBand(i, { median: Number(e.target.value) })} className="h-9" /></td>
                  <td className="py-1"><button type="button" aria-label="ลบแถว" onClick={() => setV({ ...v, bands: v.bands.filter((_, j) => j !== i) })} className="p-1 text-ink-mute hover:text-rust"><Trash2 className="size-4" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <Button size="sm" variant="ghost" icon={<Plus className="size-4" />} onClick={() => setV({ ...v, bands: [...v.bands, { label: "", level_min: 0, level_max: 0, median: 0 }] })}>เพิ่มกลุ่ม</Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="อัตราลาออกต่อปี (%)"><Input type="number" step="0.1" value={v.turnover_annual_percent} onChange={(e) => setV({ ...v, turnover_annual_percent: Number(e.target.value) })} /></Field>
          <Field label="อัตราขาดงาน (%)"><Input type="number" step="0.1" value={v.absent_rate_percent} onChange={(e) => setV({ ...v, absent_rate_percent: Number(e.target.value) })} /></Field>
          <Field label="อัตรามาสาย (%)"><Input type="number" step="0.1" value={v.late_rate_percent} onChange={(e) => setV({ ...v, late_rate_percent: Number(e.target.value) })} /></Field>
          <Field label="ต้นทุนรวม ÷ รายได้"><Input type="number" step="0.01" value={v.employer_cost_ratio} onChange={(e) => setV({ ...v, employer_cost_ratio: Number(e.target.value) })} /></Field>
        </div>
        {err && <p className="text-sm text-rust">{err}</p>}
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ resignation signal
function reasons(s: Signal): string[] {
  const out: string[] = [];
  const lateUp = s.late_recent - s.late_prev;
  if (lateUp > 0) out.push(`มาสายเพิ่มขึ้น ${lateUp} ครั้ง (90 วันล่าสุด ${s.late_recent} ครั้ง เทียบกับช่วงก่อนหน้า ${s.late_prev} ครั้ง) · +${lateUp * 4}`);
  if (s.absent_recent > 0) out.push(`ขาดงาน ${s.absent_recent} วันใน 90 วันล่าสุด · +${s.absent_recent * 10}`);
  const leaveUp = s.short_leaves_recent - s.short_leaves_prev;
  if (leaveUp > 0) out.push(`ลาระยะสั้น (≤ 1 วัน) บ่อยขึ้น ${leaveUp} ครั้ง — มักเป็นสัญญาณไปสัมภาษณ์งาน · +${leaveUp * 12}`);
  if (!s.last_raise || s.last_raise < new Date(Date.now() - 548 * 86400000).toISOString().slice(0, 10))
    out.push(`${s.last_raise ? `ไม่ได้ปรับเงินเดือนตั้งแต่ ${thDate(s.last_raise)}` : "ไม่มีประวัติการปรับเงินเดือน"} (เกิน 18 เดือน) · +15`);
  const days = (Date.now() - Date.parse(s.hire_date)) / 86400000;
  if (days >= 300 && days <= 730) out.push("อายุงาน 10–24 เดือน — ช่วงที่พนักงานลาออกมากที่สุด · +10");
  return out;
}

function Resign({ signals }: { signals: Signal[] | null }) {
  const [min, setMin] = useState(20);
  if (!signals) return <div className="flex justify-center py-16"><Spinner /></div>;
  const list = signals.filter((s) => s.risk_score >= min);
  const high = signals.filter((s) => s.risk_score >= 60).length;
  const mid = signals.filter((s) => s.risk_score >= 40 && s.risk_score < 60).length;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="ความเสี่ยงสูง (60+)" value={high} tone={high ? "rust" : undefined} />
        <Stat label="ความเสี่ยงปานกลาง (40–59)" value={mid} tone={mid ? "amber" : undefined} />
        <Stat label="พนักงานที่วิเคราะห์" value={signals.length} />
        <div className="flex flex-col justify-center rounded-[var(--radius-panel)] border border-line bg-white px-4 py-3">
          <span className="text-sm text-ink-soft">แสดงคะแนนตั้งแต่</span>
          <Select value={min} onChange={(e) => setMin(Number(e.target.value))} className="mt-1 h-9"><option value={0}>ทั้งหมด</option><option value={20}>20 ขึ้นไป</option><option value={40}>40 ขึ้นไป</option><option value={60}>60 ขึ้นไป</option></Select>
        </div>
      </div>
      <div className="flex items-start gap-2 text-sm text-ink-soft">
        <Info className="mt-0.5 size-4 shrink-0 text-jade-600" />
        คะแนน 0–100 คำนวณจากพฤติกรรมการมาทำงาน 90 วันล่าสุดเทียบกับ 90 วันก่อนหน้า การลา การปรับเงินเดือน และอายุงาน เป็นสัญญาณให้หัวหน้าพูดคุยกับพนักงาน ไม่ใช่การตัดสิน
      </div>
      <Panel bodyClass="p-0">
        {!list.length ? (
          <Empty title="ไม่พบพนักงานที่มีสัญญาณในช่วงคะแนนนี้" />
        ) : (
          <ul className="divide-y divide-line-soft">
            {list.map((s) => {
              const r = reasons(s);
              return (
                <li key={s.employee_id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-start">
                  <Link href={`/employees/${s.employee_id}`} className="flex min-w-0 items-center gap-3 sm:w-72 sm:shrink-0">
                    <Avatar src={s.photo_url} name={s.name} size={40} />
                    <span className="min-w-0">
                      <span className="block truncate font-medium hover:text-jade-700">{s.name}</span>
                      <span className="block truncate text-xs text-ink-mute">{s.code} · {s.position_name ?? "-"} · {s.org_unit_name ?? "-"}</span>
                    </span>
                  </Link>
                  <div className="flex shrink-0 items-center gap-2 sm:w-36">
                    <div className="h-2 w-20 rounded-full bg-line-soft"><div className={clsx("h-2 rounded-full", s.risk_score >= 60 ? "bg-rust" : s.risk_score >= 40 ? "bg-amber-500" : "bg-jade-400")} style={{ width: `${s.risk_score}%` }} /></div>
                    <span className={clsx("num font-semibold", s.risk_score >= 60 ? "text-rust" : s.risk_score >= 40 ? "text-amber-ink" : "text-ink")}>{s.risk_score}</span>
                  </div>
                  <ul className="min-w-0 flex-1 list-disc pl-4 text-sm text-ink-soft marker:text-ink-mute">
                    {r.length ? r.map((x) => <li key={x}>{x}</li>) : <li>ไม่มีปัจจัยเสี่ยงเด่น</li>}
                  </ul>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}

// ------------------------------------------------------------------ attendance trend
function Attendance({ extra }: { extra: Extra }) {
  const rows = extra.attendance_monthly;
  const hasData = rows.some((m) => m.work_days > 0);
  return (
    <div className="flex flex-col gap-4">
      {!hasData && <Panel><Empty title="ยังไม่มีผลคำนวณเวลาทำงาน" description="ข้อมูลมาจากผลคำนวณเวลาทำงานรายวัน (งาน 'คำนวณเวลาทำงาน' รันอัตโนมัติทุกชั่วโมง)" /></Panel>}
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="จำนวนครั้งมาสาย / ขาดงาน / ลืมสแกน รายเดือน">
          <ColumnChart
            labels={rows.map((m) => mLabel(m.month))}
            series={[
              { name: "มาสาย (ครั้ง)", values: rows.map((m) => m.late_count), color: "#f59e0b" },
              { name: "ขาดงาน (วัน)", values: rows.map((m) => m.absent), color: "#f43f5e" },
              { name: "ลืมสแกน", values: rows.map((m) => m.missing_scan), color: "#94a3b8" },
            ]}
          />
        </Panel>
        <Panel title="อัตรามาสาย (% ของวันทำงาน)">
          <ColumnChart labels={rows.map((m) => mLabel(m.month))} series={[{ name: "มาสาย %", values: rows.map((m) => (m.work_days ? Math.round((m.late_count / m.work_days) * 1000) / 10 : 0)), color: "#f59e0b" }]} format={(v) => `${v}%`} />
        </Panel>
      </div>
      <Panel title="สรุปรายเดือน" bodyClass="overflow-x-auto p-0">
        <table className="w-full text-[14px]">
          <thead className="text-left text-sm text-ink-soft"><tr className="border-b border-line-soft">
            <th className="px-4 py-2 font-medium">เดือน</th><th className="px-3 py-2 text-right font-medium">วันทำงาน (คน-วัน)</th><th className="px-3 py-2 text-right font-medium">มาสาย</th>
            <th className="px-3 py-2 text-right font-medium">นาทีสายรวม</th><th className="px-3 py-2 text-right font-medium">ขาดงาน</th><th className="px-4 py-2 text-right font-medium">ลืมสแกน</th>
          </tr></thead>
          <tbody>
            {rows.filter((m) => m.work_days > 0).map((m) => (
              <tr key={m.month} className="num border-b border-line-soft last:border-0">
                <td className="px-4 py-2">{mLabel(m.month)} {Number(m.month.slice(0, 4)) + 543}</td>
                <td className="px-3 py-2 text-right">{num(m.work_days)}</td>
                <td className="px-3 py-2 text-right">{num(m.late_count)}</td>
                <td className="px-3 py-2 text-right">{num(m.late_minutes)}</td>
                <td className={clsx("px-3 py-2 text-right", m.absent > 0 && "text-rust")}>{num(m.absent)}</td>
                <td className="px-4 py-2 text-right">{num(m.missing_scan)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}

