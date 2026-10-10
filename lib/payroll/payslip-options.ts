// Payslip display options read from settings.payroll (+ settings.pdpa). Pure so it can be unit tested;
// lib/payroll/payslip-data.ts loads the rows and calls payslipOptions().

export interface PayslipOptions {
  /** show the year-to-date block (เงินได้สะสม ภาษีสะสม ...) */
  showYtd: boolean;
  /** free text printed above the footer, null = none */
  note: string | null;
  /** print the bank account masked (PDPA) */
  maskBankAccount: boolean;
}

export const DEFAULT_PAYSLIP_OPTIONS: PayslipOptions = { showYtd: true, note: null, maskBankAccount: true };

export function payslipOptions(payroll: Record<string, unknown> | null | undefined, pdpa: Record<string, unknown> | null | undefined): PayslipOptions {
  const note = typeof payroll?.payslip_note === "string" ? payroll.payslip_note.trim() : "";
  return {
    showYtd: payroll?.payslip_show_ytd == null ? true : !!payroll.payslip_show_ytd,
    note: note || null,
    maskBankAccount: pdpa?.mask_bank_account == null ? true : !!pdpa.mask_bank_account,
  };
}
