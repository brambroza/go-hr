"use client";

import { forwardRef, useEffect, useLayoutEffect, useRef, useState, type ChangeEvent, type InputHTMLAttributes, type MutableRefObject } from "react";
import { clsx } from "clsx";
import { inputCls } from "./input-cls";
import { caretAfter, cleanMoney, groupMoney, moneyFromValue, moneyValue, sameMoney, significantBefore } from "./money-input-core";

export type MoneyInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "step"> & {
  /** fraction digits allowed (default 2) */
  decimals?: number;
};

/**
 * Amount input that shows thousands separators (25,000.50) while typing. onChange gets an event-like
 * object whose target.value is the raw decimal ("25000.50"), the same string a type="number" input
 * would give, so existing `e.target.value` handlers keep working. A `name` is submitted via a hidden
 * input carrying the raw value. A non-negative `min` blocks the minus sign.
 */
export const MoneyInput = forwardRef<HTMLInputElement, MoneyInputProps>(function MoneyInput(
  { value, defaultValue, onChange, name, min, max, decimals = 2, className, inputMode, ...rest },
  ref,
) {
  const negative = min == null || Number(min) < 0;
  const opts = { decimals, negative };
  const [raw, setRaw] = useState(() => moneyFromValue(String(value ?? defaultValue ?? ""), opts));
  const inner = useRef<HTMLInputElement | null>(null);
  const caret = useRef<number | null>(null);

  // follow the controlled value when it changes from outside (reset, recalculated amount, loaded row)
  const outer = value == null ? null : String(value);
  useEffect(() => {
    if (outer !== null && !sameMoney(outer, raw)) setRaw(moneyFromValue(outer, opts));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outer]);

  const shown = groupMoney(raw);
  useLayoutEffect(() => {
    if (caret.current === null || !inner.current) return;
    inner.current.setSelectionRange(caret.current, caret.current);
    caret.current = null;
  }, [shown]);

  const handle = (e: ChangeEvent<HTMLInputElement>) => {
    const el = e.target;
    const before = significantBefore(el.value, el.selectionStart ?? el.value.length);
    const next = cleanMoney(el.value, opts);
    caret.current = caretAfter(groupMoney(next), before);
    setRaw(next);
    const v = moneyValue(next);
    onChange?.({ target: { value: v, name: name ?? "" }, currentTarget: { value: v, name: name ?? "" } } as unknown as ChangeEvent<HTMLInputElement>);
  };

  const setRef = (el: HTMLInputElement | null) => {
    inner.current = el;
    if (typeof ref === "function") ref(el);
    else if (ref) (ref as MutableRefObject<HTMLInputElement | null>).current = el;
  };

  const over = max != null && raw !== "" && Number(moneyValue(raw)) > Number(max);
  return (
    <>
      <input
        ref={setRef}
        type="text"
        inputMode={inputMode ?? (decimals > 0 ? "decimal" : "numeric")}
        autoComplete="off"
        className={clsx(inputCls, "num h-10", className)}
        value={shown}
        {...rest}
        onChange={handle}
        aria-invalid={over || rest["aria-invalid"]}
      />
      {name && <input type="hidden" name={name} value={moneyValue(raw)} />}
    </>
  );
});
