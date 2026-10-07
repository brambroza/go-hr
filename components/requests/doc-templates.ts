// Default letter / contract templates and placeholder rendering. Pure (used by server pages and client editor).
// Stored in settings under the keys below as { th: string, en: string }. Paragraphs are separated by a blank line;
// a paragraph starting with "# " is a centred heading, "## " a bold sub-heading; a paragraph starting with "> " is not indented.

export type TemplateKey = "salary_cert_template" | "work_cert_template" | "visa_doc_template" | "contract_template";
export interface DocTemplate {
  th: string;
  en: string;
}

export const TEMPLATE_FOR_TYPE: Record<string, TemplateKey> = {
  salary_cert: "salary_cert_template",
  work_cert: "work_cert_template",
  visa_doc: "visa_doc_template",
  contract: "contract_template",
};

export const TEMPLATE_META: { key: TemplateKey; label: string; title: DocTemplate }[] = [
  { key: "salary_cert_template", label: "หนังสือรับรองเงินเดือน", title: { th: "หนังสือรับรองเงินเดือน", en: "SALARY CERTIFICATE" } },
  { key: "work_cert_template", label: "หนังสือรับรองการทำงาน", title: { th: "หนังสือรับรองการทำงาน", en: "CERTIFICATE OF EMPLOYMENT" } },
  { key: "visa_doc_template", label: "หนังสือรับรองเพื่อขอวีซ่า", title: { th: "หนังสือรับรองเพื่อประกอบการขอวีซ่า", en: "EMPLOYMENT LETTER FOR VISA APPLICATION" } },
  { key: "contract_template", label: "สัญญาจ้างแรงงาน", title: { th: "สัญญาจ้างแรงงาน", en: "EMPLOYMENT CONTRACT" } },
];

export const PLACEHOLDERS: { key: string; label: string }[] = [
  { key: "company_name", label: "ชื่อบริษัท" },
  { key: "company_name_en", label: "ชื่อบริษัท (อังกฤษ)" },
  { key: "company_address", label: "ที่อยู่บริษัท" },
  { key: "company_tax_id", label: "เลขประจำตัวผู้เสียภาษีบริษัท" },
  { key: "employee_name", label: "ชื่อ-สกุลพนักงาน (มีคำนำหน้า)" },
  { key: "employee_name_en", label: "ชื่อ-สกุลภาษาอังกฤษ" },
  { key: "employee_code", label: "รหัสพนักงาน" },
  { key: "national_id", label: "เลขบัตรประชาชน (HR เท่านั้น)" },
  { key: "passport_no", label: "เลขหนังสือเดินทาง" },
  { key: "position", label: "ตำแหน่ง" },
  { key: "position_en", label: "ตำแหน่ง (อังกฤษ)" },
  { key: "department", label: "หน่วยงาน" },
  { key: "department_en", label: "หน่วยงาน (อังกฤษ)" },
  { key: "employee_type", label: "ประเภทการจ้าง" },
  { key: "start_date", label: "วันที่เริ่มงาน" },
  { key: "start_date_en", label: "วันที่เริ่มงาน (อังกฤษ)" },
  { key: "years_of_service", label: "อายุงาน" },
  { key: "years_of_service_en", label: "อายุงาน (อังกฤษ)" },
  { key: "probation_days", label: "จำนวนวันทดลองงาน" },
  { key: "salary", label: "เงินเดือน (ตัวเลข)" },
  { key: "salary_text", label: "เงินเดือน (ตัวอักษร)" },
  { key: "salary_unit", label: "หน่วยค่าจ้าง (เดือน/วัน/ชั่วโมง)" },
  { key: "salary_unit_en", label: "หน่วยค่าจ้าง (อังกฤษ)" },
  { key: "work_time", label: "เวลาทำงาน (กะปกติ)" },
  { key: "purpose", label: "วัตถุประสงค์ที่ขอ" },
  { key: "country", label: "ประเทศที่เดินทาง" },
  { key: "travel_from", label: "วันเริ่มเดินทาง/ลา" },
  { key: "travel_to", label: "วันสิ้นสุดการเดินทาง/ลา" },
  { key: "travel_from_en", label: "วันเริ่มเดินทาง (อังกฤษ)" },
  { key: "travel_to_en", label: "วันสิ้นสุดการเดินทาง (อังกฤษ)" },
  { key: "return_date_en", label: "วันกลับมาทำงาน (อังกฤษ)" },
  { key: "contract_start", label: "วันเริ่มสัญญา" },
  { key: "contract_end", label: "วันสิ้นสุดสัญญา" },
  { key: "today", label: "วันที่ออกหนังสือ" },
  { key: "today_en", label: "วันที่ออกหนังสือ (อังกฤษ)" },
  { key: "document_no", label: "เลขที่หนังสือ" },
  { key: "signer_name", label: "ชื่อผู้ลงนาม" },
  { key: "signer_position", label: "ตำแหน่งผู้ลงนาม" },
  { key: "he_she", label: "He / She" },
  { key: "his_her", label: "His / Her" },
];

