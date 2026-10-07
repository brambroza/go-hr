// Commission & loan helpers (pure, unit tested)

export interface CommissionTier {
  from: number;
  to?: number | null; // exclusive upper bound; null/undefined = no limit
  rate: number; // percent
}

/**
 * step = ขั้นบันได: each slice of the base is paid at its tier's rate (like income tax brackets)
 * flat = อัตราเดียว: the tier the whole base falls into sets one rate for the whole base
 */
export function computeCommission(base: number, tiers: CommissionTier[], mode: "step" | "flat"): number {
  const b = Math.max(0, Number(base) || 0);
  const list = [...(tiers ?? [])].map((t) => ({ from: Number(t.from) || 0, to: t.to == null || (t.to as unknown) === "" ? Infinity : Number(t.to), rate: Number(t.rate) || 0 })).sort((a, c) => a.from - c.from);
  if (!list.length || b <= 0) return 0;
  let out = 0;
  if (mode === "flat") {
    const tier = [...list].reverse().find((t) => b >= t.from);
    out = tier ? (b * tier.rate) / 100 : 0;
  } else {
    for (const t of list) {
      if (b <= t.from) break;
      out += ((Math.min(b, t.to) - t.from) * t.rate) / 100;
    }
  }
  return Math.round(out * 100) / 100;
}

export interface LoanPlan {
  principal: number;
  interest_rate: number; // % per year, flat on principal
  installments: number;
}

/** flat interest: total = principal × (1 + rate% × months / 12); installment rounded up to the baht */
export function loanTotals(p: LoanPlan) {
  const n = Math.max(1, Math.round(p.installments) || 1);
  const interest = Math.round(((p.principal * (p.interest_rate || 0)) / 100) * (n / 12) * 100) / 100;
  const total = Math.round((p.principal + interest) * 100) / 100;
  const installment = Math.ceil((total / n) * 100) / 100;
  return { interest, total, installment, installments: n };
}

/** month-by-month schedule from start month (YYYY-MM-01), last installment absorbs rounding */
export function loanSchedule(total: number, installment: number, startMonth: string, paid = 0) {
  const rows: { no: number; month: string; amount: number; balance: number; paid: boolean }[] = [];
  if (!(installment > 0) || !(total > 0)) return rows;
  let balance = Math.round(total * 100) / 100;
  let paidLeft = paid;
  let [y, m] = startMonth.slice(0, 7).split("-").map(Number);
  for (let i = 1; balance > 0.004 && i <= 600; i++) {
    const amount = Math.min(installment, balance);
    balance = Math.round((balance - amount) * 100) / 100;
    const isPaid = paidLeft >= amount - 0.004;
    paidLeft -= amount;
    rows.push({ no: i, month: `${y}-${String(m).padStart(2, "0")}-01`, amount: Math.round(amount * 100) / 100, balance, paid: isPaid });
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return rows;
}
