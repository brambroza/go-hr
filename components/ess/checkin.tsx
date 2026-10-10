"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, CheckCircle2, CloudOff, Crosshair, LocateFixed, MapPin, QrCode, RefreshCw, ScanFace, TriangleAlert, Wifi, X } from "lucide-react";
import dynamic from "next/dynamic";
import { Button, clsx, Spinner, toast } from "@/components/ui";
import { useMe } from "@/components/app/me-context";
import { supabaseBrowser } from "@/lib/supabase/client";
import { resizeImage, uploadFile } from "@/lib/storage";
import { thDate, thTime, isoDate } from "@/lib/format";
import { useToday } from "./today";
import { DAY_TYPE_LABEL, DIRECTIONS, DIRECTION_LABEL, distanceM, errText, fmtDistance, isNetworkError, SOURCE_LABEL } from "./lib";
import { allowedLocations, DEFAULT_POLICY, gpsAllowed, parsePolicy, type CheckinPolicy } from "@/lib/attendance/checkin-policy";
import { enqueueCheckin, onQueueChange, queuedCheckins, removeQueued, syncQueue, type QueuedCheckin } from "./offline-queue";
import { photoForQueue } from "./offline-queue-core";
import { QrScanner } from "./qr-scanner";
import type { FaceCapture } from "./face-scan";
import { toPgArray } from "./face-api-loader";

// face-api + TensorFlow.js are loaded only when the "สแกนใบหน้า" tab is opened
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

const FaceCamera = dynamic(() => import("./face-scan").then((m) => m.FaceCamera), {
  ssr: false,
  loading: () => <div className="grid aspect-square w-full place-items-center rounded-[var(--radius-panel)] border border-line bg-paper text-sm text-ink-soft">กำลังโหลดระบบสแกนใบหน้า…</div>,
});

type Method = "gps" | "qr" | "face" | "wifi";
type NetInfo = { loading: boolean; ip: string | null; locations: { id: number; name: string }[]; message: string | null };

type Loc = { id: number; name: string; latitude: number | null; longitude: number | null; radius_m: number; allow_gps: boolean; allow_qr: boolean; require_photo: boolean; is_active: boolean };
type Fix = { lat: number; lng: number; acc: number; at: number };
type Result = { ok: true; time: string; location: string | null; distance: number | null; offline?: boolean; extra?: string } | { ok: false; message: string };

/* ------------------------------------------------------------------ live clock */
function useNow(intervalMs = 1000) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

function bkkParts(d: Date) {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "00";
  return { hh: g("hour") === "24" ? "00" : g("hour"), mm: g("minute"), ss: g("second") };
}

/* ------------------------------------------------------------------ geolocation */
function useGeo(enabled: boolean) {
  const [fix, setFix] = useState<Fix | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    if (!("geolocation" in navigator)) {
      setError("อุปกรณ์นี้ไม่รองรับ GPS");
      return;
    }
    setError(null);
    const id = navigator.geolocation.watchPosition(
      (p) => setFix({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy, at: p.timestamp }),
      (e) =>
        setError(
          e.code === e.PERMISSION_DENIED
            ? "ไม่ได้รับอนุญาตให้ใช้ตำแหน่ง — เปิดสิทธิ์ตำแหน่ง (Location) ให้เบราว์เซอร์แล้วกด ‘หาตำแหน่งใหม่’"
            : e.code === e.TIMEOUT
              ? "หาตำแหน่งไม่ทันเวลา — ลองออกไปที่โล่งหรือเปิด GPS แล้วกด ‘หาตำแหน่งใหม่’"
              : "หาตำแหน่งไม่ได้ — ตรวจสอบว่าเปิด GPS แล้ว",
        ),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [enabled, nonce]);
  return { fix, error, retry: () => setNonce((n) => n + 1) };
}

