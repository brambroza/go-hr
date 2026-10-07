"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useCan } from "@/components/app/me-context";
import { Badge, Button, Empty, Field, Input, Modal, PageHeader, Spinner, toast } from "@/components/ui";
import { humanError } from "@/components/crud/crud-page";
import { BookOpen } from "lucide-react";

type C = { id: number; code: string | null; title: string; category: string | null; cover_url: string | null; hours: number | null; is_published: boolean; is_mandatory: boolean; quiz: unknown[]; course_lessons: { count: number }[] };
type E = { course_id: number; status: string };

export default function CoursesPage() {
  const sb = supabaseBrowser();
  const can = useCan();
  const router = useRouter();
  const [rows, setRows] = useState<C[] | null>(null);
  const [enr, setEnr] = useState<Record<number, { total: number; done: number }>>({});
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    sb.from("courses").select("id, code, title, category, cover_url, hours, is_published, is_mandatory, quiz, course_lessons(count)").order("id", { ascending: false }).then(({ data, error }: { data: unknown; error: { message: string } | null }) => {
      if (error) toast.error(error.message);
      setRows((data as C[]) ?? []);
    });
    sb.from("course_enrollments").select("course_id, status").limit(50000).then(({ data }: { data: unknown }) => {
      const m: Record<number, { total: number; done: number }> = {};
      for (const e of (data as E[]) ?? []) {
        m[e.course_id] ??= { total: 0, done: 0 };
        m[e.course_id].total++;
        if (e.status === "completed") m[e.course_id].done++;
      }
      setEnr(m);
    });
  }, [sb]);

  async function create() {
    if (!title.trim()) return toast.error("กรุณาตั้งชื่อหลักสูตร");
    setBusy(true);
    const { data, error } = await sb.from("courses").insert({ title: title.trim() }).select("id").single();
    setBusy(false);
    if (error) return toast.error(humanError(error));
    router.push(`/learning/courses/${data.id}`);
  }

  return (
    <div>
      <PageHeader
        title="หลักสูตร E-Learning"
        description="สร้างหลักสูตรจากคลังความรู้ ใส่แบบทดสอบท้ายบท แล้วมอบหมายให้พนักงานเรียนผ่านมือถือ — เรียนจบแล้วบันทึกเป็นประวัติการฝึกอบรมอัตโนมัติ"
        actions={can("learning", "create") && <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>สร้างหลักสูตร</Button>}
      />
      {rows === null ? (
        <Spinner className="mx-auto mt-16" />
      ) : rows.length === 0 ? (
        <Empty icon={<BookOpen className="size-8" />} title="ยังไม่มีหลักสูตร" description="เริ่มจากสร้างหลักสูตรแรก เช่น ความปลอดภัยในการทำงานสำหรับพนักงานใหม่" />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((c) => {
            const e = enr[c.id];
            const pct = e?.total ? Math.round((e.done / e.total) * 100) : 0;
            return (
              <li key={c.id}>
                <button onClick={() => router.push(`/learning/courses/${c.id}`)} className="group flex h-full w-full flex-col overflow-hidden rounded-[var(--radius-panel)] border border-line bg-white text-left hover:border-jade-300">
                  <div className="relative aspect-[16/7] w-full bg-jade-800">
                    {c.cover_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.cover_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="grid h-full place-items-center text-jade-300"><BookOpen className="size-10" /></div>
                    )}
                    <div className="absolute left-2 top-2 flex gap-1">
                      {c.is_published ? <Badge color="green">เผยแพร่แล้ว</Badge> : <Badge>ร่าง</Badge>}
                      {c.is_mandatory && <Badge color="amber">บังคับเรียน</Badge>}
                    </div>
                  </div>
                  <div className="flex flex-1 flex-col p-3">
                    <div className="font-semibold text-ink group-hover:text-jade-800">{c.title}</div>
                    <div className="mt-0.5 text-sm text-ink-soft">
                      {[c.category, `${c.course_lessons?.[0]?.count ?? 0} บทเรียน`, (c.quiz?.length ?? 0) ? `แบบทดสอบ ${c.quiz.length} ข้อ` : null, c.hours ? `${c.hours} ชม.` : null].filter(Boolean).join(" · ")}
                    </div>
                    <div className="mt-auto pt-3">
                      <div className="mb-1 flex justify-between text-xs text-ink-soft">
                        <span>เรียนจบ <b className="num text-ink">{e?.done ?? 0}</b> / <span className="num">{e?.total ?? 0}</span> คน</span>
                        <span className="num">{pct}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-jade-50"><div className="h-1.5 rounded-full bg-jade-500" style={{ width: `${pct}%` }} /></div>
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <Modal open={creating} onClose={() => setCreating(false)} size="sm" title="สร้างหลักสูตร" footer={<><Button variant="secondary" onClick={() => setCreating(false)}>ยกเลิก</Button><Button loading={busy} onClick={create}>สร้างและแก้ไขต่อ</Button></>}>
        <Field label="ชื่อหลักสูตร" required>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus onKeyDown={(e) => e.key === "Enter" && create()} placeholder="เช่น ความปลอดภัยในโรงงานสำหรับพนักงานใหม่" />
        </Field>
      </Modal>
    </div>
  );
}
