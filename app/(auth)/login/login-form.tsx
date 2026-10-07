"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { Button, Field, Input } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const sb = supabaseBrowser();
    let email = login.trim();
    if (!email.includes("@")) {
      const { data } = await sb.rpc("resolve_login", { p_login: email });
      email = (data as string | null) ?? `${email}@invalid.local`;
    }
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) {
      setLoading(false);
      setError(error.message.includes("Invalid login") ? "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" : error.message);
      return;
    }
    await sb.rpc("record_login");
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
      {error && <p className="rounded-md bg-rust-soft px-3 py-2 text-sm text-rust">{error}</p>}
      <Button type="submit" size="lg" loading={loading}>
        เข้าสู่ระบบ
      </Button>
      <p className="text-sm text-ink-mute">ลืมรหัสผ่าน? ติดต่อฝ่ายบุคคลเพื่อรีเซ็ตรหัสผ่าน</p>
    </form>
  );
}
