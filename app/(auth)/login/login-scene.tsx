"use client";

// Login hero animation (GSAP + canvas).
//  - TechBackdrop: a drifting node-network ("neural" constellation) + dot grid behind the panel.
//  - LoginScene: one employee's day in three taps — face/GPS check-in → leave approved → payslip delivered —
//    with data packets travelling between the steps, a scan line on the check-in card, live tech chips
//    and a trust strip. Loops forever; prefers-reduced-motion renders the finished state without motion.

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { Check, Cpu, FileText, Lock, MapPinned, RefreshCw, ScanFace, Server, ShieldCheck, UserCheck, Wifi } from "lucide-react";

const AMOUNT = 28500;

// ---------------------------------------------------------------- backdrop

/** Node network drifting slowly behind the login panel */
export function TechBackdrop() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w = 0, h = 0, raf = 0, t = 0;
    type Node = { x: number; y: number; vx: number; vy: number; r: number };
    let nodes: Node[] = [];

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.max(24, Math.min(48, Math.round((w * h) / 22000)));
      nodes = Array.from({ length: n }, () => ({
        x: Math.random() * w, y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.22, vy: (Math.random() - 0.5) * 0.22,
        r: 1.2 + Math.random() * 1.6,
      }));
    };

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      // dot grid
      ctx.fillStyle = "rgba(4, 131, 93, 0.10)";
      for (let x = 24; x < w; x += 28) for (let y = 24; y < h; y += 28) ctx.fillRect(x, y, 1.2, 1.2);
      // radar sweep (very soft)
      const cx = w * 0.78, cy = h * 0.22;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.55);
      g.addColorStop(0, "rgba(16, 185, 129, 0.10)");
      g.addColorStop(1, "rgba(16, 185, 129, 0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      // links
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          const dx = a.x - b.x, dy = a.y - b.y, d = Math.hypot(dx, dy);
          if (d > 150) continue;
          ctx.strokeStyle = `rgba(4, 131, 93, ${(1 - d / 150) * 0.22})`;
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      }
      // nodes (a few pulse)
      nodes.forEach((n, i) => {
        const pulse = i % 7 === 0 ? 1 + 0.5 * Math.sin(t / 40 + i) : 1;
        ctx.fillStyle = i % 7 === 0 ? "rgba(16, 185, 129, 0.55)" : "rgba(4, 131, 93, 0.35)";
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r * pulse, 0, Math.PI * 2); ctx.fill();
        if (i % 7 === 0) {
          ctx.strokeStyle = `rgba(16, 185, 129, ${0.25 * (1 - ((t / 2 + i * 13) % 60) / 60)})`;
          ctx.beginPath(); ctx.arc(n.x, n.y, 4 + ((t / 2 + i * 13) % 60) / 2.5, 0, Math.PI * 2); ctx.stroke();
        }
      });
    };

    const step = () => {
      t++;
      for (const n of nodes) {
        n.x += n.vx; n.y += n.vy;
        if (n.x < -10) n.x = w + 10; else if (n.x > w + 10) n.x = -10;
        if (n.y < -10) n.y = h + 10; else if (n.y > h + 10) n.y = -10;
      }
      draw();
      raf = requestAnimationFrame(step);
    };

    resize();
    const ro = new ResizeObserver(() => { resize(); draw(); });
    ro.observe(canvas);
    if (reduce) draw(); else raf = requestAnimationFrame(step);
    const onVis = () => { if (document.hidden) cancelAnimationFrame(raf); else if (!reduce) raf = requestAnimationFrame(step); };
    document.addEventListener("visibilitychange", onVis);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); document.removeEventListener("visibilitychange", onVis); };
  }, []);

  return <canvas ref={ref} aria-hidden className="pointer-events-none absolute inset-0 size-full" />;
}

// ---------------------------------------------------------------- scene

