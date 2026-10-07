"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Award, CheckCircle2, ChevronLeft, ChevronRight, Circle, ExternalLink, FileText, Lock, PlayCircle, Printer, RotateCcw, Timer } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useMe } from "@/components/app/me-context";
import { Badge, Button, Spinner, clsx, toast } from "@/components/ui";
import { humanError } from "@/components/crud/crud-page";
import { signedUrl } from "@/lib/storage";
import { thDate } from "@/lib/format";
import { youtubeId, type QuizQuestion } from "./labels";

type Course = { id: number; title: string; description: string | null; hours: number | null; pass_score: number; quiz: QuizQuestion[]; certificate: boolean; is_published: boolean };
type Lesson = { id: number; title: string; content: string | null; sort_order: number; min_minutes: number; library_item_id: number | null; library_items: { title: string; item_type: string; url: string | null; content: string | null; duration_min: number | null } | null };
type Enr = { id: number; status: string; completed_lessons: number[]; progress: number; quiz_score: number | null; attempts: number; due_date: string | null; started_at: string | null; completed_at: string | null };
type View = { kind: "overview" } | { kind: "lesson"; i: number } | { kind: "quiz" } | { kind: "certificate" };

const timeKey = (cid: number, lid: number) => `gohr-lesson-${cid}-${lid}`;
function readSecs(cid: number, lid: number) {
  try {
    return Number(localStorage.getItem(timeKey(cid, lid)) ?? 0);
  } catch {
    return 0;
  }
}

