"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { PenLine, RotateCcw, Save } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useCan } from "@/components/app/me-context";
import { Badge, Button, PageHeader, Panel, Spinner, Tabs, Textarea, clsx, toast, useConfirm } from "@/components/ui";
import { DEFAULT_TEMPLATES, PLACEHOLDERS, TEMPLATE_META, fillTemplate, templateOf, toBlocks, type DocTemplate, type TemplateKey } from "./doc-templates";
import { errMsg } from "./lib";

const SAMPLE: Record<string, string> = {
  company_name: "บริษัท ตัวอย่าง จำกัด", company_name_en: "Sample Co., Ltd.", company_address: "99 ถ.ตัวอย่าง กรุงเทพฯ 10110", company_tax_id: "0105500000000",
  employee_name: "นายสมชาย ใจดี", employee_name_en: "Mr. Somchai Jaidee", employee_code: "E0001", national_id: "1-2345-67890-12-3", passport_no: "AA1234567",
  position: "หัวหน้าแผนกผลิต", position_en: "Production Supervisor", department: "ฝ่ายผลิต", department_en: "Production", employee_type: "พนักงานรายเดือน",
  start_date: "1 มิถุนายน 2565", start_date_en: "1 June 2022", years_of_service: "4 ปี 4 เดือน", years_of_service_en: "4 years and 4 months", probation_days: "119",
  salary: "25,000.00", salary_text: "สองหมื่นห้าพันบาทถ้วน", salary_unit: "เดือน", salary_unit_en: "month", work_time: "08:00 – 17:00 น.",
  purpose: "ขอสินเชื่อที่อยู่อาศัย", country: "ญี่ปุ่น", travel_from: "1 ธันวาคม 2569", travel_to: "7 ธันวาคม 2569", travel_from_en: "1 December 2026", travel_to_en: "7 December 2026",
  return_date_en: "8 December 2026", contract_start: "1 พฤศจิกายน 2569", contract_end: "-", today: "7 ตุลาคม 2569", today_en: "7 October 2026", document_no: "HRL20260001",
  signer_name: "นางสาวกาญจนา ทองคำ", signer_position: "ผู้จัดการฝ่ายบุคคล", he_she: "He", his_her: "his",
};

