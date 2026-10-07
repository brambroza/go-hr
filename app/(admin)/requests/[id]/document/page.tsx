import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireMe } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getCompany } from "@/lib/settings";
import { supabaseServer } from "@/lib/supabase/server";
import { bahtText, money, thDate, TH_MONTHS } from "@/lib/format";
import { DocumentToolbar, SignatureImage } from "@/components/requests/document-toolbar";
import { TEMPLATE_FOR_TYPE, TEMPLATE_META, fillTemplate, templateOf, toBlocks } from "@/components/requests/doc-templates";
import { isPrintable, type RequestRow } from "@/components/requests/lib";

export const metadata = { title: "พิมพ์เอกสาร" };

const EN_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const enDate = (d: string | null | undefined) => {
  if (!d) return "-";
  const [y, m, dd] = d.slice(0, 10).split("-").map(Number);
  return `${dd} ${EN_MONTHS[m - 1]} ${y}`;
};
const thLong = (d: string | null | undefined) => (d ? thDate(d.slice(0, 10), "long") : "-");
const addDay = (d: string, n: number) => {
  const x = new Date(`${d.slice(0, 10)}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};
function service(from: string | null, to: string) {
  if (!from) return { th: "-", en: "-" };
  const [y1, m1, d1] = from.split("-").map(Number);
  const [y2, m2, d2] = to.split("-").map(Number);
  let months = (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
  if (months < 0) months = 0;
  const y = Math.floor(months / 12);
  const m = months % 12;
  const th = [y ? `${y} ปี` : "", m ? `${m} เดือน` : "", !y && !m ? "ไม่ถึง 1 เดือน" : ""].filter(Boolean).join(" ");
  const en = [y ? `${y} year${y > 1 ? "s" : ""}` : "", m ? `${m} month${m > 1 ? "s" : ""}` : "", !y && !m ? "less than one month" : ""].filter(Boolean).join(" and ");
  return { th, en };
}
const UNIT_TH: Record<string, string> = { month: "เดือน", day: "วัน", hour: "ชั่วโมง" };
const UNIT_EN: Record<string, string> = { month: "month", day: "day", hour: "hour" };
const EMP_TYPE_TH: Record<string, string> = { monthly: "พนักงานรายเดือน", daily: "พนักงานรายวัน", hourly: "พนักงานรายชั่วโมง", contract: "พนักงานสัญญาจ้าง", intern: "นักศึกษาฝึกงาน", parttime: "พนักงานไม่เต็มเวลา" };

function Problem({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-lg rounded-[var(--radius-panel)] border border-line bg-white p-6 text-center">
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-sm text-ink-soft">{children}</p>
      <a href="/requests" className="mt-4 inline-block text-sm text-jade-700 underline">กลับไปหน้าเอกสารทั้งหมด</a>
    </div>
  );
}

export default async function RequestDocumentPage({ params, searchParams }: PageProps<"/requests/[id]/document">) {
  const me = await requireMe();
  if (!can(me, "request_admin", "view")) redirect("/approvals");
  const { id } = await params;
  const sp = await searchParams;
  const sb = await supabaseServer();

  const { data: reqData } = await sb.from("v_requests").select("*").eq("id", Number(id)).maybeSingle();
  const r = reqData as RequestRow | null;
  if (!r) return <Problem title="ไม่พบเอกสาร">เอกสารนี้ไม่มีอยู่ หรือคุณไม่มีสิทธิ์ดู</Problem>;
  if (!isPrintable(r.request_type)) return <Problem title="เอกสารประเภทนี้ไม่มีแบบพิมพ์">พิมพ์ได้เฉพาะหนังสือรับรองเงินเดือน หนังสือรับรองการทำงาน เอกสารวีซ่า และสัญญาจ้าง</Problem>;
  if (r.status !== "approved") return <Problem title="เอกสารยังไม่ได้รับการอนุมัติ">พิมพ์ได้เมื่อเอกสารผ่านการอนุมัติครบทุกขั้นแล้ว</Problem>;

  const needsPrivate = r.request_type !== "work_cert";
  if (needsPrivate && !can(me, "employee_private", "view"))
    return <Problem title="ต้องมีสิทธิ์ดูข้อมูลเงินเดือน">เอกสารนี้แสดงเงินเดือนหรือเลขบัตรของพนักงาน — ให้ผู้มีสิทธิ์ “ข้อมูลอ่อนไหว” เป็นผู้พิมพ์</Problem>;

  const issued = await sb.rpc("issue_request_document", { p_request_id: r.id });
  if (issued.error) return <Problem title="ออกเลขที่หนังสือไม่สำเร็จ">{issued.error.message}</Problem>;
  const docNo = String((issued.data as { document_no: string }).document_no);
  const issuedAt = String((issued.data as { issued_at: string }).issued_at);

  const tKey = TEMPLATE_FOR_TYPE[r.request_type];
  const [company, empRes, privRes, tplRes, signersRes] = await Promise.all([
    getCompany(),
    sb
      .from("employees")
      .select("id, code, prefix, first_name, last_name, first_name_en, last_name_en, gender, hire_date, employee_type, probation_days, contract_end_date, default_shift_id, positions:position_id(name, name_en), org_units:org_unit_id(name, name_en), shifts:default_shift_id(start_time, end_time)")
      .eq("id", r.employee_id)
      .maybeSingle(),
    needsPrivate ? sb.from("employee_private").select("salary, salary_unit, national_id, passport_no").eq("employee_id", r.employee_id).maybeSingle() : Promise.resolve({ data: null }),
    sb.from("settings").select("value").eq("key", tKey).maybeSingle(),
    sb.from("profiles").select("id, display_name, username, signature_url, employee_id").eq("is_active", true).or(`signature_url.not.is.null,id.eq.${me.userId}`),
  ]);
  if (needsPrivate) await sb.rpc("log_sensitive_view", { p_table: "employee_private", p_record: String(r.employee_id), p_field: `document:${r.request_type}:${docNo}` });

  type Emp = {
    code: string; prefix: string | null; first_name: string; last_name: string; first_name_en: string | null; last_name_en: string | null; gender: string | null;
    hire_date: string; employee_type: string; probation_days: number; contract_end_date: string | null;
    positions: { name: string; name_en: string | null } | null; org_units: { name: string; name_en: string | null } | null; shifts: { start_time: string; end_time: string } | null;
  };
  const e = empRes.data as unknown as Emp | null;
  if (!e) return <Problem title="ไม่พบข้อมูลพนักงาน">คุณอาจไม่มีสิทธิ์ดูข้อมูลพนักงานคนนี้</Problem>;
  const priv = (privRes.data ?? null) as { salary: number; salary_unit: string; national_id: string | null; passport_no: string | null } | null;

  // signers: everyone with a signature + me; position from the directory
  const sgn = (signersRes.data ?? []) as { id: string; display_name: string | null; username: string | null; signature_url: string | null; employee_id: number | null }[];
  const empIds = sgn.map((s) => s.employee_id).filter(Boolean) as number[];
  const dir = empIds.length ? await sb.from("v_directory").select("id, prefix, first_name, last_name, first_name_en, last_name_en, position_name").in("id", empIds) : { data: [] };
  const dirById = new Map(((dir.data ?? []) as { id: number; prefix: string | null; first_name: string; last_name: string; first_name_en: string | null; last_name_en: string | null; position_name: string | null }[]).map((d) => [d.id, d]));
  const signers = sgn.map((s) => {
    const d = s.employee_id ? dirById.get(s.employee_id) : undefined;
    return {
      id: s.id,
      name: d ? `${d.prefix ?? ""}${d.first_name} ${d.last_name}` : s.display_name || s.username || "-",
      name_en: d?.first_name_en ? `${d.first_name_en} ${d.last_name_en ?? ""}`.trim() : d ? `${d.first_name} ${d.last_name}` : s.display_name || s.username || "-",
      position: d?.position_name ?? "",
      signature: s.signature_url,
    };
  });
  const wanted = typeof sp.signer === "string" ? sp.signer : null;
  const signer = signers.find((s) => s.id === wanted) ?? signers.find((s) => s.id === me.userId && s.signature) ?? signers.find((s) => s.signature) ?? signers.find((s) => s.id === me.userId) ?? null;

  const p = r.payload ?? {};
  const lang: "th" | "en" = sp.lang === "en" || sp.lang === "th" ? sp.lang : p.language === "en" || (r.request_type === "visa_doc" && p.language !== "th") ? "en" : "th";

  // visa: travel dates from the request, else the employee's next approved leave
  // (requests.start_date of a document request is the date the employee needs the letter, not the trip)
  let travelFrom = (p.travel_from as string | undefined) ?? null;
  let travelTo = (p.travel_to as string | undefined) ?? travelFrom;
  if (r.request_type === "visa_doc" && !travelFrom) {
    const { data: lv } = await sb.from("requests").select("start_date, end_date").eq("employee_id", r.employee_id).eq("request_type", "leave").eq("status", "approved").gte("end_date", r.created_at.slice(0, 10)).order("start_date").limit(1).maybeSingle();
    travelFrom = lv?.start_date ?? null;
    travelTo = lv?.end_date ?? travelFrom;
  }

  const today = issuedAt;
  const svc = service(e.hire_date, today);
  const female = e.gender === "F";
  const nameTh = `${e.prefix ?? ""}${e.first_name} ${e.last_name}`;
  const nameEn = e.first_name_en ? `${female ? "Ms." : "Mr."} ${e.first_name_en} ${e.last_name_en ?? ""}`.trim() : nameTh;
  const salary = Number(priv?.salary ?? 0);
  const hhmm = (t?: string | null) => (t ? t.slice(0, 5) : "");
  const vars: Record<string, string | null> = {
    company_name: company.name,
    company_name_en: company.name_en || company.name,
    company_address: company.address ?? "",
    company_tax_id: company.tax_id ?? "",
    employee_name: nameTh,
    employee_name_en: nameEn,
    employee_code: e.code,
    national_id: priv?.national_id ?? null,
    passport_no: priv?.passport_no ?? null,
    position: e.positions?.name ?? null,
    position_en: e.positions?.name_en || e.positions?.name || null,
    department: e.org_units?.name ?? null,
    department_en: e.org_units?.name_en || e.org_units?.name || null,
    employee_type: EMP_TYPE_TH[e.employee_type] ?? e.employee_type,
    start_date: thLong(e.hire_date),
    start_date_en: enDate(e.hire_date),
    years_of_service: svc.th,
    years_of_service_en: svc.en,
    probation_days: String(e.probation_days ?? 119),
    salary: priv ? money(salary) : null,
    salary_text: priv ? bahtText(salary) : null,
    salary_unit: UNIT_TH[priv?.salary_unit ?? "month"],
    salary_unit_en: UNIT_EN[priv?.salary_unit ?? "month"],
    work_time: e.shifts ? `${hhmm(e.shifts.start_time)} – ${hhmm(e.shifts.end_time)} น.` : "08:00 – 17:00 น.",
    purpose: (p.purpose as string) || (lang === "en" ? "general reference" : "การติดต่อทั่วไป"),
    country: (p.country as string) || (p.embassy as string) || null,
    travel_from: thLong(travelFrom),
    travel_to: thLong(travelTo),
    travel_from_en: enDate(travelFrom),
    travel_to_en: enDate(travelTo),
    return_date_en: travelTo ? enDate(addDay(travelTo, 1)) : "-",
    contract_start: lang === "en" ? enDate((p.contract_start as string) ?? e.hire_date) : thLong((p.contract_start as string) ?? e.hire_date),
    contract_end: p.contract_end ? (lang === "en" ? enDate(p.contract_end as string) : thLong(p.contract_end as string)) : null,
    today: thLong(today),
    today_en: enDate(today),
    document_no: docNo,
    signer_name: lang === "en" ? signer?.name_en ?? "" : signer?.name ?? "",
    signer_position: signer?.position ?? "",
    he_she: female ? "She" : "He",
    his_her: female ? "her" : "his",
  };

  const tpl = templateOf(tKey, tplRes.data?.value);
  const blocks = toBlocks(fillTemplate(lang === "en" ? tpl.en : tpl.th, vars));
  const meta = TEMPLATE_META.find((m) => m.key === tKey)!;
  const isContract = r.request_type === "contract";
  const [ty, tm, td] = today.split("-").map(Number);

  return (
    <div className="-mx-3 -my-5 sm:-mx-6">
      <style>{`@media print { @page { size: A4; margin: 16mm 18mm; } .doc-sheet { font-size: 15px; } }`}</style>
      <Suspense>
        <DocumentToolbar
          title={`${meta.label} · ${r.first_name} ${r.last_name}`}
          lang={lang}
          signer={signer?.id ?? null}
          signers={signers.map((s) => ({ id: s.id, label: `${s.name}${s.signature ? "" : " (ยังไม่มีลายเซ็น)"}` }))}
          backHref={`/requests?id=${r.id}`}
        />
      </Suspense>
      {lang === "en" && (!e.first_name_en || !e.positions?.name_en || !e.org_units?.name_en) && (
        <p className="no-print mx-auto mb-3 max-w-[210mm] rounded-[var(--radius-ctl)] bg-amber-50 px-3 py-2 text-sm text-amber-ink">
          ยังไม่มีข้อมูลภาษาอังกฤษของ{[!e.first_name_en && "ชื่อพนักงาน", !e.positions?.name_en && "ตำแหน่ง", !e.org_units?.name_en && "หน่วยงาน"].filter(Boolean).join(" / ")} — ระบบใช้ภาษาไทยแทน เพิ่มได้ที่ข้อมูลพนักงาน / ตำแหน่งงาน / โครงสร้างองค์กร
        </p>
      )}
      <div className="flex justify-center px-3 pb-10 print:block print:p-0">
        <article
          lang={lang}
          className="doc-sheet print-page relative min-h-[297mm] w-[210mm] max-w-full bg-white px-[20mm] py-[18mm] text-[15px] leading-[1.75] text-black shadow-sm ring-1 ring-line print:min-h-0 print:w-auto print:px-0 print:py-0 print:shadow-none print:ring-0"
        >
          {/* letterhead */}
          <header className="flex items-start gap-4 border-b-2 border-black pb-3">
            {company.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={company.logo_url} alt="" className="h-16 w-16 object-contain" />
            )}
            <div className="min-w-0 flex-1 leading-snug">
              <div className="text-[18px] font-semibold">{lang === "en" ? company.name_en || company.name : company.name}</div>
              {lang === "th" && company.name_en && <div className="text-[13px]">{company.name_en}</div>}
              {company.address && <div className="text-[12.5px]">{company.address}</div>}
              <div className="text-[12.5px]">
                {[company.phone && `${lang === "en" ? "Tel." : "โทร"} ${company.phone}`, company.email, company.tax_id && `${lang === "en" ? "Tax ID" : "เลขประจำตัวผู้เสียภาษี"} ${company.tax_id}`].filter(Boolean).join(" · ")}
              </div>
            </div>
          </header>

          <div className="mt-4 flex justify-between text-[14px]">
            <span>
              {lang === "en" ? "Ref." : "ที่"} <span className="num">{docNo}</span>
            </span>
            <span>{lang === "en" ? enDate(today) : `วันที่ ${td} ${TH_MONTHS[tm - 1]} พ.ศ. ${ty + 543}`}</span>
          </div>

          <h2 className="mt-6 mb-5 text-center text-[19px] font-semibold tracking-wide">{meta.title[lang]}</h2>

          <div className="flex flex-col gap-3">
            {blocks.map((b, i) =>
              b.kind === "h1" ? (
                <h3 key={i} className="text-center text-[17px] font-semibold" dangerouslySetInnerHTML={{ __html: b.html }} />
              ) : b.kind === "h2" ? (
                <h4 key={i} className="mt-1 font-semibold" dangerouslySetInnerHTML={{ __html: b.html }} />
              ) : b.kind === "plain" ? (
                <p key={i} dangerouslySetInnerHTML={{ __html: b.html }} />
              ) : (
                <p key={i} className="indent-[2.5em] text-justify" dangerouslySetInnerHTML={{ __html: b.html }} />
              ),
            )}
          </div>

          {isContract ? (
            <div className="mt-12 grid grid-cols-2 gap-x-10 gap-y-12 text-center text-[14px] break-inside-avoid">
              <SignBox label={lang === "en" ? "Employer" : "นายจ้าง"} name={vars.signer_name} position={vars.signer_position} signature={signer?.signature ?? null} />
              <SignBox label={lang === "en" ? "Employee" : "ลูกจ้าง"} name={lang === "en" ? nameEn : nameTh} position={vars.position} signature={null} />
              <SignBox label={lang === "en" ? "Witness" : "พยาน"} name={null} position={null} signature={null} />
              <SignBox label={lang === "en" ? "Witness" : "พยาน"} name={null} position={null} signature={null} />
            </div>
          ) : (
            <div className="mt-12 ml-auto w-[80mm] max-w-full text-center text-[14.5px] break-inside-avoid">
              <div>{lang === "en" ? "Yours faithfully," : "ขอแสดงความนับถือ"}</div>
              <SignatureImage src={signer?.signature ?? null} className="mx-auto mt-2 h-[22mm] max-w-[60mm] object-contain" />
              <div className="mx-auto w-[64mm] border-t border-dotted border-black pt-1">({vars.signer_name || "........................................"})</div>
              <div>{vars.signer_position || (lang === "en" ? "Authorized signatory" : "ผู้มีอำนาจลงนาม")}</div>
              <div>{lang === "en" ? company.name_en || company.name : company.name}</div>
            </div>
          )}

          <footer className="mt-10 border-t border-line pt-2 text-[11.5px] text-neutral-600">
            {lang === "en"
              ? `This document was issued from the HR system under reference ${docNo} (request ${r.doc_no}). Please contact ${company.phone || company.email || "the HR department"} to verify.`
              : `เอกสารออกจากระบบงานบุคคล เลขที่อ้างอิง ${docNo} (คำขอ ${r.doc_no}) ตรวจสอบความถูกต้องได้ที่ ${company.phone || company.email || "ฝ่ายบุคคล"}`}
          </footer>
        </article>
      </div>
    </div>
  );
}

function SignBox({ label, name, position, signature }: { label: string; name: string | null; position: string | null; signature: string | null }) {
  return (
    <div>
      <SignatureImage src={signature} className="mx-auto h-[18mm] max-w-[55mm] object-contain" />
      <div className="mx-auto w-[64mm] border-t border-dotted border-black pt-1">
        {label}
      </div>
      <div>({name || "........................................"})</div>
      {position && <div>{position}</div>}
    </div>
  );
}