export function CoursePlayer({ courseId }: { courseId: number }) {
  const me = useMe();
  const sb = supabaseBrowser();
  const router = useRouter();
  const [c, setC] = useState<Course | null | undefined>(undefined);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [enr, setEnr] = useState<Enr | null>(null);
  const [company, setCompany] = useState("");
  const [view, setView] = useState<View>({ kind: "overview" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [a, b, e, s] = await Promise.all([
      sb.from("courses").select("id, title, description, hours, pass_score, quiz, certificate, is_published").eq("id", courseId).maybeSingle(),
      sb.from("course_lessons").select("id, title, content, sort_order, min_minutes, library_item_id, library_items(title, item_type, url, content, duration_min)").eq("course_id", courseId).order("sort_order").order("id"),
      sb.from("course_enrollments").select("id, status, completed_lessons, progress, quiz_score, attempts, due_date, started_at, completed_at").eq("course_id", courseId).eq("employee_id", me.employeeId!).maybeSingle(),
      sb.from("settings").select("value").eq("key", "company").maybeSingle(),
    ]);
    const course = a.data as Course | null;
    if (course) course.quiz = Array.isArray(course.quiz) ? course.quiz : [];
    setC(course);
    setLessons((b.data as unknown as Lesson[]) ?? []);
    setEnr((e.data as Enr) ?? null);
    setCompany(((s.data?.value as { name?: string }) ?? {}).name ?? "");
  }, [sb, courseId, me.employeeId]);
  useEffect(() => {
    load();
  }, [load]);

  const doneSet = useMemo(() => new Set((enr?.completed_lessons ?? []).map(Number)), [enr]);
  const allLessonsDone = lessons.length > 0 && lessons.every((l) => doneSet.has(l.id));
  const completed = enr?.status === "completed";

  async function enroll() {
    setBusy(true);
    const { error } = await sb.rpc("course_enroll_self", { p_course_id: courseId });
    setBusy(false);
    if (error) return toast.error(humanError(error));
    toast.ok("ลงทะเบียนเรียนแล้ว");
    await load();
    setView({ kind: "lesson", i: 0 });
  }

  async function markDone(l: Lesson) {
    setBusy(true);
    const { data, error } = await sb.rpc("course_lesson_done", { p_course_id: courseId, p_lesson_id: l.id });
    setBusy(false);
    if (error) return toast.error(humanError(error));
    const r = data as { status: string };
    await load();
    const idx = lessons.findIndex((x) => x.id === l.id);
    if (r.status === "completed") {
      toast.ok("เรียนจบหลักสูตรแล้ว");
      setView({ kind: "certificate" });
    } else if (idx < lessons.length - 1) setView({ kind: "lesson", i: idx + 1 });
    else if (c?.quiz.length) setView({ kind: "quiz" });
    else setView({ kind: "overview" });
  }

  if (c === undefined) return <Spinner className="mx-auto mt-20" />;
  if (c === null || !c.is_published)
    return (
      <main className="mx-auto max-w-md px-4 pt-10 text-center">
        <p className="font-medium">ไม่พบหลักสูตรนี้ หรือหลักสูตรยังไม่เปิด</p>
        <Link href="/m/learning" className="mt-3 inline-block text-jade-700 underline">กลับไปหน้าเรียนออนไลน์</Link>
      </main>
    );

  const back = (
    <button
      onClick={() => (view.kind === "overview" ? router.push("/m/learning") : setView({ kind: "overview" }))}
      className="no-print -ml-1 inline-flex h-10 items-center gap-1 pr-2 text-[15px] text-ink-soft active:text-jade-700"
    >
      <ChevronLeft className="size-5" /> {view.kind === "overview" ? "หลักสูตรของฉัน" : "สารบัญหลักสูตร"}
    </button>
  );

  return (
    <main className="mx-auto w-full max-w-md px-4 pt-3 print:max-w-none print:p-0">
      {back}
      {view.kind === "overview" && (
        <div className="flex flex-col gap-4">
          <div>
            <h1 className="text-[22px] font-semibold leading-tight text-ink">{c.title}</h1>
            {c.description && <p className="mt-1 text-[15px] text-ink-soft">{c.description}</p>}
            <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
              <Badge>{lessons.length} บทเรียน</Badge>
              {c.quiz.length > 0 && <Badge>แบบทดสอบ {c.quiz.length} ข้อ · ผ่าน {c.pass_score}%</Badge>}
              {c.hours && <Badge>{c.hours} ชั่วโมง</Badge>}
            </div>
          </div>
          {enr && (
            <div className="rounded-[var(--radius-panel)] border border-line bg-white p-3">
              <div className="mb-1.5 flex justify-between text-sm">
                <span className="text-ink-soft">{completed ? "เรียนจบแล้ว" : "ความคืบหน้า"}</span>
                <span className="num font-semibold text-jade-800">{Math.round(enr.progress)}%</span>
              </div>
              <div className="h-2 rounded-full bg-jade-50"><div className="h-2 rounded-full bg-jade-500 transition-all" style={{ width: `${enr.progress}%` }} /></div>
              {enr.due_date && !completed && <p className="mt-1.5 text-xs text-ink-mute">ควรเรียนจบภายใน {thDate(enr.due_date, "long")}</p>}
            </div>
          )}
          <ol className="overflow-hidden rounded-[var(--radius-panel)] border border-line bg-white">
            {lessons.map((l, i) => {
              const done = doneSet.has(l.id);
              return (
                <li key={l.id} className="border-b border-line-soft last:border-0">
                  <button disabled={!enr} onClick={() => setView({ kind: "lesson", i })} className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left active:bg-jade-50 disabled:opacity-60">
                    {done ? <CheckCircle2 className="size-6 shrink-0 text-jade-600" /> : <Circle className="size-6 shrink-0 text-line" />}
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-ink">{i + 1}. {l.title}</span>
                      <span className="block text-[13px] text-ink-mute">{l.library_items ? typeLabel(l.library_items.item_type) : "บทอ่าน"}{l.min_minutes ? ` · ${l.min_minutes} นาที` : ""}</span>
                    </span>
                    <ChevronRight className="size-5 text-ink-mute" />
                  </button>
                </li>
              );
            })}
            {c.quiz.length > 0 && (
              <li>
                <button disabled={!enr || !allLessonsDone} onClick={() => setView({ kind: "quiz" })} className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left active:bg-jade-50 disabled:opacity-60">
                  {completed ? <CheckCircle2 className="size-6 shrink-0 text-jade-600" /> : allLessonsDone ? <Circle className="size-6 shrink-0 text-amber-500" /> : <Lock className="size-6 shrink-0 text-ink-mute" />}
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-ink">แบบทดสอบท้ายหลักสูตร</span>
                    <span className="block text-[13px] text-ink-mute">{enr?.quiz_score != null ? `คะแนนดีที่สุด ${enr.quiz_score}% · สอบแล้ว ${enr.attempts} ครั้ง` : allLessonsDone ? "พร้อมทำแบบทดสอบ" : "เรียนให้ครบทุกบทก่อน"}</span>
                  </span>
                  <ChevronRight className="size-5 text-ink-mute" />
                </button>
              </li>
            )}
          </ol>
          {!enr ? (
            <Button size="lg" loading={busy} onClick={enroll}>ลงทะเบียนและเริ่มเรียน</Button>
          ) : completed ? (
            c.certificate && <Button size="lg" icon={<Award className="size-5" />} onClick={() => setView({ kind: "certificate" })}>ดูใบประกาศนียบัตร</Button>
          ) : (
            <Button size="lg" icon={<PlayCircle className="size-5" />} onClick={() => {
              const next = lessons.findIndex((l) => !doneSet.has(l.id));
              setView(next >= 0 ? { kind: "lesson", i: next } : { kind: "quiz" });
            }}>
              {enr.progress > 0 ? "เรียนต่อ" : "เริ่มเรียน"}
            </Button>
          )}
        </div>
      )}

      {view.kind === "lesson" && lessons[view.i] && (
        <LessonView key={lessons[view.i].id} courseId={courseId} lesson={lessons[view.i]} index={view.i} total={lessons.length} done={doneSet.has(lessons[view.i].id)} busy={busy} onDone={() => markDone(lessons[view.i])} onNav={(i) => setView({ kind: "lesson", i })} />
      )}

      {view.kind === "quiz" && <Quiz course={c} enr={enr} onFinished={async (passed) => (await load(), passed && setView({ kind: "certificate" }))} />}

      {view.kind === "certificate" && completed && <Certificate course={c} name={me.employee ? `${me.employee.first_name} ${me.employee.last_name}` : me.displayName} company={company} date={enr?.completed_at ?? null} score={enr?.quiz_score ?? null} />}
    </main>
  );
}