export function LoginScene() {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const q = gsap.utils.selector(el);
    const amount = el.querySelector<HTMLElement>("[data-amount]");
    const score = el.querySelector<HTMLElement>("[data-score]");
    const hudLm = el.querySelector<HTMLElement>("[data-hud='landmarks']");
    const hudLive = el.querySelector<HTMLElement>("[data-hud='liveness']");
    const hudHex = el.querySelector<HTMLElement>("[data-hud='hex']");
    const status = el.querySelector<HTMLElement>("[data-face-status]");
    const counter = { v: 0, s: 0, lm: 0, live: 0 };
    const fmt = (n: number) => Math.round(n).toLocaleString("th-TH");
    const hex = () => Array.from({ length: 6 }, () => Math.floor(Math.random() * 0xffff).toString(16).padStart(4, "0")).join(" ");
    const setHud = () => {
      if (hudLm) hudLm.textContent = `${String(Math.round(counter.lm)).padStart(2, "0")}/68`;
      if (hudLive) hudLive.textContent = counter.live.toFixed(2);
      if (score) score.textContent = counter.s.toFixed(1);
    };

    if (reduce) {
      gsap.set(q("[data-step], [data-badge], [data-done], [data-trust], [data-link-fill], [data-approved], [data-chip]"), { opacity: 1, clearProps: "transform" });
      gsap.set(q("[data-link-fill]"), { scaleX: 1 });
      gsap.set(q("[data-pending], [data-scan], [data-packet], [data-face-scanning]"), { autoAlpha: 0 });
      gsap.set(q("[data-lm], [data-mesh], [data-face-ok]"), { opacity: 1 });
      if (amount) amount.textContent = fmt(AMOUNT);
      counter.s = 99.2; counter.lm = 68; counter.live = 0.97; setHud();
      if (hudHex) hudHex.textContent = "verified · 4a1f 9c0e";
      if (status) status.textContent = "ยืนยันตัวตนแล้ว";
      return;
    }

    const ctx = gsap.context(() => {
      gsap.set(q("[data-step]"), { opacity: 0, y: 18, scale: 0.96 });
      gsap.set(q("[data-badge], [data-done], [data-trust], [data-approved]"), { opacity: 0, y: 8 });
      gsap.set(q("[data-chip]"), { opacity: 0, x: -6 });
      gsap.set(q("[data-link-fill]"), { scaleX: 0, transformOrigin: "left center" });
      gsap.set(q("[data-packet]"), { opacity: 0, left: 0 });
      gsap.set(q("[data-scan]"), { opacity: 0, top: 0 });
      gsap.set(q("[data-lm]"), { opacity: 0, scale: 0, transformOrigin: "center" });
      gsap.set(q("[data-mesh]"), { opacity: 0 });
      gsap.set(q("[data-face-ok]"), { opacity: 0, scale: 0.5, transformOrigin: "center" });
      gsap.set(q("[data-face-scanning]"), { autoAlpha: 1 });
      gsap.set(q("[data-pending]"), { opacity: 1 });
      gsap.set(q("[data-line]"), { scaleX: 0, transformOrigin: "left center" });

      // always-on: blinking status dots on the tech chips and the "scanning" indicator
      gsap.to(q("[data-dot]"), { opacity: 0.25, duration: 0.9, yoyo: true, repeat: -1, ease: "sine.inOut", stagger: 0.3 });
      gsap.to(q("[data-face-scanning]"), { opacity: 0.2, duration: 0.5, yoyo: true, repeat: -1, ease: "sine.inOut" });

      const packet = (n: 1 | 2) =>
        gsap.timeline()
          .set(q(`[data-packet='${n}']`), { opacity: 1, left: 0 })
          .to(q(`[data-packet='${n}']`), { left: "100%", duration: 0.55, ease: "power1.inOut" })
          .to(q(`[data-packet='${n}']`), { opacity: 0, duration: 0.15 }, "-=0.1");

      const tl = gsap.timeline({ repeat: -1, repeatDelay: 2.2, defaults: { ease: "power2.out" } });

      tl.to(q("[data-chip]"), { opacity: 1, x: 0, duration: 0.4, stagger: 0.08 })
        // 1) check in: face scan line + fingerprint tap + GPS lock
        .to(q("[data-step='1']"), { opacity: 1, y: 0, scale: 1, duration: 0.6 }, "-=0.1")
        // face scan: viewfinder sweep, landmarks lock on one by one, mesh appears, HUD numbers compute
        .add(() => { if (status) status.textContent = "กำลังสแกนใบหน้า…"; })
        .set(q("[data-scan]"), { opacity: 1, top: 0 })
        .to(q("[data-scan]"), { top: "100%", duration: 0.8, ease: "none", repeat: 2, yoyo: true })
        .to(q("[data-lm]"), { opacity: 1, scale: 1, duration: 0.25, stagger: { each: 0.045, from: "random" }, ease: "back.out(2)" }, "<+=0.2")
        .to(q("[data-mesh]"), { opacity: 1, duration: 0.6 }, "<+=0.5")
        .to(counter, {
          lm: 68, live: 0.97, s: 99.2, duration: 2.0, ease: "power2.out",
          onUpdate: () => { setHud(); if (hudHex) hudHex.textContent = counter.s < 99 ? hex() : "verified · 4a1f 9c0e"; },
        }, "<-=0.6")
        .set(q("[data-scan]"), { opacity: 0 })
        .add(() => { if (status) status.textContent = "ยืนยันตัวตนแล้ว"; })
        .to(q("[data-face-scanning]"), { autoAlpha: 0, duration: 0.2 })
        .to(q("[data-face-ok]"), { opacity: 1, scale: 1, duration: 0.4, ease: "back.out(2.5)" }, "<")
        .to(q("[data-mesh]"), { opacity: 0.35, duration: 0.4 }, "<")
        .to(q("[data-badge='1']"), { opacity: 1, y: 0, duration: 0.4 }, "-=0.2")
        // 2) data packet → manager approves on the phone
        .add(packet(1), "+=0.2")
        .to(q("[data-link-fill='1']"), { scaleX: 1, duration: 0.55, ease: "power1.inOut" }, "<")
        .to(q("[data-step='2']"), { opacity: 1, y: 0, scale: 1, duration: 0.6 }, "-=0.15")
        .to(q("[data-pending]"), { opacity: 0, duration: 0.25 }, "+=0.7")
        .to(q("[data-approved]"), { opacity: 1, y: 0, duration: 0.35, ease: "back.out(2)" }, "<")
        .to(q("[data-badge='2']"), { opacity: 1, y: 0, duration: 0.4 }, "-=0.1")
        // 3) data packet → payroll engine computes the slip
        .add(packet(2), "+=0.2")
        .to(q("[data-link-fill='2']"), { scaleX: 1, duration: 0.55, ease: "power1.inOut" }, "<")
        .to(q("[data-step='3']"), { opacity: 1, y: 0, scale: 1, duration: 0.6 }, "-=0.15")
        .to(q("[data-line]"), { scaleX: 1, duration: 0.5, stagger: 0.12 }, "-=0.2")
        .to(counter, { v: AMOUNT, duration: 1.1, ease: "power3.out", onUpdate: () => { if (amount) amount.textContent = fmt(counter.v); } }, "-=0.3")
        .to(q("[data-done]"), { opacity: 1, y: 0, duration: 0.4, ease: "back.out(1.6)" }, "-=0.3")
        .to(q("[data-badge='3']"), { opacity: 1, y: 0, duration: 0.4 }, "-=0.2")
        // 4) trust strip
        .to(q("[data-trust]"), { opacity: 1, y: 0, duration: 0.5, stagger: 0.15 }, "+=0.4")
        // hold, then fade for the next loop
        .to(q("[data-step], [data-badge], [data-trust], [data-link-fill], [data-chip]"), { opacity: 0, duration: 0.6, ease: "power1.in" }, "+=2.8")
        .add(() => {
          counter.v = 0; counter.s = 0; counter.lm = 0; counter.live = 0;
          if (amount) amount.textContent = "0";
          setHud();
          if (hudHex) hudHex.textContent = "— — —";
          gsap.set(q("[data-lm]"), { opacity: 0, scale: 0 });
          gsap.set(q("[data-mesh], [data-face-ok]"), { opacity: 0 });
          gsap.set(q("[data-face-scanning]"), { autoAlpha: 1 });
        });
    }, el);
    return () => ctx.revert();
  }, []);

  return (
    <div ref={root} className="relative select-none" aria-hidden>
      {/* live tech chips */}
      <div className="mb-8 flex flex-wrap gap-2">
        <Chip icon={<ScanFace className="size-3.5" />}>Face ID · Liveness</Chip>
        <Chip icon={<MapPinned className="size-3.5" />}>GPS Geofence</Chip>
        <Chip icon={<Wifi className="size-3.5" />}>Office Wi-Fi</Chip>
        <Chip icon={<RefreshCw className="size-3.5" />}>Offline Sync</Chip>
        <Chip icon={<Cpu className="size-3.5" />}>Payroll Engine</Chip>
      </div>

      {/* three steps */}
      <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-2">
        {/* 1 — check in */}
        <div className="relative" data-step="1">
          <Card>
            <CardHead icon={<ScanFace className="size-4" />} title="ลงเวลา" sub="สแกนใบหน้า · มือถือ" />
            <FaceScanner />
            <div className="mt-3 flex items-end justify-between">
              <div>
                <p className="num text-2xl font-semibold leading-none tracking-tight text-ink">08:58</p>
                <p className="mt-1 text-[11px] text-ink-mute">GPS · สำนักงานใหญ่</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-wider text-ink-mute">face match</p>
                <p className="num text-sm font-semibold text-jade-700"><span data-score>0.0</span>%</p>
              </div>
            </div>
          </Card>
          <Badge data-badge="1">ยืนยันตัวตนแล้ว · แตะเดียว</Badge>
        </div>

        <Link n={1} />

        {/* 2 — approval */}
        <div className="relative" data-step="2">
          <Card>
            <CardHead icon={<UserCheck className="size-4" />} title="อนุมัติ" sub="หัวหน้า · ทุกที่" />
            <div className="mt-3 rounded-lg border border-line-soft bg-paper px-3 py-2.5">
              <p className="text-sm font-medium text-ink">ลาพักร้อน 2 วัน</p>
              <p className="text-xs text-ink-mute">12–13 พ.ย. · คงเหลือ 6 วัน</p>
            </div>
            <div className="relative mt-3 h-8">
              <span data-pending className="absolute inset-y-0 left-0 inline-flex items-center rounded-full bg-amber-50 px-3 text-xs font-medium text-amber-ink">รออนุมัติ</span>
              <span data-approved className="absolute inset-y-0 left-0 inline-flex items-center gap-1 rounded-full bg-jade-50 px-3 text-xs font-medium text-jade-800">
                <Check className="size-3.5" /> อนุมัติแล้ว
              </span>
            </div>
          </Card>
          <Badge data-badge="2">แจ้งเตือน LINE ทันที</Badge>
        </div>

        <Link n={2} />

        {/* 3 — payslip */}
        <div className="relative" data-step="3">
          <Card>
            <CardHead icon={<FileText className="size-4" />} title="สลิปเงินเดือน" sub="คำนวณอัตโนมัติ · ปิดงวด" />
            <div className="mt-3 flex flex-col gap-2">
              <span data-line className="block h-1.5 w-full rounded bg-line" />
              <span data-line className="block h-1.5 w-4/5 rounded bg-line" />
              <span data-line className="block h-1.5 w-3/5 rounded bg-line" />
            </div>
            <div className="mt-3 flex items-end justify-between">
              <div>
                <p className="text-[11px] text-ink-mute">สุทธิ</p>
                <p className="num text-xl font-semibold tracking-tight text-ink">
                  ฿<span data-amount>0</span>
                </p>
              </div>
              <span data-done className="grid size-8 place-items-center rounded-full bg-jade-600 text-white">
                <Check className="size-4" />
              </span>
            </div>
          </Card>
          <Badge data-badge="3">ภ.ง.ด.1 · สปส. พร้อมส่ง</Badge>
        </div>
      </div>

      {/* trust strip */}
      <div className="mt-12 grid grid-cols-3 gap-3">
        <Trust icon={<Server className="size-4" />} title="ข้อมูลอยู่ที่บริษัทคุณ" sub="ติดตั้งบนเซิร์ฟเวอร์ของคุณเอง" />
        <Trust icon={<Lock className="size-4" />} title="เข้ารหัสทุกการเชื่อมต่อ" sub="HTTPS · สิทธิ์แยกตามบทบาท" />
        <Trust icon={<ShieldCheck className="size-4" />} title="ถูกต้องตามกฎหมายแรงงาน" sub="ภาษี ประกันสังคม อัปเดตทุกปี" />
      </div>
    </div>
  );
}

