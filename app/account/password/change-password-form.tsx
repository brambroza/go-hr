"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Circle, Eye, EyeOff, LogOut } from "lucide-react";
import { Button, Field, Input, clsx, toast } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import { checkPassword, type PasswordPolicy } from "@/lib/employees/password";
import { changePasswordAction } from "./actions";

export function ChangePasswordForm({ first, policy, name }: { first: boolean; policy: PasswordPolicy; name: string }) {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const rules = [
    { ok: pw.length >= policy.min_length, label: `ยาวอย่างน้อย ${policy.min_length} ตัวอักษร` },
    ...(policy.require_upper ? [{ ok: /[A-Z]/.test(pw), label: "ตัวพิมพ์ใหญ่ (A-Z)" }] : []),
    ...(policy.require_lower ? [{ ok: /[a-z]/.test(pw), label: "ตัวพิมพ์เล็ก (a-z)" }] : []),
    ...(policy.require_digit ? [{ ok: /\d/.test(pw), label: "ตัวเลข (0-9)" }] : []),
    ...(policy.require_special ? [{ ok: /[^A-Za-z0-9]/.test(pw), label: "อักขระพิเศษ เช่น @ # $ !" }] : []),
  ];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!current) return setError("กรอกรหัสผ่านปัจจุบัน");
    const miss = checkPassword(pw, policy);
    if (miss.length) return setError(`รหัสผ่านใหม่ต้อง${miss.join(", ")}`);
    if (pw !== pw2) return setError("ยืนยันรหัสผ่านใหม่ไม่ตรงกัน");
    if (pw === current) return setError("รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านเดิม");
    setLoading(true);
    // verified and written on the server (current password, password policy) — see ./actions.ts
    const r = await changePasswordAction(current, pw).catch(() => ({ ok: false as const, error: "เปลี่ยนรหัสผ่านไม่ได้ชั่วคราว กรุณาลองใหม่อีกครั้ง" }));
    setLoading(false);
    if (!r.ok) return setError(r.error);
    setDone(true);
    toast.ok("เปลี่ยนรหัสผ่านแล้ว");
    router.replace("/");
    router.refresh();
  }

  async function signOut() {
    await supabaseBrowser().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="rounded-[var(--radius-panel)] border border-line bg-white p-6 shadow-sm">
      <h1 className="text-xl font-semibold">{first ? "ตั้งรหัสผ่านใหม่ก่อนเริ่มใช้งาน" : "เปลี่ยนรหัสผ่าน"}</h1>
      <p className="mt-1 text-[15px] text-ink-soft">
        {first ? `สวัสดี ${name} เพื่อความปลอดภัย กรุณาเปลี่ยนรหัสผ่านเริ่มต้นที่ได้รับจากฝ่ายบุคคล` : `บัญชี ${name}`}
      </p>
      <form onSubmit={submit} className="mt-5 flex flex-col gap-4" noValidate>
        <Field label="รหัสผ่านปัจจุบัน">
          <Input type={show ? "text" : "password"} autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} autoFocus required />
        </Field>
        <Field label="รหัสผ่านใหม่">
          <div className="relative">
            <Input type={show ? "text" : "password"} autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} className="pr-10" required aria-describedby="pw-rules" />
            <button type="button" onClick={() => setShow((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-ink-mute" aria-label={show ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}>
              {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </Field>
        <ul id="pw-rules" className="-mt-2 grid grid-cols-1 gap-1 text-sm sm:grid-cols-2" aria-live="polite">
          {rules.map((r) => (
            <li key={r.label} className={clsx("flex items-center gap-1.5", r.ok ? "text-jade-700" : "text-ink-mute")}>
              {r.ok ? <Check className="size-3.5" aria-label="ผ่าน" /> : <Circle className="size-3" aria-label="ยังไม่ผ่าน" />}
              {r.label}
            </li>
          ))}
        </ul>
        <Field label="ยืนยันรหัสผ่านใหม่" error={pw2 && pw !== pw2 ? "ไม่ตรงกับรหัสผ่านใหม่" : null}>
          <Input type={show ? "text" : "password"} autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} required />
        </Field>
        {error && <p role="alert" className="rounded-md bg-rust-soft px-3 py-2 text-sm text-rust">{error}</p>}
        {done && <p className="rounded-md bg-jade-50 px-3 py-2 text-sm text-jade-800">เปลี่ยนรหัสผ่านแล้ว กำลังพาไปหน้าแรก…</p>}
        <Button type="submit" size="lg" loading={loading} disabled={done}>
          บันทึกรหัสผ่านใหม่
        </Button>
        <div className="flex items-center justify-between text-sm">
          {first ? (
            <button type="button" onClick={signOut} className="inline-flex items-center gap-1 text-ink-soft hover:text-rust">
              <LogOut className="size-4" /> ออกจากระบบ
            </button>
          ) : (
            <button type="button" onClick={() => router.back()} className="text-ink-soft hover:text-jade-700">
              ย้อนกลับ
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
