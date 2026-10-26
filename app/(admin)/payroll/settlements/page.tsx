"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, UserMinus } from "lucide-react";
import { Badge, Empty, Input, PageHeader, Panel, Spinner, toast } from "@/components/ui";
import { money, thDate } from "@/lib/format";
import { listSettlementsAction, type SettlementListRow } from "@/lib/payroll/settlement-actions";

/** เคลียร์เงินพนักงานพ้นสภาพ — resigned employees and whether their final settlement is done */
export default function SettlementsPage() {
  const [rows, setRows] = useState<SettlementListRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    listSettlementsAction().then((r) => {
      if (r.ok) setRows(r.data ?? []);
      else {
        setError(r.error);
        toast.error(r.error);
      }
    });
  }, []);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (rows ?? []).filter((r) => !t || `${r.code} ${r.name}`.toLowerCase().includes(t));
  }, [rows, q]);
  const todo = (rows ?? []).filter((r) => !r.settlement).length;

  return (
    <div>
      <PageHeader
        title="เคลียร์เงินพนักงานพ้นสภาพ"
        description="ค่าชดเชย ม.118 (แยกส่วนยกเว้นภาษี), ค่าจ้างวันหยุดพักผ่อนที่ยังไม่ได้ใช้, ค่าบอกกล่าวล่วงหน้า และคืนเงินประกัน — ยืนยันแล้วยอดจะเข้าคิว “รอเข้างวด” ของงวดเงินเดือน ส่วนเงินเดือนงวดสุดท้ายระบบคิดตามสัดส่วนวันทำงานในงวดปกติ"
      />
      <Panel
        title={rows ? `พ้นสภาพใน 13 เดือนล่าสุด · ยังไม่เคลียร์ ${todo} คน` : "พ้นสภาพใน 13 เดือนล่าสุด"}
        actions={<Input className="h-9 w-56" placeholder="ค้นหารหัส / ชื่อ" value={q} onChange={(e) => setQ(e.target.value)} />}
      >
        {error ? (
          <Empty title="โหลดข้อมูลไม่สำเร็จ" description={error} />
        ) : rows === null ? (
          <Spinner className="mx-auto my-10" />
        ) : shown.length === 0 ? (
          <Empty icon={<UserMinus className="size-8" />} title="ไม่มีพนักงานพ้นสภาพ" description="บันทึกการพ้นสภาพ (ประเภทและวันทำงานวันสุดท้าย) ที่ประวัติพนักงานก่อน แล้วรายชื่อจะแสดงที่นี่" />
        ) : (
          <div className="thin-scroll overflow-x-auto rounded-[var(--radius-ctl)] border border-line">
            <table className="w-full text-[14px]">
              <thead>
                <tr className="border-b border-line bg-paper/60 text-left text-[13px] text-ink-soft">
                  <th className="px-3 py-2 font-medium">พนักงาน</th>
                  <th className="px-3 py-2 font-medium">วันทำงานวันสุดท้าย</th>
                  <th className="px-3 py-2 font-medium">ประเภท</th>
                  <th className="px-3 py-2 font-medium">สถานะ</th>
                  <th className="px-3 py-2 text-right font-medium">ยอดเคลียร์</th>
                  <th className="w-px" />
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.employee_id} className="border-b border-line-soft last:border-0 hover:bg-paper/40">
                    <td className="px-3 py-2">
                      <span className="text-ink-mute">{r.code}</span> {r.name}
                    </td>
                    <td className="px-3 py-2">{thDate(r.resign_date)}</td>
                    <td className="px-3 py-2 text-ink-soft">{r.resign_type || <span className="text-amber-ink">ยังไม่ระบุ</span>}</td>
                    <td className="px-3 py-2">
                      {!r.settlement ? <Badge color="amber">ยังไม่เคลียร์</Badge> : r.settlement.paid ? <Badge color="green">จ่ายแล้ว</Badge> : <Badge color="blue">รอเข้างวด</Badge>}
                    </td>
                    <td className="num px-3 py-2 text-right">{r.settlement ? money(r.settlement.total) : "-"}</td>
                    <td className="px-2 text-right">
                      <Link href={`/payroll/settlements/${r.employee_id}`} className="inline-flex items-center gap-1 rounded px-2 py-1 text-jade-700 hover:bg-jade-50" aria-label={`เปิดเคลียร์เงิน ${r.name}`}>
                        เปิด <ChevronRight className="size-4" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
