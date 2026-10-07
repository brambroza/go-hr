"use client";

import { forwardRef, useEffect, useId, useRef, useState, useSyncExternalStore, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { clsx } from "clsx";
import { CheckCircle2, Info, Loader2, X, XCircle } from "lucide-react";

export { clsx };

// ------------------------------------------------------------------ Button
type Variant = "primary" | "secondary" | "ghost" | "danger" | "subtle";
const VARIANTS: Record<Variant, string> = {
  primary: "bg-jade-600 text-white shadow-[var(--shadow-soft)] hover:bg-jade-700 active:bg-jade-800 disabled:bg-jade-200 disabled:text-white disabled:shadow-none",
  secondary: "bg-white text-ink border border-line shadow-[var(--shadow-soft)] hover:bg-paper hover:border-gray-300 disabled:text-ink-mute disabled:shadow-none",
  ghost: "text-ink-soft hover:bg-paper hover:text-ink",
  danger: "bg-rust text-white shadow-[var(--shadow-soft)] hover:bg-red-800 disabled:opacity-50",
  subtle: "bg-jade-50 text-jade-700 hover:bg-jade-100",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading, icon, className, children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={clsx(
        "inline-flex items-center justify-center gap-1.5 rounded-[var(--radius-ctl)] font-medium transition-colors whitespace-nowrap disabled:cursor-not-allowed aria-busy:cursor-progress",
        size === "sm" && "h-8 px-2.5 text-sm",
        size === "md" && "h-10 px-4 text-[15px]",
        size === "lg" && "h-12 px-5 text-base",
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
});

// ------------------------------------------------------------------ Inputs
const inputCls =
  "w-full rounded-[var(--radius-ctl)] border border-line bg-white px-3 text-[15px] text-ink placeholder:text-ink-mute hover:border-gray-300 focus:border-jade-500 focus:outline-none focus:ring-4 focus:ring-jade-100 disabled:bg-paper disabled:text-ink-mute";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={clsx(inputCls, "h-10", className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={clsx(inputCls, "min-h-20 py-2", className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { placeholder?: string }>(function Select(
  { className, children, placeholder, ...rest },
  ref,
) {
  return (
    <select ref={ref} className={clsx(inputCls, "h-10 pr-8", className)} {...rest}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {children}
    </select>
  );
});

export function Field({ label, hint, error, required, children, className }: { label?: ReactNode; hint?: ReactNode; error?: string | null; required?: boolean; children: ReactNode; className?: string }) {
  return (
    <label className={clsx("flex flex-col gap-1", className)}>
      {label && (
        <span className="text-sm font-medium text-ink-soft">
          {label}
          {required && <span className="ml-0.5 text-rust">*</span>}
        </span>
      )}
      {children}
      {hint && !error && <span className="text-xs text-ink-mute">{hint}</span>}
      {error && <span className="text-xs text-rust">{error}</span>}
    </label>
  );
}

export function Checkbox({ label, checked, onChange, disabled }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className={clsx("inline-flex items-center gap-2 text-[15px] select-none", disabled ? "text-ink-mute" : "cursor-pointer")}>
      <input type="checkbox" className="size-4 accent-jade-600" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; disabled?: boolean }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-[15px]">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={clsx("relative h-6 w-10 rounded-full transition-colors", checked ? "bg-jade-600" : "bg-line", disabled && "opacity-50")}
      >
        <span className={clsx("absolute top-0.5 size-5 rounded-full bg-white shadow transition-all", checked ? "left-[18px]" : "left-0.5")} />
      </button>
      {label}
    </label>
  );
}

// ------------------------------------------------------------------ Layout bits
export function Panel({ title, actions, children, className, bodyClass, footer }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClass?: string; footer?: ReactNode }) {
  return (
    <section className={clsx("rounded-[var(--radius-panel)] border border-line/80 bg-white shadow-[var(--shadow-soft)]", className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line-soft px-5 py-3.5">
          {title && <h2 className="text-[15px] font-semibold text-ink">{title}</h2>}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={clsx(bodyClass ?? "p-5")}>{children}</div>
      {footer && <footer className="border-t border-line-soft px-5 py-3">{footer}</footer>}
    </section>
  );
}

export function PageHeader({ title, description, actions, back }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; back?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {back}
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-[15px] text-ink-soft">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

const BADGE: Record<string, string> = {
  green: "bg-jade-50 text-jade-800 ring-jade-100",
  amber: "bg-amber-50 text-amber-ink ring-amber-100",
  red: "bg-rust-soft text-rust ring-red-100",
  gray: "bg-gray-100 text-ink-soft ring-gray-200/70",
  blue: "bg-sky-50 text-sky-800 ring-sky-100",
  violet: "bg-violet-50 text-violet-800 ring-violet-100",
};
export function Badge({ color = "gray", children, className }: { color?: keyof typeof BADGE | string; children: ReactNode; className?: string }) {
  return <span className={clsx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap", BADGE[color] ?? BADGE.gray, className)}>{children}</span>;
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={clsx("size-5 animate-spin text-jade-600", className)} />;
}

export function Empty({ title, description, action, icon }: { title: ReactNode; description?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      {icon && <div className="text-jade-400">{icon}</div>}
      <p className="font-medium text-ink">{title}</p>
      {description && <p className="max-w-md text-sm text-ink-soft">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Stat({ label, value, sub, tone }: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: "jade" | "amber" | "rust" }) {
  return (
    <div className="rounded-[var(--radius-panel)] border border-line/80 bg-white px-5 py-4 shadow-[var(--shadow-soft)]">
      <div className="text-sm text-ink-soft">{label}</div>
      <div className={clsx("num mt-1 text-2xl font-semibold", tone === "amber" ? "text-amber-ink" : tone === "rust" ? "text-rust" : "text-ink")}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-ink-mute">{sub}</div>}
    </div>
  );
}

// ------------------------------------------------------------------ Modal
export function Modal({ open, onClose, title, children, footer, size = "md" }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; size?: "sm" | "md" | "lg" | "xl" }) {
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
      className={clsx(
        "m-auto w-[calc(100%-2rem)] rounded-[var(--radius-panel)] border border-line/70 bg-white p-0 text-ink shadow-[var(--shadow-pop)]",
        size === "sm" && "max-w-md",
        size === "md" && "max-w-xl",
        size === "lg" && "max-w-3xl",
        size === "xl" && "max-w-5xl",
      )}
    >
      {open && (
        <div className="flex max-h-[88vh] flex-col">
          <header className="flex items-center justify-between gap-3 border-b border-line-soft px-5 py-4">
            <h3 className="text-lg font-semibold">{title}</h3>
            <button type="button" onClick={onClose} className="rounded-md p-1 text-ink-mute hover:bg-paper hover:text-ink" aria-label="ปิด">
              <X className="size-5" />
            </button>
          </header>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {footer && <footer className="flex justify-end gap-2 border-t border-line-soft bg-paper/50 px-5 py-3">{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}

// ------------------------------------------------------------------ Tabs
export function Tabs<T extends string>({ tabs, value, onChange, className }: { tabs: { value: T; label: ReactNode; count?: number }[]; value: T; onChange: (v: T) => void; className?: string }) {
  return (
    <div role="tablist" className={clsx("thin-scroll flex gap-1 overflow-x-auto border-b border-line", className)}>
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          type="button"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={clsx(
            "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-[15px] transition-colors",
            value === t.value ? "border-jade-500 font-medium text-jade-700" : "border-transparent text-ink-soft hover:text-ink",
          )}
        >
          {t.label}
          {t.count != null && <span className="ml-1.5 rounded-full bg-gray-100 px-1.5 text-xs text-ink-soft">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ Toasts
type Toast = { id: number; kind: "ok" | "error" | "info"; text: string };
// Module-level store: toasts survive client navigation between layouts (e.g. save → router.push to another shell).
let toastItems: Toast[] = [];
let toastSeq = 0;
const toastSubs = new Set<() => void>();
const emitToasts = () => toastSubs.forEach((f) => f());
function dismissToast(id: number) {
  toastItems = toastItems.filter((i) => i.id !== id);
  emitToasts();
}
function push(t: Omit<Toast, "id">) {
  const id = ++toastSeq;
  toastItems = [...toastItems.filter((i) => !(i.text === t.text && i.kind === t.kind)), { ...t, id }].slice(-4);
  emitToasts();
  setTimeout(() => dismissToast(id), t.kind === "error" ? 7000 : 3500);
}

export const toast = {
  ok: (text: string) => push({ kind: "ok", text }),
  /** accepts a Thai message, a raw Postgres/server-action error string or an Error; raw text is translated by errorText() */
  error: (text: unknown) => push({ kind: "error", text: errorText(text) }),
  info: (text: string) => push({ kind: "info", text }),
};

const EMPTY_TOASTS: Toast[] = [];
const TOAST_ICON = {
  ok: <CheckCircle2 className="size-5 text-jade-600" aria-hidden />,
  error: <XCircle className="size-5 text-rust" aria-hidden />,
  info: <Info className="size-5 text-sky-600" aria-hidden />,
};

/**
 * Toast stack: top-right on desktop, top-center on phones (clear of the bottom nav).
 * Success/info auto-dismiss after 3.5s, errors after 7s. Mount one per layout.
 */
export function Toaster() {
  const items = useSyncExternalStore(
    (cb) => {
      toastSubs.add(cb);
      return () => void toastSubs.delete(cb);
    },
    () => toastItems,
    () => EMPTY_TOASTS,
  );
  // Render in the browser "top layer" (popover) so toasts stay visible above open <dialog> modals.
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current as (HTMLDivElement & { showPopover?: () => void; hidePopover?: () => void }) | null;
    if (!el?.showPopover) return;
    try {
      if (el.matches(":popover-open")) el.hidePopover!();
      if (items.length) el.showPopover();
    } catch {
      /* popover unsupported — falls back to z-index */
    }
  }, [items]);
  return (
    <div
      ref={ref}
      data-toaster
      popover="manual"
      className="no-print pointer-events-none fixed inset-x-0 bottom-auto top-[calc(0.75rem+env(safe-area-inset-top))] z-[1000] m-0 flex h-fit w-auto flex-col items-center gap-2 overflow-visible border-0 bg-transparent p-0 px-3 text-ink sm:left-auto sm:right-5 sm:top-[4.25rem] sm:items-end"
    >
      {items.map((t) => (
        <div
          key={t.id}
          role={t.kind === "error" ? "alert" : "status"}
          aria-live={t.kind === "error" ? "assertive" : "polite"}
          className={clsx(
            "toast-in pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-[var(--radius-ctl)] border border-line/80 bg-white py-3 pl-3.5 pr-2 text-[15px] text-ink shadow-[var(--shadow-pop)]",
            t.kind === "ok" && "border-l-4 border-l-jade-500",
            t.kind === "error" && "border-l-4 border-l-rust",
            t.kind === "info" && "border-l-4 border-l-sky-500",
          )}
        >
          <span className="mt-px shrink-0">{TOAST_ICON[t.kind]}</span>
          <span className="min-w-0 flex-1 break-words leading-snug">{t.text}</span>
          <button
            type="button"
            onClick={() => dismissToast(t.id)}
            className="-my-1 shrink-0 rounded-md p-1 text-ink-mute hover:bg-paper hover:text-ink"
            aria-label="ปิดข้อความ"
          >
            <X className="size-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

/** Turn any thrown value / Supabase error / server-action error string into a short Thai message. */
export function errorText(e: unknown): string {
  const msg = typeof e === "string" ? e : typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : String(e ?? "");
  if (!msg || msg === "undefined" || msg === "[object Object]") return "ทำรายการไม่สำเร็จ กรุณาลองใหม่อีกครั้ง";
  if (msg.includes("duplicate key")) return "ข้อมูลซ้ำกับรายการที่มีอยู่แล้ว (เช่น รหัสซ้ำ)";
  if (msg.includes("violates foreign key") && msg.includes("delete")) return "ลบไม่ได้ เพราะมีข้อมูลอื่นอ้างอิงรายการนี้อยู่";
  if (msg.includes("violates foreign key")) return "ข้อมูลอ้างอิงไม่ถูกต้อง หรือมีข้อมูลอื่นใช้รายการนี้อยู่";
  if (msg.includes("row-level security") || msg.includes("permission denied")) return "คุณไม่มีสิทธิ์ทำรายการนี้";
  if (msg.includes("violates check constraint")) return "ค่าที่กรอกไม่อยู่ในรูปแบบที่กำหนด";
  if (msg.includes("violates not-null")) return "กรอกข้อมูลที่จำเป็นไม่ครบ";
  if (msg.includes("Failed to fetch") || msg.includes("NetworkError") || msg.includes("Load failed")) return "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่";
  if (msg.includes("JWT expired")) return "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่";
  if (/^\s*[[{]/.test(msg)) return "ทำรายการไม่สำเร็จ กรุณาลองใหม่อีกครั้ง";
  return msg;
}

/**
 * Run a mutation with standard feedback: optional confirm → busy flag → success toast / error toast.
 * `fn` may throw, or return a Supabase-style `{ error }` or a safeAction-style `{ ok:false, error }` — both count as failure.
 * Returns the result of fn, or undefined when cancelled / failed.
 */
export async function runAction<T>(
  fn: () => Promise<T>,
  opts: {
    success?: string | ((r: T) => string | null | undefined);
    error?: string;
    setBusy?: (v: boolean) => void;
    confirm?: () => Promise<boolean>;
  } = {},
): Promise<T | undefined> {
  if (opts.confirm && !(await opts.confirm())) return undefined;
  opts.setBusy?.(true);
  try {
    const r = await fn();
    const err = r && typeof r === "object" && "error" in r ? (r as { error?: unknown }).error : undefined;
    const notOk = r && typeof r === "object" && "ok" in r && (r as { ok?: unknown }).ok === false;
    if (err || notOk) {
      toast.error((opts.error ? opts.error + ": " : "") + errorText(err));
      return undefined;
    }
    const msg = typeof opts.success === "function" ? opts.success(r) : opts.success;
    if (msg) toast.ok(msg);
    return r;
  } catch (e) {
    toast.error((opts.error ? opts.error + ": " : "") + errorText(e));
    return undefined;
  } finally {
    opts.setBusy?.(false);
  }
}

// ------------------------------------------------------------------ Confirm
export function useConfirm() {
  const [state, setState] = useState<{ text: ReactNode; resolve: (v: boolean) => void; danger?: boolean; confirmText?: string } | null>(null);
  const confirm = (text: ReactNode, opts?: { danger?: boolean; confirmText?: string }) =>
    new Promise<boolean>((resolve) => setState({ text, resolve, ...opts }));
  const dialog = (
    <Modal
      open={!!state}
      size="sm"
      title="ยืนยันการทำรายการ"
      onClose={() => {
        state?.resolve(false);
        setState(null);
      }}
      footer={
        <>
          <Button
            variant="secondary"
            onClick={() => {
              state?.resolve(false);
              setState(null);
            }}
          >
            ยกเลิก
          </Button>
          <Button
            variant={state?.danger ? "danger" : "primary"}
            onClick={() => {
              state?.resolve(true);
              setState(null);
            }}
          >
            {state?.confirmText ?? "ยืนยัน"}
          </Button>
        </>
      }
    >
      <div className="text-[15px] leading-relaxed text-ink-soft">{state?.text}</div>
    </Modal>
  );
  return { confirm, dialog };
}

export function useStableId(prefix = "f") {
  return prefix + useId().replace(/:/g, "");
}
