"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { Button, Checkbox, Field, Input } from "@/components/ui";
import { REMEMBER_LOGIN_KEY, SESSION_ONLY_COOKIE } from "@/lib/supabase/cookie";
import { loginAction } from "./actions";

const secure = () => (typeof location !== "undefined" && location.protocol === "https:" ? "; Secure" : "");

/** Mark this browser session as "do not remember": a session cookie that every auth-cookie writer checks */
function setSessionOnly(on: boolean) {
  document.cookie = on ? `${SESSION_ONLY_COOKIE}=1; Path=/; SameSite=Lax${secure()}` : `${SESSION_ONLY_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secure()}`;
}

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // prefill the username remembered on this device
  useEffect(() => {
    try {
      const saved = localStorage.getItem(REMEMBER_LOGIN_KEY);
      if (saved) setLogin(saved);
    } catch {
      /* storage blocked (private mode) */
    }
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    // must be set before the server writes the auth cookie (it reads the marker from the request cookies)
    setSessionOnly(!remember);
    try {
      if (remember) localStorage.setItem(REMEMBER_LOGIN_KEY, login.trim());
      else localStorage.removeItem(REMEMBER_LOGIN_KEY);
    } catch {
      /* ignore */
    }
    // the sign-in itself runs on the server: username → e-mail lookup, lockout check and failure counting never reach the browser
    let r: Awaited<ReturnType<typeof loginAction>>;
    try {
      r = await loginAction(login, password);
    } catch {
      r = { ok: false, error: "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่อีกครั้ง" };
    }
    if (!r.ok) {
      setLoading(false);
      setError(r.error);
      return;
    }
    router.replace(next);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
      <Field label="รหัสพนักงาน / ชื่อผู้ใช้ / อีเมล">
        <Input autoFocus autoComplete="username" value={login} onChange={(e) => setLogin(e.target.value)} required />
      </Field>
      <Field label="รหัสผ่าน">
        <div className="relative">
          <Input type={show ? "text" : "password"} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required className="pr-10" />
          <button type="button" onClick={() => setShow((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-ink-mute" aria-label={show ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}>
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </Field>
      <Checkbox label="จดจำฉันไว้ในเครื่องนี้" checked={remember} onChange={setRemember} />
      {error && <p className="rounded-md bg-rust-soft px-3 py-2 text-sm text-rust">{error}</p>}
      <Button type="submit" size="lg" loading={loading}>
        เข้าสู่ระบบ
      </Button>
      <p className="text-sm text-ink-mute">ลืมรหัสผ่าน? ติดต่อฝ่ายบุคคลเพื่อรีเซ็ตรหัสผ่าน</p>
    </form>
  );
}
