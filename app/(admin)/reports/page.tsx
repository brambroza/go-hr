import Link from "next/link";
import { BarChart3, CalendarCheck, Clock, FileText, Landmark, Receipt, ShieldCheck, Users } from "lucide-react";
import { requirePerm } from "@/lib/auth";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "รายงาน" };

const GROUPS = [
  {
    title: "แบบฟอร์มภาครัฐ",
    items: [
      { href: "/reports/pnd1", icon: Landmark, title: "ภ.ง.ด.1 / ภ.ง.ด.1ก", desc: "ภาษีหัก ณ ที่จ่ายรายเดือนพร้อมใบแนบ และสรุปทั้งปี ส่งออกไฟล์สำหรับโปรแกรม RD Prep / e-Filing" },
      { href: "/reports/sso", icon: ShieldCheck, title: "สปส.1-10", desc: "แบบรายการแสดงการส่งเงินสมทบรายเดือนแยกสาขา ส่วนที่ 1 และ 2 พร้อมไฟล์ส่งข้อมูล e-Service" },
      { href: "/reports/tawi50", icon: Receipt, title: "หนังสือรับรองการหักภาษี 50 ทวิ", desc: "ออกหนังสือรับรองฯ ประจำปีให้พนักงานทุกคน พิมพ์ทีละคนหรือทั้งหมด" },
    ],
  },
  {
    title: "เงินเดือน",
    items: [{ href: "/reports/payroll-summary", icon: BarChart3, title: "สรุปเงินเดือนตามหน่วยงาน / สาขา", desc: "จำนวนคน รายได้ รายการหัก สุทธิ และต้นทุนนายจ้าง (สปส. PVD) ของแต่ละงวด" }],
  },
  {
    title: "เวลาทำงานและบุคลากร",
    items: [
      { href: "/reports/attendance", icon: Clock, title: "สรุปเวลาทำงาน", desc: "มาสาย ขาดงาน ลืมสแกน และ OT รายบุคคลตามช่วงวันที่" },
      { href: "/reports/leave", icon: CalendarCheck, title: "สรุปการลา", desc: "วันลาที่ใช้และคงเหลือของแต่ละคนแยกตามประเภทการลา ทั้งปี" },
      { href: "/reports/headcount", icon: Users, title: "อัตรากำลังและการลาออก", desc: "จำนวนพนักงานตามหน่วยงาน ตำแหน่ง ประเภท เพศ พนักงานเข้า-ออก และอัตราการลาออก" },
    ],
  },
];

export default async function ReportsHub() {
  await requirePerm("report", "view");
  return (
    <div>
      <PageHeader title="รายงาน" description="รายงานทุกฉบับพิมพ์เป็น A4 ได้ และส่งออกเป็นไฟล์ CSV เปิดด้วย Excel · แสดงปีเป็น พ.ศ." />
      <div className="flex flex-col gap-6">
        {GROUPS.map((g) => (
          <section key={g.title}>
            <h2 className="mb-2 text-sm font-semibold text-ink-soft">{g.title}</h2>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {g.items.map((r) => (
                <Link key={r.href} href={r.href} className="group flex gap-3 rounded-[var(--radius-panel)] border border-line bg-white p-4 transition-colors hover:border-jade-300 hover:bg-jade-50/40">
                  <span className="grid size-10 shrink-0 place-items-center rounded-[var(--radius-ctl)] bg-jade-50 text-jade-700 group-hover:bg-jade-100">
                    <r.icon className="size-5" />
                  </span>
                  <span>
                    <span className="block font-medium text-ink">{r.title}</span>
                    <span className="mt-0.5 block text-sm text-ink-soft">{r.desc}</span>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
      <p className="mt-6 flex items-center gap-1.5 text-sm text-ink-mute">
        <FileText className="size-4" /> รายงานภาษีและประกันสังคมใช้เฉพาะงวดที่อนุมัติแล้ว จ่ายแล้ว หรือปิดงวดแล้ว
      </p>
    </div>
  );
}
