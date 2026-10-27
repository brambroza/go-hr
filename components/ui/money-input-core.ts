// Pure helpers for the money input: "1,234,567.50" on screen, "1234567.50" in form state.
// Kept free of React so they can be unit-tested.

/**
 * Strip a typed/pasted string down to a raw decimal: digits, one dot, optional leading minus,
 * at most `decimals` fraction digits. Leading zeros are dropped ("007" → "7", ".5" → "0.5").
 */
export function cleanMoney(s: string, { decimals = 2, negative = true }: { decimals?: number; negative?: boolean } = {}): string {
  const neg = negative && s.trim().startsWith("-");
  const body = s.replace(/[^\d.]/g, "");
  const dot = body.indexOf(".");
  let int = dot < 0 ? body : body.slice(0, dot);
  const frac = dot < 0 ? null : body.slice(dot + 1).replace(/\./g, "").slice(0, decimals);
  int = int.replace(/^0+(?=\d)/, "");
  if (frac !== null && int === "") int = "0";
  const out = frac !== null && decimals > 0 ? `${int}.${frac}` : int;
  return (neg ? "-" : "") + out;
}

/** a value set from outside (e.g. a computed 2083.3333) is rounded, not truncated, to `decimals` */
export function moneyFromValue(v: string, { decimals = 2, negative = true }: { decimals?: number; negative?: boolean } = {}): string {
  const s = v.trim();
  const tooLong = new RegExp(`^-?\\d*\\.\\d{${decimals + 1},}$`).test(s);
  return cleanMoney(tooLong && isFinite(Number(s)) ? Number(s).toFixed(decimals) : s, { decimals, negative });
}

/** raw decimal → display with thousands separators ("-1234.5" → "-1,234.5"); keeps a trailing dot while typing */
export function groupMoney(raw: string): string {
  const neg = raw.startsWith("-");
  const body = neg ? raw.slice(1) : raw;
  const dot = body.indexOf(".");
  const int = dot < 0 ? body : body.slice(0, dot);
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return (neg ? "-" : "") + grouped + (dot < 0 ? "" : body.slice(dot));
}

/** value the form receives: "" for an empty or lone "-" entry, else the raw decimal */
export function moneyValue(raw: string): string {
  return raw === "-" ? "" : raw.replace(/\.$/, "");
}

/** do two raw strings describe the same amount? ("25000" vs "25000.00", "" vs "") */
export function sameMoney(a: string, b: string): boolean {
  const ea = moneyValue(a) === "", eb = moneyValue(b) === "";
  if (ea || eb) return ea === eb;
  return Number(moneyValue(a)) === Number(moneyValue(b));
}

/** caret position in `formatted` that has the same number of significant chars (digits, dot, minus) to its left as `count` */
export function caretAfter(formatted: string, count: number): number {
  if (count <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < formatted.length; i++) {
    if (formatted[i] !== ",") seen++;
    if (seen === count) return i + 1;
  }
  return formatted.length;
}

/** number of significant chars (not commas) left of `pos` */
export function significantBefore(text: string, pos: number): number {
  return text.slice(0, pos).replace(/[^\d.-]/g, "").length;
}