// 68-point style landmark mesh, simplified to 26 points in a 100×100 box
const LM: [number, number][] = [
  [30, 38], [40, 36], [60, 36], [70, 38], // brows
  [36, 46], [44, 46], [56, 46], [64, 46], // eyes
  [50, 52], [46, 62], [50, 64], [54, 62], // nose
  [40, 74], [50, 72], [60, 74], [50, 79], // mouth
  [24, 44], [23, 58], [28, 72], [37, 84], [50, 89], [63, 84], [72, 72], [77, 58], [76, 44], // jaw
  [50, 24], // forehead
];
const MESH: [number, number][] = [
  [16, 0], [0, 1], [1, 4], [4, 5], [5, 8], [8, 6], [6, 7], [7, 2], [2, 3], [3, 24],
  [0, 25], [3, 25], [1, 25], [2, 25], [4, 9], [7, 11], [9, 10], [10, 11], [8, 10],
  [9, 12], [11, 14], [12, 13], [13, 14], [12, 15], [14, 15], [15, 20],
  [16, 17], [17, 18], [18, 19], [19, 20], [20, 21], [21, 22], [22, 23], [23, 24],
  [17, 4], [18, 9], [19, 12], [21, 14], [22, 11], [23, 7],
];

/** Dark camera viewfinder: face outline, landmark mesh, sweeping scan line, computing HUD */
function FaceScanner() {
  return (
    <div className="relative mt-3 overflow-hidden rounded-lg bg-[radial-gradient(circle_at_50%_40%,#0f2f27_0%,#071a15_70%)]">
      {/* grid */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.18] [background-image:linear-gradient(rgba(110,231,183,.35)_1px,transparent_1px),linear-gradient(90deg,rgba(110,231,183,.35)_1px,transparent_1px)] [background-size:14px_14px]" />
      {/* viewfinder corners */}
      {["left-2 top-2 border-l-2 border-t-2", "right-2 top-2 border-r-2 border-t-2", "left-2 bottom-2 border-l-2 border-b-2", "right-2 bottom-2 border-r-2 border-b-2"].map((c) => (
        <span key={c} className={`pointer-events-none absolute size-4 rounded-[2px] border-jade-400 ${c}`} />
      ))}
      <div className="flex items-stretch gap-2 p-2.5">
        {/* face */}
        <svg viewBox="0 0 100 100" className="h-[104px] w-[96px] shrink-0">
          <path d="M50 14c-16 0-27 12-27 30 0 9 3 18 8 25 4 6 11 15 19 15s15-9 19-15c5-7 8-16 8-25 0-18-11-30-27-30z" fill="none" stroke="rgba(110,231,183,0.55)" strokeWidth="1" strokeDasharray="3 2" />
          <g data-mesh stroke="rgba(52,211,153,0.45)" strokeWidth="0.6">
            {MESH.map(([a, b], i) => <line key={i} x1={LM[a][0]} y1={LM[a][1]} x2={LM[b][0]} y2={LM[b][1]} />)}
          </g>
          {LM.map(([x, y], i) => <circle key={i} data-lm cx={x} cy={y} r="1.6" fill="#6ee7b7" />)}
          <g data-face-ok>
            <circle cx="50" cy="52" r="15" fill="rgba(16,185,129,0.18)" stroke="#34d399" strokeWidth="1.2" />
            <path d="M42 52l6 6 11-12" fill="none" stroke="#a7f3d0" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </g>
        </svg>
        {/* HUD */}
        <div className="num flex min-w-0 flex-1 flex-col justify-between py-1 font-mono text-[10px] leading-tight text-jade-200/90">
          <div className="space-y-1">
            <p className="flex justify-between gap-2"><span className="text-jade-400/70">LANDMARKS</span><span data-hud="landmarks">00/68</span></p>
            <p className="flex justify-between gap-2"><span className="text-jade-400/70">LIVENESS</span><span data-hud="liveness">0.00</span></p>
            <p className="flex justify-between gap-2"><span className="text-jade-400/70">MODEL</span><span>fnet-128d</span></p>
          </div>
          <p data-hud="hex" className="truncate text-[9px] tracking-wider text-jade-300/60">— — —</p>
          <p className="flex items-center gap-1.5 text-[10px] text-jade-100">
            <span data-face-scanning className="size-1.5 rounded-full bg-jade-400" />
            <span data-face-status>กำลังสแกนใบหน้า…</span>
          </p>
        </div>
      </div>
      {/* scan line */}
      <span data-scan className="pointer-events-none absolute inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-jade-300 to-transparent shadow-[0_0_14px_3px_rgba(52,211,153,0.55)]" />
    </div>
  );
}