/* ------------------------------------------------------------------ screen */
export function CheckinScreen() {
  const me = useMe();
  const now = useNow();
  const { data: today, reload } = useToday();
  const [method, setMethod] = useState<Method>("gps");
  const [faceReset, setFaceReset] = useState(0);
  const [net, setNet] = useState<NetInfo | null>(null);
  const [direction, setDirection] = useState("auto");
  const [locs, setLocs] = useState<Loc[]>([]);
  // effective area policy for this employee (own list → org unit → every location); resolved by the database
  const [policy, setPolicy] = useState<CheckinPolicy>(DEFAULT_POLICY);
  const [photo, setPhoto] = useState<{ blob: Blob; preview: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [queue, setQueue] = useState<QueuedCheckin[]>([]);
  const [online, setOnline] = useState(true);
  const [manualQr, setManualQr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (result && method !== "gps") resultRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [result, method]);
  // every check-in attempt also gets a toast, so the outcome is visible even when the result card is off-screen
  useEffect(() => {
    if (!result) return;
    if (!result.ok) toast.error(`ลงเวลาไม่สำเร็จ: ${result.message}`);
    else if (result.offline) toast.info(`บันทึกเวลา ${thTime(result.time)} น. ไว้ในเครื่องแล้ว — รอซิงก์`);
    else toast.ok(`ลงเวลาสำเร็จ ${thTime(result.time)} น.${result.location ? ` · ${result.location}` : ""}`);
  }, [result]);
  const geo = useGeo(true);

  useEffect(() => {
    const sb = supabaseBrowser();
    sb.from("work_locations")
      .select("id, name, latitude, longitude, radius_m, allow_gps, allow_qr, require_photo, is_active")
      .eq("is_active", true)
      .then(({ data }: { data: unknown }) => setLocs((data as Loc[]) ?? []));
    sb.rpc("my_checkin_policy").then(({ data }: { data: unknown }) => setPolicy(parsePolicy(data)));
    const refresh = () => setQueue(queuedCheckins(me.employeeId));
    refresh();
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    const un = onQueueChange(() => {
      refresh();
      reload();
    });
    return () => {
      un();
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, [me.employeeId, reload]);

  // nearest allowed GPS location (with "anywhere" it is shown for information only)
  const anywhere = policy.mode === "anywhere";
  const nearest = useMemo(() => {
    if (!geo.fix) return null;
    let best: { loc: Loc; dist: number } | null = null;
    for (const l of allowedLocations(policy, locs)) {
      if (!l.allow_gps || l.latitude == null || l.longitude == null) continue;
      const d = distanceM(geo.fix.lat, geo.fix.lng, l.latitude, l.longitude);
      if (!best || d < best.dist) best = { loc: l, dist: d };
    }
    return best;
  }, [geo.fix, locs, policy]);
  const insideRadius = nearest ? nearest.dist <= nearest.loc.radius_m + Math.min(geo.fix?.acc ?? 0, 100) : false;
  const inside = gpsAllowed(policy, insideRadius);
  const netLoc = method === "wifi" && net?.locations[0] ? locs.find((l) => l.id === net.locations[0].id) : undefined;
  // no location is attached to an "anywhere" GPS check-in, so no per-location photo rule applies
  const photoRequired = method === "gps" ? !anywhere && !!nearest?.loc.require_photo : method === "wifi" ? !!netLoc?.require_photo : false;

  const checkNetwork = useCallback(async () => {
    setNet((n) => ({ ip: n?.ip ?? null, locations: n?.locations ?? [], message: null, loading: true }));
    try {
      const r = await fetch("/api/checkin/network", { cache: "no-store" });
      const j = (await r.json()) as Partial<NetInfo> & { error?: string };
      setNet({ loading: false, ip: j.ip ?? null, locations: j.locations ?? [], message: j.error ?? j.message ?? null });
    } catch {
      setNet({ loading: false, ip: null, locations: [], message: "ติดต่อเซิร์ฟเวอร์ไม่ได้ — ตรวจสอบการเชื่อมต่อแล้วลองใหม่" });
    }
  }, []);

  const scans = today?.scans ?? [];
  const autoLabel = scans.length === 0 ? "ลงเวลาเข้างาน" : "ลงเวลาออกงาน";
  const actionLabel = direction === "auto" ? autoLabel : `ลงเวลา${DIRECTION_LABEL[direction]}`;

  async function takePhoto(f: File | undefined) {
    if (!f) return;
    try {
      const blob = await resizeImage(f, 960, 0.8);
      setPhoto({ blob, preview: URL.createObjectURL(blob) });
    } catch {
      toast.error("อ่านรูปไม่ได้ ลองถ่ายใหม่อีกครั้ง");
    }
  }

  const uploadPhoto = useCallback(async () => {
    if (!photo) return null;
    const r = await uploadFile("checkins", photo.blob, { folder: isoDate(), name: "selfie.jpg" });
    return r.url;
  }, [photo]);

  async function queueOffline(reason: string) {
    if (!geo.fix) {
      setResult({ ok: false, message: `${reason} และยังหาตำแหน่ง GPS ไม่ได้ จึงบันทึกไว้ไม่ได้ — รอให้ GPS จับตำแหน่งได้แล้วกดอีกครั้ง` });
      return;
    }
    try {
      // keep the selfie with the queued punch (small JPEG) so locations that require a photo accept the sync later
      let photoData: string | null = null;
      if (photo) {
        try {
          const small = await resizeImage(photo.blob, 480, 0.6);
          photoData = photoForQueue(await blobToDataUrl(small));
        } catch {
          photoData = null;
        }
      }
      const q = enqueueCheckin({ latitude: geo.fix.lat, longitude: geo.fix.lng, accuracy: geo.fix.acc, direction, employee_id: me.employeeId, photo_data: photoData });
      setResult({ ok: true, time: q.log_time, location: anywhere ? null : nearest?.loc.name ?? null, distance: !anywhere && nearest ? Math.round(nearest.dist) : null, offline: true });
    } catch (e) {
      setResult({ ok: false, message: (e as Error).message });
    }
  }

  async function submit(opts: { qrToken?: string } = {}) {
    if (busy) return;
    setResult(null);
    const isQr = !!opts.qrToken;
    if (!isQr && !geo.fix) {
      setResult({ ok: false, message: geo.error ?? "ยังหาตำแหน่งไม่ได้ รอสักครู่แล้วลองอีกครั้ง" });
      return;
    }
    if (!isQr && photoRequired && !photo) {
      setResult({ ok: false, message: `จุด ${nearest?.loc.name} ต้องถ่ายรูปประกอบการลงเวลา — กด ‘ถ่ายรูปยืนยัน’ ก่อน` });
      return;
    }
    if (!navigator.onLine) {
      if (isQr) {
        setResult({ ok: false, message: "ออฟไลน์อยู่ ลงเวลาด้วย QR ไม่ได้ — ใช้ GPS แทน ระบบจะส่งให้เมื่อกลับมาออนไลน์" });
        return;
      }
      await queueOffline("ออฟไลน์อยู่");
      return;
    }
    setBusy(true);
    try {
      let photoUrl: string | null = null;
      try {
        photoUrl = await uploadPhoto();
      } catch (e) {
        if (isNetworkError(e) && !isQr) {
          await queueOffline("ส่งข้อมูลไม่ได้");
          return;
        }
        throw new Error("อัปโหลดรูปไม่สำเร็จ: " + errText(e));
      }
      const { data, error } = await supabaseBrowser().rpc("check_in", {
        p_method: isQr ? "qr" : "gps",
        p_latitude: geo.fix?.lat ?? null,
        p_longitude: geo.fix?.lng ?? null,
        p_accuracy: geo.fix ? Math.round(geo.fix.acc) : null,
        p_qr_token: opts.qrToken ?? null,
        p_photo_url: photoUrl,
        p_direction: direction,
      });
      if (error) {
        if (isNetworkError(error) && !isQr) {
          await queueOffline("ส่งข้อมูลไม่ได้");
          return;
        }
        throw error;
      }
      const d = data as { time: string; location: string | null; distance: number | null };
      setResult({ ok: true, time: d.time, location: d.location, distance: isQr ? null : d.distance });
      setPhoto(null);
      if ("vibrate" in navigator) navigator.vibrate?.(60);
      reload();
    } catch (e) {
      const msg = errText(e);
      setResult({ ok: false, message: msg });
      if (msg.includes("ถ่ายรูป")) fileRef.current?.click();
    } finally {
      setBusy(false);
    }
  }

  /** face scan captured (liveness passed) → upload selfie → server matches the descriptor */
  async function submitFace(c: FaceCapture) {
    setResult(null);
    if (!navigator.onLine) {
      const message = "ออฟไลน์อยู่ ลงเวลาด้วยใบหน้าไม่ได้ — ใช้ GPS แทน ระบบจะส่งให้เมื่อกลับมาออนไลน์";
      setResult({ ok: false, message });
      throw new Error(message);
    }
    if (!geo.fix) {
      const message = geo.error ?? "ยังหาตำแหน่งไม่ได้ รอสักครู่แล้วสแกนอีกครั้ง";
      setResult({ ok: false, message });
      throw new Error(message);
    }
    setBusy(true);
    try {
      const photo = await resizeImage(c.photo, 640, 0.8);
      const up = await uploadFile("checkins", photo, { folder: isoDate(), name: "face.jpg" });
      const { data, error } = await supabaseBrowser().rpc("check_in_face", {
        p_descriptor: toPgArray(c.descriptor),
        p_latitude: geo.fix.lat,
        p_longitude: geo.fix.lng,
        p_accuracy: Math.round(geo.fix.acc),
        p_photo_url: up.url,
        p_direction: direction,
      });
      if (error) throw error;
      const d = data as { ok: boolean; error?: string; time: string; location: string | null; distance: number | null; face_score?: number };
      if (!d.ok) throw new Error(d.error ?? "ใบหน้าไม่ตรงกับที่ลงทะเบียนไว้");
      setResult({ ok: true, time: d.time, location: d.location, distance: d.distance, extra: d.face_score != null ? `ใบหน้าตรงกัน ${Math.round(d.face_score * 100)}%` : undefined });
      if ("vibrate" in navigator) navigator.vibrate?.(60);
      reload();
    } catch (e) {
      const message = isNetworkError(e) ? "ส่งข้อมูลไม่ได้ — ตรวจสอบอินเทอร์เน็ตแล้วสแกนใหม่" : errText(e);
      setResult({ ok: false, message });
      throw new Error(message);
    } finally {
      setBusy(false);
    }
  }

  /** office network: the server reads our IP and finds the location */
  async function submitWifi() {
    if (busy) return;
    setResult(null);
    if (photoRequired && !photo) {
      setResult({ ok: false, message: `จุด ${netLoc?.name ?? ""} ต้องถ่ายรูปประกอบการลงเวลา — กด ‘ถ่ายรูปยืนยัน’ ก่อน` });
      return;
    }
    setBusy(true);
    try {
      let photoUrl: string | null = null;
      if (photo) photoUrl = await uploadPhoto();
      const r = await fetch("/api/checkin/network", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ direction, ...(photoUrl ? { photo_url: photoUrl } : {}) }),
      });
      const j = (await r.json().catch(() => ({}))) as { error?: string; time?: string; location?: string | null; ip?: string };
      if (!r.ok || j.error) {
        if (j.ip !== undefined) setNet((n) => (n ? { ...n, ip: j.ip ?? n.ip } : n));
        throw new Error(j.error ?? "ลงเวลาไม่สำเร็จ");
      }
      setResult({ ok: true, time: j.time!, location: j.location ?? null, distance: null, extra: j.ip ? `เครือข่ายบริษัท (IP ${j.ip})` : undefined });
      setPhoto(null);
      if ("vibrate" in navigator) navigator.vibrate?.(60);
      reload();
    } catch (e) {
      const msg = isNetworkError(e) ? "ติดต่อเซิร์ฟเวอร์ไม่ได้ — ตรวจสอบว่าเชื่อมต่อ Wi-Fi ของบริษัทแล้ว" : errText(e);
      setResult({ ok: false, message: msg });
      if (msg.includes("ถ่ายรูป")) fileRef.current?.click();
    } finally {
      setBusy(false);
    }
  }

  const t = now ? bkkParts(now) : null;
  const isWorkDay = today && (today.day_type === "work" || today.day_type === "special");

  return (
    <main className="mx-auto w-full max-w-md">
      {/* Clock hero */}
      <section className="mx-4 mt-4 rounded-[1.25rem] border border-jade-100 bg-gradient-to-b from-jade-50 to-white px-5 pb-9 pt-5 text-ink ring-4 ring-jade-50/60">
        <div className="flex items-center justify-between text-sm text-ink-soft">
          <span>{now ? thDate(isoDate(now), "long") : " "}</span>
          <span className={clsx("inline-flex items-center gap-1.5", online ? "text-jade-700" : "text-amber-ink")}>
            <span className={clsx("size-2 rounded-full", online ? "bg-jade-500" : "bg-amber-500")} />
            {online ? "ออนไลน์" : "ออฟไลน์"}
          </span>
        </div>
        <h1 className="sr-only">ลงเวลา</h1>
        <div className="num mt-3 flex items-baseline justify-center font-semibold leading-none tracking-tight" aria-label={t ? `เวลา ${t.hh}:${t.mm} น.` : undefined} role="timer">
          <span className="text-[88px] text-ink">{t ? `${t.hh}:${t.mm}` : "--:--"}</span>
          <span className="ml-1.5 w-[2.2ch] text-[32px] text-jade-600">{t?.ss ?? "--"}</span>
        </div>
        <div className="mt-3 text-center text-[15px] text-ink-soft">
          {!today ? (
            " "
          ) : isWorkDay && today.shift ? (
            <>
              กะวันนี้ <span className="num font-semibold text-ink">{today.shift.start_time} – {today.shift.end_time}</span>
              <span className="text-ink-mute"> · {today.shift.name}</span>
            </>
          ) : (
            <>{today.holiday ?? DAY_TYPE_LABEL[today.day_type]} — ลงเวลาได้ถ้ามาทำงาน</>
          )}
        </div>
      </section>

      <div className="px-4">
        {/* Method switch */}
        <div role="tablist" aria-label="วิธีลงเวลา" className="relative -mt-6 grid grid-cols-4 gap-1 rounded-[var(--radius-panel)] border border-line bg-white p-1 shadow-[var(--shadow-pop)]">
          {(
            [
              { v: "gps", label: "GPS", icon: LocateFixed },
              { v: "qr", label: "สแกน QR", icon: QrCode },
              { v: "face", label: "สแกนใบหน้า", icon: ScanFace },
              { v: "wifi", label: "Wi-Fi บริษัท", icon: Wifi },
            ] as const
          ).map((m) => (
            <button
              key={m.v}
              role="tab"
              aria-selected={method === m.v}
              onClick={() => {
                setMethod(m.v);
                setResult(null);
                if (m.v === "wifi") checkNetwork();
              }}
              className={clsx(
                "flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-[calc(var(--radius-panel)-4px)] px-1 py-1.5 text-[13px] font-medium leading-tight",
                method === m.v ? "bg-jade-50 text-jade-700 ring-1 ring-jade-200" : "text-ink-soft active:bg-paper",
              )}
            >
              <m.icon className="size-5" /> {m.label}
            </button>
          ))}
        </div>

        {/* Location status */}
        {(method === "gps" || method === "face") && (
          <div className="mt-3 rounded-[var(--radius-panel)] border border-line bg-white px-4 py-3">
            {geo.error && !geo.fix ? (
              <div className="flex items-start gap-3">
                <TriangleAlert className="mt-0.5 size-5 shrink-0 text-rust" />
                <div className="flex-1 text-[15px] text-ink">{geo.error}</div>
              </div>
            ) : !geo.fix ? (
              <div className="flex items-center gap-3 text-[15px] text-ink-soft">
                <Crosshair className="size-5 text-jade-600 motion-safe:animate-pulse" /> กำลังหาตำแหน่งของคุณ…
              </div>
            ) : anywhere ? (
              <div className="flex items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-jade-50 text-jade-700">
                  <MapPin className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-jade-800">ลงเวลาได้ทุกที่</div>
                  <div className="truncate text-sm text-ink-soft">
                    หน่วยงานของคุณไม่จำกัดพื้นที่ · ระบบบันทึกตำแหน่งปัจจุบัน{nearest ? ` (ใกล้ ${nearest.loc.name} ${fmtDistance(nearest.dist)})` : ""}
                  </div>
                </div>
              </div>
            ) : !nearest ? (
              <div className="flex items-start gap-3 text-[15px] text-ink">
                <TriangleAlert className="mt-0.5 size-5 shrink-0 text-amber-ink" /> ยังไม่ได้ตั้งค่าพื้นที่ลงเวลาด้วย GPS — ติดต่อฝ่ายบุคคล
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <span className={clsx("grid size-10 shrink-0 place-items-center rounded-full", inside ? "bg-jade-50 text-jade-700" : "bg-rust-soft text-rust")}>
                  <MapPin className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className={clsx("font-semibold", inside ? "text-jade-800" : "text-rust")}>{inside ? "อยู่ในพื้นที่ลงเวลา" : "อยู่นอกพื้นที่ลงเวลา"}</div>
                  <div className="truncate text-sm text-ink-soft">
                    {nearest.loc.name} · ห่าง {fmtDistance(nearest.dist)} (รัศมี {fmtDistance(nearest.loc.radius_m)})
                  </div>
                </div>
              </div>
            )}
            <div className="mt-2 flex items-center justify-between border-t border-line-soft pt-2 text-xs text-ink-mute">
              <span>{geo.fix ? `ความแม่นยำ ±${Math.round(geo.fix.acc)} ม.` : "ต้องเปิด GPS และอนุญาตตำแหน่ง"}</span>
              <button className="inline-flex h-8 items-center gap-1 rounded px-2 text-jade-700 active:bg-jade-50" onClick={geo.retry}>
                <RefreshCw className="size-3.5" /> หาตำแหน่งใหม่
              </button>
            </div>
          </div>
        )}

        {method === "qr" && (
          <div className="mt-3">
            <QrScanner paused={busy} onResult={(text) => submit({ qrToken: text })} />
            <details className="mt-2 text-sm text-ink-soft">
              <summary className="cursor-pointer py-1.5">สแกนไม่ได้? พิมพ์รหัสจากจอแทน</summary>
              <div className="mt-1 flex gap-2">
                <input
                  value={manualQr}
                  onChange={(e) => setManualQr(e.target.value)}
                  placeholder="รหัส QR"
                  aria-label="รหัส QR"
                  className="h-11 min-w-0 flex-1 rounded-[var(--radius-ctl)] border border-line bg-white px-3 text-[15px]"
                />
                <Button size="lg" variant="secondary" disabled={!manualQr.trim()} loading={busy} onClick={() => submit({ qrToken: manualQr.trim() })}>
                  ส่ง
                </Button>
              </div>
            </details>
          </div>
        )}

        {method === "face" && (
          <div className="mt-3">
            <FaceCamera mode="liveness" aspectClass="aspect-square" paused={busy || (!geo.fix && !geo.error)} resetKey={faceReset} onCapture={submitFace} />
            <p className="mt-2 text-sm text-ink-mute">
              ระบบจะถ่ายรูปและลงเวลาให้อัตโนมัติเมื่อยืนยันใบหน้าได้ · ยังไม่ได้ลงทะเบียนใบหน้า? ติดต่อฝ่ายบุคคล
            </p>
            {result?.ok && (
              <button className="mt-1 inline-flex h-9 items-center gap-1 rounded px-2 text-sm text-jade-700 active:bg-jade-50" onClick={() => (setResult(null), setFaceReset((n) => n + 1))}>
                <RefreshCw className="size-3.5" /> สแกนอีกครั้ง
              </button>
            )}
          </div>
        )}

        {method === "wifi" && (
          <div className="mt-3 rounded-[var(--radius-panel)] border border-line bg-white px-4 py-3">
            {!net || net.loading ? (
              <div className="flex items-center gap-3 text-[15px] text-ink-soft">
                <Wifi className="size-5 text-jade-600 motion-safe:animate-pulse" /> กำลังตรวจสอบเครือข่าย…
              </div>
            ) : net.locations.length ? (
              <div className="flex items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-jade-50 text-jade-700">
                  <Wifi className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-jade-800">เชื่อมต่อเครือข่ายบริษัทแล้ว</div>
                  <div className="truncate text-sm text-ink-soft">{net.locations[0].name}</div>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-3">
                <TriangleAlert className="mt-0.5 size-5 shrink-0 text-amber-ink" />
                <div className="flex-1 text-[15px] text-ink">{net.message ?? `เครื่องของคุณไม่ได้ต่อ Wi-Fi ของบริษัท (IP ${net.ip ?? "ไม่ทราบ"})`}</div>
              </div>
            )}
            <div className="mt-2 flex items-center justify-between border-t border-line-soft pt-2 text-xs text-ink-mute">
              <span className="num">{net?.ip ? `IP ของเครื่อง ${net.ip}` : "ตรวจจากเครือข่ายที่เครื่องเชื่อมต่ออยู่"}</span>
              <button className="inline-flex h-8 items-center gap-1 rounded px-2 text-jade-700 active:bg-jade-50" onClick={checkNetwork}>
                <RefreshCw className="size-3.5" /> ตรวจใหม่
              </button>
            </div>
          </div>
        )}

        {/* Direction */}
        <fieldset className="mt-3">
          <legend className="mb-1.5 text-sm text-ink-soft">ประเภทการลงเวลา</legend>
          <div className="thin-scroll -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
            {DIRECTIONS.map((d) => (
              <button
                key={d.value}
                aria-pressed={direction === d.value}
                onClick={() => setDirection(d.value)}
                className={clsx(
                  "h-10 shrink-0 rounded-full border px-3.5 text-sm",
                  direction === d.value ? "border-jade-600 bg-jade-50 font-medium text-jade-800" : "border-line bg-white text-ink-soft",
                )}
              >
                {d.label}
              </button>
            ))}
          </div>
        </fieldset>

        {/* Photo (face scan captures its own selfie) */}
        <div className={clsx("mt-3 flex items-center gap-3", method === "face" && "hidden")}>
          <input ref={fileRef} type="file" accept="image/*" capture="user" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => takePhoto(e.target.files?.[0])} />
          {photo ? (
            <div className="relative">
              { }
              <img src={photo.preview} alt="รูปยืนยันการลงเวลา" className="size-14 rounded-[var(--radius-ctl)] object-cover" />
              <button className="absolute -right-2 -top-2 grid size-6 place-items-center rounded-full border border-line bg-white text-ink-soft shadow-[var(--shadow-soft)]" aria-label="ลบรูป" onClick={() => setPhoto(null)}>
                <X className="size-3.5" />
              </button>
            </div>
          ) : null}
          <button
            onClick={() => fileRef.current?.click()}
            className={clsx(
              "inline-flex h-11 items-center gap-2 rounded-[var(--radius-ctl)] border px-3.5 text-[15px]",
              photoRequired && !photo ? "border-amber-ink/40 bg-amber-50 text-amber-ink" : "border-line bg-white text-ink-soft",
            )}
          >
            <Camera className="size-5" />
            {photo ? "ถ่ายใหม่" : photoRequired ? "ถ่ายรูปยืนยัน (จำเป็น)" : "ถ่ายรูปยืนยัน (ไม่บังคับ)"}
          </button>
        </div>

        {/* Primary action (Wi-Fi) */}
        {method === "wifi" && (
          <button
            onClick={submitWifi}
            disabled={busy || !net || net.loading || !net.locations.length || !online}
            className={clsx(
              "mt-4 flex h-[68px] w-full items-center justify-center gap-2.5 rounded-[var(--radius-panel)] text-[19px] font-semibold text-white shadow-sm transition-colors",
              busy || !net?.locations.length || !online ? "bg-line !text-ink-mute shadow-none" : "bg-jade-600 active:bg-jade-800",
            )}
          >
            {busy ? <Spinner className="size-6 !text-current" /> : <Wifi className="size-6" />}
            {busy ? "กำลังบันทึก…" : online ? actionLabel : "ออฟไลน์อยู่ — ลงเวลาด้วย Wi-Fi ไม่ได้"}
          </button>
        )}

        {/* Primary action (GPS) */}
        {method === "gps" && (
          <button
            onClick={() => submit()}
            disabled={busy || (!geo.fix && !geo.error)}
            className={clsx(
              "mt-4 flex h-[68px] w-full items-center justify-center gap-2.5 rounded-[var(--radius-panel)] text-[19px] font-semibold text-white shadow-sm transition-colors",
              busy || (!geo.fix && !geo.error) ? "bg-line !text-ink-mute shadow-none" : "bg-jade-600 active:bg-jade-800",
            )}
          >
            {busy ? <Spinner className="size-6 !text-current" /> : online ? <Fingerprint /> : <CloudOff className="size-6" />}
            {busy ? "กำลังบันทึก…" : online ? actionLabel : `${actionLabel} (ออฟไลน์)`}
          </button>
        )}

        {/* Result */}
        {result && (
          <div
            ref={resultRef}
            role="status"
            className={clsx(
              "mt-3 rounded-[var(--radius-panel)] border px-4 py-3.5",
              !result.ok ? "border-rust/30 bg-rust-soft" : result.offline ? "border-amber-ink/25 bg-amber-50" : "border-jade-200 bg-jade-50",
            )}
          >
            {result.ok ? (
              <div className="flex items-center gap-3">
                {result.offline ? <CloudOff className="size-8 shrink-0 text-amber-ink" /> : <CheckCircle2 className="size-8 shrink-0 text-jade-600" />}
                <div className="min-w-0">
                  <div className={clsx("font-semibold", result.offline ? "text-amber-ink" : "text-jade-800")}>
                    {result.offline ? "บันทึกไว้ในเครื่องแล้ว — รอซิงก์" : "ลงเวลาสำเร็จ"} <span className="num">{thTime(result.time)} น.</span>
                  </div>
                  <div className="text-sm text-ink-soft">
                    {result.offline
                      ? "ระบบจะส่งให้อัตโนมัติเมื่อกลับมาออนไลน์"
                      : [result.location, result.distance != null ? `ห่าง ${fmtDistance(result.distance)}` : null, result.extra].filter(Boolean).join(" · ")}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-3">
                <TriangleAlert className="mt-0.5 size-6 shrink-0 text-rust" />
                <div>
                  <div className="font-semibold text-rust">ลงเวลาไม่สำเร็จ</div>
                  <div className="text-[15px] text-ink">{result.message}</div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Pending sync */}
        {queue.length > 0 && (
          <section className="mt-4 rounded-[var(--radius-panel)] border border-amber-ink/25 bg-amber-50">
            <header className="flex items-center justify-between px-4 pt-3">
              <h2 className="text-[15px] font-semibold text-amber-ink">รอซิงก์ {queue.length} รายการ</h2>
              <Button
                size="sm"
                variant="secondary"
                disabled={!online}
                loading={syncing}
                onClick={async () => {
                  setSyncing(true);
                  const r = await syncQueue(me.employeeId).finally(() => setSyncing(false));
                  if (r.synced) toast.ok(`ซิงก์แล้ว ${r.synced} รายการ`);
                  else if (r.failed) toast.error("ยังซิงก์ไม่ได้ ดูเหตุผลในรายการ");
                  else toast.info("ไม่มีรายการที่ต้องซิงก์");
                }}
              >
                ซิงก์ตอนนี้
              </Button>
            </header>
            <ul className="px-4 pb-2 pt-1">
              {queue.map((q) => (
                <li key={q.client_ref} className="flex items-start gap-3 border-t border-amber-ink/10 py-2 first:border-0">
                  <span className="num w-14 pt-0.5 font-semibold text-ink">{thTime(q.log_time)}</span>
                  <div className="min-w-0 flex-1 text-sm">
                    <div className="text-ink">{DIRECTION_LABEL[q.direction] ?? "ลงเวลา"} · {thDate(q.log_time)}</div>
                    {q.error ? <div className="text-rust">ส่งไม่ผ่าน: {q.error}</div> : <div className="text-amber-ink">รอซิงก์</div>}
                  </div>
                  {q.error && (
                    <button className="h-8 rounded px-2 text-sm text-ink-soft active:bg-white" onClick={() => removeQueued(q.client_ref)}>
                      ลบ
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Today's scans */}
        <section className="mt-4 rounded-[var(--radius-panel)] border border-line bg-white">
          <h2 className="px-4 pt-3 text-[15px] font-semibold">เวลาวันนี้</h2>
          {scans.length === 0 ? (
            <p className="px-4 pb-4 pt-1 text-sm text-ink-mute">ยังไม่มีการลงเวลาวันนี้</p>
          ) : (
            <ol className="px-4 pb-2 pt-1">
              {scans.map((s) => (
                <li key={s.id} className="flex items-center gap-3 border-t border-line-soft py-2.5 first:border-0">
                  <span className="num w-14 text-lg font-semibold text-ink">{thTime(s.log_time)}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[15px]">{DIRECTION_LABEL[s.direction] ?? "ลงเวลา"}</div>
                    <div className="truncate text-sm text-ink-mute">
                      {SOURCE_LABEL[s.source] ?? s.source}
                      {s.location ? ` · ${s.location}` : ""}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
        <div className="h-4" />
      </div>
    </main>
  );
}

function Fingerprint() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
      <path d="M12 3a8 8 0 0 0-8 8v1M20 12v-1a8 8 0 0 0-3-6.2" />
      <path d="M8 21c.6-1.8 1-3.8 1-6v-3a3 3 0 0 1 6 0v1" />
      <path d="M12 12v3c0 3-.6 5-1.5 7M15 16c0 2-.3 3.5-.8 5M18 14.5c0 1.5-.1 2.8-.4 4" />
    </svg>
  );
}
