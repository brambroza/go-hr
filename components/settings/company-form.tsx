"use client";

import { useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { useCan } from "@/components/app/me-context";
import { Button, Field, Input, PageHeader, Panel, Select, Spinner, Textarea, toast } from "@/components/ui";
import { uploadFile, resizeImage } from "@/lib/storage";
import { TH_MONTHS } from "@/lib/format";
import { useSetting } from "./use-setting";

type Company = {
  name: string; name_en: string; tax_id: string; branch_no: string; address: string; address_en?: string; phone: string; email: string; website?: string;
  logo_url: string | null; primary_color: string; fiscal_year_start_month: number;
};
const DEFAULTS: Company = { name: "", name_en: "", tax_id: "", branch_no: "00000", address: "", phone: "", email: "", website: "", logo_url: null, primary_color: "#1b6f53", fiscal_year_start_month: 1 };

export function CompanyForm() {
  const can = useCan();
  const { value: v, setValue, save, saving } = useSetting<Company>("company", DEFAULTS, { isPublic: true });
  const [err, setErr] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const ro = !can("settings", "edit");
  if (!v) return <div className="flex justify-center py-16"><Spinner /></div>;
  const set = (p: Partial<Company>) => setValue({ ...v, ...p });

  const onLogo = async (f?: File) => {
    if (!f) return;
    if (!f.type.startsWith("image/")) return toast.error("เลือกไฟล์รูปภาพ (PNG, JPG, SVG)");
    setUploading(true);
    try {
      const blob = f.type === "image/svg+xml" ? f : await resizeImage(f, 512, 0.9);
      const r = await uploadFile("public", blob, { folder: "company", name: f.type === "image/svg+xml" ? "logo.svg" : "logo.jpg" });
      set({ logo_url: r.url });
    } catch (e) {
      toast.error(`อัปโหลดโลโก้ไม่สำเร็จ: ${(e as Error).message}`);
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    const e: Record<string, string> = {};
    if (!v.name.trim()) e.name = "กรอกชื่อบริษัท";
    if (v.tax_id && !/^\d{13}$/.test(v.tax_id.replace(/\D/g, ""))) e.tax_id = "เลขประจำตัวผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก";
    if (v.branch_no && !/^\d{5}$/.test(v.branch_no)) e.branch_no = "เลขที่สาขาต้องเป็นตัวเลข 5 หลัก (สำนักงานใหญ่ = 00000)";
    if (v.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email)) e.email = "อีเมลไม่ถูกต้อง";
    if (!/^#[0-9a-f]{6}$/i.test(v.primary_color)) e.primary_color = "สีต้องอยู่ในรูปแบบ #RRGGBB";
    setErr(e);
    if (Object.keys(e).length) return toast.error("กรุณาแก้ไขข้อมูลที่ไม่ถูกต้อง");
    await save({ ...v, tax_id: v.tax_id.replace(/\D/g, ""), name: v.name.trim() }, "บันทึกข้อมูลบริษัทแล้ว");
  };

  return (
    <div>
      <PageHeader title="ข้อมูลบริษัท" description="ใช้ในหัวเอกสาร สลิปเงินเดือน แบบฟอร์มภาครัฐ (ภ.ง.ด. / สปส.) และหน้าเข้าสู่ระบบ" actions={!ro && <Button loading={saving} onClick={submit}>บันทึก</Button>} />
      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="ข้อมูลนิติบุคคล" className="xl:col-span-2">
          <fieldset disabled={ro} className="grid gap-4 sm:grid-cols-2">
            <Field label="ชื่อบริษัท (ไทย)" required error={err.name} className="sm:col-span-2"><Input value={v.name} onChange={(e) => set({ name: e.target.value })} /></Field>
            <Field label="ชื่อบริษัท (อังกฤษ)" className="sm:col-span-2"><Input value={v.name_en} onChange={(e) => set({ name_en: e.target.value })} /></Field>
            <Field label="เลขประจำตัวผู้เสียภาษี" error={err.tax_id} hint="13 หลัก"><Input inputMode="numeric" value={v.tax_id} onChange={(e) => set({ tax_id: e.target.value })} maxLength={17} /></Field>
            <Field label="เลขที่สาขา" error={err.branch_no} hint="สำนักงานใหญ่ = 00000"><Input inputMode="numeric" value={v.branch_no} onChange={(e) => set({ branch_no: e.target.value })} maxLength={5} /></Field>
            <Field label="ที่อยู่" className="sm:col-span-2"><Textarea value={v.address} onChange={(e) => set({ address: e.target.value })} rows={3} /></Field>
            <Field label="โทรศัพท์"><Input value={v.phone} onChange={(e) => set({ phone: e.target.value })} /></Field>
            <Field label="อีเมล" error={err.email}><Input type="email" value={v.email} onChange={(e) => set({ email: e.target.value })} /></Field>
            <Field label="เว็บไซต์"><Input value={v.website ?? ""} onChange={(e) => set({ website: e.target.value })} placeholder="https://" /></Field>
            <Field label="เดือนเริ่มต้นปีบัญชี" hint="ใช้กับรายงานรายปีและโควต้าบางประเภท">
              <Select value={v.fiscal_year_start_month} onChange={(e) => set({ fiscal_year_start_month: Number(e.target.value) })}>
                {TH_MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </Select>
            </Field>
          </fieldset>
        </Panel>
        <Panel title="โลโก้และสี">
          <div className="flex flex-col gap-4">
            <div>
              <div className="mb-1 text-sm font-medium text-ink-soft">โลโก้บริษัท</div>
              <div className="flex items-center gap-4">
                <div className="grid size-24 place-items-center overflow-hidden rounded-[var(--radius-ctl)] border border-line bg-paper">
                  {uploading ? <Spinner /> : v.logo_url ? (
                     
                    <img src={v.logo_url} alt="โลโก้" className="size-full object-contain p-1" />
                  ) : <span className="text-xs text-ink-mute">ยังไม่มีโลโก้</span>}
                </div>
                {!ro && (
                  <div className="flex flex-col gap-2">
                    <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-[var(--radius-ctl)] border border-line bg-white px-3 text-sm hover:bg-jade-50">
                      <ImagePlus className="size-4" /> เลือกรูป
                      <input type="file" accept="image/*" hidden onChange={(e) => onLogo(e.target.files?.[0])} />
                    </label>
                    {v.logo_url && <Button variant="ghost" size="sm" icon={<X className="size-4" />} onClick={() => set({ logo_url: null })}>เอาโลโก้ออก</Button>}
                  </div>
                )}
              </div>
              <p className="mt-1 text-xs text-ink-mute">แนะนำรูปสี่เหลี่ยมจัตุรัส พื้นหลังโปร่งใส ระบบย่อขนาดให้อัตโนมัติ</p>
            </div>
            <Field label="สีหลักในเอกสาร" error={err.primary_color}>
              <div className="flex items-center gap-2">
                <input type="color" value={v.primary_color} disabled={ro} onChange={(e) => set({ primary_color: e.target.value })} className="h-10 w-14 cursor-pointer rounded border border-line bg-white" aria-label="เลือกสี" />
                <Input value={v.primary_color} disabled={ro} onChange={(e) => set({ primary_color: e.target.value })} className="w-32" />
              </div>
            </Field>
            <div className="rounded-[var(--radius-ctl)] border border-line p-3">
              <div className="mb-2 text-xs text-ink-mute">ตัวอย่างหัวเอกสาร</div>
              <div className="flex items-center gap-3 border-b-2 pb-2" style={{ borderColor: v.primary_color }}>
                {v.logo_url && (
                   
                  <img src={v.logo_url} alt="" className="size-10 object-contain" />
                )}
                <div className="min-w-0">
                  <div className="truncate font-semibold" style={{ color: v.primary_color }}>{v.name || "ชื่อบริษัท"}</div>
                  <div className="truncate text-xs text-ink-soft">เลขประจำตัวผู้เสียภาษี {v.tax_id || "-"} สาขา {v.branch_no || "-"}</div>
                </div>
              </div>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