function Chip({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span data-chip className="inline-flex items-center gap-1.5 rounded-full border border-jade-200/80 bg-white/80 px-2.5 py-1 text-[11px] font-medium text-jade-800 backdrop-blur">
      <span data-dot className="size-1.5 rounded-full bg-jade-500" />
      {icon}
      {children}
    </span>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="relative overflow-hidden rounded-[var(--radius-panel)] border border-line/70 bg-white/90 p-4 shadow-[var(--shadow-pop)] backdrop-blur">{children}</div>;
}

function CardHead({ icon, title, sub }: { icon: React.ReactNode; title: string; sub: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="grid size-8 place-items-center rounded-lg bg-jade-50 text-jade-700">{icon}</span>
      <div className="min-w-0">
        <p className="text-sm font-semibold leading-tight text-ink">{title}</p>
        <p className="text-[11px] text-ink-mute">{sub}</p>
      </div>
    </div>
  );
}

function Badge({ children, ...rest }: { children: React.ReactNode } & Record<`data-${string}`, string>) {
  return (
    <span {...rest} className="absolute -bottom-4 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-full border border-jade-200 bg-white px-2.5 py-1 text-[11px] font-medium text-jade-800 shadow-[var(--shadow-soft)]">
      <Check className="size-3" /> {children}
    </span>
  );
}

function Link({ n }: { n: 1 | 2 }) {
  return (
    <div className="relative h-1 w-8 rounded-full bg-line sm:w-10">
      <span data-link-fill={n} className="absolute inset-0 rounded-full bg-jade-500" />
      {/* data packet travelling along the link */}
      <span data-packet={n} className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-jade-400 shadow-[0_0_10px_3px_rgba(16,185,129,0.6)]" />
    </div>
  );
}

function Trust({ icon, title, sub }: { icon: React.ReactNode; title: string; sub: string }) {
  return (
    <div data-trust className="flex items-start gap-2.5 rounded-lg border border-line/60 bg-white/80 px-3 py-2.5 backdrop-blur">
      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md bg-jade-600 text-white">{icon}</span>
      <div className="min-w-0">
        <p className="text-[13px] font-semibold leading-tight text-ink">{title}</p>
        <p className="mt-0.5 text-[11px] leading-snug text-ink-mute">{sub}</p>
      </div>
    </div>
  );
}
