// Printable Thai warning letter (หนังสือเตือน) — A4, no hooks (usable from server components)
import { thDate } from "@/lib/format";
import { WARNING_LEVEL } from "./labels";

export interface WarningLetterData {
  doc_no: string | null; issue_date: string; level: string; offense: string; detail: string | null; incident_date: string | null; rule_reference: string | null;
  penalty: string | null; suspension_days: number | null; expire_date: string | null; witness: string | null; acknowledged_at: string | null; employee_comment: string | null;
}
export interface WarningEmployee { code: string; prefix: string | null; first_name: string; last_name: string; position_name: string | null; org_unit_name: string | null }
export interface WarningCompany { name: string; address?: string; phone?: string; tax_id?: string; logo_url?: string | null }

export function WarningLetter({ company, emp, w, issuer }: { company: WarningCompany; emp: WarningEmployee; w: WarningLetterData; issuer?: string | null }) {
  const name = `${emp.prefix ?? ""}${emp.first_name} ${emp.last_name}`;
  const title = w.level === "verbal" ? "บันทึกการตักเตือนด้วยวาจา" : w.level === "termination" ? "หนังสือเลิกจ้าง" : w.level === "suspension" ? "หนังสือลงโทษพักงาน" : "หนังสือเตือน";
  return (
    <article className="mx-auto w-full max-w-[190mm] bg-white text-[14px] leading-relaxed text-black print:text-[13.5px]">
      <header className="flex items-start justify-between gap-4 border-b-2 border-black pb-2">
        <div className="flex items-start gap-3">
          {company.logo_url && (
             
            <img src={company.logo_url} alt="" className="h-12 w-12 object-contain" />
          )}
          <div>
            <div className="text-[16px] font-semibold">{company.name}</div>
            {company.address && <div className="text-[12px]">{company.address}</div>}
            {company.phone && <div className="text-[12px]">โทร {company.phone}</div>}
          </div>
        </div>
        <div className="shrink-0 text-right text-[12px]">
          <div>เลขที่ <span className="num">{w.doc_no ?? "-"}</span></div>
          <div>วันที่ {thDate(w.issue_date, "long")}</div>
        </div>
      </header>

      <h1 className="mt-5 text-center text-[20px] font-semibold">{title}</h1>
      <p className="text-center text-[13px]">({WARNING_LEVEL[w.level]})</p>

      <div className="mt-5 grid grid-cols-[7rem_1fr] gap-y-1">
        <span>เรื่อง</span><span>{w.offense}</span>
        <span>เรียน</span><span>{name} รหัสพนักงาน {emp.code}</span>
        <span>ตำแหน่ง</span><span>{[emp.position_name, emp.org_unit_name].filter(Boolean).join(" / ") || "-"}</span>
      </div>

      <p className="mt-4 indent-12">
        ด้วยปรากฏว่า เมื่อ{w.incident_date ? `วันที่ ${thDate(w.incident_date, "long")}` : "ระยะที่ผ่านมา"} ท่านได้กระทำผิดในเรื่อง “{w.offense}”
        {w.detail ? ` กล่าวคือ ${w.detail}` : ""}
        {w.rule_reference ? ` ซึ่งเป็นการฝ่าฝืนข้อบังคับเกี่ยวกับการทำงานของบริษัท ${w.rule_reference}` : " ซึ่งเป็นการฝ่าฝืนข้อบังคับเกี่ยวกับการทำงานของบริษัท"}
      </p>
      <p className="mt-2 indent-12">
        บริษัทจึงมีหนังสือฉบับนี้มาเพื่อ{w.level === "termination" ? "แจ้งเลิกจ้าง" : w.level === "suspension" ? `ลงโทษพักงานโดยไม่ได้รับค่าจ้างเป็นเวลา ${w.suspension_days ?? "-"} วัน` : "ตักเตือนเป็นลายลักษณ์อักษร"}
        {w.penalty ? ` และ${w.penalty}` : ""}
        {w.level !== "termination" &&
          " และขอให้ท่านปรับปรุงตนเองมิให้กระทำผิดซ้ำอีก หากท่านกระทำผิดในลักษณะเดียวกันซ้ำภายในระยะเวลาที่หนังสือเตือนฉบับนี้มีผล บริษัทจะพิจารณาลงโทษในขั้นที่สูงขึ้น ซึ่งอาจถึงขั้นเลิกจ้างโดยไม่จ่ายค่าชดเชยตามมาตรา 119 (4) แห่งพระราชบัญญัติคุ้มครองแรงงาน พ.ศ. 2541"}
      </p>
      {w.expire_date && w.level !== "termination" && <p className="mt-2 indent-12">หนังสือเตือนฉบับนี้มีผลตั้งแต่วันที่ {thDate(w.issue_date, "long")} ถึงวันที่ {thDate(w.expire_date, "long")}</p>}

      <div className="mt-10 grid grid-cols-2 gap-4 text-center text-[13px] sm:gap-8 sm:text-[14px]">
        <div>
          <div className="mx-auto mt-8 w-full max-w-56 border-t border-dotted border-black" />
          <div className="mt-1">( {issuer || "................................................"} )</div>
          <div>ผู้ออกหนังสือ / ผู้บังคับบัญชา</div>
        </div>
        <div>
          <div className="mx-auto mt-8 w-full max-w-56 border-t border-dotted border-black" />
          <div className="mt-1">( {w.witness || "................................................"} )</div>
          <div>พยาน</div>
        </div>
      </div>

      <section className="mt-10 break-inside-avoid rounded border border-black p-4">
        <h2 className="font-semibold">ส่วนของพนักงาน — การรับทราบ</h2>
        <p className="mt-1 text-[13px]">ข้าพเจ้าได้รับและอ่านหนังสือฉบับนี้แล้ว (การลงนามรับทราบไม่ถือเป็นการยอมรับข้อกล่าวหา)</p>
        <div className="mt-2 min-h-16 text-[13px]">
          คำชี้แจงของพนักงาน: {w.employee_comment ? <span>{w.employee_comment}</span> : <span className="block border-b border-dotted border-black pt-5" />}
          {!w.employee_comment && <span className="block border-b border-dotted border-black pt-6" />}
        </div>
        <div className="mt-6 grid grid-cols-2 gap-4 text-center sm:gap-8">
          <div>
            <div className="mx-auto mt-6 w-full max-w-56 border-t border-dotted border-black" />
            <div className="mt-1">( {name} )</div>
            <div>พนักงานผู้รับหนังสือ</div>
          </div>
          <div className="pt-6">
            วันที่รับทราบ {w.acknowledged_at ? <b>{thDate(w.acknowledged_at, "long")} (รับทราบผ่านระบบ)</b> : "......../......../........"}
          </div>
        </div>
      </section>
    </article>
  );
}
