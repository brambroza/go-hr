import Link from "next/link";
import { requireMe } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { supabaseServer } from "@/lib/supabase/server";
import { PageHeader, Panel, Stat, Badge } from "@/components/ui";
import { BarList, ColumnChart, Donut } from "@/components/charts";
import { TH_MONTHS_SHORT, thDate, isoDate } from "@/lib/format";

export const metadata = { title: "แดชบอร์ด" };

type Stats = {
  headcount: number; probation: number; new_this_month: number; resigned_this_month: number; resigned_12m: number; avg_headcount_12m: number;
  pending_requests: number; today: { checked_in: number; on_leave: number; late: number };
  by_org: { name: string; count: number }[]; by_type: { name: string; count: number }[]; by_gender: { name: string; count: number }[];
  tenure: { name: string; count: number }[];
  headcount_trend: { month: string; count: number; hired: number; resigned: number }[];
  upcoming_birthdays: { id: number; name: string; nickname: string | null; date: string }[];
  probation_due: { id: number; name: string; date: string }[];
  contract_expiring: { id: number; name: string; date: string }[];
};

const TYPE_LABEL: Record<string, string> = { monthly: "รายเดือน", daily: "รายวัน", hourly: "รายชั่วโมง", contract: "สัญญาจ้าง", intern: "นักศึกษาฝึกงาน", parttime: "พาร์ทไทม์" };
const GENDER_LABEL: Record<string, string> = { M: "ชาย", F: "หญิง", X: "ไม่ระบุ", "-": "ไม่ระบุ" };

export default async function DashboardPage() {
  const me = await requireMe();
  const sb = await supabaseServer();
  const showOrg = can(me, "insight") || can(me, "employee");
  const [statsRes, approvals, ann] = await Promise.all([
    showOrg ? sb.rpc("dashboard_stats") : Promise.resolve({ data: null }),
    sb.from("v_my_approvals").select("id", { count: "exact", head: true }),
    sb.from("announcements").select("id, title, publish_at, is_pinned").order("is_pinned", { ascending: false }).order("publish_at", { ascending: false }).limit(5),
  ]);
  const s = statsRes.data as Stats | null;
  const pendingMine = approvals.count ?? 0;
  const turnover = s && s.avg_headcount_12m ? Math.round((s.resigned_12m / s.avg_headcount_12m) * 1000) / 10 : 0;

  return (
    <div>
      <PageHeader title={`สวัสดี ${me.employee?.nickname || me.displayName}`} description={`วันนี้ ${thDate(isoDate(), "long")}`} />

      {pendingMine > 0 && (
        <Link href="/approvals" className="mb-5 flex items-center justify-between rounded-[var(--radius-panel)] border border-amber-200 bg-amber-50 px-4 py-3 text-amber-ink hover:bg-amber-100">
          <span>มีเอกสารรอคุณอนุมัติ <b className="num">{pendingMine}</b> รายการ</span>
          <span className="text-sm font-medium">ไปที่หน้าอนุมัติ</span>
        </Link>
      )}

      {s && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
            <Stat label="พนักงานทั้งหมด" value={s.headcount.toLocaleString()} sub={`ทดลองงาน ${s.probation} คน`} />
            <Stat label="ลงเวลาวันนี้" value={s.today.checked_in.toLocaleString()} sub={`จาก ${s.headcount} คน`} />
            <Stat label="ลาวันนี้" value={s.today.on_leave} />
            <Stat label="มาสายวันนี้" value={s.today.late} tone={s.today.late ? "amber" : undefined} />
            <Stat label="เอกสารรออนุมัติ" value={s.pending_requests} tone={s.pending_requests ? "amber" : undefined} />
            <Stat label="อัตราลาออก 12 เดือน" value={`${turnover}%`} sub={`เข้าใหม่เดือนนี้ ${s.new_this_month} · ออก ${s.resigned_this_month}`} />
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-3">
            <Panel title="จำนวนพนักงาน 12 เดือนล่าสุด" className="xl:col-span-2">
              <ColumnChart
                labels={s.headcount_trend.map((m) => TH_MONTHS_SHORT[Number(m.month.slice(5)) - 1])}
                series={[
                  { name: "เข้าใหม่", values: s.headcount_trend.map((m) => m.hired), color: "#4ba383" },
                  { name: "ลาออก", values: s.headcount_trend.map((m) => m.resigned), color: "#b4441c" },
                ]}
              />
            </Panel>
            <Panel title="ประเภทพนักงาน">
              <Donut data={s.by_type.map((x) => ({ name: TYPE_LABEL[x.name] ?? x.name, value: x.count }))} />
              <div className="mt-4 border-t border-line-soft pt-4">
                <Donut size={110} data={s.by_gender.map((x) => ({ name: GENDER_LABEL[x.name] ?? x.name, value: x.count }))} />
              </div>
            </Panel>
            <Panel title="พนักงานตามหน่วยงาน">
              <BarList data={s.by_org.slice(0, 10).map((x) => ({ name: x.name, value: x.count }))} />
            </Panel>
            <Panel title="อายุงาน">
              <BarList data={s.tenure.map((x) => ({ name: x.name, value: x.count }))} />
            </Panel>
            <Panel title="ต้องติดตาม">
              <ul className="flex flex-col gap-2 text-sm">
                {s.probation_due.map((p) => (
                  <li key={`p${p.id}`} className="flex items-center justify-between gap-2">
                    <Link href={`/employees/${p.id}`} className="hover:text-jade-700">{p.name}</Link>
                    <Badge color="amber">ครบทดลองงาน {thDate(p.date)}</Badge>
                  </li>
                ))}
                {s.contract_expiring.map((p) => (
                  <li key={`c${p.id}`} className="flex items-center justify-between gap-2">
                    <Link href={`/employees/${p.id}`} className="hover:text-jade-700">{p.name}</Link>
                    <Badge color="red">สัญญาหมด {thDate(p.date)}</Badge>
                  </li>
                ))}
                {s.upcoming_birthdays.slice(0, 6).map((p) => (
                  <li key={`b${p.id}`} className="flex items-center justify-between gap-2">
                    <span>{p.name}{p.nickname ? ` (${p.nickname})` : ""}</span>
                    <Badge color="violet">วันเกิด {Number(p.date.slice(3))} {TH_MONTHS_SHORT[Number(p.date.slice(0, 2)) - 1]}</Badge>
                  </li>
                ))}
                {!s.probation_due.length && !s.contract_expiring.length && !s.upcoming_birthdays.length && <li className="text-ink-mute">ไม่มีรายการที่ต้องติดตามในช่วงนี้</li>}
              </ul>
            </Panel>
          </div>
        </>
      )}

      <Panel title="ประกาศล่าสุด" className="mt-4" actions={<Link href="/feed" className="text-sm text-jade-700 hover:underline">ดูทั้งหมด</Link>}>
        {(ann.data ?? []).length === 0 ? (
          <p className="text-sm text-ink-mute">ยังไม่มีประกาศ</p>
        ) : (
          <ul className="divide-y divide-line-soft">
            {(ann.data ?? []).map((a) => (
              <li key={a.id} className="flex items-center justify-between py-2 text-sm">
                <span>{a.is_pinned && <Badge color="green" className="mr-2">ปักหมุด</Badge>}{a.title}</span>
                <span className="text-ink-mute">{thDate(a.publish_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
