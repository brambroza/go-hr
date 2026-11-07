"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Script from "next/script";
import Link from "next/link";
import { CheckCircle2, Copy, Loader2, LogIn, ShieldCheck } from "lucide-react";
import { clsx, toast } from "@/components/ui";
import { HEADCOUNT_RANGES, INDUSTRIES, type DemoAccount } from "@/lib/trial";
import { TURNSTILE_SCRIPT } from "@/lib/turnstile";

const inputCls =
  "h-12 w-full rounded-[var(--radius-ctl)] border border-line bg-white px-3 text-[16px] text-ink placeholder:text-ink-mute focus:border-jade-500 focus:outline-none focus:ring-2 focus:ring-jade-100";

/** Labelled form field with an inline error */
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

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id?: string) => void;
  remove: (id?: string) => void;
};
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

type Done = { refNo: string; accounts: DemoAccount[] };

/**
 * Trial sign-up form with the Cloudflare Turnstile widget.
 * @param siteKey - TURNSTILE_SITE_KEY (public)
 * @param nonce - CSP nonce from proxy.ts, so the widget script may load
 * @param contactLine - GoAlong LINE OA id shown as a fallback, e.g. "@goalong"
 */
export function TrialForm({ siteKey, nonce, contactLine }: { siteKey: string; nonce?: string; contactLine?: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const widgetRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const [token, setToken] = useState("");
  const [scriptReady, setScriptReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<{ msg: string; field?: string } | null>(null);
  const [done, setDone] = useState<Done | null>(null);

  const fieldErr = (f: string) => (error?.field === f ? error.msg : undefined);

  const renderWidget = useCallback(() => {
    if (!window.turnstile || !widgetRef.current || widgetId.current) return;
    widgetId.current = window.turnstile.render(widgetRef.current, {
      sitekey: siteKey,
      language: "th",
      size: "flexible", // fills the column (min 300px) instead of a fixed 300px box
      callback: (t: string) => setToken(t),
      "expired-callback": () => setToken(""),
      "error-callback": () => setToken(""),
    });
  }, [siteKey]);

  useEffect(() => {
    if (scriptReady) renderWidget();
  }, [scriptReady, renderWidget]);
  useEffect(
    () => () => {
      if (widgetId.current) window.turnstile?.remove(widgetId.current);
    },
    [],
  );

  const resetWidget = () => {
    setToken("");
    if (widgetId.current) window.turnstile?.reset(widgetId.current);
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!consent) return setError({ msg: "กรุณายินยอมให้เก็บข้อมูลเพื่อติดต่อกลับก่อนส่งแบบฟอร์ม", field: "consent" });
    if (!token) return setError({ msg: "กรุณายืนยันว่าไม่ใช่บอทก่อนส่ง", field: "turnstile" });
    const fd = new FormData(formRef.current!);
    fd.set("consent", "1");
    fd.set("cf-turnstile-response", token);
    setBusy(true);
    try {
      const res = await fetch("/api/public/trial", { method: "POST", body: fd });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; ref_no?: string; accounts?: DemoAccount[]; error?: string; field?: string };
      if (!res.ok || !j.ok) {
        const msg = j.error ?? "ส่งแบบฟอร์มไม่สำเร็จ กรุณาลองใหม่";
        setError({ msg, field: j.field });
        toast.error(msg);
        resetWidget(); // a Turnstile token can be used only once
        return;
      }
      setDone({ refNo: j.ref_no ?? "", accounts: j.accounts ?? [] });
      setTimeout(() => document.getElementById("trial")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } catch {
      setError({ msg: "เชื่อมต่อไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่" });
      toast.error("เชื่อมต่อไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่");
      resetWidget();
    } finally {
      setBusy(false);
    }
  }

  if (done) return <TrialDone done={done} contactLine={contactLine} />;

  return (
    <form id="trial" ref={formRef} onSubmit={submit} noValidate className="rounded-[var(--radius-panel)] border border-line bg-white">
      <Script src={TURNSTILE_SCRIPT} nonce={nonce} strategy="afterInteractive" onReady={() => setScriptReady(true)} />
      <header className="border-b border-line-soft px-5 py-4">
        <h2 className="text-lg font-semibold text-ink">ขอทดลองใช้ฟรี</h2>
        <p className="text-sm text-ink-soft">ใช้เวลาไม่ถึง 1 นาที ช่องที่มี <span className="text-rust">*</span> จำเป็นต้องกรอก</p>
      </header>
      {/* honeypot — hidden from people, bots fill it */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Website <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <div className="grid gap-4 px-5 py-5 sm:grid-cols-2">
        <F label="ชื่อบริษัท" required error={fieldErr("company_name")} className="sm:col-span-2">
          <input name="company_name" className={inputCls} autoComplete="organization" maxLength={200} />
        </F>
        <F label="ชื่อผู้ติดต่อ" required error={fieldErr("contact_name")}>
          <input name="contact_name" className={inputCls} autoComplete="name" maxLength={150} />
        </F>
        <F label="ตำแหน่ง" error={fieldErr("position")}>
          <input name="position" className={inputCls} placeholder="เช่น ผู้จัดการฝ่ายบุคคล" maxLength={100} />
        </F>
        <F label="เบอร์โทรศัพท์" required error={fieldErr("phone")}>
          <input name="phone" className={inputCls} inputMode="tel" autoComplete="tel" placeholder="0812345678" maxLength={15} />
        </F>
        <F label="LINE ID" error={fieldErr("line_id")} hint="ทีมงานจะติดต่อกลับทาง LINE เป็นหลัก">
          <input name="line_id" className={inputCls} autoComplete="off" maxLength={60} />
        </F>
        <F label="อีเมล" error={fieldErr("email")} className="sm:col-span-2">
          <input name="email" type="email" className={inputCls} autoComplete="email" maxLength={200} />
        </F>
        <F label="จำนวนพนักงาน" required error={fieldErr("headcount_range")}>
          <select name="headcount_range" className={inputCls} defaultValue="">
            <option value="" disabled>
              เลือก
            </option>
            {HEADCOUNT_RANGES.map((r) => (
              <option key={r} value={r}>
                {r} คน
              </option>
            ))}
          </select>
        </F>
        <F label="ประเภทธุรกิจ" error={fieldErr("industry")}>
          <select name="industry" className={inputCls} defaultValue="">
            <option value="">ไม่ระบุ</option>
            {INDUSTRIES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </F>
        <F label="อยากดูเรื่องไหนเป็นพิเศษ" error={fieldErr("note")} className="sm:col-span-2">
          <textarea name="note" rows={3} maxLength={1000} className={clsx(inputCls, "h-auto py-2")} placeholder="เช่น ลงเวลาผ่าน LINE, คิดเงินเดือน OT, ไฟล์ สปส." />
        </F>

        <div className={clsx("rounded-[var(--radius-panel)] border p-4 sm:col-span-2", fieldErr("consent") ? "border-rust bg-rust-soft" : "border-line bg-paper")}>
          <div className="flex items-center gap-2 text-sm font-medium text-ink">
            <ShieldCheck className="size-4 text-jade-600" /> การคุ้มครองข้อมูลส่วนบุคคล
          </div>
          <p className="mt-1 text-sm leading-relaxed text-ink-soft">
            ข้อมูลในแบบฟอร์มนี้ใช้เพื่อติดต่อกลับเรื่องการทดลองใช้และนำเสนอ GO HR เท่านั้น เก็บไม่เกิน 2 ปี และขอให้ลบได้ทุกเมื่อตาม พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562
          </p>
          <label className="mt-3 flex min-h-11 items-start gap-2 text-sm text-ink">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-jade-600" />
            ยินยอมให้เก็บและใช้ข้อมูลเพื่อติดต่อกลับ
          </label>
          {fieldErr("consent") && <p className="mt-1 text-xs text-rust">{fieldErr("consent")}</p>}
        </div>

        <div className="sm:col-span-2">
          <div ref={widgetRef} className="min-h-[65px]" />
          {!scriptReady && <p className="text-xs text-ink-mute">กำลังโหลดตัวยืนยันความปลอดภัย…</p>}
          {fieldErr("turnstile") && <p className="mt-1 text-xs text-rust">{fieldErr("turnstile")}</p>}
        </div>

        {error && !error.field && <p className="text-sm text-rust sm:col-span-2">{error.msg}</p>}

        <button
          type="submit"
          disabled={busy}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-[var(--radius-ctl)] bg-jade-600 px-6 font-semibold text-white hover:bg-jade-700 disabled:opacity-60 sm:col-span-2"
        >
          {busy && <Loader2 className="size-5 animate-spin" />}
          {busy ? "กำลังส่ง…" : "เริ่มทดลองใช้"}
        </button>
      </div>
    </form>
  );
}

/** Success panel: reference number + demo logins (if configured) */
function TrialDone({ done, contactLine }: { done: Done; contactLine?: string }) {
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.ok("คัดลอกแล้ว");
    } catch {
      toast.error("คัดลอกไม่ได้ กรุณาจดไว้");
    }
  };
  return (
    <div id="trial" className="rounded-[var(--radius-panel)] border border-jade-200 bg-white p-6 sm:p-8">
      <div className="text-center">
        <CheckCircle2 className="mx-auto size-14 text-jade-600" />
        <h2 className="mt-3 text-2xl font-semibold text-ink">ได้รับข้อมูลแล้ว</h2>
        <p className="mt-2 text-[15px] text-ink-soft">
          เลขที่อ้างอิง <span className="num font-semibold text-ink">{done.refNo}</span> · ทีมงานจะติดต่อกลับภายในวันทำการ{contactLine ? ` หรือทัก LINE ${contactLine}` : ""}
        </p>
      </div>
      {done.accounts.length > 0 && (
        <div className="mt-6">
          <h3 className="font-semibold text-ink">ลองใช้ระบบตัวอย่างได้ทันที</h3>
          <p className="text-sm text-ink-soft">ข้อมูลเป็นบริษัทสมมติ ใช้ร่วมกับผู้ทดลองคนอื่น และรีเซ็ตทุกคืน — อย่าใส่ข้อมูลจริงของพนักงาน</p>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {done.accounts.map((a) => (
              <li key={a.login} className="rounded-[var(--radius-panel)] border border-line bg-paper p-4">
                <div className="font-medium text-ink">{a.label}</div>
                <div className="mt-1 flex items-center gap-2 text-sm text-ink-soft">
                  ผู้ใช้ <code className="num text-ink">{a.login}</code>
                  <button type="button" onClick={() => copy(a.login)} className="grid size-11 place-items-center rounded-md hover:bg-white" aria-label={`คัดลอกชื่อผู้ใช้ ${a.label}`}>
                    <Copy className="size-4" />
                  </button>
                </div>
                <div className="flex items-center gap-2 text-sm text-ink-soft">
                  รหัสผ่าน <code className="num text-ink">{a.password}</code>
                  <button type="button" onClick={() => copy(a.password)} className="grid size-11 place-items-center rounded-md hover:bg-white" aria-label={`คัดลอกรหัสผ่าน ${a.label}`}>
                    <Copy className="size-4" />
                  </button>
                </div>
                <Link
                  href={`/login?next=${encodeURIComponent(a.path ?? "/dashboard")}`}
                  className="mt-2 inline-flex h-11 items-center gap-1.5 rounded-[var(--radius-ctl)] bg-jade-600 px-4 text-sm font-medium text-white hover:bg-jade-700"
                >
                  <LogIn className="size-4" /> เข้าสู่ระบบ
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
