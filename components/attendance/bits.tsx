"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { Badge, clsx } from "@/components/ui";
import { minutesToHM } from "@/lib/format";
import { textOn } from "./lookups";

/** Right-side drawer built on <dialog> (focus trap + Esc for free) */
export function Drawer({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === ref.current && onClose()}
      className={clsx("no-print fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-dvh w-full border-l border-line bg-white p-0 text-ink shadow-2xl backdrop:bg-jade-950/40", wide ? "max-w-3xl" : "max-w-xl")}
    >
      {open && (
        <div className="flex h-full flex-col">
          <header className="flex items-start justify-between gap-3 border-b border-line-soft px-5 py-3.5">
            <div className="min-w-0 text-lg font-semibold">{title}</div>
            <button type="button" onClick={onClose} className="rounded p-1 text-ink-mute hover:bg-paper hover:text-ink" aria-label="ปิด">
              <X className="size-5" />
            </button>
          </header>
          <div className="thin-scroll flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && <footer className="flex justify-end gap-2 border-t border-line-soft px-5 py-3">{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}

export function ShiftChip({ code, color, title, className }: { code: string; color?: string | null; title?: string; className?: string }) {
  return (
    <span title={title} className={clsx("inline-flex h-6 min-w-7 items-center justify-center rounded px-1.5 text-xs font-semibold", className)} style={{ background: color ?? "#10b981", color: textOn(color) }}>
      {code}
    </span>
  );
}

export interface DayRow {
  day_type: string;
  absent: boolean;
  missing_scan: boolean;
  late_minutes: number;
  early_minutes: number;
  leave_minutes: number;
  break_over_minutes?: number;
  ot_approved_minutes: Record<string, number> | null;
  ot_before_minutes?: number;
  ot_after_minutes?: number;
  is_locked?: boolean;
  status?: string;
}

export const otTotal = (o: Record<string, number> | null | undefined) => Object.values(o ?? {}).reduce((a, b) => a + Number(b), 0);

export function DayBadges({ d, holidayName }: { d: DayRow; holidayName?: string }) {
  const out: ReactNode[] = [];
  if (d.day_type === "holiday") out.push(<Badge key="h" color="violet">{holidayName ?? "วันหยุดนักขัตฤกษ์"}</Badge>);
  if (d.day_type === "off") out.push(<Badge key="o">วันหยุด</Badge>);
  if (d.day_type === "special") out.push(<Badge key="s" color="blue">วันทำงานพิเศษ</Badge>);
  if (d.absent) out.push(<Badge key="a" color="red">ขาดงาน</Badge>);
  if (d.late_minutes > 0) out.push(<Badge key="l" color="amber">สาย {minutesToHM(d.late_minutes)}</Badge>);
  if (d.early_minutes > 0) out.push(<Badge key="e" color="amber">กลับก่อน {minutesToHM(d.early_minutes)}</Badge>);
  if (d.missing_scan) out.push(<Badge key="m" color="amber">ลืมสแกน</Badge>);
  if (d.leave_minutes > 0) out.push(<Badge key="v" color="blue">ลา</Badge>);
  if ((d.break_over_minutes ?? 0) > 0) out.push(<Badge key="b" color="amber">พักเกิน {minutesToHM(d.break_over_minutes)}</Badge>);
  if (otTotal(d.ot_approved_minutes) > 0) out.push(<Badge key="ot" color="green">OT {minutesToHM(otTotal(d.ot_approved_minutes))}</Badge>);
  else if ((d.ot_before_minutes ?? 0) + (d.ot_after_minutes ?? 0) >= 30) out.push(<Badge key="otp">OT ไม่มีใบขอ {minutesToHM((d.ot_before_minutes ?? 0) + (d.ot_after_minutes ?? 0))}</Badge>);
  if (d.status === "dirty") out.push(<Badge key="d" color="amber">รอคำนวณใหม่</Badge>);
  if (d.is_locked) out.push(<Badge key="k">ล็อกแล้ว</Badge>);
  if (!out.length && d.day_type !== "off") out.push(<Badge key="ok" color="green">ปกติ</Badge>);
  return <div className="flex flex-wrap gap-1">{out}</div>;
}

export function OtRates({ o }: { o: Record<string, number> | null | undefined }) {
  const e = Object.entries(o ?? {}).filter(([, v]) => Number(v) > 0);
  if (!e.length) return <span className="text-ink-mute">-</span>;
  return (
    <span className="num whitespace-nowrap">
      {e.sort(([a], [b]) => Number(a) - Number(b)).map(([k, v]) => `${minutesToHM(Number(v))} ×${k}`).join(" · ")}
    </span>
  );
}

export const SOURCE_LABEL: Record<string, string> = {
  fingerprint: "สแกนนิ้ว", face: "สแกนหน้า", kiosk: "Kiosk", gps: "GPS", wifi: "Wi-Fi", beacon: "Beacon", qr: "QR Code",
  offline: "ออฟไลน์", import: "นำเข้าไฟล์", manual: "HR เพิ่มเอง", team: "หัวหน้าลงแทน", line: "LINE",
};
export const DIRECTION_LABEL: Record<string, string> = { auto: "อัตโนมัติ", in: "เข้างาน", out: "ออกงาน", break_out: "พักออก", break_in: "พักเข้า" };
export const DAY_TYPE_LABEL: Record<string, string> = { work: "วันทำงาน", off: "วันหยุดประจำสัปดาห์", holiday: "วันหยุดนักขัตฤกษ์", special: "วันทำงานพิเศษ" };

/** Bangkok wall-clock "YYYY-MM-DDTHH:mm" for <input type=datetime-local> */
export function toLocalInput(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(d).replace(" ", "T");
}
export function fromLocalInput(v: string): string {
  return new Date(`${v.length === 16 ? v + ":00" : v}+07:00`).toISOString();
}

export function FilterBar({ children }: { children: ReactNode }) {
  return <div className="no-print mb-4 flex flex-wrap items-end gap-2 rounded-[var(--radius-panel)] border border-line bg-white p-3">{children}</div>;
}

export function MiniField({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={clsx("flex max-w-full flex-col gap-1 text-xs text-ink-soft", className)}>
      <span>{label}</span>
      {children}
    </label>
  );
}
