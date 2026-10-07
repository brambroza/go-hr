"use client";

import { useCallback, useEffect, useState } from "react";
import { WifiOff } from "lucide-react";
import { TH_DAYS, TH_MONTHS } from "@/lib/format";
import { QrSvg } from "./qr";

const ROTATE_MS = 30_000;

export function KioskScreen({ deviceKey, company, logo, location, deviceName, hasLocation }: { deviceKey: string | null; company: string; logo: string | null; location: string | null; deviceName: string | null; hasLocation: boolean }) {
  const [now, setNow] = useState<Date | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0); // server - client clock (ms)
  const [left, setLeft] = useState(30);

  const fetchToken = useCallback(async () => {
    if (!deviceKey) return;
    try {
      const r = await fetch("/api/device/qr", { headers: { "x-device-key": deviceKey }, cache: "no-store" });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setToken(j.token);
      setLeft(30);
      setOffset(new Date(j.server_time).getTime() - Date.now());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [deviceKey]);

  useEffect(() => {
    const first = setTimeout(() => setNow(new Date()), 0);
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, []);

  useEffect(() => {
    const first = setTimeout(fetchToken, 0);
    const t = setInterval(fetchToken, ROTATE_MS);
    const tick = setInterval(() => setLeft((x) => (x <= 1 ? 30 : x - 1)), 1000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
      clearInterval(tick);
    };
  }, [fetchToken]);

  useEffect(() => {
    // keep the screen awake on tablets that support it
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<unknown> } };
    nav.wakeLock?.request("screen").catch(() => undefined);
  }, []);

  const t = now ? new Date(now.getTime() + offset) : null;
  const bkk = t ? new Date(t.getTime() + 7 * 3_600_000) : null;
  const hh = bkk ? String(bkk.getUTCHours()).padStart(2, "0") : "--";
  const mm = bkk ? String(bkk.getUTCMinutes()).padStart(2, "0") : "--";
  const ss = bkk ? String(bkk.getUTCSeconds()).padStart(2, "0") : "--";
  const dateText = bkk ? `วัน${TH_DAYS[bkk.getUTCDay()]}ที่ ${bkk.getUTCDate()} ${TH_MONTHS[bkk.getUTCMonth()]} ${bkk.getUTCFullYear() + 543}` : "";

  return (
    <main className="flex min-h-dvh flex-col bg-jade-950 text-white">
      <header className="flex items-center gap-3 px-8 py-6">
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt="" className="size-12 rounded-md bg-white object-contain p-1" />
        ) : (
          <div className="grid size-12 place-items-center rounded-md bg-jade-500 text-xl font-bold">HR</div>
        )}
        <div>
          <h1 className="text-2xl font-semibold">{company}</h1>
          {location && <div className="text-jade-300">{location}</div>}
        </div>
      </header>

      {!deviceKey ? (
        <section className="m-auto max-w-xl px-8 text-center">
          <p className="text-3xl font-semibold">ยังไม่ได้ตั้งค่าเครื่อง Kiosk</p>
          <p className="mt-3 text-lg text-jade-200">เปิดหน้านี้ด้วยลิงก์จากเมนู “อุปกรณ์ลงเวลา” (มี API key ของเครื่อง) หรือ API key ไม่ถูกต้อง/ถูกปิดใช้งาน</p>
        </section>
      ) : (
        <section className="grid flex-1 items-center gap-10 px-8 pb-10 lg:grid-cols-2">
          <div className="text-center lg:text-left">
            <div className="num text-[min(22vw,11rem)] font-semibold leading-none tracking-tight" aria-live="off">
              {hh}:{mm}
              <span className="text-[0.4em] text-jade-300">:{ss}</span>
            </div>
            <div className="mt-4 text-2xl text-jade-100 lg:text-3xl">{dateText}</div>
            <p className="mt-8 text-xl text-jade-200">สแกน QR ด้วยแอป GO HR บนมือถือเพื่อลงเวลาเข้า-ออกงาน</p>
          </div>
          <div className="mx-auto flex w-full max-w-md flex-col items-center gap-4">
            <div className="w-full rounded-2xl bg-white p-5 shadow-2xl">
              {token && !error ? (
                <QrSvg value={token} className="aspect-square w-full" label="QR Code สำหรับลงเวลา" />
              ) : (
                <div className="grid aspect-square w-full place-items-center p-6 text-center text-ink">
                  {error ? (
                    <div>
                      <WifiOff className="mx-auto mb-3 size-12 text-rust" />
                      <p className="text-lg font-semibold">แสดง QR ไม่ได้</p>
                      <p className="mt-1 text-ink-soft">{!hasLocation ? "ยังไม่ได้ผูกเครื่องนี้กับพื้นที่ลงเวลา" : error}</p>
                      <p className="mt-2 text-sm text-ink-mute">ระบบจะลองใหม่อัตโนมัติ</p>
                    </div>
                  ) : (
                    <p className="text-ink-soft">กำลังโหลด…</p>
                  )}
                </div>
              )}
            </div>
            {token && !error && (
              <div className="w-full">
                <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full bg-jade-400 transition-all duration-1000 ease-linear" style={{ width: `${(left / 30) * 100}%` }} />
                </div>
                <p className="mt-2 text-center text-sm text-jade-300">QR เปลี่ยนทุก 30 วินาที · {deviceName}</p>
              </div>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
