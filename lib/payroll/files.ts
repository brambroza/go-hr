// Export files for payroll — public entry point (pure, tests in tests/payroll-files.test.ts)
//
//  tis620.ts       UTF-8 → TIS-620 / Windows-874 encoder, byte-aware truncation
//  file-engine.ts  data-driven layout engine (fixed width in BYTES / delimited, header/detail/trailer, encodings)
//  file-layouts.ts built-in layouts with their sources: RD ฟอร์แมตกลาง V2.0/V1.0 + RD Prep, SSO สปส.1-10,
//                  banks (KTB, LHB, KBank, SCB, BBL, BAY, TTB, CSV) + the variable catalog for the template editor
//  file-data.ts    maps payroll rows → variables and validates them (Thai error list)
//
// Source URLs, what is verified vs best-effort, and upload steps: docs/GOV-BANK-FILES.md

export { encodeTis620, decodeTis620, toTis620Text, truncateBytes, byteLength, type Encoding } from "./tis620";
export { renderFile, formatField, formatDate, formatAmount, toSatang, recordWidth, renderFileName, checkLayout, type FieldDef, type FileLayout, type FileKind, type Issue, type RenderedFile, type Vars } from "./file-engine";
export { BANK_NAMES, BUILTIN_LAYOUTS, VARIABLES, KIND_LABEL, STATUS_LABEL, SSO_TITLE_CODES, LEGACY_BANK_KEYS, builtinLayouts, findBuiltin, cloneLayout, accountNumber11, expectedAccountLengths } from "./file-layouts";
export { bankFileData, ssoFileData, rdFileData, pvdFileData, buildExport, ssoRound, stripPrefix, validTaxId, type BankRow, type BankBatch, type SsoRow, type SsoBatch, type RdRow, type RdBatch, type PvdRow, type PvdBatch } from "./file-data";

/** trigger a browser download of a rendered file */
export function downloadBuilt(f: { bytes: Uint8Array; mime: string; filename: string }) {
  const blob = new Blob([f.bytes as BlobPart], { type: f.mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = f.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