function typeLabel(t: string) {
  return ({ youtube: "วิดีโอ", video: "วิดีโอ", pdf: "เอกสาร PDF", slide: "สไลด์", link: "ลิงก์", article: "บทความ" } as Record<string, string>)[t] ?? t;
}

function LessonView({ courseId, lesson, index, total, done, busy, onDone, onNav }: { courseId: number; lesson: Lesson; index: number; total: number; done: boolean; busy: boolean; onDone: () => void; onNav: (i: number) => void }) {
  const item = lesson.library_items;
  const [url, setUrl] = useState<string | null>(null);
  const [secs, setSecs] = useState(() => readSecs(courseId, lesson.id));
  const need = (lesson.min_minutes || 0) * 60;
  const ref = useRef(secs);

  useEffect(() => {
    if (item?.url) signedUrl(item.url).then(setUrl);
  }, [item?.url]);
  useEffect(() => {
    if (done || need === 0) return;
    const t = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      ref.current += 1;
      setSecs(ref.current);
      if (ref.current % 5 === 0) {
        try {
          localStorage.setItem(timeKey(courseId, lesson.id), String(ref.current));
        } catch {}
      }
    }, 1000);
    return () => clearInterval(t);
  }, [done, need, courseId, lesson.id]);

  const left = Math.max(0, need - secs);
  const yt = item?.item_type === "youtube" ? youtubeId(item.url) : null;
  const text = lesson.content || item?.content;

  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className="text-sm text-ink-mute">บทที่ {index + 1} จาก {total}</div>
        <h1 className="text-xl font-semibold leading-tight text-ink">{lesson.title}</h1>
      </div>
      {yt ? (
        <div className="aspect-video overflow-hidden rounded-[var(--radius-panel)] bg-black">
          <iframe className="h-full w-full" src={`https://www.youtube-nocookie.com/embed/${yt}?rel=0&playsinline=1`} title={lesson.title} allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowFullScreen />
        </div>
      ) : item?.item_type === "video" && url ? (
        <video src={url} controls playsInline className="w-full rounded-[var(--radius-panel)] bg-black" />
      ) : (item?.item_type === "pdf" || item?.item_type === "slide") && url ? (
        <div className="overflow-hidden rounded-[var(--radius-panel)] border border-line bg-white">
          <iframe src={url} title={lesson.title} className="h-[60dvh] w-full" />
          <a href={url} target="_blank" rel="noreferrer" className="flex h-12 items-center justify-center gap-2 border-t border-line-soft text-[15px] font-medium text-jade-700">
            <FileText className="size-4" /> เปิดเอกสารเต็มจอ
          </a>
        </div>
      ) : item?.item_type === "link" && url ? (
        <a href={url} target="_blank" rel="noreferrer" className="flex h-14 items-center justify-center gap-2 rounded-[var(--radius-panel)] border border-line bg-white font-medium text-jade-700">
          เปิด {item.title} <ExternalLink className="size-4" />
        </a>
      ) : null}
      {text && <article className="whitespace-pre-line rounded-[var(--radius-panel)] border border-line bg-white p-4 text-[16px] leading-relaxed text-ink">{text}</article>}

      <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-10 -mx-4 border-t border-line bg-paper/95 px-4 py-3 backdrop-blur">
        {done ? (
          <div className="flex items-center gap-2">
            <span className="flex flex-1 items-center gap-1.5 text-[15px] font-medium text-jade-700"><CheckCircle2 className="size-5" /> เรียนบทนี้แล้ว</span>
            {index > 0 && <Button variant="secondary" onClick={() => onNav(index - 1)} aria-label="บทก่อนหน้า"><ChevronLeft className="size-4" /></Button>}
            {index < total - 1 && <Button onClick={() => onNav(index + 1)}>บทถัดไป <ChevronRight className="size-4" /></Button>}
          </div>
        ) : (
          <Button size="lg" className="w-full" loading={busy} disabled={left > 0} onClick={onDone} icon={left > 0 ? <Timer className="size-5" /> : <CheckCircle2 className="size-5" />}>
            {left > 0 ? `เรียนต่ออีก ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")} นาที` : "เรียนจบบทนี้"}
          </Button>
        )}
      </div>
    </div>
  );
}

