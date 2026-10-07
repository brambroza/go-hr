"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, ExternalLink, QrCode, Users } from "lucide-react";
import { CrudPage } from "@/components/crud/crud-page";
import { Badge, Button, Modal, toast } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import { QrSvg } from "@/components/attendance/qr";
import { QuestionsBuilder } from "@/components/recruit/questions-builder";
import { EMP_TYPE_LABEL, JOB_STATUS, JOB_STATUS_COLOR, STAGE, salaryText, type JobQuestion } from "@/components/recruit/labels";
import { thDate } from "@/lib/format";

type Counts = Record<number, Record<string, number>>;

function publicUrl(slug: string) {
  return `${typeof window !== "undefined" ? window.location.origin : ""}/careers/${slug}`;
}

export default function JobsPage() {
  const router = useRouter();
  const [counts, setCounts] = useState<Counts>({});
  const [qr, setQr] = useState<{ title: string; slug: string } | null>(null);

  useEffect(() => {
    supabaseBrowser()
      .from("applicants")
      .select("posting_id, stage")
      .limit(20000)
      .then(({ data }: { data: unknown }) => {
        const c: Counts = {};
        for (const r of (data ?? []) as { posting_id: number | null; stage: string }[]) {
          if (!r.posting_id) continue;
          c[r.posting_id] ??= {};
          c[r.posting_id][r.stage] = (c[r.posting_id][r.stage] ?? 0) + 1;
        }
        setCounts(c);
      });
  }, []);

  const copy = async (slug: string) => {
    try {
      await navigator.clipboard.writeText(publicUrl(slug));
      toast.ok("คัดลอกลิงก์ใบสมัครแล้ว");
    } catch {
      toast.info(publicUrl(slug));
    }
  };

  return (
    <>
      <CrudPage
        config={{
          table: "job_postings",
          title: "ประกาศรับสมัครงาน",
          description: "ประกาศที่สถานะ “เปิดรับสมัคร” จะแสดงบนหน้ารับสมัครงานออนไลน์ (/careers) — ผู้สมัครกรอกใบสมัครได้เองโดยไม่ต้องมีบัญชี",
          menu: "recruit",
          orderBy: { column: "id", ascending: false },
          searchColumns: ["title", "location_text"],
          formSize: "xl",
          exportName: "job-postings",
          defaults: { status: "draft", headcount: 1, employment_type: "monthly", show_salary: true, questions: [] },
          filters: [{ name: "status", label: "สถานะ", options: Object.entries(JOB_STATUS).map(([value, label]) => ({ value, label })) }],
          columns: [
            {
              key: "title",
              label: "ตำแหน่งที่รับสมัคร",
              sortable: true,
              render: (r, { refLabel }) => (
                <div className="min-w-48">
                  <div className="font-medium text-ink">{String(r.title)}</div>
                  <div className="text-xs text-ink-mute">
                    {[refLabel("org_unit_id", r.org_unit_id), refLabel("branch_id", r.branch_id)].filter((x) => x !== "-").join(" · ") || "-"}
                  </div>
                </div>
              ),
            },
            { key: "headcount", label: "อัตรา", className: "text-right num" },
            {
              key: "salary_min",
              label: "เงินเดือน",
              render: (r) => <span className="num whitespace-nowrap text-ink-soft">{salaryText(r.salary_min as number, r.salary_max as number, r.employment_type as string)}</span>,
              exportValue: (r) => salaryText(r.salary_min as number, r.salary_max as number, r.employment_type as string),
            },
            {
              key: "status",
              label: "สถานะ",
              render: (r) => <Badge color={JOB_STATUS_COLOR[String(r.status)]}>{JOB_STATUS[String(r.status)]}</Badge>,
              exportValue: (r) => JOB_STATUS[String(r.status)],
            },
            {
              key: "close_date",
              label: "ปิดรับ",
              render: (r) => <span className="num whitespace-nowrap">{r.close_date ? thDate(String(r.close_date)) : "ไม่กำหนด"}</span>,
            },
            {
              key: "applicants",
              label: "ผู้สมัคร",
              exportValue: (r) => Object.values(counts[Number(r.id)] ?? {}).reduce((a, b) => a + b, 0),
              render: (r) => {
                const c = counts[Number(r.id)] ?? {};
                const total = Object.values(c).reduce((a, b) => a + b, 0);
                if (!total) return <span className="text-ink-mute">ยังไม่มี</span>;
                return (
                  <Link href={`/recruit/applicants?posting=${r.id}`} onClick={(e) => e.stopPropagation()} className="group flex min-w-44 flex-wrap items-center gap-1">
                    <span className="num mr-1 font-semibold text-jade-800 group-hover:underline">{total}</span>
                    {(["applied", "screening", "interview", "offer", "hired"] as const).map((s) =>
                      c[s] ? (
                        <span key={s} title={STAGE[s]} className="num rounded bg-paper px-1.5 text-xs text-ink-soft">
                          {STAGE[s].slice(0, 6)} {c[s]}
                        </span>
                      ) : null,
                    )}
                  </Link>
                );
              },
            },
          ],
          rowActions: (r) => (
            <>
              <button className="rounded p-1.5 text-ink-mute hover:bg-jade-50 hover:text-jade-700" title="ผู้สมัคร" aria-label="ผู้สมัคร" onClick={() => router.push(`/recruit/applicants?posting=${r.id}`)}>
                <Users className="size-4" />
              </button>
              <button className="rounded p-1.5 text-ink-mute hover:bg-jade-50 hover:text-jade-700" title="คัดลอกลิงก์ใบสมัคร" aria-label="คัดลอกลิงก์" onClick={() => copy(String(r.slug))}>
                <Copy className="size-4" />
              </button>
              <button className="rounded p-1.5 text-ink-mute hover:bg-jade-50 hover:text-jade-700" title="QR Code สำหรับโปสเตอร์" aria-label="QR Code" onClick={() => setQr({ title: String(r.title), slug: String(r.slug) })}>
                <QrCode className="size-4" />
              </button>
              <a className="rounded p-1.5 text-ink-mute hover:bg-jade-50 hover:text-jade-700" title="เปิดหน้าประกาศ" aria-label="เปิดหน้าประกาศ" href={`/careers/${r.slug}`} target="_blank" rel="noreferrer">
                <ExternalLink className="size-4" />
              </a>
            </>
          ),
          fields: [
            { name: "title", label: "ชื่อตำแหน่งที่ประกาศ", type: "text", required: true, span: 2, section: "รายละเอียดตำแหน่ง", placeholder: "เช่น พนักงานฝ่ายผลิต (กะ) ประจำโรงงานบางเสาธง" },
            { name: "status", label: "สถานะ", type: "select", required: true, options: Object.entries(JOB_STATUS).map(([value, label]) => ({ value, label })) },
            { name: "position_id", label: "ตำแหน่งในผังองค์กร", type: "ref", ref: { table: "positions", label: "name", order: "code" } },
            { name: "org_unit_id", label: "หน่วยงาน", type: "ref", ref: { table: "org_units", label: "name", order: "name" } },
            { name: "branch_id", label: "สาขา / สถานที่ทำงาน", type: "ref", ref: { table: "branches", label: "name", order: "code" } },
            { name: "headcount", label: "จำนวนที่รับ (อัตรา)", type: "number", min: 1, required: true },
            { name: "employment_type", label: "ประเภทการจ้าง", type: "select", required: true, options: Object.entries(EMP_TYPE_LABEL).map(([value, label]) => ({ value, label })) },
            { name: "hiring_manager_id", label: "หัวหน้าที่รับผิดชอบ (Hiring manager)", type: "employee", hint: "เห็นผู้สมัครของประกาศนี้ และเป็นหัวหน้าเริ่มต้นเมื่อบรรจุ" },
            { name: "location_text", label: "สถานที่ปฏิบัติงาน (แสดงต่อผู้สมัคร)", type: "text", placeholder: "เช่น บางเสาธง สมุทรปราการ" },
            { name: "salary_min", label: "เงินเดือนต่ำสุด", type: "money", section: "ค่าตอบแทนและช่วงเวลารับสมัคร" },
            { name: "salary_max", label: "เงินเดือนสูงสุด", type: "money", validate: (v, vals) => (v && vals.salary_min && Number(v) < Number(vals.salary_min) ? "ต้องไม่น้อยกว่าเงินเดือนต่ำสุด" : null) },
            { name: "show_salary", label: "แสดงเงินเดือนบนประกาศ", type: "boolean" },
            { name: "open_date", label: "วันที่เปิดรับ", type: "date" },
            { name: "close_date", label: "วันที่ปิดรับ", type: "date", hint: "เว้นว่าง = รับสมัครจนกว่าจะได้ผู้สมัคร", validate: (v, vals) => (v && vals.open_date && String(v) < String(vals.open_date) ? "ต้องไม่ก่อนวันที่เปิดรับ" : null) },
            { name: "description", label: "รายละเอียดงาน", type: "textarea", section: "เนื้อหาประกาศ", hint: "ขึ้นบรรทัดใหม่เพื่อแยกข้อ" },
            { name: "qualifications", label: "คุณสมบัติผู้สมัคร", type: "textarea" },
            { name: "benefits", label: "สวัสดิการ", type: "textarea" },
            {
              name: "questions",
              label: "คำถามเพิ่มเติมในใบสมัคร",
              type: "custom",
              span: 2,
              section: "ใบสมัคร",
              render: ({ value, onChange }) => <QuestionsBuilder value={(value as JobQuestion[]) ?? []} onChange={onChange} />,
            },
          ],
          beforeSave: (v) => ({
            ...v,
            questions: ((v.questions as JobQuestion[]) ?? []).filter((q) => q.label?.trim()),
          }),
        }}
      />
      <Modal
        open={!!qr}
        onClose={() => setQr(null)}
        title="QR Code สำหรับโปสเตอร์รับสมัครงาน"
        footer={
          <>
            <Button variant="secondary" icon={<Copy className="size-4" />} onClick={() => qr && copy(qr.slug)}>
              คัดลอกลิงก์
            </Button>
            <Button onClick={() => window.print()}>พิมพ์</Button>
          </>
        }
      >
        {qr && (
          <div className="flex flex-col items-center gap-3 text-center">
            <p className="text-lg font-semibold">{qr.title}</p>
            <QrSvg value={publicUrl(qr.slug)} className="size-64" label={`QR ใบสมัคร ${qr.title}`} />
            <p className="text-[15px] text-ink-soft">สแกนเพื่อดูรายละเอียดและสมัครงานออนไลน์</p>
            <p className="break-all text-xs text-ink-mute">{publicUrl(qr.slug)}</p>
          </div>
        )}
      </Modal>
    </>
  );
}
