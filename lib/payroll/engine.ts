// Payroll calculation for one employee in one period — pure function (unit tested).
import { monthlyWithholding, ssoContribution, ssoLimits, DEFAULT_SSO_CONFIG, DEFAULT_TAX_CONFIG, type SsoConfig, type TaxConfig } from "./tax";

export interface PayItemDef {
  id: number;
  code: string;
  name: string;
  category: string;
  direction: 1 | -1;
  is_taxable: boolean;
  is_sso: boolean;
  is_pvd_base: boolean;
  is_regular: boolean;
  calc_type: string;
  rate: number | null;
  system_key: string | null;
}

export interface PayrollConfig {
  daily_divisor: number;
  hours_per_day: number;
  deduct_absent: boolean;
  deduct_late: boolean;
  deduct_early: boolean;
  prorate_new_joiner: boolean;
  /** settings.payroll.round_mode — satang = 2 decimals (default), baht = whole baht per line and total */
  round_mode: "satang" | "baht";
}

export const DEFAULT_PAYROLL_CONFIG: PayrollConfig = {
  daily_divisor: 30,
  hours_per_day: 8,
  deduct_absent: true,
  deduct_late: true,
  deduct_early: true,
  prorate_new_joiner: true,
  round_mode: "satang",
};

export interface PeriodInput {
  pay_year: number;
  pay_month: number;
  start_date: string;
  end_date: string;
  pay_date: string;
  period_type: string;
  include_salary: boolean;
  include_attendance: boolean;
  include_constants: boolean;
  include_tax: boolean;
  include_sso: boolean;
  include_pvd: boolean;
}

export interface AttendanceInput {
  work_days: number; // วันที่มาทำงาน
  paid_holiday_days: number; // วันหยุดนักขัตฤกษ์ที่ได้รับค่าจ้าง (รายวัน)
  paid_leave_days: number; // วันลาที่ได้รับค่าจ้าง (เต็มวัน-equivalent)
  unpaid_leave_days: number; // วันลาไม่ได้รับค่าจ้าง (รวมส่วนที่ได้ไม่เต็ม เช่น 50%)
  absent_days: number;
  late_minutes: number;
  early_minutes: number;
  work_minutes: number; // สำหรับรายชั่วโมง
  ot_minutes: Record<string, number>;
  late_count: number;
}

export interface LineInput {
  item: PayItemDef;
  amount: number;
  qty?: number | null;
  note?: string | null;
  source?: string;
  source_id?: number | null;
  /** count as irregular income for the tax projection even if the pay item is regular (retro pay of earlier months) */
  irregular?: boolean;
}

export interface EmployeePayInput {
  employee: { id: number; employee_type: string; hire_date: string; resign_date: string | null };
  priv: {
    salary: number;
    salary_unit: "month" | "day" | "hour";
    sso_enabled: boolean;
    pvd_enabled: boolean;
    pvd_employee_rate: number;
    pvd_employer_rate: number;
    tax_method: "annualized" | "none" | "fixed_rate";
    tax_fixed_rate: number | null;
  };
  period: PeriodInput;
  att: AttendanceInput;
  items: Record<string, PayItemDef>; // by system_key
  constants: LineInput[];
  adjustments: LineInput[];
  loans: LineInput[];
  advances: LineInput[];
  guarantee: LineInput | null;
  diligence?: { enabled: boolean; steps: number[]; prevStep: number; item: PayItemDef | null } | null;
  ytd: { regular: number; irregular: number; tax: number; sso: number; pvd: number };
  monthPrev: { regular: number; irregular: number; tax: number; sso_wage: number; sso_employee: number; sso_employer: number };
  deductions: { code: string; amount: number }[];
  cfg?: Partial<PayrollConfig>;
  taxCfg?: TaxConfig;
  ssoCfg?: SsoConfig;
  /** paid months remaining in the year incl. this one; default 12 - month + 1 (or fewer if resigning) */
  remainingMonths?: number;
}

export interface EntryLine {
  pay_item_id: number | null;
  code: string;
  name: string;
  category: string;
  direction: 1 | -1;
  qty: number | null;
  rate: number | null;
  amount: number;
  is_taxable: boolean;
  is_sso: boolean;
  is_regular: boolean;
  is_pvd_base: boolean;
  source: string;
  source_id: number | null;
}