function Quiz({ course, enr, onFinished }: { course: Course; enr: Enr | null; onFinished: (passed: boolean) => void }) {
  const sb = supabaseBrowser();
  const [answers, setAnswers] = useState<(number | null)[]>(() => course.quiz.map(() => null));
  const [result, setResult] = useState<{ score: number; correct: number; total: number; passed: boolean; attempts: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const missing = answers.filter((a) => a == null).length;

  async function submit() {
    if (missing) return toast.error(`ยังไม่ได้ตอบ ${missing} ข้อ`);
    setBusy(true);
    const { data, error } = await sb.rpc("course_submit_quiz", { p_course_id: course.id, p_answers: answers });
    setBusy(false);
    if (error) return toast.error(humanError(error));
    const qr = data as NonNullable<typeof result>;
    if (qr.passed) toast.ok(`ส่งคำตอบแล้ว — ผ่าน ${qr.score}%`);
    else toast.info(`ส่งคำตอบแล้ว — ได้ ${qr.score}% ยังไม่ผ่านเกณฑ์`);
    setResult(qr);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (result)
    return (
      <div className="flex flex-col items-center gap-3 rounded-[var(--radius-panel)] border border-line bg-white px-5 py-8 text-center">
        {result.passed ? <Award className="size-14 text-jade-600" /> : <RotateCcw className="size-12 text-amber-500" />}
        <h1 className="text-2xl font-semibold">{result.passed ? "ผ่านแบบทดสอบ" : "ยังไม่ผ่าน"}</h1>
        <div className="num text-5xl font-semibold text-jade-800">{result.score}%</div>
        <p className="text-[15px] text-ink-soft">ตอบถูก {result.correct} จาก {result.total} ข้อ · เกณฑ์ผ่าน {course.pass_score}% · สอบครั้งที่ {result.attempts}</p>
        {result.passed ? (
          <Button size="lg" className="w-full" icon={<Award className="size-5" />} onClick={() => onFinished(true)}>รับใบประกาศนียบัตร</Button>
        ) : (
          <Button size="lg" className="w-full" icon={<RotateCcw className="size-5" />} onClick={() => (setResult(null), setAnswers(course.quiz.map(() => null)))}>ทำแบบทดสอบอีกครั้ง</Button>
        )}
      </div>
    );

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h1 className="text-xl font-semibold text-ink">แบบทดสอบท้ายหลักสูตร</h1>
        <p className="text-[15px] text-ink-soft">{course.quiz.length} ข้อ · ต้องได้ {course.pass_score}% ขึ้นไป{enr?.attempts ? ` · สอบแล้ว ${enr.attempts} ครั้ง` : ""}</p>
      </div>
      {course.quiz.map((q, i) => (
        <fieldset key={i} className="rounded-[var(--radius-panel)] border border-line bg-white p-4">
          <legend className="sr-only">ข้อ {i + 1}</legend>
          <p className="mb-3 text-[16px] font-medium text-ink"><span className="num text-jade-700">{i + 1}.</span> {q.q}</p>
          <div className="flex flex-col gap-2">
            {q.choices.map((ch, k) =>
              ch.trim() ? (
                <button key={k} type="button" onClick={() => setAnswers(answers.map((a, j) => (j === i ? k : a)))} className={clsx("flex min-h-12 items-center gap-3 rounded-[var(--radius-ctl)] border px-3 py-2 text-left text-[15px]", answers[i] === k ? "border-jade-600 bg-jade-50 font-medium text-jade-900" : "border-line bg-white text-ink")}>
                  <span className={clsx("grid size-5 shrink-0 place-items-center rounded-full border-2", answers[i] === k ? "border-jade-600" : "border-line")}>{answers[i] === k && <span className="size-2.5 rounded-full bg-jade-600" />}</span>
                  {ch}
                </button>
              ) : null,
            )}
          </div>
        </fieldset>
      ))}
      <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] -mx-4 border-t border-line bg-paper/95 px-4 py-3 backdrop-blur">
        <Button size="lg" className="w-full" loading={busy} onClick={submit}>{missing ? `ส่งคำตอบ (เหลือ ${missing} ข้อ)` : "ส่งคำตอบ"}</Button>
      </div>
    </div>
  );
}

