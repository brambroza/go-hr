"use client";

// Date / month / date-time pickers — one calendar popover for the whole app.
// Values are the strings the native inputs use ("YYYY-MM-DD", "YYYY-MM", "YYYY-MM-DDTHH:mm"), so <Input type="date">
// call sites keep working unchanged: Input routes those types here (see components/ui/index.tsx).
// The popover uses the Popover API (top layer) so it also shows above <dialog> modals; browsers without it get a
// fixed-position fallback with an outside-click listener.

import { forwardRef, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { clsx } from "clsx";
import { CalendarDays, ChevronLeft, ChevronRight, Clock, X } from "lucide-react";
import { TH_DAYS_SHORT, TH_MONTHS, TH_MONTHS_SHORT } from "@/lib/format";
import { inputCls } from "./input-cls";
import {
  BE, addDaysYmd, addMonths, fmtDate, fmtDateTime, fmtMonth, inRange, monthGrid, parseYm, parseYmd, splitDateTime, todayYmd, toYm, toYmd, yearBlock,
} from "./date-picker-core";

export type PickerKind = "date" | "month" | "datetime";

export interface DatePickerProps {
  /** "date" (default) → YYYY-MM-DD, "month" → YYYY-MM, "datetime" → YYYY-MM-DDTHH:mm */
  kind?: PickerKind;
  value?: string | null;
  defaultValue?: string;
  onChange?: (value: string) => void;
  min?: string;
  max?: string;
  disabled?: boolean;
  readOnly?: boolean;
  required?: boolean;
  /** submitted with a <form> like a native input (hidden field) */
  name?: string;
  id?: string;
  placeholder?: string;
  className?: string;
  "aria-label"?: string;
  autoFocus?: boolean;
  /** show the ✕ button (default: when not required) */
  clearable?: boolean;
}

const POP_W = 304;
const hasPopoverApi = () => typeof HTMLElement !== "undefined" && "showPopover" in HTMLElement.prototype;

/** Button-like trigger + calendar popover */
export const DatePicker = forwardRef<HTMLInputElement, DatePickerProps>(function DatePicker(
  { kind = "date", value, defaultValue, onChange, min, max, disabled, readOnly, required, name, id, placeholder, className, autoFocus, clearable, "aria-label": ariaLabel },
  ref,
) {
  const controlled = value !== undefined;
  const [inner, setInner] = useState(defaultValue ?? "");
  const cur = (controlled ? value ?? "" : inner).trim();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const uid = useId();
  const popId = `dp-${uid.replace(/[^a-zA-Z0-9]/g, "")}`;
  const [style, setStyle] = useState<CSSProperties>({});
  const [sheet, setSheet] = useState(false);
  // Popover API support is only known in the browser; never branch on it during render (hydration mismatch)
  const [popApi, setPopApi] = useState<boolean | null>(null);
  useEffect(() => setPopApi(hasPopoverApi()), []);

  const commit = useCallback(
    (v: string) => {
      if (!controlled) setInner(v);
      onChange?.(v);
    },
    [controlled, onChange],
  );

  // ---- open / close (Popover API when available, otherwise fixed + outside click)
  const place = useCallback(() => {
    const t = trigger.current;
    if (!t) return;
    const r = t.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    if (vw < 480) {
      setSheet(true);
      setStyle({});
      return;
    }
    setSheet(false);
    const h = pop.current?.offsetHeight || 360;
    const below = r.bottom + 6 + h <= vh - 8;
    const top = below ? r.bottom + 6 : Math.max(8, r.top - 6 - h);
    const left = Math.min(Math.max(8, r.left), Math.max(8, vw - POP_W - 8));
    setStyle({ top, left, width: POP_W });
  }, []);

  useLayoutEffect(() => {
    const el = pop.current;
    if (!el) return;
    if (open) {
      place();
      if (hasPopoverApi()) {
        try {
          if (!el.matches(":popover-open")) el.showPopover();
        } catch {
          /* already open */
        }
      }
      // re-place once the real height is known
      const raf = requestAnimationFrame(place);
      return () => cancelAnimationFrame(raf);
    }
    if (hasPopoverApi() && el.matches(":popover-open")) el.hidePopover();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const el = pop.current;
    // light dismiss / Esc handled by the browser for popovers (one Esc closes only the picker, not a parent <dialog>)
    const onToggle = (e: Event) => {
      if ((e as ToggleEvent).newState === "closed") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    const onDoc = (e: MouseEvent) => {
      if (hasPopoverApi()) return;
      const t = e.target as Node;
      if (el?.contains(t) || trigger.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape" && !hasPopoverApi()) {
        e.stopPropagation();
        setOpen(false);
        trigger.current?.focus();
      }
    };
    el?.addEventListener("toggle", onToggle);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      el?.removeEventListener("toggle", onToggle);
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, place]);

  const label = kind === "month" ? fmtMonth(cur) : kind === "datetime" ? fmtDateTime(cur) : fmtDate(cur);
  const canClear = !disabled && !readOnly && !!cur && (clearable ?? !required);
  const ph = placeholder ?? (kind === "month" ? "เลือกเดือน" : kind === "datetime" ? "เลือกวันและเวลา" : "เลือกวันที่");

  return (
    <div className={clsx("relative min-w-0", className?.includes("w-") ? "" : "w-full")}>
      {/* hidden real input: form submission, `required` validation, ref compatibility */}
      <input ref={ref} type="text" name={name} value={cur} required={required} readOnly tabIndex={-1} aria-hidden className="sr-only" onChange={() => {}} />
      <button
        ref={trigger}
        type="button"
        id={id}
        disabled={disabled}
        autoFocus={autoFocus}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={popId}
        onClick={() => !readOnly && setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === " ") {
            e.preventDefault();
            if (!readOnly) setOpen(true);
          }
        }}
        className={clsx(inputCls, "flex h-10 items-center gap-2 text-left", canClear && "pr-14", open && "border-jade-500 ring-4 ring-jade-100", className)}
      >
        {kind === "datetime" ? <Clock className="size-4 shrink-0 text-ink-mute" /> : <CalendarDays className="size-4 shrink-0 text-ink-mute" />}
        <span className={clsx("num min-w-0 flex-1 truncate", !label && "text-ink-mute")}>{label || ph}</span>
      </button>
      {canClear && (
        <button
          type="button"
          aria-label="ล้างค่า"
          onClick={() => commit("")}
          className="absolute right-1.5 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-ink-mute hover:bg-paper hover:text-ink"
        >
          <X className="size-4" />
        </button>
      )}
      <div
        ref={pop}
        id={popId}
        role="dialog"
        aria-label={ph}
        popover="auto"
        style={{ ...style, zIndex: 1000 }}
        className={clsx(
          "fixed inset-auto m-0 overflow-visible border-0 bg-transparent p-0 text-ink",
          // browsers without the Popover API ignore the attribute: hide the box ourselves when closed
          popApi === false && !open && "hidden",
          sheet && "!inset-x-0 !bottom-0 !top-auto !w-full",
        )}
      >
        {/* phone bottom sheet: dim the page behind (a scrim inside the popover so it also sits in the top layer) */}
        {open && sheet && <div aria-hidden onClick={() => setOpen(false)} className="fixed inset-0 bg-ink/35" />}
        {open && (
          <Calendar
            kind={kind}
            value={cur}
            min={min}
            max={max}
            sheet={sheet}
            onPick={(v, close) => {
              commit(v);
              if (close) {
                setOpen(false);
                trigger.current?.focus();
              }
            }}
            onClose={() => {
              setOpen(false);
              trigger.current?.focus();
            }}
          />
        )}
      </div>
    </div>
  );
});