export const DEFAULT_TEMPLATES: Record<TemplateKey, DocTemplate> = {
  salary_cert_template: {
    th: `> เรียน ผู้ที่เกี่ยวข้อง

หนังสือฉบับนี้ให้ไว้เพื่อรับรองว่า {{employee_name}} รหัสพนักงาน {{employee_code}} เป็นพนักงานของ{{company_name}} ตั้งแต่วันที่ {{start_date}} จนถึงปัจจุบัน ปัจจุบันดำรงตำแหน่ง {{position}} สังกัด{{department}} ได้รับเงินเดือนอัตรา{{salary_unit}}ละ {{salary}} บาท ({{salary_text}})

หนังสือรับรองฉบับนี้ออกให้ตามคำร้องขอของพนักงาน เพื่อใช้ประกอบ{{purpose}} เท่านั้น

> ออกให้ ณ วันที่ {{today}}`,
    en: `> To Whom It May Concern,

This is to certify that {{employee_name_en}} (Employee ID {{employee_code}}) has been employed by {{company_name_en}} since {{start_date_en}} and currently holds the position of {{position_en}} in the {{department_en}} department. {{his_her}} current salary is THB {{salary}} per {{salary_unit_en}}.

This certificate is issued at the request of the employee for the purpose of {{purpose}}.

> Issued on {{today_en}}`,
  },
  work_cert_template: {
    th: `> เรียน ผู้ที่เกี่ยวข้อง

หนังสือฉบับนี้ให้ไว้เพื่อรับรองว่า {{employee_name}} รหัสพนักงาน {{employee_code}} เป็นพนักงานของ{{company_name}} เริ่มปฏิบัติงานตั้งแต่วันที่ {{start_date}} จนถึงปัจจุบัน รวมอายุงาน {{years_of_service}} ปัจจุบันดำรงตำแหน่ง {{position}} สังกัด{{department}} ประเภทการจ้าง{{employee_type}}

ตลอดระยะเวลาการปฏิบัติงาน พนักงานผู้นี้ได้ปฏิบัติหน้าที่ด้วยความรับผิดชอบ หนังสือรับรองฉบับนี้ออกให้ตามคำร้องขอของพนักงาน เพื่อใช้ประกอบ{{purpose}}

> ออกให้ ณ วันที่ {{today}}`,
    en: `> To Whom It May Concern,

This is to certify that {{employee_name_en}} (Employee ID {{employee_code}}) has been employed by {{company_name_en}} since {{start_date_en}}, a period of {{years_of_service_en}}. {{he_she}} currently holds the position of {{position_en}} in the {{department_en}} department.

This certificate is issued at the request of the employee for the purpose of {{purpose}}.

> Issued on {{today_en}}`,
  },
  visa_doc_template: {
    th: `> เรียน เจ้าหน้าที่ฝ่ายกงสุล สถานเอกอัครราชทูต{{country}}

{{company_name}} ขอรับรองว่า {{employee_name}} เลขที่หนังสือเดินทาง {{passport_no}} เป็นพนักงานประจำของบริษัท ตั้งแต่วันที่ {{start_date}} ปัจจุบันดำรงตำแหน่ง {{position}} ได้รับเงินเดือน{{salary_unit}}ละ {{salary}} บาท

บริษัทได้อนุมัติให้พนักงานลางานเพื่อเดินทางไปยัง{{country}} ระหว่างวันที่ {{travel_from}} ถึงวันที่ {{travel_to}} เพื่อ{{purpose}} โดยพนักงานจะกลับมาปฏิบัติงานตามปกติเมื่อครบกำหนด และบริษัทจะยังคงสถานะการจ้างงานไว้ตลอดระยะเวลาดังกล่าว

> ออกให้ ณ วันที่ {{today}}`,
    en: `> To: The Consular Section, Embassy of {{country}}

Dear Sir or Madam,

We are pleased to confirm that {{employee_name_en}}, holder of passport no. {{passport_no}}, has been a full-time employee of {{company_name_en}} since {{start_date_en}}. {{he_she}} currently holds the position of {{position_en}} with a salary of THB {{salary}} per {{salary_unit_en}}.

The company has approved {{his_her}} leave from {{travel_from_en}} to {{travel_to_en}} for the purpose of {{purpose}}. {{he_she}} will resume {{his_her}} duties on {{return_date_en}}, and {{his_her}} position will be retained during this period. All travel expenses will be borne by the employee unless otherwise stated.

We would be grateful for any assistance you can extend to {{his_her}} visa application. Please do not hesitate to contact us should you require further information.

> Issued on {{today_en}}`,
  },
  contract_template: {
    th: `สัญญาฉบับนี้ทำขึ้นเมื่อวันที่ {{today}} ระหว่าง {{company_name}} สำนักงานตั้งอยู่เลขที่ {{company_address}} เลขประจำตัวผู้เสียภาษี {{company_tax_id}} ซึ่งต่อไปในสัญญานี้เรียกว่า “นายจ้าง” ฝ่ายหนึ่ง กับ {{employee_name}} เลขประจำตัวประชาชน {{national_id}} ซึ่งต่อไปในสัญญานี้เรียกว่า “ลูกจ้าง” อีกฝ่ายหนึ่ง ทั้งสองฝ่ายตกลงทำสัญญากันดังต่อไปนี้

## ข้อ 1 การจ้างและตำแหน่งงาน
นายจ้างตกลงจ้างและลูกจ้างตกลงทำงานให้แก่นายจ้างในตำแหน่ง {{position}} สังกัด{{department}} ประเภทการจ้าง{{employee_type}} เริ่มตั้งแต่วันที่ {{contract_start}} โดยลูกจ้างจะปฏิบัติงานตามที่นายจ้างมอบหมายด้วยความซื่อสัตย์สุจริตและตั้งใจ

## ข้อ 2 ทดลองงาน
ลูกจ้างต้องทดลองงานเป็นระยะเวลา {{probation_days}} วัน นับแต่วันเริ่มงาน หากผลการปฏิบัติงานไม่เป็นที่พอใจ นายจ้างอาจเลิกจ้างได้โดยปฏิบัติตามกฎหมายคุ้มครองแรงงาน

## ข้อ 3 ค่าจ้าง
นายจ้างตกลงจ่ายค่าจ้างให้ลูกจ้างอัตรา{{salary_unit}}ละ {{salary}} บาท ({{salary_text}}) โดยจ่ายเข้าบัญชีธนาคารของลูกจ้างตามรอบการจ่ายเงินเดือนของบริษัท และหักภาษีเงินได้ เงินสมทบกองทุนประกันสังคม และรายการอื่นตามที่กฎหมายกำหนดหรือที่ลูกจ้างยินยอม

## ข้อ 4 เวลาทำงานและวันหยุด
ลูกจ้างทำงานตามเวลา {{work_time}} หรือตามกะที่นายจ้างกำหนด ไม่เกินสัปดาห์ละ 48 ชั่วโมง ลูกจ้างมีสิทธิ์หยุดประจำสัปดาห์ วันหยุดตามประเพณี วันหยุดพักผ่อนประจำปี และวันลาตามระเบียบข้อบังคับเกี่ยวกับการทำงานของบริษัทและพระราชบัญญัติคุ้มครองแรงงาน

## ข้อ 5 หน้าที่และการรักษาความลับ
ลูกจ้างต้องปฏิบัติตามระเบียบข้อบังคับของบริษัท และต้องไม่เปิดเผยความลับทางการค้า ข้อมูลลูกค้า หรือข้อมูลส่วนบุคคลที่ได้รับจากการทำงาน ทั้งในระหว่างและภายหลังสิ้นสุดสัญญา

## ข้อ 6 การสิ้นสุดสัญญา
ฝ่ายใดประสงค์จะเลิกสัญญา ต้องบอกกล่าวล่วงหน้าเป็นหนังสือไม่น้อยกว่าหนึ่งรอบการจ่ายค่าจ้าง นายจ้างจะจ่ายค่าชดเชยตามที่กฎหมายกำหนด เว้นแต่เป็นกรณีที่กฎหมายยกเว้น

สัญญานี้ทำขึ้นสองฉบับมีข้อความถูกต้องตรงกัน คู่สัญญาได้อ่านและเข้าใจข้อความโดยตลอดแล้ว จึงลงลายมือชื่อไว้เป็นสำคัญต่อหน้าพยาน และต่างยึดถือไว้ฝ่ายละหนึ่งฉบับ`,
    en: `This Employment Contract is made on {{today_en}} between {{company_name_en}}, located at {{company_address}} (the "Employer"), and {{employee_name_en}}, ID/passport no. {{national_id}} (the "Employee").

## 1. Position
The Employer agrees to employ the Employee as {{position_en}} in the {{department_en}} department, starting on {{contract_start}}.

## 2. Probation
The Employee shall serve a probationary period of {{probation_days}} days from the start date.

## 3. Salary
The Employer shall pay the Employee THB {{salary}} per {{salary_unit_en}}, less income tax, social security contributions and other deductions required by law or agreed by the Employee.

## 4. Working hours and holidays
Working hours are {{work_time}} or as scheduled by the Employer, not exceeding 48 hours per week. The Employee is entitled to weekly holidays, public holidays, annual leave and other leave in accordance with the company work rules and the Labour Protection Act.

## 5. Confidentiality
The Employee shall not disclose trade secrets, customer information or personal data obtained in the course of employment, during or after the term of this contract.

## 6. Termination
Either party may terminate this contract by giving written notice of at least one pay period. Severance pay shall be paid as required by law.

This contract is made in two copies with identical content. Both parties have read and understood it and hereby sign in the presence of witnesses.`,
  },
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** replace {{key}} placeholders; unknown keys stay visible so HR can spot typos */
export function fillTemplate(text: string, vars: Record<string, string | null | undefined>): string {
  return text.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (m, k: string) => {
    const v = vars[k];
    return v === undefined ? m : v === null || v === "" ? "-" : v;
  });
}

