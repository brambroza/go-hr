import { test } from "node:test";
import assert from "node:assert/strict";
import { progressiveTax, annualTax, monthlyWithholding, ssoContribution, DEFAULT_TAX_CONFIG } from "../lib/payroll/tax";

const cfg = { ...DEFAULT_TAX_CONFIG, deductions: [
  { code: "life_insurance", name: "ประกันชีวิต", max: 100000, group: "insurance" },
  { code: "health_insurance", name: "ประกันสุขภาพ", max: 25000, group: "insurance" },
  { code: "child", name: "บุตร", per_unit: 30000 },
  { code: "donation_edu", name: "บริจาคการศึกษา", multiplier: 2, donation: true },
] };

test("progressive brackets", () => {
  assert.equal(progressiveTax(150000), 0);
  assert.equal(progressiveTax(300000), 7500);
  assert.equal(progressiveTax(500000), 27500);
  assert.equal(progressiveTax(1000000), 115000);
  assert.equal(progressiveTax(6000000), 1615000);
});

test("SSO 2026 ceiling 17,500 → 875", () => {
  assert.deepEqual(ssoContribution(30000, "2026-10-31"), { wage: 17500, employee: 875, employer: 875 });
  assert.deepEqual(ssoContribution(30000, "2025-12-31"), { wage: 15000, employee: 750, employer: 750 });
  assert.equal(ssoContribution(1000, "2026-10-31").employee, 83); // floor 1,650 × 5% = 82.5 → 83
  assert.equal(ssoContribution(12345, "2026-10-31").employee, 617);
});

test("annual tax 30,000/month", () => {
  const r = annualTax({ annualIncome: 360000, annualSso: 10500, annualPvd: 0, deductions: [] });
  assert.equal(r.netIncome, 189500);
  assert.equal(r.tax, 1975);
});

test("insurance group cap and per-unit child", () => {
  const r = annualTax({ annualIncome: 1200000, annualSso: 10500, annualPvd: 0, deductions: [
    { code: "life_insurance", amount: 90000 }, { code: "health_insurance", amount: 25000 }, { code: "child", amount: 2 } ] }, cfg);
  const ins = r.allowances.filter((a) => a.code.endsWith("insurance")).reduce((s, a) => s + a.amount, 0);
  assert.equal(ins, 100000);
  assert.equal(r.allowances.find((a) => a.code === "child")!.amount, 60000);
});

test("monthly withholding settles exactly by December", () => {
  let ytdTax = 0, ytdReg = 0, ytdIrr = 0, ytdSso = 0;
  for (let m = 1; m <= 12; m++) {
    const bonus = m === 3 ? 100000 : 0;
    const salary = m >= 7 ? 55000 : 50000; // raise mid-year
    const r = monthlyWithholding({ month: m, currentRegular: salary, currentIrregular: bonus, ytdRegular: ytdReg, ytdIrregular: ytdIrr,
      ytdTax, currentSso: 875, ytdSso, annualSsoMax: 10500, currentPvd: 0, ytdPvd: 0, deductions: [] });
    ytdTax += r.tax; ytdReg += salary; ytdIrr += bonus; ytdSso += 875;
  }
  const actual = annualTax({ annualIncome: ytdReg + ytdIrr, annualSso: 10500, annualPvd: 0, deductions: [] });
  assert.ok(Math.abs(Math.round(ytdTax * 100) / 100 - actual.tax) < 0.05, `withheld ${ytdTax} vs ${actual.tax}`);
});

test("monthly withholding 50,000 flat", () => {
  const r = monthlyWithholding({ month: 1, currentRegular: 50000, currentIrregular: 0, ytdRegular: 0, ytdIrregular: 0, ytdTax: 0,
    currentSso: 875, ytdSso: 0, annualSsoMax: 10500, currentPvd: 0, ytdPvd: 0, deductions: [] });
  assert.equal(r.tax, 1704.17);
});
