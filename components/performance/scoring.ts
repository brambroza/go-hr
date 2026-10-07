// Pure scoring helpers for evaluation forms & KPIs (safe on client and server)

export interface EvalCriterion { key: string; name: string; weight: number; description?: string }
export interface EvalSection { title: string; weight: number; criteria: EvalCriterion[] }
export interface EvalForm {
  id: number;
  name: string;
  form_type: string;
  scale_max: number;
  scale_labels: string[];
  sections: EvalSection[];
  kpi_weight: number;
  open_questions: string[];
  is_active?: boolean;
}

export type Scores = Record<string, number>;

/** weighted total in % (0–100); null when nothing has been rated */
export function formScore(form: Pick<EvalForm, "sections" | "scale_max">, scores: Scores): number | null {
  const max = form.scale_max || 5;
  let total = 0;
  let wSum = 0;
  let any = false;
  for (const s of form.sections ?? []) {
    const cw = s.criteria.reduce((a, c) => a + (Number(c.weight) || 0), 0) || s.criteria.length;
    let sec = 0;
    for (const c of s.criteria) {
      const v = scores[c.key];
      if (v == null) continue;
      any = true;
      sec += ((Number(c.weight) || (cw === s.criteria.length ? 1 : 0)) / cw) * (v / max);
    }
    total += (Number(s.weight) || 0) * sec;
    wSum += Number(s.weight) || 0;
  }
  if (!any) return null;
  return Math.round((total / (wSum || 100)) * 100 * 100) / 100;
}

export function sectionScore(section: EvalSection, scores: Scores, scaleMax: number): number | null {
  const cw = section.criteria.reduce((a, c) => a + (Number(c.weight) || 0), 0) || section.criteria.length;
  let sec = 0;
  let any = false;
  for (const c of section.criteria) {
    const v = scores[c.key];
    if (v == null) continue;
    any = true;
    sec += ((Number(c.weight) || (cw === section.criteria.length ? 1 : 0)) / cw) * (v / scaleMax);
  }
  return any ? Math.round(sec * 10000) / 100 : null;
}

export function missingCriteria(form: Pick<EvalForm, "sections">, scores: Scores): string[] {
  return (form.sections ?? []).flatMap((s) => s.criteria.filter((c) => scores[c.key] == null).map((c) => c.name));
}

/** validation messages for the form builder */
export function validateForm(form: Pick<EvalForm, "sections" | "kpi_weight" | "scale_max" | "scale_labels">): string[] {
  const errs: string[] = [];
  const sw = form.sections.reduce((a, s) => a + (Number(s.weight) || 0), 0);
  if (!form.sections.length) errs.push("ต้องมีอย่างน้อย 1 หมวด");
  if (form.sections.length && Math.abs(sw - 100) > 0.001) errs.push(`น้ำหนักหมวดรวมกันต้องเท่ากับ 100 (ตอนนี้ ${sw})`);
  form.sections.forEach((s, i) => {
    if (!s.title.trim()) errs.push(`หมวดที่ ${i + 1} ยังไม่มีชื่อ`);
    if (!s.criteria.length) errs.push(`หมวด "${s.title || i + 1}" ยังไม่มีหัวข้อประเมิน`);
    const cw = s.criteria.reduce((a, c) => a + (Number(c.weight) || 0), 0);
    if (s.criteria.length && Math.abs(cw - 100) > 0.001) errs.push(`น้ำหนักหัวข้อในหมวด "${s.title || i + 1}" รวมกันต้องเท่ากับ 100 (ตอนนี้ ${cw})`);
    s.criteria.forEach((c, j) => {
      if (!c.name.trim()) errs.push(`หมวด "${s.title || i + 1}" หัวข้อที่ ${j + 1} ยังไม่มีชื่อ`);
    });
  });
  if (form.kpi_weight < 0 || form.kpi_weight > 100) errs.push("น้ำหนัก KPI ต้องอยู่ระหว่าง 0–100");
  if (form.scale_max < 2 || form.scale_max > 10) errs.push("ระดับคะแนนต้องอยู่ระหว่าง 2–10");
  if (form.scale_labels.length && form.scale_labels.length !== form.scale_max) errs.push(`คำอธิบายระดับคะแนนต้องมี ${form.scale_max} ระดับ`);
  return errs;
}

export interface ScoringStep { min: number; score: number }

/** KPI achievement % by direction */
export function kpiAchievement(actual: number | null | undefined, target: number | null | undefined, direction: string): number | null {
  if (actual == null || isNaN(actual)) return null;
  let ach: number;
  if (target == null || target === 0) {
    if (direction === "lower") ach = actual <= 0 ? 100 : Math.max(0, 100 - actual * 10);
    else return null;
  } else if (direction === "lower") ach = actual <= 0 ? 120 : (target / actual) * 100;
  else if (direction === "exact") ach = Math.max(0, 100 - (Math.abs(actual - target) / Math.abs(target)) * 100);
  else ach = (actual / target) * 100;
  return Math.min(Math.max(ach, 0), 150);
}

/** KPI score 0–100: through the scoring table (normalised by its max score) or linear capped at 100. Mirrors app.kpi_score */
export function kpiScore(actual: number | null | undefined, target: number | null | undefined, direction: string, scoring?: ScoringStep[] | null): number | null {
  const ach = kpiAchievement(actual, target, direction);
  if (ach == null) return null;
  if (scoring && scoring.length) {
    const mx = Math.max(...scoring.map((s) => Number(s.score)));
    const step = [...scoring].sort((a, b) => b.min - a.min).find((s) => ach >= s.min);
    return Math.round((100 * (step ? Number(step.score) : 0)) / (mx || 1) * 100) / 100;
  }
  return Math.round(Math.min(ach, 100) * 100) / 100;
}

export interface GradeStep { grade: string; min: number }
export function gradeOf(score: number | null | undefined, scale: GradeStep[]): string | null {
  if (score == null) return null;
  return [...scale].sort((a, b) => b.min - a.min).find((g) => score >= g.min)?.grade ?? null;
}

/** final = competency×(1−kpi%) + kpi×kpi%; needs a competency score (no KPI → competency only). Mirrors eval_cycle_compute */
export function finalScore(comp: number | null, kpi: number | null, kpiWeight: number): number | null {
  const kw = (kpiWeight || 0) / 100;
  if (comp == null) return null;
  if (kpi != null) return Math.round((comp * (1 - kw) + kpi * kw) * 100) / 100;
  return comp;
}
