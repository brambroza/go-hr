"use client";

import { useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { CheckCircle2, FileUp, Loader2, ShieldCheck } from "lucide-react";
import { clsx, DatePicker, toast } from "@/components/ui";
import { EDU_LEVELS, type JobQuestion } from "@/components/recruit/labels";

const inputCls =
  "w-full rounded-[var(--radius-ctl)] border border-line bg-white px-3 text-[16px] text-ink placeholder:text-ink-mute focus:border-jade-500 focus:outline-none focus:ring-2 focus:ring-jade-100";

function F({ label, required, error, hint, children, className }: { label: string; required?: boolean; error?: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={clsx("flex flex-col gap-1", className)}>
      <span className="text-sm font-medium text-ink-soft">
        {label}
        {required && <span className="ml-0.5 text-rust">*</span>}
      </span>
      {children}
      {hint && !error && <span className="text-xs text-ink-mute">{hint}</span>}
      {error && <span className="text-xs text-rust">{error}</span>}
    </label>
  );
}

const MAX = 5 * 1024 * 1024;

export function ApplyForm({ slug, title, questions, consentText, companyName }: { slug: string; title: string; questions: JobQuestion[]; consentText: string; companyName: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ msg: string; field?: string } | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [resume, setResume] = useState<File | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [answers, setAnswers] = useState<Record<string, string | boolean>>({});
  const [consent, setConsent] = useState(false);

  const fieldErr = (f: string) => (error?.field === f ? error.msg : undefined);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (resume && resume.size > MAX) return setError({ msg: "ไฟล์ใบสมัครใหญ่เกิน 5 MB", field: "resume" });
    if (photo && photo.size > MAX) return setError({ msg: "รูปถ่ายใหญ่เกิน 5 MB", field: "photo" });
    for (const q of questions) {
      const v = answers[q.key];
      if (q.required && (v === undefined || v === "")) return setError({ msg: `กรุณาตอบคำถาม “${q.label}”`, field: `q_${q.key}` });
    }
    if (!consent) return setError({ msg: "กรุณายินยอมให้เก็บข้อมูลส่วนบุคคลก่อนส่งใบสมัคร", field: "consent" });
    const fd = new FormData(formRef.current!);
    fd.set("posting_slug", slug);
    fd.set("answers", JSON.stringify(answers));
    fd.set("consent", "1");
    fd.delete("resume");
    fd.delete("photo");
    if (resume) fd.set("resume", resume);
    if (photo) fd.set("photo", photo);
    setBusy(true);
    try {
      const res = await fetch("/api/public/apply", { method: "POST", body: fd });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; ref_no?: string; error?: string; field?: string };
      if (!res.ok || !j.ok) {
        setError({ msg: j.error ?? "ส่งใบสมัครไม่สำเร็จ กรุณาลองใหม่", field: j.field });
        toast.error(j.error ?? "ส่งใบสมัครไม่สำเร็จ กรุณาลองใหม่");
        return;
      }
      toast.ok("ส่งใบสมัครแล้ว");
      setDone(j.ref_no ?? "");
      setTimeout(() => document.getElementById("apply")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } catch {
      setError({ msg: "เชื่อมต่อไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่" });
      toast.error("เชื่อมต่อไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่");
    } finally {
      setBusy(false);
    }
  }

  if (done !== null) {
    return (
      <div className="rounded-[var(--radius-panel)] border border-jade-200 bg-white p-6 text-center sm:p-10">
        <CheckCircle2 className="mx-auto size-14 text-jade-600" />
        <h2 className="mt-3 text-2xl font-semibold text-ink">ส่งใบสมัครเรียบร้อยแล้ว</h2>
        <p className="mt-2 text-[15px] text-ink-soft">ขอบคุณที่สนใจร่วมงานกับ {companyName} ในตำแหน่ง {title}</p>
        <div className="mx-auto mt-5 max-w-xs rounded-[var(--radius-panel)] bg-jade-50 px-4 py-3">
          <div className="text-sm text-jade-800">เลขที่ใบสมัครของคุณ</div>
          <div className="num mt-0.5 text-2xl font-semibold tracking-wide text-jade-900">{done}</div>
        </div>
        <p className="mx-auto mt-4 max-w-md text-sm text-ink-soft">กรุณาจดเลขที่ใบสมัครไว้สำหรับติดต่อสอบถาม ฝ่ายบุคคลจะพิจารณาและติดต่อกลับทางโทรศัพท์หรืออีเมลที่ให้ไว้</p>
        <Link href="/careers" className="mt-6 inline-flex h-12 items-center rounded-[var(--radius-ctl)] border border-line px-5 font-medium text-ink hover:bg-paper">
          ดูตำแหน่งงานอื่น
        </Link>
      </div>
    );
  }

  return (
    <form ref={formRef} onSubmit={submit} noValidate className="rounded-[var(--radius-panel)] border border-line bg-white">
      <header className="border-b border-line-soft px-5 py-4">
        <h2 className="text-lg font-semibold text-ink">ใบสมัครงาน</h2>
        <p className="text-sm text-ink-soft">ใช้เวลาประมาณ 3 นาที ช่องที่มี <span className="text-rust">*</span> จำเป็นต้องกรอก</p>
      </header>
      {/* honeypot — hidden from people, bots fill it */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Website <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <div className="flex flex-col gap-6 px-5 py-5">
        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="mb-2 text-[15px] font-semibold text-jade-800">ข้อมูลส่วนตัว</legend>
          <div className="grid grid-cols-[6.5rem_1fr] gap-2 sm:col-span-2">
            <F label="คำนำหน้า">
              <select name="prefix" className={clsx(inputCls, "h-12")} defaultValue="">
                <option value="">-</option>
                <option>นาย</option>
                <option>นาง</option>
                <option>นางสาว</option>
              </select>
            </F>
            <F label="ชื่อ" required error={fieldErr("first_name")}>
              <input name="first_name" required autoComplete="given-name" className={clsx(inputCls, "h-12")} />
            </F>
          </div>
          <F label="นามสกุล" required error={fieldErr("last_name")}>
            <input name="last_name" required autoComplete="family-name" className={clsx(inputCls, "h-12")} />
          </F>
          <F label="ชื่อเล่น">
            <input name="nickname" className={clsx(inputCls, "h-12")} />
          </F>
          <F label="เบอร์โทรศัพท์มือถือ" required error={fieldErr("phone")}>
            <input name="phone" type="tel" inputMode="tel" required autoComplete="tel" placeholder="08x-xxx-xxxx" className={clsx(inputCls, "h-12")} />
          </F>
          <F label="อีเมล" error={fieldErr("email")}>
            <input name="email" type="email" inputMode="email" autoComplete="email" className={clsx(inputCls, "h-12")} />
          </F>
          <F label="วันเกิด" error={fieldErr("birth_date")}>
            <DatePicker name="birth_date" className="h-12" max={new Date().toISOString().slice(0, 10)} />
          </F>
          <F label="เพศ">
            <select name="gender" className={clsx(inputCls, "h-12")} defaultValue="">
              <option value="">ไม่ระบุ</option>
              <option value="M">ชาย</option>
              <option value="F">หญิง</option>
            </select>
          </F>
          <F label="ที่อยู่ปัจจุบัน" className="sm:col-span-2">
            <textarea name="address" rows={2} autoComplete="street-address" className={clsx(inputCls, "py-2")} />
          </F>
        </fieldset>

        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="mb-2 text-[15px] font-semibold text-jade-800">การศึกษาและประสบการณ์</legend>
          <F label="วุฒิการศึกษาสูงสุด">
            <select name="education_level" className={clsx(inputCls, "h-12")} defaultValue="">
              <option value="">เลือก</option>
              {EDU_LEVELS.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </F>
          <F label="สาขาวิชา">
            <input name="major" className={clsx(inputCls, "h-12")} />
          </F>
          <F label="สถาบันการศึกษา" className="sm:col-span-2">
            <input name="institution" className={clsx(inputCls, "h-12")} />
          </F>
          <F label="ประสบการณ์ทำงานรวม (ปี)" error={fieldErr("experience_years")}>
            <input name="experience_years" type="number" min={0} step="0.5" inputMode="decimal" className={clsx(inputCls, "num h-12")} />
          </F>
          <F label="ตำแหน่งล่าสุด">
            <input name="last_position" className={clsx(inputCls, "h-12")} />
          </F>
          <F label="บริษัทล่าสุด" className="sm:col-span-2">
            <input name="last_company" className={clsx(inputCls, "h-12")} />
          </F>
          <F label="เงินเดือนที่ต้องการ (บาท)" error={fieldErr("expected_salary")}>
            <input name="expected_salary" type="number" min={0} inputMode="numeric" className={clsx(inputCls, "num h-12")} />
          </F>
          <F label="วันที่เริ่มงานได้" error={fieldErr("available_date")}>
            <DatePicker name="available_date" className="h-12" />
          </F>
        </fieldset>

        {questions.length > 0 && (
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2 text-[15px] font-semibold text-jade-800">คำถามเพิ่มเติม</legend>
            {questions.map((q) => (
              <F key={q.key} label={q.label} required={q.required} error={fieldErr(`q_${q.key}`)}>
                {q.type === "textarea" ? (
                  <textarea rows={3} className={clsx(inputCls, "py-2")} value={String(answers[q.key] ?? "")} onChange={(e) => setAnswers({ ...answers, [q.key]: e.target.value })} />
                ) : q.type === "select" ? (
                  <select className={clsx(inputCls, "h-12")} value={String(answers[q.key] ?? "")} onChange={(e) => setAnswers({ ...answers, [q.key]: e.target.value })}>
                    <option value="">เลือก</option>
                    {(q.options ?? []).map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                ) : q.type === "yesno" ? (
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      [true, "ใช่"],
                      [false, "ไม่ใช่"],
                    ].map(([val, l]) => (
                      <button
                        key={String(val)}
                        type="button"
                        onClick={() => setAnswers({ ...answers, [q.key]: val as boolean })}
                        className={clsx("h-12 rounded-[var(--radius-ctl)] border text-[16px]", answers[q.key] === val ? "border-jade-600 bg-jade-600 font-medium text-white" : "border-line bg-white text-ink")}
                      >
                        {l as string}
                      </button>
                    ))}
                  </div>
                ) : (
                  <input className={clsx(inputCls, "h-12")} value={String(answers[q.key] ?? "")} onChange={(e) => setAnswers({ ...answers, [q.key]: e.target.value })} />
                )}
              </F>
            ))}
          </fieldset>
        )}

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-[15px] font-semibold text-jade-800">แนบไฟล์</legend>
          <FilePick label="Resume / ใบสมัคร (PDF หรือ Word ไม่เกิน 5 MB)" accept=".pdf,.doc,.docx,application/pdf" file={resume} onFile={setResume} error={fieldErr("resume")} />
          <FilePick label="รูปถ่าย (ไม่บังคับ, JPG / PNG)" accept="image/jpeg,image/png,image/webp" file={photo} onFile={setPhoto} error={fieldErr("photo")} />
          <F label="แนะนำตัวสั้น ๆ (ไม่บังคับ)">
            <textarea name="cover_letter" rows={3} maxLength={3000} className={clsx(inputCls, "py-2")} />
          </F>
        </fieldset>

        <div className={clsx("rounded-[var(--radius-panel)] border p-4", fieldErr("consent") ? "border-rust bg-rust-soft" : "border-line bg-paper")}>
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
            <ShieldCheck className="size-4 text-jade-600" /> การคุ้มครองข้อมูลส่วนบุคคล (PDPA)
          </div>
          <p className="text-sm leading-relaxed text-ink-soft">{consentText}</p>
          <label className="mt-3 flex cursor-pointer items-start gap-3 text-[15px] text-ink">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-jade-600" />
            ข้าพเจ้าได้อ่านและยินยอมตามข้อความข้างต้น และรับรองว่าข้อมูลในใบสมัครเป็นความจริง
          </label>
        </div>

        {error && (
          <p role="alert" className="rounded-[var(--radius-ctl)] bg-rust-soft px-3 py-2.5 text-[15px] text-rust">
            {error.msg}
          </p>
        )}

        <button type="submit" disabled={busy} className="flex h-13 min-h-12 items-center justify-center gap-2 rounded-[var(--radius-ctl)] bg-jade-600 text-[17px] font-semibold text-white hover:bg-jade-700 disabled:bg-line disabled:text-ink-mute disabled:hover:bg-line">
          {busy && <Loader2 className="size-5 animate-spin" />}
          {busy ? "กำลังส่งใบสมัคร…" : "ส่งใบสมัคร"}
        </button>
      </div>
    </form>
  );
}

function FilePick({ label, accept, file, onFile, error }: { label: string; accept: string; file: File | null; onFile: (f: File | null) => void; error?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-medium text-ink-soft">{label}</span>
      <label className={clsx("flex min-h-14 cursor-pointer items-center gap-3 rounded-[var(--radius-ctl)] border border-dashed px-3 py-2", error ? "border-rust" : file ? "border-jade-400 bg-jade-50" : "border-line bg-white hover:bg-paper")}>
        <FileUp className="size-5 shrink-0 text-jade-600" />
        <span className="min-w-0 flex-1 truncate text-[15px] text-ink">{file ? file.name : "แตะเพื่อเลือกไฟล์"}</span>
        {file && <span className="num shrink-0 text-xs text-ink-mute">{(file.size / 1024 / 1024).toFixed(1)} MB</span>}
        <input type="file" accept={accept} className="sr-only" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
      </label>
      {error && <span className="text-xs text-rust">{error}</span>}
    </div>
  );
}
