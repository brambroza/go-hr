// PDPA conceal settings (settings.pdpa) — which sensitive fields are hidden until the viewer presses "แสดง".
// Pure, shared by the employee private tab, the payslip and the tests.

export interface PdpaMasks {
  mask_national_id: boolean;
  mask_bank_account: boolean;
  mask_salary: boolean;
}

export const DEFAULT_PDPA: PdpaMasks = { mask_national_id: true, mask_bank_account: true, mask_salary: true };

export type PdpaField = "national_id" | "bank_account" | "salary";

const KEY: Record<PdpaField, keyof PdpaMasks> = { national_id: "mask_national_id", bank_account: "mask_bank_account", salary: "mask_salary" };

/**
 * Is this field shown masked right now?
 * @param revealed - the viewer pressed "แสดง" (logged as VIEW_SENSITIVE); a revealed field is never masked
 */
export function isMasked(field: PdpaField, pdpa: Partial<PdpaMasks> | null | undefined, revealed: boolean): boolean {
  if (revealed) return false;
  const v = pdpa?.[KEY[field]];
  return v == null ? DEFAULT_PDPA[KEY[field]] : !!v;
}