// ---------------------------------------------------------------- calendar body

type View = "days" | "months" | "years";

function Calendar({ kind, value, min, max, sheet, onPick, onClose }: { kind: PickerKind; value: string; min?: string; max?: string; sheet: boolean; onPick: (v: string, close: boolean) => void; onClose: () => void }) {
  const today = todayYmd();
  const dt = kind === "datetime" ? splitDateTime(value) : { date: value, time: "" };
  const selDate = kind === "month" ? "" : parseYmd(dt.date) ? dt.date : "";
  const selMonth = kind === "month" ? parseYm(value) : null;
  const base = parseYm(selDate || value) ?? parseYm(today)!;
  const [view, setView] = useState<View>(kind === "month" ? "months" : "days");
  const [cursor, setCursor] = useState<{ y: number; m: number }>({ y: base.y, m: base.m });
  const [focus, setFocus] = useState<string>(selDate || (parseYm(today)!.y === base.y && parseYm(today)!.m === base.m ? today : toYmd({ y: base.y, m: base.m, d: 1 })));
  const [time, setTime] = useState(dt.time || "09:00");
  const grid = useMemo(() => monthGrid(cursor.y, cursor.m), [cursor]);
  const gridRef = useRef<HTMLDivElement>(null);

  // keep keyboard focus on the focused day when it changes
  useEffect(() => {
    if (view !== "days") return;
    const el = gridRef.current?.querySelector<HTMLButtonElement>(`[data-ymd="${focus}"]`);
    el?.focus({ preventScroll: true });
  }, [focus, view, cursor]);

  const pickDay = (ymd: string) => {
    if (!inRange(ymd, min, max)) return;
    if (kind === "datetime") onPick(`${ymd}T${time}`, false);
    else onPick(ymd, true);
  };
  const pickMonth = (m: number) => {
    const next = { y: cursor.y, m };
    setCursor(next);
    if (kind === "month") {
      const v = toYm(next.y, next.m);
      if (!inRange(`${v}-01`, min?.slice(0, 7) && `${min.slice(0, 7)}-01`, max?.slice(0, 7) && `${max.slice(0, 7)}-31`)) return;
      onPick(v, true);
      return;
    }
    setFocus(toYmd({ y: next.y, m: next.m, d: 1 }));
    setView("days");
  };
  const pickYear = (y: number) => {
    setCursor({ y, m: cursor.m });
    setView("months");
  };

  const onGridKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (e.key in step) {
      e.preventDefault();
      const n = addDaysYmd(focus, step[e.key]);
      const p = parseYm(n)!;
      if (p.y !== cursor.y || p.m !== cursor.m) setCursor({ y: p.y, m: p.m });
      setFocus(n);
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      const p = parseYmd(focus)!;
      setFocus(toYmd({ y: p.y, m: p.m, d: e.key === "Home" ? 1 : new Date(p.y, p.m + 1, 0).getDate() }));
    } else if (e.key === "PageUp" || e.key === "PageDown") {
      e.preventDefault();
      const n = addMonths(cursor.y, cursor.m, e.key === "PageUp" ? -1 : 1);
      setCursor(n);
      const p = parseYmd(focus)!;
      setFocus(toYmd({ y: n.y, m: n.m, d: Math.min(p.d, new Date(n.y, n.m + 1, 0).getDate()) }));
    } else if (e.key === "Enter") {
      e.preventDefault();
      pickDay(focus);
    }
  };

  const nav = (n: number) => {
    if (view === "years") setCursor({ y: cursor.y + n * 12, m: cursor.m });
    else if (view === "months") setCursor({ y: cursor.y + n, m: cursor.m });
    else {
      const t = addMonths(cursor.y, cursor.m, n);
      setCursor(t);
      setFocus(toYmd({ y: t.y, m: t.m, d: 1 }));
    }
  };
  const years = yearBlock(cursor.y);
  const title =
    view === "years" ? `${BE(years[0])} – ${BE(years[11])}` : view === "months" ? `พ.ศ. ${BE(cursor.y)}` : `${TH_MONTHS[cursor.m]} ${BE(cursor.y)}`;

  return (
    <div
      className={clsx(
        "dp-in relative flex flex-col border border-line/70 bg-white text-ink shadow-[var(--shadow-pop)]",
        sheet ? "w-full rounded-t-[var(--radius-panel)] pb-[env(safe-area-inset-bottom)]" : "w-[304px] rounded-[var(--radius-panel)]",
      )}
    >
      {sheet && <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-line" aria-hidden />}
      {/* header */}
      <div className="flex items-center justify-between px-2 pt-2">
        <NavBtn onClick={() => nav(-1)} label={view === "days" ? "เดือนก่อน" : "ก่อนหน้า"}><ChevronLeft className="size-5" /></NavBtn>
        <button
          type="button"
          onClick={() => setView(view === "days" ? "months" : view === "months" ? "years" : "days")}
          className="h-9 rounded-md px-3 text-[15px] font-semibold hover:bg-paper"
          aria-live="polite"
        >
          {title}
        </button>
        <NavBtn onClick={() => nav(1)} label={view === "days" ? "เดือนถัดไป" : "ถัดไป"}><ChevronRight className="size-5" /></NavBtn>
      </div>

      {/* body */}
      {view === "days" && (
        <div className="px-2 pb-1 pt-1">
          <div className="grid grid-cols-7 text-center text-[11px] font-medium text-ink-mute">
            {TH_DAYS_SHORT.map((d, i) => (
              <div key={d} className={clsx("h-7 leading-7", (i === 0 || i === 6) && "text-rust/70")}>{d.replace(".", "")}</div>
            ))}
          </div>
          <div ref={gridRef} role="grid" aria-label={title} onKeyDown={onGridKey} className="grid grid-cols-7 gap-y-0.5">
            {grid.map((c) => {
              const sel = c.ymd === selDate;
              const ok = inRange(c.ymd, min, max);
              const isToday = c.ymd === today;
              return (
                <button
                  key={c.ymd}
                  type="button"
                  role="gridcell"
                  data-ymd={c.ymd}
                  tabIndex={c.ymd === focus ? 0 : -1}
                  disabled={!ok}
                  aria-selected={sel}
                  aria-label={fmtDate(c.ymd)}
                  onClick={() => pickDay(c.ymd)}
                  onFocus={() => setFocus(c.ymd)}
                  className={clsx(
                    "num mx-auto grid size-9 place-items-center rounded-full text-[14px] transition-colors sm:size-9",
                    sheet && "size-10 text-[15px]",
                    sel ? "bg-jade-600 font-semibold text-white" : ok ? "hover:bg-jade-50 hover:text-jade-800 active:bg-jade-100" : "text-ink-mute/50",
                    !sel && !c.inMonth && "text-ink-mute/60",
                    !sel && isToday && "font-semibold text-jade-700 ring-1 ring-inset ring-jade-300",
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-jade-500",
                  )}
                >
                  {c.d}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {view === "months" && (
        <div className="grid grid-cols-3 gap-1 px-3 py-2">
          {TH_MONTHS_SHORT.map((mn, i) => {
            const sel = kind === "month" ? selMonth?.y === cursor.y && selMonth?.m === i : parseYm(selDate)?.y === cursor.y && parseYm(selDate)?.m === i;
            const key = toYm(cursor.y, i);
            const ok = (!min || key >= min.slice(0, 7)) && (!max || key <= max.slice(0, 7));
            return (
              <button
                key={mn}
                type="button"
                disabled={!ok}
                onClick={() => pickMonth(i)}
                className={clsx(
                  "h-10 rounded-md text-[14px] transition-colors",
                  sel ? "bg-jade-600 font-semibold text-white" : ok ? "hover:bg-jade-50 hover:text-jade-800" : "text-ink-mute/50",
                  !sel && cursor.y === parseYm(today)!.y && i === parseYm(today)!.m && "font-semibold text-jade-700",
                )}
              >
                {TH_MONTHS[i]}
              </button>
            );
          })}
        </div>
      )}
      {view === "years" && (
        <div className="grid grid-cols-3 gap-1 px-3 py-2">
          {years.map((y) => {
            const sel = (kind === "month" ? selMonth?.y : parseYm(selDate)?.y) === y;
            const ok = (!min || y >= Number(min.slice(0, 4))) && (!max || y <= Number(max.slice(0, 4)));
            return (
              <button
                key={y}
                type="button"
                disabled={!ok}
                onClick={() => pickYear(y)}
                className={clsx(
                  "num h-10 rounded-md text-[14px] transition-colors",
                  sel ? "bg-jade-600 font-semibold text-white" : ok ? "hover:bg-jade-50 hover:text-jade-800" : "text-ink-mute/50",
                  !sel && y === parseYm(today)!.y && "font-semibold text-jade-700",
                )}
              >
                {BE(y)}
              </button>
            );
          })}
        </div>
      )}

      {/* footer */}
      <div className="flex items-center justify-between gap-2 border-t border-line-soft px-3 py-2">
        {kind === "datetime" ? (
          <label className="flex items-center gap-2 text-sm text-ink-soft">
            เวลา
            <input
              type="time"
              value={time}
              onChange={(e) => {
                setTime(e.target.value);
                if (selDate && e.target.value) onPick(`${selDate}T${e.target.value}`, false);
              }}
              className="num h-8 rounded-md border border-line bg-white px-2 text-[14px] text-ink focus:border-jade-500 focus:outline-none"
            />
          </label>
        ) : (
          <button
            type="button"
            onClick={() => {
              const p = parseYm(today)!;
              setCursor(p);
              setFocus(today);
              if (kind === "month") onPick(toYm(p.y, p.m), true);
              else if (inRange(today, min, max)) onPick(today, true);
              else setView("days");
            }}
            className="h-8 rounded-md px-2 text-sm font-medium text-jade-700 hover:bg-jade-50"
          >
            {kind === "month" ? "เดือนนี้" : "วันนี้"}
          </button>
        )}
        <div className="flex items-center gap-1">
          {kind === "datetime" && (
            <button type="button" onClick={onClose} className="h-8 rounded-md bg-jade-600 px-3 text-sm font-medium text-white hover:bg-jade-700" disabled={!selDate}>
              ตกลง
            </button>
          )}
          {kind !== "datetime" && (
            <button type="button" onClick={onClose} className="h-8 rounded-md px-2 text-sm text-ink-soft hover:bg-paper">
              ปิด
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function NavBtn({ onClick, label, children }: { onClick: () => void; label: string; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} className="grid size-9 place-items-center rounded-md text-ink-soft hover:bg-paper hover:text-ink">
      {children}
    </button>
  );
}
