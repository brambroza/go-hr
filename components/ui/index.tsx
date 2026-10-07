"use client";

import { forwardRef, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { clsx } from "clsx";
import { Loader2, X } from "lucide-react";

export { clsx };

// ------------------------------------------------------------------ Button
type Variant = "primary" | "secondary" | "ghost" | "danger" | "subtle";
const VARIANTS: Record<Variant, string> = {
  primary: "bg-jade-600 text-white hover:bg-jade-700 active:bg-jade-800 disabled:bg-jade-300",
  secondary: "bg-white text-ink border border-line hover:bg-jade-50 hover:border-jade-200 disabled:text-ink-mute",
  ghost: "text-ink-soft hover:bg-jade-50 hover:text-jade-800",
  danger: "bg-rust text-white hover:brightness-95 disabled:opacity-50",
  subtle: "bg-jade-50 text-jade-800 hover:bg-jade-100",
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
      className={clsx(
        "inline-flex items-center justify-center gap-1.5 rounded-[var(--radius-ctl)] font-medium transition-colors whitespace-nowrap disabled:cursor-not-allowed",
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
  "w-full rounded-[var(--radius-ctl)] border border-line bg-white px-3 text-[15px] text-ink placeholder:text-ink-mute focus:border-jade-500 focus:outline-none focus:ring-2 focus:ring-jade-100 disabled:bg-paper disabled:text-ink-mute";

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
    <section className={clsx("rounded-[var(--radius-panel)] border border-line bg-white", className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line-soft px-4 py-3">
          {title && <h2 className="text-[15px] font-semibold text-ink">{title}</h2>}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={clsx(bodyClass ?? "p-4")}>{children}</div>
      {footer && <footer className="border-t border-line-soft px-4 py-3">{footer}</footer>}
    </section>
  );
}

export function PageHeader({ title, description, actions, back }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; back?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
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
  green: "bg-jade-50 text-jade-800 ring-jade-200",
  amber: "bg-amber-50 text-amber-ink ring-amber-200",
  red: "bg-rust-soft text-rust ring-orange-200",
  gray: "bg-paper text-ink-soft ring-line",
  blue: "bg-sky-50 text-sky-800 ring-sky-200",
  violet: "bg-violet-50 text-violet-800 ring-violet-200",
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
    <div className="rounded-[var(--radius-panel)] border border-line bg-white px-4 py-3">
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
        "m-auto w-[calc(100%-2rem)] rounded-[var(--radius-panel)] border border-line bg-white p-0 text-ink shadow-xl backdrop:bg-jade-950/40",
        size === "sm" && "max-w-md",
        size === "md" && "max-w-xl",
        size === "lg" && "max-w-3xl",
        size === "xl" && "max-w-5xl",
      )}
    >
      {open && (
        <div className="flex max-h-[88vh] flex-col">
          <header className="flex items-center justify-between gap-3 border-b border-line-soft px-5 py-3.5">
            <h3 className="text-lg font-semibold">{title}</h3>
            <button type="button" onClick={onClose} className="rounded p-1 text-ink-mute hover:bg-paper hover:text-ink" aria-label="ปิด">
              <X className="size-5" />
            </button>
          </header>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {footer && <footer className="flex justify-end gap-2 border-t border-line-soft px-5 py-3">{footer}</footer>}
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
            value === t.value ? "border-jade-600 font-medium text-jade-800" : "border-transparent text-ink-soft hover:text-ink",
          )}
        >
          {t.label}
          {t.count != null && <span className="ml-1.5 rounded-full bg-paper px-1.5 text-xs text-ink-soft">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ Toasts
type Toast = { id: number; kind: "ok" | "error" | "info"; text: string };
let pushToast: ((t: Omit<Toast, "id">) => void) | null = null;

export const toast = {
  ok: (text: string) => pushToast?.({ kind: "ok", text }),
  error: (text: string) => pushToast?.({ kind: "error", text }),
  info: (text: string) => pushToast?.({ kind: "info", text }),
};

export function Toaster() {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => {
    let n = 0;
    pushToast = (t) => {
      const id = ++n;
      setItems((x) => [...x, { ...t, id }]);
      setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), t.kind === "error" ? 7000 : 3500);
    };
    return () => {
      pushToast = null;
    };
  }, []);
  return (
    <div className="no-print pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4 sm:items-end sm:pr-6" aria-live="polite">
      {items.map((t) => (
        <div
          key={t.id}
          className={clsx(
            "pointer-events-auto max-w-md rounded-[var(--radius-ctl)] px-4 py-2.5 text-[15px] shadow-lg",
            t.kind === "ok" && "bg-jade-800 text-white",
            t.kind === "error" && "bg-rust text-white",
            t.kind === "info" && "bg-ink text-white",
          )}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
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
      <div className="text-[15px]">{state?.text}</div>
    </Modal>
  );
  return { confirm, dialog };
}

export function useStableId(prefix = "f") {
  return prefix + useId().replace(/:/g, "");
}