export function TemplatesEditor() {
  const sb = supabaseBrowser();
  const can = useCan();
  const canEdit = can("request_admin", "edit");
  const [key, setKey] = useState<TemplateKey>("salary_cert_template");
  const [lang, setLang] = useState<"th" | "en">("th");
  const [stored, setStored] = useState<Record<string, DocTemplate>>({});
  const [draft, setDraft] = useState<Record<string, DocTemplate>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const ta = useRef<HTMLTextAreaElement>(null);
  const { confirm, dialog } = useConfirm();

  useEffect(() => {
    sb.from("settings")
      .select("key, value")
      .in("key", TEMPLATE_META.map((m) => m.key))
      .then(({ data }: { data: { key: TemplateKey; value: unknown }[] | null }) => {
        const s: Record<string, DocTemplate> = {};
        for (const m of TEMPLATE_META) s[m.key] = templateOf(m.key, data?.find((d) => d.key === m.key)?.value);
        setStored(s);
        setDraft(s);
        setLoading(false);
      });
  }, [sb]);

  const cur = draft[key]?.[lang] ?? "";
  const dirty = (k: TemplateKey) => draft[k] && stored[k] && (draft[k].th !== stored[k].th || draft[k].en !== stored[k].en);
  const preview = useMemo(() => toBlocks(fillTemplate(cur, { ...SAMPLE, salary_unit_en: "month" })), [cur]);

  const setText = (v: string) => setDraft((d) => ({ ...d, [key]: { ...d[key], [lang]: v } }));

  function insert(ph: string) {
    const el = ta.current;
    const token = `{{${ph}}}`;
    if (!el) return setText(cur + token);
    const s = el.selectionStart ?? cur.length;
    const e = el.selectionEnd ?? cur.length;
    setText(cur.slice(0, s) + token + cur.slice(e));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + token.length, s + token.length);
    });
  }

  async function save() {
    setSaving(true);
    const { error } = await sb.rpc("save_document_template", { p_key: key, p_value: draft[key] });
    setSaving(false);
    if (error) return toast.error(errMsg(error));
    setStored((s) => ({ ...s, [key]: draft[key] }));
    toast.ok("บันทึกแบบฟอร์มแล้ว — มีผลกับเอกสารที่พิมพ์หลังจากนี้");
  }

  async function reset() {
    if (!(await confirm("แทนที่ข้อความภาษานี้ด้วยแบบฟอร์มเริ่มต้นของระบบ? (ยังไม่บันทึกจนกว่าจะกดบันทึก)", { confirmText: "ใช้แบบเริ่มต้น" }))) return;
    setText(DEFAULT_TEMPLATES[key][lang]);
  }

  const meta = TEMPLATE_META.find((m) => m.key === key)!;

  return (
    <>
      <PageHeader
        title="แบบฟอร์มเอกสาร"
        description="ข้อความในหนังสือรับรองและสัญญาจ้างที่พิมพ์จากระบบ ใช้ {{ชื่อตัวแปร}} แทนข้อมูลพนักงาน ระบบเติมหัวกระดาษบริษัท เลขที่หนังสือ วันที่ และช่องลงนามให้อัตโนมัติ"
        actions={
          <Link href="/settings/signature" className="inline-flex h-10 items-center gap-1.5 rounded-[var(--radius-ctl)] border border-line bg-white px-4 text-[15px] font-medium hover:bg-jade-50">
            <PenLine className="size-4" /> ตั้งค่าลายเซ็นของฉัน
          </Link>
        }
      />
      <Tabs
        tabs={TEMPLATE_META.map((m) => ({ value: m.key, label: <>{m.label}{dirty(m.key) && <span className="ml-1 text-amber-ink">•</span>}</> }))}
        value={key}
        onChange={setKey}
        className="mb-4"
      />
      {loading ? (
        <div className="flex justify-center py-10"><Spinner /></div>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Panel
            title={
              <div className="inline-flex overflow-hidden rounded-[var(--radius-ctl)] border border-line text-sm font-normal" role="group" aria-label="ภาษา">
                {(["th", "en"] as const).map((l) => (
                  <button key={l} type="button" onClick={() => setLang(l)} className={l === lang ? "bg-jade-600 px-3 py-1 text-white" : "bg-white px-3 py-1 hover:bg-jade-50"}>
                    {l === "th" ? "ภาษาไทย" : "English"}
                  </button>
                ))}
              </div>
            }
            actions={
              canEdit && (
                <>
                  <Button size="sm" variant="ghost" icon={<RotateCcw className="size-4" />} onClick={reset}>
                    แบบเริ่มต้น
                  </Button>
                  <Button size="sm" icon={<Save className="size-4" />} loading={saving} disabled={!dirty(key)} onClick={save}>
                    บันทึก
                  </Button>
                </>
              )
            }
          >
            <Textarea ref={ta} value={cur} onChange={(e) => setText(e.target.value)} readOnly={!canEdit} rows={18} className="font-[inherit] text-[14px] leading-relaxed" />
            <p className="mt-2 text-xs text-ink-mute">
              เว้นบรรทัดว่างเพื่อขึ้นย่อหน้าใหม่ (ย่อหน้าปกติจะย่อหน้าบรรทัดแรก) · ขึ้นต้นด้วย “&gt; ” = ไม่ย่อหน้า · “## ” = หัวข้อตัวหนา
            </p>
            <div className="mt-3">
              <div className="mb-1.5 text-sm font-medium text-ink-soft">แทรกข้อมูล</div>
              <div className="flex flex-wrap gap-1.5">
                {PLACEHOLDERS.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    disabled={!canEdit}
                    onClick={() => insert(p.key)}
                    title={`{{${p.key}}}`}
                    className={clsx("rounded-md border border-line bg-white px-2 py-0.5 text-xs hover:border-jade-300 hover:bg-jade-50 disabled:opacity-50", cur.includes(`{{${p.key}}}`) && "border-jade-200 bg-jade-50 text-jade-800")}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </Panel>
          <Panel title={<span>ตัวอย่าง <Badge className="ml-1">ข้อมูลสมมุติ</Badge></span>} bodyClass="bg-paper/60 p-4">
            <div className="mx-auto max-w-[170mm] bg-white px-8 py-7 text-[14px] leading-[1.75] text-black shadow-sm ring-1 ring-line">
              <div className="mb-4 text-center text-[17px] font-semibold">{meta.title[lang]}</div>
              <div className="flex flex-col gap-2.5">
                {preview.map((b, i) =>
                  b.kind === "h2" ? (
                    <div key={i} className="font-semibold" dangerouslySetInnerHTML={{ __html: b.html }} />
                  ) : b.kind === "h1" ? (
                    <div key={i} className="text-center font-semibold" dangerouslySetInnerHTML={{ __html: b.html }} />
                  ) : (
                    <p key={i} className={b.kind === "p" ? "indent-[2.5em] text-justify" : ""} dangerouslySetInnerHTML={{ __html: b.html }} />
                  ),
                )}
              </div>
              <div className="mt-8 ml-auto w-56 text-center text-[13px]">
                <div className="h-10" />
                <div className="border-t border-dotted border-black pt-1">({SAMPLE.signer_name})</div>
                <div>{SAMPLE.signer_position}</div>
              </div>
            </div>
          </Panel>
        </div>
      )}
      {dialog}
    </>
  );
}
