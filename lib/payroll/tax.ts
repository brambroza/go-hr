// Thai personal income tax (ภ.ง.ด.1 withholding) — pure functions, configurable per year via settings.tax_config

export interface TaxBracket {
  upto: number | null; // ceiling of the bracket (null = no limit)
  rate: number; // percent
}

export interface DeductionDef {
  code: string;
  name: string;
  max?: number;
  per_unit?: number;
  multiplier?: number;
  group?: string; // e.g. "insurance" shares insurance_group_max
  retirement?: boolean; // shares retirement_group_max with PVD
  donation?: boolean; // capped at donation_max_percent of income after other deductions
}

export interface TaxConfig {
  brackets: TaxBracket[];
  expense: { rate: number; max: number };
  personal_allowance: number;
  deductions: DeductionDef[];
  insurance_group_max?: number;
  retirement_group_max?: number;
  pvd_max_percent?: number;
  donation_max_percent?: number;
}

export const DEFAULT_TAX_CONFIG: TaxConfig = {
  brackets: [
    { upto: 150000, rate: 0 },
    { upto: 300000, rate: 5 },
    { upto: 500000, rate: 10 },
    { upto: 750000, rate: 15 },
    { upto: 1000000, rate: 20 },
    { upto: 2000000, rate: 25 },
    { upto: 5000000, rate: 30 },
    { upto: null, rate: 35 },
  ],
  expense: { rate: 50, max: 100000 },
  personal_allowance: 60000,
  deductions: [],
  insurance_group_max: 100000,
  retirement_group_max: 500000,
  pvd_max_percent: 15,
  donation_max_percent: 10,
};

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** progressive tax on net income */
export function progressiveTax(netIncome: number, brackets: TaxBracket[] = DEFAULT_TAX_CONFIG.brackets): number {
  let tax = 0;
  let lower = 0;
  const income = Math.max(0, netIncome);
  for (const b of brackets) {
    const upper = b.upto ?? Infinity;
    if (income > lower) {
      const portion = Math.min(income, upper) - lower;
      tax += (portion * b.rate) / 100;
    }
    lower = upper;
    if (income <= upper) break;
  }
  return r2(tax);
}

export interface AnnualTaxInput {
  annualIncome: number; // เงินได้พึงประเมิน 40(1) ทั้งปี (คาดการณ์)
  annualSso: number; // เงินสมทบประกันสังคมทั้งปี (คาดการณ์)
  annualPvd: number; // เงินสะสม PVD ทั้งปี (คาดการณ์)
  deductions: { code: string; amount: number }[]; // จากแบบ ล.ย.01 ของพนักงาน (amount = จำนวนคน สำหรับ per_unit)
}

export interface AnnualTaxResult {
  income: number;
  expense: number;
  allowances: { code: string; name: string; amount: number }[];
  totalAllowance: number;
  netIncome: number;
  tax: number;
}

export function annualTax(input: AnnualTaxInput, cfg: TaxConfig = DEFAULT_TAX_CONFIG): AnnualTaxResult {
  const income = Math.max(0, input.annualIncome);
  const expense = Math.min((income * cfg.expense.rate) / 100, cfg.expense.max);
  const allowances: { code: string; name: string; amount: number }[] = [];
  allowances.push({ code: "personal", name: "ลดหย่อนส่วนตัว", amount: cfg.personal_allowance });
  if (input.annualSso > 0) allowances.push({ code: "sso", name: "เงินสมทบประกันสังคม", amount: r2(input.annualSso) });

  // PVD: max X% of income, shares retirement cap
  const pvdCap = Math.min((income * (cfg.pvd_max_percent ?? 15)) / 100, cfg.retirement_group_max ?? 500000);
  const pvd = Math.min(input.annualPvd, pvdCap);
  // first 10,000 of PVD is deducted as allowance; excess is exempt income — net effect identical for withholding purposes
  let retirementUsed = pvd;
  if (pvd > 0) allowances.push({ code: "pvd", name: "เงินสะสมกองทุนสำรองเลี้ยงชีพ", amount: r2(pvd) });

  let insuranceUsed = 0;
  const defs = new Map(cfg.deductions.map((d) => [d.code, d]));
  const donations: { def: DeductionDef; amount: number }[] = [];

  for (const d of input.deductions) {
    const def = defs.get(d.code);
    if (!def || !(d.amount > 0)) continue;
    if (def.donation) {
      donations.push({ def, amount: d.amount * (def.multiplier ?? 1) });
      continue;
    }
    let amt = def.per_unit ? def.per_unit * d.amount : d.amount;
    if (def.max != null) amt = Math.min(amt, def.max);
    if (def.group === "insurance") {
      const room = Math.max(0, (cfg.insurance_group_max ?? Infinity) - insuranceUsed);
      amt = Math.min(amt, room);
      insuranceUsed += amt;
    }
    if (def.retirement) {
      const room = Math.max(0, (cfg.retirement_group_max ?? Infinity) - retirementUsed);
      // retirement funds generally also capped at 30% of income (RMF/SSF) — approximate with income limit
      amt = Math.min(amt, room, income * 0.3);
      retirementUsed += amt;
    }
    if (amt > 0) allowances.push({ code: def.code, name: def.name, amount: r2(amt) });
  }

  let totalAllowance = allowances.reduce((s, a) => s + a.amount, 0);
  let net = income - expense - totalAllowance;
  if (donations.length && net > 0) {
    const cap = (net * (cfg.donation_max_percent ?? 10)) / 100;
    let used = 0;
    for (const dn of donations) {
      const amt = Math.min(dn.amount, Math.max(0, cap - used));
      used += amt;
      if (amt > 0) allowances.push({ code: dn.def.code, name: dn.def.name, amount: r2(amt) });
    }
    totalAllowance += used;
    net -= used;
  }
  net = Math.max(0, r2(net));
  return { income: r2(income), expense: r2(expense), allowances, totalAllowance: r2(totalAllowance), netIncome: net, tax: progressiveTax(net, cfg.brackets) };
}

