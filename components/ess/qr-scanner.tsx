"use client";

import { useEffect, useRef, useState } from "react";
import { CameraOff } from "lucide-react";

type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };

/**
 * Camera QR scanner. Uses the native BarcodeDetector when present (Android Chrome), otherwise decodes
 * video frames with jsQR (iOS Safari, desktop). Calls onResult once per distinct code.
 */
export function QrScanner({ onResult, paused }: { onResult: (text: string) => void; paused?: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const cb = useRef(onResult);
  const pausedRef = useRef(paused);
  useEffect(() => {
    cb.current = onResult;
    pausedRef.current = paused;
  });

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    let last = "";
    let lastAt = 0;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("อุปกรณ์นี้เปิดกล้องจากเบราว์เซอร์ไม่ได้");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } }, audio: false });
      } catch (e) {
        const name = (e as { name?: string })?.name;
        setError(name === "NotAllowedError" ? "ไม่ได้รับอนุญาตให้ใช้กล้อง — เปิดสิทธิ์กล้องในการตั้งค่าเบราว์เซอร์แล้วลองใหม่" : "เปิดกล้องไม่ได้");
        return;
      }
      if (stopped) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const v = video.current!;
      v.srcObject = stream;
      await v.play().catch(() => {});
      setReady(true);

      let detector: Detector | null = null;
      const BD = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
      if (BD) {
        try {
          detector = new BD({ formats: ["qr_code"] });
        } catch {
          detector = null;
        }
      }
      const jsQR = detector ? null : (await import("jsqr")).default;

      const emit = (text: string) => {
        const now = Date.now();
        if (text && (text !== last || now - lastAt > 4000)) {
          last = text;
          lastAt = now;
          cb.current(text);
        }
      };

      const tick = async () => {
        if (stopped) return;
        if (!pausedRef.current && v.readyState >= 2 && v.videoWidth) {
          try {
            if (detector) {
              const codes = await detector.detect(v);
              if (codes[0]?.rawValue) emit(codes[0].rawValue);
            } else if (jsQR && ctx) {
              const w = Math.min(640, v.videoWidth);
              const h = Math.round((v.videoHeight / v.videoWidth) * w);
              canvas.width = w;
              canvas.height = h;
              ctx.drawImage(v, 0, 0, w, h);
              const img = ctx.getImageData(0, 0, w, h);
              const code = jsQR(img.data, w, h, { inversionAttempts: "dontInvert" });
              if (code?.data) emit(code.data);
            }
          } catch {
            /* frame not ready */
          }
        }
        raf = window.setTimeout(() => requestAnimationFrame(tick), 180) as unknown as number;
      };
      tick();
    })();

    return () => {
      stopped = true;
      clearTimeout(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  if (error) {
    return (
      <div className="flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-[var(--radius-panel)] bg-jade-950 px-6 text-center text-jade-100">
        <CameraOff className="size-8 text-jade-300" />
        <p className="text-[15px]">{error}</p>
      </div>
    );
  }
  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-[var(--radius-panel)] bg-jade-950">
      <video ref={video} playsInline muted className="absolute inset-0 size-full object-cover" />
      <div className="pointer-events-none absolute inset-[14%] rounded-2xl border-[3px] border-white/85 shadow-[0_0_0_999px_rgba(8,33,25,0.45)]" />
      {!ready && <p className="absolute inset-x-0 bottom-4 text-center text-sm text-jade-100">กำลังเปิดกล้อง…</p>}
      {ready && <p className="absolute inset-x-0 bottom-3 text-center text-sm text-white/90">เล็ง QR Code ที่จอลงเวลาให้อยู่ในกรอบ</p>}
    </div>
  );
}
