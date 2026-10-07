"use client";

import { clsx } from "@/components/ui";

const toMin = (t: string | null | undefined) => {
  if (!t) return null;
  const [h, m] = String(t).split(":").map(Number);
  return isNaN(h) ? null : h * 60 + (m || 0);
};

/**
 * 24h (or 30h for overnight shifts) bar: scan window, work time, break, late grace, OT start.
 * Pure SVG-free divs so it prints and scales.
 */
export function ShiftTimeline({ s, compact }: { s: Record<string, unknown>; compact?: boolean }) {
  const start = toMin(s.start_time as string);
  let end = toMin(s.end_time as string);
  if (start == null || end == null) return <span className="text-sm text-ink-mute">ระบุเวลาเข้า-ออกเพื่อดูภาพรวมกะ</span>;
  const overnight = !!s.is_overnight || end <= start;
  if (overnight) end += 1440;
  const span = overnight ? 1440 + 720 : 1440; // overnight: show until 12:00 next day
  const pct = (m: number) => `${(Math.max(0, Math.min(span, m)) / span) * 100}%`;
  const w = (a: number, b: number) => `${((Math.max(0, Math.min(span, b)) - Math.max(0, Math.min(span, a))) / span) * 100}%`;
  let bs = toMin(s.break_start as string);
  let be = toMin(s.break_end as string);
  if (bs != null && bs < start) bs += 1440;
  if (be != null && bs != null && be < bs) be += 1440;
  const winStart = start - Number(s.scan_in_before_min ?? 0);
  const winEnd = end + Number(s.scan_out_after_min ?? 0);
  const grace = Number(s.late_grace_min ?? 0);
  const otStart = end + Number(s.ot_after_start_min ?? 0);
  const color = (s.color as string) || "#10b981";
  const ticks = [];
  for (let h = 0; h <= span / 60; h += compact ? 6 : 3) ticks.push(h);
  const hh = (m: number) => `${String(Math.floor((m % 1440) / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

  return (
    <div className={clsx("w-full", compact ? "min-w-48" : "")} aria-label={`กะ ${hh(start)}–${hh(end % 1440)}${overnight ? " (ข้ามวัน)" : ""}`}>
      <div className={clsx("relative rounded bg-paper", compact ? "h-4" : "h-8")}>
        <div className="absolute inset-y-0 rounded bg-jade-100/70" style={{ left: pct(winStart), width: w(winStart, winEnd) }} title={`ช่วงรับการสแกน ${hh(Math.max(0, winStart))}–${hh(winEnd)}`} />
        <div className="absolute inset-y-0 rounded" style={{ left: pct(start), width: w(start, end), background: color }} title={`เวลางาน ${hh(start)}–${hh(end)}`} />
        {grace > 0 && <div className="absolute inset-y-0 bg-amber-300/80" style={{ left: pct(start), width: w(start, start + grace) }} title={`สายได้ ${grace} นาที`} />}
        {bs != null && be != null && <div className="absolute inset-y-0 bg-white/70" style={{ left: pct(bs), width: w(bs, be), backgroundImage: "repeating-linear-gradient(45deg, transparent 0 3px, rgba(0,0,0,.12) 3px 5px)" }} title={`พัก ${hh(bs)}–${hh(be)}`} />}
        {!compact && <div className="absolute inset-y-[-4px] w-0.5 bg-rust" style={{ left: pct(otStart) }} title={`เริ่มนับ OT ${hh(otStart)}`} />}
        {!compact && overnight && <div className="absolute inset-y-[-4px] w-px border-l border-dashed border-ink-mute" style={{ left: pct(1440) }} />}
      </div>
      {!compact && (
        <>
          <div className="relative mt-1 h-4 text-[11px] text-ink-mute">
            {ticks.map((h) => (
              <span key={h} className="num absolute -translate-x-1/2" style={{ left: pct(h * 60) }}>{String(h % 24).padStart(2, "0")}</span>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-soft">
            <Legend swatch={<span className="inline-block size-3 rounded-sm" style={{ background: color }} />} text={`เวลางาน ${hh(start)}–${hh(end)}${overnight ? " (+1 วัน)" : ""}`} />
            {bs != null && be != null && <Legend swatch={<span className="inline-block size-3 rounded-sm border border-line" style={{ backgroundImage: "repeating-linear-gradient(45deg, transparent 0 3px, rgba(0,0,0,.2) 3px 5px)" }} />} text={`พัก ${hh(bs)}–${hh(be)}`} />}
            <Legend swatch={<span className="inline-block size-3 rounded-sm bg-jade-100" />} text={`รับการสแกน ${hh(((winStart % 1440) + 1440) % 1440)}–${hh(winEnd)}`} />
            {grace > 0 && <Legend swatch={<span className="inline-block size-3 rounded-sm bg-amber-300" />} text={`สายได้ ${grace} นาที`} />}
            <Legend swatch={<span className="inline-block h-3 w-0.5 bg-rust" />} text={`เริ่มนับ OT ${hh(otStart)}`} />
          </div>
        </>
      )}
    </div>
  );
}

function Legend({ swatch, text }: { swatch: React.ReactNode; text: string }) {
  return <span className="inline-flex items-center gap-1.5">{swatch}{text}</span>;
}