export interface Block {
  kind: "h1" | "h2" | "p" | "plain";
  html: string;
}

/** split filled text into paragraphs (HTML-escaped, line breaks kept) */
export function toBlocks(filled: string): Block[] {
  return filled
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .flatMap((p): Block[] => {
      if (p.startsWith("# ")) return [{ kind: "h1", html: esc(p.slice(2)) }];
      if (p.startsWith("## ")) {
        const [head, ...rest] = p.slice(3).split("\n");
        const out: Block[] = [{ kind: "h2", html: esc(head) }];
        if (rest.join("\n").trim()) out.push({ kind: "p", html: esc(rest.join("\n").trim()).replace(/\n/g, "<br/>") });
        return out;
      }
      if (p.startsWith("> ")) return [{ kind: "plain", html: esc(p.slice(2)).replace(/\n/g, "<br/>") }];
      return [{ kind: "p", html: esc(p).replace(/\n/g, "<br/>") }];
    });
}

export function templateOf(key: TemplateKey, stored: unknown): DocTemplate {
  const s = (stored ?? {}) as Partial<DocTemplate>;
  return { th: s.th?.trim() ? s.th : DEFAULT_TEMPLATES[key].th, en: s.en?.trim() ? s.en : DEFAULT_TEMPLATES[key].en };
}