export interface EntryResult {
  lines: EntryLine[];
  base_salary: number;
  total_income: number;
  total_deduction: number;
  taxable_income: number;
  sso_wage: number;
  sso_employee: number;
  sso_employer: number;
  pvd_employee: number;
  pvd_employer: number;
  tax: number;
  net_pay: number;
  ytd_income: number;
  ytd_tax: number;
  ytd_sso: number;
  ytd_pvd: number;
  rates: { daily: number; hourly: number };
  detail: Record<string, unknown>;
  warnings: string[];
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Round a money amount per settings.payroll.round_mode ("baht" = whole baht, anything else = satang) */
export function roundMoney(n: number, mode: PayrollConfig["round_mode"] | string | undefined): number {
  return mode === "baht" ? Math.round(n + Number.EPSILON) : r2(n);
}

const OT_KEYS: Record<string, string> = { "1": "ot_1", "1.5": "ot_1_5", "2": "ot_2", "3": "ot_3" };

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86_400_000) + 1;
}

export function computeEntry(input: EmployeePayInput): EntryResult {
  const cfg = { ...DEFAULT_PAYROLL_CONFIG, ...(input.cfg ?? {}) };
  const taxCfg = input.taxCfg ?? DEFAULT_TAX_CONFIG;
  const ssoCfg = input.ssoCfg ?? DEFAULT_SSO_CONFIG;
  const { priv, period, att, items } = input;
  const lines: EntryLine[] = [];
  const warnings: string[] = [];

  const rm = (n: number) => roundMoney(n, cfg.round_mode);
  const push = (it: PayItemDef | undefined, amount: number, opts: Partial<EntryLine> = {}) => {
    if (!it) return;
    const a = rm(amount);
    if (!a) return;
    // a negative amount reverses the item (e.g. "ยกเลิกสวัสดิการ" after payment, retro refund of a deduction):
    // keep the amount positive and flip the direction, so it is taken back instead of paid again
    lines.push({
      pay_item_id: it.id,
      code: it.code,
      name: opts.name ?? it.name,
      category: it.category,
      direction: a < 0 ? (-it.direction as 1 | -1) : it.direction,
      qty: opts.qty ?? null,
      rate: opts.rate ?? null,
      amount: Math.abs(a),
      is_taxable: it.is_taxable,
      is_sso: it.is_sso,
      is_regular: opts.is_regular ?? it.is_regular,
      is_pvd_base: it.is_pvd_base,
      source: opts.source ?? "auto",
      source_id: opts.source_id ?? null,
    });
  };

  // ---- rates -------------------------------------------------------------
  const salary = Number(priv.salary) || 0;
  let daily = 0;
  let hourly = 0;
  if (priv.salary_unit === "month") {
    daily = salary / cfg.daily_divisor;
    hourly = daily / cfg.hours_per_day;
  } else if (priv.salary_unit === "day") {
    daily = salary;
    hourly = salary / cfg.hours_per_day;
  } else {
    hourly = salary;
    daily = salary * cfg.hours_per_day;
  }

  // ---- base salary / wage --------------------------------------------------------
  let base = 0;
  if (period.include_salary) {
    if (priv.salary_unit === "month") {
      const share = period.period_type === "semi_monthly" ? 0.5 : 1;
      base = salary * share;
      if (cfg.prorate_new_joiner) {
        const from = input.employee.hire_date > period.start_date ? input.employee.hire_date : period.start_date;
        const to = input.employee.resign_date && input.employee.resign_date < period.end_date ? input.employee.resign_date : period.end_date;
        const periodDays = daysBetween(period.start_date, period.end_date);
        const employedDays = Math.max(0, daysBetween(from, to));
        if (employedDays < periodDays) {
          base = Math.min(base, daily * employedDays);
          warnings.push(`คำนวณเงินเดือนตามสัดส่วน ${employedDays} วัน`);
        }
      }
      push(items.salary, base, { qty: 1, rate: salary });
    } else if (priv.salary_unit === "day") {
      const paidDays = att.work_days + att.paid_holiday_days + att.paid_leave_days;
      base = daily * paidDays;
      push(items.salary, base, { qty: r2(paidDays), rate: daily, name: `ค่าจ้างรายวัน (${r2(paidDays)} วัน)` });
    } else {
      const hours = att.work_minutes / 60 + att.paid_leave_days * cfg.hours_per_day;
      base = hourly * hours;
      push(items.salary, base, { qty: r2(hours), rate: hourly, name: `ค่าจ้างรายชั่วโมง (${r2(hours)} ชม.)` });
    }
  }

  // ---- attendance-based ---------------------------------------------------------
  let diligenceStep: number | null = null;
  if (period.include_attendance) {
    if (priv.salary_unit === "month") {
      if (cfg.deduct_absent && att.absent_days > 0) push(items.absent, daily * att.absent_days, { qty: att.absent_days, rate: daily });
      if (att.unpaid_leave_days > 0) push(items.unpaid_leave, daily * att.unpaid_leave_days, { qty: r2(att.unpaid_leave_days), rate: daily });
    }
    // hourly pay is counted from the minutes actually worked, so the late / early minutes are already unpaid —
    // deducting them as well took the same time twice
    const timeDeductible = priv.salary_unit !== "hour";
    if (timeDeductible && cfg.deduct_late && att.late_minutes > 0) push(items.late, (hourly / 60) * att.late_minutes, { qty: att.late_minutes, rate: hourly / 60 });
    if (timeDeductible && cfg.deduct_early && att.early_minutes > 0) push(items.early, (hourly / 60) * att.early_minutes, { qty: att.early_minutes, rate: hourly / 60 });
    for (const [rate, minutes] of Object.entries(att.ot_minutes ?? {})) {
      if (!minutes) continue;
      const it = items[OT_KEYS[rate] ?? "ot_1_5"];
      const mult = Number(rate);
      push(it, (minutes / 60) * hourly * mult, { qty: r2(minutes / 60), rate: r2(hourly * mult), name: `${it?.name ?? "ค่าล่วงเวลา"}${OT_KEYS[rate] ? "" : ` (${rate} เท่า)`}` });
    }
    // เบี้ยขยัน (ขั้นบันได)
    if (input.diligence?.enabled && input.diligence.item && input.diligence.steps.length) {
      const eligible = att.late_count === 0 && att.absent_days === 0 && att.unpaid_leave_days === 0;
      const step = eligible ? Math.min(input.diligence.prevStep + 1, input.diligence.steps.length) : 0;
      diligenceStep = step;
      if (step > 0) push(input.diligence.item, input.diligence.steps[step - 1], { qty: step, name: `${input.diligence.item.name} (ขั้น ${step})` });
    }
  }

  // ---- constants & one-offs --------------------------------------------------------
  const lineFrom = (l: LineInput, source: string) => {
    let amount = Number(l.amount) || 0;
    if (l.item.calc_type === "per_day") amount = amount * (l.qty ?? att.work_days);
    else if (l.item.calc_type === "per_hour") amount = amount * (l.qty ?? att.work_minutes / 60);
    else if (l.item.calc_type === "percent_salary") amount = (salary * (l.item.rate ?? amount)) / 100;
    push(l.item, amount, { qty: l.qty ?? null, source: l.source ?? source, source_id: l.source_id ?? null, name: l.note ? `${l.item.name} — ${l.note}` : undefined, is_regular: l.irregular ? false : undefined });
  };
  if (period.include_constants) input.constants.forEach((l) => lineFrom(l, "constant"));
  input.adjustments.forEach((l) => lineFrom(l, l.source ?? "manual"));

  // ---- taxable / SSO / PVD bases -----------------------------------------------
  const sum = (f: (l: EntryLine) => boolean) => lines.filter(f).reduce((s, l) => s + l.direction * l.amount, 0);
  const totalIncomeGross = lines.filter((l) => l.direction === 1).reduce((s, l) => s + l.amount, 0);
  const regularTaxable = sum((l) => l.is_taxable && l.is_regular);
  const irregularTaxable = sum((l) => l.is_taxable && !l.is_regular);
  const taxable = regularTaxable + irregularTaxable;
  const ssoWagePeriod = Math.max(0, sum((l) => l.is_sso));
  const pvdBase = Math.max(0, sum((l) => l.is_pvd_base));

  // SSO: computed on the whole calendar month's wage, minus what earlier periods of the month already took
  let ssoEmp = 0;
  let ssoEr = 0;
  let ssoWage = 0;
  if (period.include_sso && priv.sso_enabled) {
    const monthWage = ssoWagePeriod + input.monthPrev.sso_wage;
    const c = ssoContribution(monthWage, period.pay_date, ssoCfg);
    ssoWage = c.wage - Math.min(input.monthPrev.sso_wage, c.wage);
    ssoEmp = Math.max(0, c.employee - input.monthPrev.sso_employee);
    ssoEr = Math.max(0, c.employer - input.monthPrev.sso_employer);
    if (ssoEmp) lines.push(mkSys(items.sso, ssoEmp, "ประกันสังคม", cfg.round_mode));
  }

  let pvdEmp = 0;
  let pvdEr = 0;
  if (period.include_pvd && priv.pvd_enabled) {
    // rounded the same way as the pay line so entry.pvd_employee always equals the PVD line (also in baht mode)
    pvdEmp = rm((pvdBase * (Number(priv.pvd_employee_rate) || 0)) / 100);
    pvdEr = rm((pvdBase * (Number(priv.pvd_employer_rate) || 0)) / 100);
    if (pvdEmp) lines.push(mkSys(items.pvd, pvdEmp, "กองทุนสำรองเลี้ยงชีพ", cfg.round_mode));
  }

  // ---- tax ---------------------------------------------------------------------------
  let tax = 0;
  let taxDetail: unknown = null;
  if (period.include_tax && priv.tax_method !== "none") {
    if (priv.tax_method === "fixed_rate") {
      tax = rm((Math.max(0, taxable) * (Number(priv.tax_fixed_rate) || 0)) / 100);
    } else {
      const { maxEmployee } = ssoLimits(period.pay_date, ssoCfg);
      const monthRegular = regularTaxable + input.monthPrev.regular;
      const monthIrregular = irregularTaxable + input.monthPrev.irregular;
      const w = monthlyWithholding(
        {
          month: period.pay_month,
          remainingMonths: input.remainingMonths,
          currentRegular: Math.max(0, monthRegular),
          currentIrregular: Math.max(0, monthIrregular),
          ytdRegular: input.ytd.regular,
          ytdIrregular: input.ytd.irregular,
          ytdTax: input.ytd.tax,
          currentSso: ssoEmp + input.monthPrev.sso_employee,
          ytdSso: input.ytd.sso,
          annualSsoMax: maxEmployee * 12,
          currentPvd: pvdEmp,
          ytdPvd: input.ytd.pvd,
          deductions: input.deductions,
        },
        taxCfg,
      );
      tax = Math.max(0, rm(w.tax - input.monthPrev.tax)); // same rounding as the tax line (entry.tax feeds ภ.ง.ด.1)
      taxDetail = { projected_income: w.projectedIncome, annual_tax: w.annualTaxWithCurrentIrregular, allowances: w.detail.allowances, net_income: w.detail.netIncome };
    }
    if (tax) lines.push(mkSys(items.tax, tax, "ภาษีเงินได้หัก ณ ที่จ่าย", cfg.round_mode));
  }

  // ---- after-tax deductions (loans, advances, guarantee) ---------------------------------
  input.loans.forEach((l) => push(l.item, l.amount, { source: "loan", source_id: l.source_id ?? null, name: l.note ? `${l.item.name} — ${l.note}` : undefined }));
  input.advances.forEach((l) => push(l.item, l.amount, { source: "advance", source_id: l.source_id ?? null }));
  if (input.guarantee) push(input.guarantee.item, input.guarantee.amount, { source: "guarantee", source_id: input.guarantee.source_id ?? null });

  const totalIncome = rm(lines.filter((l) => l.direction === 1).reduce((s, l) => s + l.amount, 0));
  const totalDeduction = rm(lines.filter((l) => l.direction === -1).reduce((s, l) => s + l.amount, 0));
  const net = rm(totalIncome - totalDeduction);
  if (net < 0) warnings.push("เงินได้สุทธิติดลบ — ตรวจสอบรายการหัก");
  void totalIncomeGross;

  return {
    lines,
    base_salary: r2(base),
    total_income: totalIncome,
    total_deduction: totalDeduction,
    taxable_income: r2(taxable),
    sso_wage: r2(ssoWage),
    sso_employee: ssoEmp,
    sso_employer: ssoEr,
    pvd_employee: pvdEmp,
    pvd_employer: pvdEr,
    tax,
    net_pay: net,
    ytd_income: r2(input.ytd.regular + input.ytd.irregular + input.monthPrev.regular + input.monthPrev.irregular + Math.max(0, taxable)),
    ytd_tax: r2(input.ytd.tax + input.monthPrev.tax + tax),
    ytd_sso: r2(input.ytd.sso + input.monthPrev.sso_employee + ssoEmp),
    ytd_pvd: r2(input.ytd.pvd + pvdEmp),
    rates: { daily: r2(daily), hourly: r2(hourly) },
    detail: { tax: taxDetail, regular_taxable: r2(regularTaxable), irregular_taxable: r2(irregularTaxable), pvd_base: r2(pvdBase), diligence_step: diligenceStep },
    warnings,
  };
}

function mkSys(it: PayItemDef | undefined, amount: number, fallback: string, mode: PayrollConfig["round_mode"] = "satang"): EntryLine {
  return {
    pay_item_id: it?.id ?? null,
    code: it?.code ?? fallback,
    name: it?.name ?? fallback,
    category: it?.category ?? "auto",
    direction: -1,
    qty: null,
    rate: null,
    amount: roundMoney(amount, mode),
    is_taxable: false,
    is_sso: false,
    is_regular: true,
    is_pvd_base: false,
    source: "auto",
    source_id: null,
  };
}
