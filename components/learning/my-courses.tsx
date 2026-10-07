"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Award, BookOpen, ChevronRight, Clock } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useMe } from "@/components/app/me-context";
import { Badge, Spinner, Tabs, clsx } from "@/components/ui";
import { MPage } from "@/components/ess/shell";
import { thDate, isoDate } from "@/lib/format";
import { ENROLL_COLOR, ENROLL_STATUS } from "./labels";

type Course = { id: number; title: string; description: string | null; category: string | null; cover_url: string | null; hours: number | null; is_mandatory: boolean; audience: { all?: boolean; org_unit_ids?: number[]; position_ids?: number[] }; course_lessons: { count: number }[] };
type Enr = { id: number; course_id: number; status: string; progress: number; due_date: string | null; completed_at: string | null };

export function MyCourses() {
  const me = useMe();
  const sb = supabaseBrowser();
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [enr, setEnr] = useState<Enr[]>([]);
  const [emp, setEmp] = useState<{ org_unit_id: number | null; position_id: number | null } | null>(null);
  const [tab, setTab] = useState<"mine" | "open" | "done">("mine");

  useEffect(() => {
    Promise.all([
      sb.from("courses").select("id, title, description, category, cover_url, hours, is_mandatory, audience, course_lessons(count)").eq("is_published", true).order("id", { ascending: false }),
      sb.from("course_enrollments").select("id, course_id, status, progress, due_date, completed_at").eq("employee_id", me.employeeId!),
      sb.from("v_directory").select("org_unit_id, position_id").eq("id", me.employeeId!).maybeSingle(),
    ]).then(([c, e, d]) => {
      setCourses((c.data as Course[]) ?? []);
      setEnr((e.data as Enr[]) ?? []);
      setEmp(d.data as { org_unit_id: number | null; position_id: number | null } | null);
    });
  }, [sb, me.employeeId]);

  if (!courses) return <MPage title="เรียนออนไลน์"><Spinner className="mx-auto mt-16" /></MPage>;

  const byCourse = new Map(enr.map((e) => [e.course_id, e]));
  const forMe = (c: Course) => c.audience?.all || (emp && ((c.audience?.org_unit_ids ?? []).includes(emp.org_unit_id ?? -1) || (c.audience?.position_ids ?? []).includes(emp.position_id ?? -1)));
  const mine = courses.filter((c) => byCourse.has(c.id) && byCourse.get(c.id)!.status !== "completed");
  const open = courses.filter((c) => !byCourse.has(c.id) && forMe(c));
  const done = courses.filter((c) => byCourse.get(c.id)?.status === "completed");
  const list = tab === "mine" ? mine : tab === "open" ? open : done;

  return (
    <MPage title="เรียนออนไลน์" description="เรียนได้ทุกที่จากมือถือ เรียนจบแล้วได้ใบประกาศนียบัตรและบันทึกในประวัติอบรม">
      <Tabs
        className="mb-3"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "mine", label: "กำลังเรียน", count: mine.length },
          { value: "open", label: "เปิดให้เรียน", count: open.length },
          { value: "done", label: "จบแล้ว", count: done.length },
        ]}
      />
      {list.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-[var(--radius-panel)] border border-line bg-white px-6 py-12 text-center">
          <BookOpen className="size-8 text-jade-400" />
          <p className="font-medium">{tab === "mine" ? "ยังไม่มีหลักสูตรที่กำลังเรียน" : tab === "open" ? "ยังไม่มีหลักสูตรใหม่สำหรับคุณ" : "ยังไม่มีหลักสูตรที่เรียนจบ"}</p>
          {tab === "mine" && open.length > 0 && (
            <button onClick={() => setTab("open")} className="mt-1 text-jade-700 underline">ดูหลักสูตรที่เปิดให้เรียน ({open.length})</button>
          )}
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {list.map((c) => {
            const e = byCourse.get(c.id);
            const late = e && e.status !== "completed" && e.due_date && e.due_date < isoDate();
            return (
              <li key={c.id}>
                <Link href={`/m/learning/${c.id}`} className="flex gap-3 overflow-hidden rounded-[var(--radius-panel)] border border-line bg-white p-3 active:bg-jade-50">
                  <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-[var(--radius-ctl)] bg-jade-800 text-jade-300">
                    {c.cover_url ? (
                       
                      <img src={c.cover_url} alt="" className="h-full w-full object-cover" />
                    ) : e?.status === "completed" ? (
                      <Award className="size-8" />
                    ) : (
                      <BookOpen className="size-8" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-1">
                      <span className="line-clamp-2 flex-1 font-semibold leading-snug text-ink">{c.title}</span>
                      <ChevronRight className="mt-0.5 size-5 shrink-0 text-ink-mute" />
                    </div>
                    <div className="mt-0.5 text-[13px] text-ink-soft">
                      {[`${c.course_lessons?.[0]?.count ?? 0} บท`, c.hours ? `${c.hours} ชม.` : null, c.category].filter(Boolean).join(" · ")}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1">
                      {c.is_mandatory && <Badge color="amber">บังคับเรียน</Badge>}
                      {e && <Badge color={ENROLL_COLOR[e.status]}>{ENROLL_STATUS[e.status]}</Badge>}
                      {e?.due_date && e.status !== "completed" && (
                        <span className={clsx("inline-flex items-center gap-1 text-xs", late ? "text-rust" : "text-ink-mute")}><Clock className="size-3" />{late ? "เลยกำหนด " : "ภายใน "}{thDate(e.due_date)}</span>
                      )}
                      {e?.completed_at && <span className="text-xs text-ink-mute">จบเมื่อ {thDate(e.completed_at)}</span>}
                    </div>
                    {e && e.status !== "completed" && (
                      <div className="mt-2 flex items-center gap-2">
                        <div className="h-1.5 flex-1 rounded-full bg-jade-50"><div className="h-1.5 rounded-full bg-jade-500" style={{ width: `${e.progress}%` }} /></div>
                        <span className="num text-xs text-ink-soft">{Math.round(e.progress)}%</span>
                      </div>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </MPage>
  );
}