function Certificate({ course, name, company, date, score }: { course: Course; name: string; company: string; date: string | null; score: number | null }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="no-print flex justify-end">
        <Button variant="secondary" icon={<Printer className="size-4" />} onClick={() => window.print()}>พิมพ์ / บันทึก PDF</Button>
      </div>
      <section className="print-page relative overflow-hidden rounded-[var(--radius-panel)] border-[6px] border-double border-jade-700 bg-white px-5 py-8 text-center print:min-h-[180mm] print:border-[10px] print:py-16">
        <Award className="mx-auto size-12 text-jade-600 print:size-20" />
        <p className="mt-2 text-sm tracking-wide text-ink-soft">{company}</p>
        <h1 className="mt-1 text-2xl font-semibold text-jade-900 print:text-4xl">ใบประกาศนียบัตร</h1>
        <p className="text-xs text-ink-mute print:text-sm">Certificate of Completion</p>
        <p className="mt-6 text-[15px] text-ink-soft">ขอมอบให้ไว้เพื่อแสดงว่า</p>
        <p className="mt-2 text-2xl font-semibold text-ink print:text-4xl">{name}</p>
        <p className="mt-4 text-[15px] text-ink-soft">ได้ผ่านการเรียนหลักสูตร</p>
        <p className="mt-1 text-lg font-semibold text-jade-800 print:text-2xl">“{course.title}”</p>
        <p className="mt-2 text-sm text-ink-soft">
          {course.hours ? `จำนวน ${course.hours} ชั่วโมง` : ""}
          {score != null ? `${course.hours ? " · " : ""}คะแนนแบบทดสอบ ${score}%` : ""}
        </p>
        <p className="mt-6 text-[15px] text-ink">ให้ไว้ ณ วันที่ {thDate(date, "long")}</p>
        <div className="mx-auto mt-10 w-56 border-t border-ink-mute pt-1 text-sm text-ink-soft">ฝ่ายทรัพยากรบุคคล</div>
      </section>
    </div>
  );
}
