"use client";

import { useEffect, useRef, useState } from "react";
import { CameraOff, RefreshCw, ScanFace } from "lucide-react";
import { clsx } from "@/components/ui";
import {
  cameraErrorText, canvasToJpeg, describeFaces, detectFaces, grabFrame, loadFaceApi, openFrontCamera, type FaceApiModule,
} from "./face-api-loader";
import { LivenessTracker, PLACEMENT_TEXT, type LivenessStage, earFrom68, facePlacement, yawFrom68, type Placement } from "./face-liveness";

export type FaceCapture = { descriptor: Float32Array; photo: Blob; preview: string };

type Phase = "loading" | "camera" | "scanning" | "processing" | "done" | "error";

/**
 * Front-camera face scanner.
 *  - mode "liveness": waits for one well-placed face, asks for a blink or a small head turn, then captures
 *    automatically (check-in).
 *  - mode "manual": shows a capture button that is enabled when exactly one face is in the circle (enrollment).
 * onCapture resolves → scanner stays on "done" until reset via `resetKey` change; rejects → scanner restarts.
 */
export function FaceCamera({
  mode,
  onCapture,
  paused,
  resetKey,
  captureLabel = "ถ่ายตัวอย่างใบหน้า",
  aspectClass = "aspect-[4/5]",
}: {
  mode: "liveness" | "manual";
  onCapture: (c: FaceCapture) => Promise<void> | void;
  paused?: boolean;
  resetKey?: unknown;
  captureLabel?: string;
  /** Tailwind aspect class for the camera box */
  aspectClass?: string;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const api = useRef<FaceApiModule | null>(null);
  const tracker = useRef(new LivenessTracker());
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState<string | null>(null);
  const [placement, setPlacement] = useState<Placement>("none");
  const [stage, setStage] = useState<LivenessStage>("baseline");
  const [hint, setHint] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const busy = useRef(false);
  const cb = useRef(onCapture);
  const pausedRef = useRef(paused);
  const phaseRef = useRef<Phase>("loading");
  useEffect(() => {
    cb.current = onCapture;
    pausedRef.current = paused;
  });
  const go = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  // restart scanning when the parent asks (e.g. after a failed check-in)
  useEffect(() => {
    if (phaseRef.current === "done" || phaseRef.current === "processing") {
      tracker.current.reset();
      setStage("baseline");
      go(phaseRef.current === "done" ? "scanning" : phaseRef.current);
    }
  }, [resetKey]);

  async function capture() {
    const v = video.current;
    const faceapi = api.current;
    if (!v || !faceapi || busy.current) return;
    busy.current = true;
    go("processing");
    try {
      const frame = grabFrame(v, 640);
      const faces = await describeFaces(faceapi, frame);
      if (faces.length === 0) throw new Error(PLACEMENT_TEXT.none);
      if (faces.length > 1) throw new Error(PLACEMENT_TEXT.many);
      const blob = await canvasToJpeg(frame, 0.82);
      await cb.current({ descriptor: faces[0].descriptor!, photo: blob, preview: URL.createObjectURL(blob) });
      // enrollment keeps the camera running for the next sample; check-in stops on success
      go(mode === "manual" ? "scanning" : "done");
    } catch (e) {
      setHint(e instanceof Error ? e.message : String(e));
      tracker.current.reset();
      setStage("baseline");
      go("scanning");
    } finally {
      busy.current = false;
    }
  }
  const captureRef = useRef(capture);
  useEffect(() => {
    captureRef.current = capture;
  });

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer = 0;
    let stopped = false;
    tracker.current.reset();
    setStage("baseline");
    setError(null);
    go("loading");

    (async () => {
      try {
        const [faceapi, s] = await Promise.all([
          loadFaceApi().catch(() => {
            throw Object.assign(new Error("โหลดระบบสแกนใบหน้าไม่สำเร็จ — ตรวจสอบการเชื่อมต่อกับเซิร์ฟเวอร์แล้วลองใหม่"), { kind: "model" });
          }),
          openFrontCamera(),
        ]);
        stream = s;
        api.current = faceapi;
      } catch (e) {
        if (!stopped) {
          setError((e as { kind?: string }).kind === "model" ? (e as Error).message : cameraErrorText(e));
          go("error");
        }
        return;
      }
      if (stopped) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const v = video.current!;
      v.srcObject = stream;
      await v.play().catch(() => {});
      go("scanning");

      const tick = async () => {
        if (stopped) return;
        if (phaseRef.current === "scanning" && !pausedRef.current && !busy.current && v.readyState >= 2 && v.videoWidth) {
          try {
            const faces = await detectFaces(api.current!, v);
            const pl = facePlacement(faces.map((f) => f.box), { width: v.videoWidth, height: v.videoHeight });
            setPlacement(pl);
            if (pl === "ok") setHint(null);
            if (mode === "liveness") {
              const tr = tracker.current;
              if (pl === "ok") {
                const lm = faces[0].landmarks;
                const st = tr.feed({ t: performance.now(), ear: earFrom68(lm), yaw: yawFrom68(lm) });
                setStage(st);
                if (st === "passed") captureRef.current();
                else if (tr.timedOut) {
                  tr.reset();
                  setStage("baseline");
                  setHint("ยังไม่เห็นการกะพริบตาหรือหันหน้า — ลองใหม่อีกครั้ง");
                }
              } else if (pl === "many" || pl === "none") {
                // someone else stepped in / face lost: start over
                if (tr.stage !== "baseline") {
                  tr.reset();
                  setStage("baseline");
                }
              }
            }
          } catch {
            /* frame not ready */
          }
        }
        timer = window.setTimeout(tick, 120);
      };
      tick();
    })();

    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [mode, nonce]);

  if (phase === "error") {
    return (
      <div className={clsx("flex w-full flex-col items-center justify-center gap-3 rounded-[var(--radius-panel)] bg-jade-950 px-6 text-center text-jade-100", aspectClass)}>
        <CameraOff className="size-8 text-jade-300" />
        <p className="text-[15px]">{error}</p>
        <button className="inline-flex h-10 items-center gap-1.5 rounded-full border border-jade-700 px-4 text-sm text-white active:bg-jade-900" onClick={() => setNonce((n) => n + 1)}>
          <RefreshCw className="size-4" /> ลองอีกครั้ง
        </button>
      </div>
    );
  }

  const good = placement === "ok";
  const instruction =
    phase === "loading"
      ? "กำลังเปิดกล้องและโหลดระบบสแกนใบหน้า…"
      : phase === "processing"
        ? "กำลังตรวจสอบใบหน้า…"
        : phase === "done"
          ? "สแกนเสร็จแล้ว"
          : !good
            ? PLACEMENT_TEXT[placement]
            : mode === "manual"
              ? "พร้อมถ่าย — มองตรงที่กล้อง"
              : stage === "baseline"
                ? "มองตรงที่กล้องค้างไว้…"
                : stage === "challenge"
                  ? "กะพริบตา หรือหันหน้าไปด้านข้างเล็กน้อย"
                  : stage === "return"
                    ? "ดีมาก — หันกลับมามองกล้อง"
                    : "กำลังตรวจสอบใบหน้า…";

  return (
    <div>
      <div className={clsx("relative w-full overflow-hidden rounded-[var(--radius-panel)] bg-jade-950", aspectClass)}>
        <video ref={video} playsInline muted className="absolute inset-0 size-full -scale-x-100 object-cover" />
        {/* guide circle */}
        <div
          className={clsx(
            "pointer-events-none absolute left-1/2 top-[54%] aspect-square w-[62%] -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] shadow-[0_0_0_999px_rgba(8,33,25,0.55)] transition-colors",
            phase === "done" || stage === "passed" ? "border-jade-300" : good && phase === "scanning" ? "border-white" : "border-white/45 border-dashed",
          )}
        />
        {phase === "loading" && (
          <div className="absolute inset-0 grid place-items-center">
            <ScanFace className="size-12 text-jade-300 motion-safe:animate-pulse" />
          </div>
        )}
        <div aria-live="polite" className="absolute inset-x-3 top-3 rounded-[var(--radius-ctl)] bg-jade-950/80 px-3 py-2.5 text-center text-[15px] font-medium text-white">
          {instruction}
          {hint && phase === "scanning" && <div className="mt-0.5 text-sm font-normal text-amber-200">{hint}</div>}
        </div>
        {mode === "liveness" && phase === "scanning" && good && (
          <ol className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5" aria-hidden>
            {(["baseline", "challenge", "return"] as const).map((s, i) => {
              const order = ["baseline", "challenge", "return", "passed"].indexOf(stage);
              return <li key={s} className={clsx("h-1.5 w-8 rounded-full", order > i ? "bg-jade-300" : order === i ? "bg-white" : "bg-white/30")} />;
            })}
          </ol>
        )}
      </div>
      {mode === "manual" && (
        <button
          type="button"
          onClick={capture}
          disabled={phase !== "scanning" || !good || paused}
          className={clsx(
            "mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-[var(--radius-ctl)] text-[15px] font-semibold text-white",
            phase === "scanning" && good && !paused ? "bg-jade-600 active:bg-jade-800" : "bg-jade-300",
          )}
        >
          <ScanFace className="size-5" /> {phase === "processing" ? "กำลังประมวลผล…" : captureLabel}
        </button>
      )}
    </div>
  );
}