export interface MonthlyWithholdingInput {
  month: number; // 1-12 (pay month)
  /** months in the tax year this employee is expected to be paid from this month on, incl. this month (default 12-month+1) */
  remainingMonths?: number;
  currentRegular: number; // taxable regular income this period
  currentIrregular: number; // taxable irregular income this period (bonus, commission ...)
  ytdRegular: number; // before this period (incl. previous employer)
  ytdIrregular: number;
  ytdTax: number; // tax withheld before this period (incl. previous employer)
  currentSso: number;
  ytdSso: number;
  annualSsoMax: number;
  currentPvd: number;
  ytdPvd: number;
  deductions: { code: string; amount: number }[];
}

export interface MonthlyWithholdingResult {
  tax: number;
  projectedIncome: number;
  annualTaxWithoutCurrentIrregular: number;
  annualTaxWithCurrentIrregular: number;
  detail: AnnualTaxResult;
}

/**
 * Cumulative (self-correcting) withholding:
 *   projected = ytdRegular + currentRegular × remaining + ytdIrregular
 *   tax = (annualTax(projected) − ytdTax) / remaining  +  [annualTax(projected + currentIrregular) − annualTax(projected)]
 * In the last month remaining = 1 so the year settles exactly.
 */
export function monthlyWithholding(i: MonthlyWithholdingInput, cfg: TaxConfig = DEFAULT_TAX_CONFIG): MonthlyWithholdingResult {
  const remaining = Math.max(1, i.remainingMonths ?? 12 - i.month + 1);
  const projectedRegular = i.ytdRegular + i.currentRegular * remaining;
  const projectedSso = Math.min(i.ytdSso + i.currentSso * remaining, i.annualSsoMax);
  const projectedPvd = i.ytdPvd + i.currentPvd * remaining;

  const base = projectedRegular + i.ytdIrregular;
  const a = annualTax({ annualIncome: base, annualSso: projectedSso, annualPvd: projectedPvd, deductions: i.deductions }, cfg);
  const b =
    i.currentIrregular > 0
      ? annualTax({ annualIncome: base + i.currentIrregular, annualSso: projectedSso, annualPvd: projectedPvd, deductions: i.deductions }, cfg)
      : a;

  const regularPart = (a.tax - i.ytdTax) / remaining;
  const irregularPart = b.tax - a.tax;
  const tax = Math.max(0, r2(regularPart + irregularPart));
  return { tax, projectedIncome: r2(base + i.currentIrregular), annualTaxWithoutCurrentIrregular: a.tax, annualTaxWithCurrentIrregular: b.tax, detail: b };
}

// ------------------------------------------------------------------ Social security
export interface SsoConfig {
  rate_employee: number;
  rate_employer: number;
  floors: { from: string; floor: number }[];
  ceilings: { from: string; ceiling: number }[];
}

export const DEFAULT_SSO_CONFIG: SsoConfig = {
  rate_employee: 5,
  rate_employer: 5,
  floors: [{ from: "2000-01-01", floor: 1650 }],
  ceilings: [
    { from: "2000-01-01", ceiling: 15000 },
    { from: "2026-01-01", ceiling: 17500 },
    { from: "2029-01-01", ceiling: 20000 },
    { from: "2032-01-01", ceiling: 23000 },
  ],
};

function pickByDate<T extends { from: string }>(list: T[], date: string): T | undefined {
  return [...list].sort((a, b) => a.from.localeCompare(b.from)).filter((x) => x.from <= date).pop();
}

export function ssoLimits(payDate: string, cfg: SsoConfig = DEFAULT_SSO_CONFIG) {
  const floor = pickByDate(cfg.floors, payDate)?.floor ?? 1650;
  const ceiling = pickByDate(cfg.ceilings, payDate)?.ceiling ?? 15000;
  return { floor, ceiling, maxEmployee: Math.round((ceiling * cfg.rate_employee) / 100) };
}

/** contribution on the wage of one calendar month (SSO rounds to whole baht, .50 up) */
export function ssoContribution(wage: number, payDate: string, cfg: SsoConfig = DEFAULT_SSO_CONFIG, alreadyPaidThisMonth = 0) {
  const { floor, ceiling } = ssoLimits(payDate, cfg);
  const w = Math.min(Math.max(wage, wage > 0 ? floor : 0), ceiling);
  const emp = Math.max(0, Math.round((w * cfg.rate_employee) / 100) - alreadyPaidThisMonth);
  const er = Math.max(0, Math.round((w * cfg.rate_employer) / 100) - alreadyPaidThisMonth);
  return { wage: w, employee: emp, employer: er };
}
