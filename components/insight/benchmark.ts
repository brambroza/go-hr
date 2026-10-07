// Industry benchmark reference figures (settings key 'industry_benchmark') — editable by HR.
// The starter values are ROUGH ILLUSTRATIVE FIGURES for Thai manufacturing SMEs (2025-2026) so the screen is useful
// out of the box; they are not survey data. Customers should replace them with their own salary survey.

export interface BenchmarkBand {
  label: string;
  level_min: number;
  level_max: number;
  median: number; // market median monthly salary (THB)
}

export interface IndustryBenchmark {
  source: string;
  updated: string; // YYYY-MM-DD
  industry: string;
  bands: BenchmarkBand[];
  turnover_annual_percent: number;
  absent_rate_percent: number;
  late_rate_percent: number;
  employer_cost_ratio: number; // total employer cost ÷ base salary
}

export const STARTER_BENCHMARK: IndustryBenchmark = {
  source: "ค่าตั้งต้นสำหรับอ้างอิงคร่าว ๆ (ไม่ใช่ผลสำรวจ) — กรุณาแก้ไขตามผลสำรวจค่าจ้างที่บริษัทใช้",
  updated: "2026-01-01",
  industry: "อุตสาหกรรมการผลิต (SME)",
  bands: [
    { label: "พนักงานปฏิบัติการ", level_min: 1, level_max: 2, median: 12500 },
    { label: "พนักงานมีทักษะ / QC / ช่างเทคนิค", level_min: 3, level_max: 4, median: 16000 },
    { label: "เจ้าหน้าที่สำนักงาน / วิศวกรจบใหม่", level_min: 5, level_max: 7, median: 23000 },
    { label: "หัวหน้างาน / Supervisor", level_min: 8, level_max: 10, median: 33000 },
    { label: "ผู้จัดการแผนก / ฝ่าย", level_min: 11, level_max: 14, median: 65000 },
    { label: "ผู้บริหารระดับสูง", level_min: 15, level_max: 30, median: 150000 },
  ],
  turnover_annual_percent: 18,
  absent_rate_percent: 2,
  late_rate_percent: 5,
  employer_cost_ratio: 1.08,
};

export function bandOf(bench: IndustryBenchmark, level: number | null | undefined): BenchmarkBand | null {
  if (level == null) return null;
  return bench.bands.find((b) => level >= b.level_min && level <= b.level_max) ?? null;
}

export function validateBenchmark(b: IndustryBenchmark): string | null {
  if (!b.bands.length) return "ต้องมีอย่างน้อย 1 กลุ่มระดับงาน";
  for (const x of b.bands) {
    if (!x.label.trim()) return "กรอกชื่อกลุ่มระดับงานให้ครบ";
    if (!(x.level_min >= 0) || !(x.level_max >= x.level_min)) return `ช่วงระดับงานของ "${x.label}" ไม่ถูกต้อง`;
    if (!(x.median > 0)) return `กรอกค่ากลางเงินเดือนตลาดของ "${x.label}"`;
  }
  const sorted = [...b.bands].sort((a, c) => a.level_min - c.level_min);
  for (let i = 1; i < sorted.length; i++) if (sorted[i].level_min <= sorted[i - 1].level_max) return `ช่วงระดับงาน "${sorted[i - 1].label}" และ "${sorted[i].label}" ซ้อนกัน`;
  if (!(b.turnover_annual_percent >= 0 && b.turnover_annual_percent <= 100)) return "อัตราลาออกต้องอยู่ระหว่าง 0-100%";
  return null;
}
