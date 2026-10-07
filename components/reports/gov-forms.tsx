// Printable government forms laid out after the official paper forms (A4 portrait, black on white).
//   ภ.ง.ด.1 / ภ.ง.ด.1ก (แบบ + ใบแนบ), หนังสือรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ), สปส.1-10 ส่วนที่ 1 + 2
// Layout references: docs/GOV-BANK-FILES.md. The forms are rebuilt in HTML (not overlaid on the agencies' PDFs) — the
// official PDFs cannot be bundled reliably (download servers block automated fetches and change URLs), and HTML keeps
// Thai text crisp in any browser and prints 1:1 on A4.
import type { ReactNode } from "react";
import { bahtText, TH_MONTHS } from "@/lib/format";

export const fmt = (n: number) => (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

/** A4 print rules for multi-sheet forms: every .gov-sheet is one page */
export function GovPrintStyle() {
  return (
    <style>{`
      .gov-sheet { width: 100%; max-width: 190mm; margin: 0 auto 24px; color: #000; font-size: 11.5px; line-height: 1.45; }
      .gov-sheet table { border-collapse: collapse; width: 100%; }
      .gov-sheet .bx td, .gov-sheet .bx th { border: 1px solid #000; padding: 2px 4px; vertical-align: top; }
      .gov-sheet .bx th { font-weight: 600; text-align: center; vertical-align: middle; }
      .gov-sheet .dots { border-bottom: 1px dotted #000; display: inline-block; min-width: 2em; padding: 0 4px; line-height: 1.2; }
      @media print {
        @page { size: A4 portrait; margin: 9mm 10mm; }
        .gov-sheet { margin: 0; max-width: none; break-after: page; page-break-after: always; }
        .gov-sheet:last-child { break-after: auto; page-break-after: auto; }
        .report-paper { padding: 0 !important; border: 0 !important; max-width: none !important; }
      }
    `}</style>
  );
}

/** digit boxes: groups e.g. [1,4,5,2,1] for a 13-digit tax id ( □-□□□□-□□□□□-□□-□ ) */
export function DigitBoxes({ value, groups = [1, 4, 5, 2, 1], size = 15 }: { value: string | null | undefined; groups?: number[]; size?: number }) {
  const d = digits(value);
  let i = 0;
  return (
    <span className="inline-flex items-center align-middle leading-none">
      {groups.map((g, gi) => (
        <span key={gi} className="inline-flex items-center">
          {gi > 0 && <span className="px-[1px]">-</span>}
          {Array.from({ length: g }).map((_, k) => {
            const ch = d[i++] ?? "";
            return (
              <span key={k} className="num inline-grid place-items-center border border-black text-[11px] font-semibold" style={{ width: size, height: size + 2, marginLeft: k ? -1 : 0 }}>
                {ch}
              </span>
            );
          })}
        </span>
      ))}
    </span>
  );
}

export function Box({ on, children }: { on?: boolean; children?: ReactNode }) {
  return (
    <span className="mr-3 inline-flex items-center gap-1 whitespace-nowrap">
      <span className="inline-grid size-[13px] place-items-center border border-black text-[11px] leading-none font-bold">{on ? "✓" : ""}</span>
      {children}
    </span>
  );
}

/** "12,345.67" split into baht | satang cells (official forms print satang in its own column) */
export function BahtCells({ n, blank }: { n: number; blank?: boolean }) {
  if (blank) return (<><td /><td className="w-8" /></>);
  const [b, s] = fmt(n).split(".");
  return (
    <>
      <td className="num text-right">{b}</td>
      <td className="num w-8 text-center">{s}</td>
    </>
  );
}

export function Dots({ children, w }: { children?: ReactNode; w?: number | string }) {
  return (
    <span className="dots" style={w ? { minWidth: w } : undefined}>
      {children ?? " "}
    </span>
  );
}

export function SignBlock({ role, date, extra }: { role: string; date?: string; extra?: ReactNode }) {
  return (
    <div className="text-center leading-7">
      <div>
        ลงชื่อ <Dots w="48mm" /> {role}
      </div>
      <div>
        ( <Dots w="46mm" /> )
      </div>
      <div>
        ตำแหน่ง <Dots w="44mm" />
      </div>
      <div>{date ?? <>ยื่นวันที่ <Dots w="8mm" /> เดือน <Dots w="20mm" /> พ.ศ. <Dots w="12mm" /></>}</div>
      {extra}
    </div>
  );
}

export function Seal() {
  return <div className="mx-auto grid size-[22mm] place-items-center rounded-full border border-dashed border-black text-center text-[9.5px] leading-tight">ประทับตรา<br />นิติบุคคล<br />(ถ้ามี)</div>;
}

export function chunk<T>(list: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n));
  return out.length ? out : [[]];
}

export function thMonthName(m: number) {
  return TH_MONTHS[m - 1] ?? "";
}

export { bahtText };

/** 2026-09-30 → 30/09/2569 */
export function dmyBE(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? `${m[3]}/${m[2]}/${Number(m[1]) + 543}` : "";
}
