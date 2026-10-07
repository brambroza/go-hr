"use client";
// รูปแบบไฟล์ (file templates): browse built-in bank / SSO / RD layouts, clone one and edit its fields, header/trailer,
// delimiter, encoding, line ending and file name; preview with real data of a payroll period; save to file_formats.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowLeft, ArrowUp, Copy, Download, Plus, Save, Star, Trash2 } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useCan } from "@/components/app/me-context";
import { Button, Checkbox, Empty, Field, Input, PageHeader, Panel, Select, Spinner, Tabs, clsx, toast, useConfirm } from "@/components/ui";
import { KIND_LABEL, VARIABLES, buildExport, checkLayout, cloneLayout, recordWidth, type FieldDef, type FileKind, type FileLayout, type RenderedFile } from "@/lib/payroll/files";
import { downloadBuilt } from "@/lib/payroll/files";
import { ENCODING_LABEL, type Encoding } from "@/lib/payroll/tis620";
import { FilePreview, IssueList, StatusBadge, useFileLayouts } from "./file-export";
import { loadPeriods, loadPreviewData, type PeriodLite } from "./file-preview-data";

const KINDS: FileKind[] = ["bank", "sso", "pnd1", "pnd1a", "rd_fund"];
type Section = "header" | "detail" | "trailer";
const SECTION_LABEL: Record<Section, string> = { header: "ส่วนหัว (Header)", detail: "รายการ (Detail) — 1 บรรทัดต่อคน", trailer: "ส่วนท้าย (Trailer)" };
const TYPE_LABEL: Record<FieldDef["type"], string> = { text: "ข้อความ", digits: "ตัวเลขล้วน (ตัดขีด)", int: "จำนวนเต็ม", amount: "จำนวนเงิน มีจุดทศนิยม", satang: "จำนวนเงินเป็นสตางค์ (ไม่มีจุด)", date: "วันที่" };

export function FileFormatEditor() {
  const can = useCan();
  const canEdit = can("payroll", "edit") || can("settings", "edit");
  const [kind, setKind] = useState<FileKind>("bank");
  const { layouts, custom, reload } = useFileLayouts(kind);
  const [selKey, setSelKey] = useState<string>("");
  const [draft, setDraft] = useState<FileLayout | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const { confirm, dialog } = useConfirm();

  useEffect(() => {
    setSelKey("");
    setDraft(null);
  }, [kind]);
  useEffect(() => {
    if (!selKey && layouts.length) setSelKey(layouts[0].key);
  }, [layouts, selKey]);

  const sel = layouts.find((l) => l.key === selKey);
  const customRow = custom?.find((c) => c.key === selKey);
  const isCustom = !!customRow;
  const current = draft ?? sel ?? null;

  const choose = async (key: string) => {
    if (dirty && !(await confirm("มีการแก้ไขที่ยังไม่ได้บันทึก ต้องการทิ้งการแก้ไขหรือไม่", { confirmText: "ทิ้งการแก้ไข", danger: true }))) return;
    setSelKey(key);
    setDraft(null);
    setDirty(false);
  };

  const startEdit = () => {
    if (!sel) return;
    setDraft(isCustom ? (JSON.parse(JSON.stringify(sel)) as FileLayout) : cloneLayout(sel));
    setDirty(!isCustom);
  };

  const update = (p: Partial<FileLayout>) => {
    if (!draft) return;
    setDraft({ ...draft, ...p });
    setDirty(true);
  };

  const save = async () => {
    if (!draft) return;
    const problems = checkLayout(draft, VARIABLES[kind].map((v) => v.key)).filter((x) => x.level === "error");
    if (problems.length) return toast.error(problems.map((x) => x.message).join(" · "));
    setSaving(true);
    const sb = supabaseBrowser();
    const { data: auth } = await sb.auth.getUser();
    const row = { key: draft.key, kind, label: draft.label, layout: draft, based_on: customRow?.based_on ?? sel?.key ?? null, updated_by: auth.user?.id ?? null };
    const { error } = await sb.from("file_formats").upsert(row, { onConflict: "key" });
    setSaving(false);
    if (error) return toast.error(error);
    toast.ok(`บันทึกรูปแบบ "${draft.label}" แล้ว`);
    setDirty(false);
    await reload();
    setSelKey(draft.key);
    setDraft(null);
  };

  const remove = async () => {
    if (!customRow) return;
    if (!(await confirm(<>ลบรูปแบบ <b>{customRow.label}</b> หรือไม่ — ไฟล์ที่เคยดาวน์โหลดไปแล้วไม่ได้รับผลกระทบ</>, { danger: true, confirmText: "ลบรูปแบบนี้" }))) return;
    const { error } = await supabaseBrowser().from("file_formats").delete().eq("key", customRow.key);
    if (error) return toast.error(error);
    toast.ok("ลบรูปแบบแล้ว");
    setSelKey("");
    setDraft(null);
    setDirty(false);
    reload();
  };

  const setDefault = async () => {
    if (!customRow) return;
    const sb = supabaseBrowser();
    const r1 = await sb.from("file_formats").update({ is_default: false }).eq("kind", kind).eq("is_default", true);
    const r2 = await sb.from("file_formats").update({ is_default: !customRow.is_default }).eq("key", customRow.key);
    if (r1.error || r2.error) return toast.error(r1.error ?? r2.error);
    toast.ok(customRow.is_default ? "ยกเลิกการใช้เป็นค่าเริ่มต้นแล้ว" : `ใช้ "${customRow.label}" เป็นค่าเริ่มต้นแล้ว`);
    reload();
  };

  return (
    <div>
      <PageHeader
        title="รูปแบบไฟล์ส่งธนาคาร / ประกันสังคม / สรรพากร"
        description="เลือกดูรูปแบบที่มีในระบบ หรือคัดลอกไปแก้ให้ตรงกับสเปกที่ธนาคารหรือหน่วยงานให้มา โดยไม่ต้องแก้โปรแกรม — ทดลองกับข้อมูลจริงของงวดเงินเดือนได้ก่อนบันทึก"
        back={
          <Link href="/payroll" className="inline-flex items-center gap-1 text-sm text-ink-soft hover:text-jade-700">
            <ArrowLeft className="size-4" /> งวดเงินเดือน
          </Link>
        }
      />
      <Tabs value={kind} onChange={(k) => (dirty ? confirm("มีการแก้ไขที่ยังไม่ได้บันทึก ต้องการทิ้งการแก้ไขหรือไม่", { danger: true, confirmText: "ทิ้งการแก้ไข" }).then((ok) => ok && (setDirty(false), setKind(k))) : setKind(k))} tabs={KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))} className="mb-4" />
      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <Panel title="รูปแบบที่มี" bodyClass="p-0">
          {custom === null ? (
            <Spinner className="mx-auto my-6" />
          ) : (
            <ul className="divide-y divide-line-soft">
              {layouts.map((l) => {
                const c = custom.find((x) => x.key === l.key);
                return (
                  <li key={l.key}>
                    <button type="button" onClick={() => choose(l.key)} className={clsx("w-full px-4 py-2.5 text-left text-sm hover:bg-paper", selKey === l.key && "bg-jade-50")}>
                      <div className="flex items-start gap-1.5 font-medium">
                        {c?.is_default && <Star className="mt-0.5 size-3.5 shrink-0 fill-current text-amber-ink" aria-label="ค่าเริ่มต้น" />}
                        <span>{l.label}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {c ? <span className="text-xs text-ink-mute">ปรับเอง · แก้ไขล่าสุด {new Date(c.updated_at).toLocaleDateString("th-TH")}</span> : <StatusBadge status={l.status} />}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
        <div className="min-w-0 space-y-4">
          {!current ? (
            <Empty title="เลือกรูปแบบไฟล์ทางซ้าย" />
          ) : (
            <>
              <Panel
                title={draft ? (dirty ? "กำลังแก้ไข (ยังไม่บันทึก)" : "กำลังแก้ไข") : current.label}
                actions={
                  canEdit && (
                    <div className="flex flex-wrap gap-2">
                      {!draft && (
                        <Button size="sm" variant={isCustom ? "primary" : "secondary"} icon={<Copy className="size-4" />} onClick={startEdit}>
                          {isCustom ? "แก้ไขรูปแบบนี้" : "คัดลอกไปแก้ไข"}
                        </Button>
                      )}
                      {!draft && isCustom && (
                        <>
                          <Button size="sm" variant="secondary" icon={<Star className="size-4" />} onClick={setDefault}>
                            {customRow?.is_default ? "เลิกใช้เป็นค่าเริ่มต้น" : "ใช้เป็นค่าเริ่มต้น"}
                          </Button>
                          <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" />} onClick={remove}>
                            ลบ
                          </Button>
                        </>
                      )}
                      {draft && (
                        <>
                          <Button size="sm" variant="secondary" onClick={() => (setDraft(null), setDirty(false))}>
                            ยกเลิก
                          </Button>
                          <Button size="sm" icon={<Save className="size-4" />} loading={saving} onClick={save}>
                            บันทึกรูปแบบ
                          </Button>
                        </>
                      )}
                    </div>
                  )
                }
              >
                <LayoutSettings layout={current} edit={!!draft} onChange={update} />
              </Panel>
              {(["header", "detail", "trailer"] as Section[]).map((s) =>
                current[s]?.length || (draft && s !== "detail" && current.mode === "fixed") || s === "detail" ? (
                  <FieldTable key={s} section={s} layout={current} edit={!!draft} onChange={(fields) => update({ [s]: fields.length ? fields : undefined } as Partial<FileLayout>)} kind={kind} />
                ) : null,
              )}
              <PreviewPanel layout={current} />
            </>
          )}
        </div>
      </div>
      {dialog}
    </div>
  );
}

function LayoutSettings({ layout: l, edit, onChange }: { layout: FileLayout; edit: boolean; onChange: (p: Partial<FileLayout>) => void }) {
  if (!edit)
    return (
      <div className="space-y-2 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={l.status} />
          <span className="text-ink-soft">{l.description}</span>
        </div>
        <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
          <Item k="ชนิดไฟล์">{l.mode === "fixed" ? `ความยาวคงที่ (Fixed width) — นับเป็นไบต์ของ ${l.encoding === "tis620" ? "TIS-620" : "UTF-8"}` : `คั่นด้วย "${l.delimiter === "\t" ? "Tab" : l.delimiter}"${l.quote ? " (ครอบด้วย \" เมื่อจำเป็น)" : ""}`}</Item>
          <Item k="การเข้ารหัส">{ENCODING_LABEL[l.encoding]}</Item>
          <Item k="ขึ้นบรรทัดใหม่">{l.lineEnding === "CRLF" ? "CRLF (Windows)" : "LF"}</Item>
          <Item k="ชื่อไฟล์">
            <code className="break-all text-xs">{l.fileName}</code>
          </Item>
          {l.mode === "fixed" && (
            <Item k="ความยาวต่อบรรทัด (ไบต์)">
              {[l.header && `หัว ${recordWidth(l.header)}`, `รายการ ${recordWidth(l.detail)}`, l.trailer && `ท้าย ${recordWidth(l.trailer)}`].filter(Boolean).join(" · ")}
            </Item>
          )}
          {l.stripChars && <Item k="ตัดอักขระต้องห้าม">{l.stripChars}</Item>}
        </dl>
        {l.source && <p className="break-words text-xs text-ink-mute">ที่มา: {l.source}</p>}
      </div>
    );
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="ชื่อรูปแบบ" className="sm:col-span-2">
        <Input value={l.label} onChange={(e) => onChange({ label: e.target.value })} />
      </Field>
      <Field label="คำอธิบาย / หมายเหตุจากธนาคาร" className="sm:col-span-2">
        <Input value={l.description ?? ""} onChange={(e) => onChange({ description: e.target.value })} />
      </Field>
      <Field label="ชนิดไฟล์">
        <Select value={l.mode} onChange={(e) => onChange({ mode: e.target.value as FileLayout["mode"], delimiter: e.target.value === "delimited" ? l.delimiter || "|" : l.delimiter })}>
          <option value="fixed">ความยาวคงที่ (Fixed width)</option>
          <option value="delimited">มีตัวคั่น (CSV / |)</option>
        </Select>
      </Field>
      {l.mode === "delimited" && (
        <Field label="ตัวคั่น">
          <Select value={l.delimiter} onChange={(e) => onChange({ delimiter: e.target.value })}>
            <option value="|">| (Pipe)</option>
            <option value=",">, (Comma)</option>
            <option value={"\t"}>Tab</option>
            <option value=";">; (Semicolon)</option>
          </Select>
        </Field>
      )}
      <Field label="การเข้ารหัสตัวอักษร">
        <Select value={l.encoding} onChange={(e) => onChange({ encoding: e.target.value as Encoding })}>
          {(Object.keys(ENCODING_LABEL) as Encoding[]).map((k) => (
            <option key={k} value={k}>
              {ENCODING_LABEL[k]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="ขึ้นบรรทัดใหม่">
        <Select value={l.lineEnding} onChange={(e) => onChange({ lineEnding: e.target.value as FileLayout["lineEnding"] })}>
          <option value="CRLF">CRLF (Windows — ธนาคาร/หน่วยงานส่วนใหญ่)</option>
          <option value="LF">LF</option>
        </Select>
      </Field>
      <Field label="รูปแบบชื่อไฟล์" hint="ใส่ตัวแปรในวงเล็บปีกกา เช่น {period.code} {company.tax_id}" className="sm:col-span-2">
        <Input value={l.fileName} onChange={(e) => onChange({ fileName: e.target.value })} className="font-mono text-sm" />
      </Field>
      {l.kind === "bank" && (
        <Field label="ผู้รับที่รวมในไฟล์">
          <Select value={l.bankScope ?? "any"} onChange={(e) => onChange({ bankScope: e.target.value as FileLayout["bankScope"] })}>
            <option value="any">ทุกธนาคาร</option>
            <option value="same">เฉพาะบัญชีธนาคารเดียวกับบริษัท</option>
            <option value="other">เฉพาะบัญชีต่างธนาคาร</option>
          </Select>
        </Field>
      )}
      {l.kind === "bank" && (
        <Field label="ตรวจจำนวนหลักเลขบัญชีผู้รับ">
          <Select value={String(l.accountDigits ?? "bot")} onChange={(e) => onChange({ accountDigits: e.target.value === "bot" ? "bot" : Number(e.target.value) })}>
            <option value="bot">ตามธนาคารผู้รับ (10 หลัก, ออมสิน/ธ.ก.ส. 12 หลัก …)</option>
            <option value="10">10 หลักเท่านั้น</option>
            <option value="11">11 หลักเท่านั้น</option>
            <option value="12">12 หลักเท่านั้น</option>
          </Select>
        </Field>
      )}
      <div className="flex flex-wrap gap-4 sm:col-span-2">
        {l.mode === "delimited" && <Checkbox label="ครอบข้อความด้วย &quot; เมื่อมีตัวคั่นในข้อมูล (CSV)" checked={!!l.quote} onChange={(v) => onChange({ quote: v })} />}
        {l.mode === "delimited" && <Checkbox label="บรรทัดแรกเป็นชื่อคอลัมน์" checked={!!l.columnTitles} onChange={(v) => onChange({ columnTitles: v })} />}
        <Checkbox label="ขึ้นบรรทัดใหม่หลังบรรทัดสุดท้าย" checked={l.finalNewline !== false} onChange={(v) => onChange({ finalNewline: v })} />
      </div>
    </div>
  );
}

function Item({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 gap-2">
      <dt className="shrink-0 text-ink-mute">{k}:</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

function FieldTable({ section, layout, edit, onChange, kind }: { section: Section; layout: FileLayout; edit: boolean; onChange: (f: FieldDef[]) => void; kind: FileKind }) {
  const fields = layout[section] ?? [];
  const fixed = layout.mode === "fixed";
  const vars = VARIABLES[kind].filter((v) => section === "detail" || v.scope === "file");
  const set = (i: number, p: Partial<FieldDef>) => onChange(fields.map((f, j) => (j === i ? { ...f, ...p } : f)));
  const move = (i: number, d: -1 | 1) => {
    const n = [...fields];
    const j = i + d;
    if (j < 0 || j >= n.length) return;
    [n[i], n[j]] = [n[j], n[i]];
    onChange(n);
  };
  const starts = fields.reduce<number[]>((acc, f, i) => [...acc, i === 0 ? 1 : acc[i - 1] + (fields[i - 1].len ?? 0)], []);
  const varLabel = (k: string) => (k === "const" ? "ค่าคงที่" : k === "blank" ? "ว่าง" : k === "seq" ? "ลำดับที่ (1, 2, 3 …)" : vars.find((v) => v.key === k)?.label ?? VARIABLES[kind].find((v) => v.key === k)?.label ?? k);
  return (
    <Panel
      title={`${SECTION_LABEL[section]}${fixed ? ` — ${recordWidth(fields)} ไบต์` : ""}`}
      bodyClass="p-0"
      actions={
        edit && (
          <Button size="sm" variant="secondary" icon={<Plus className="size-4" />} onClick={() => onChange([...fields, { label: "ช่องใหม่", source: "blank", type: "text", len: fixed ? 1 : undefined }])}>
            เพิ่มช่อง
          </Button>
        )
      }
    >
      <div className="thin-scroll overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead className="bg-paper text-left text-xs text-ink-mute">
            <tr className="[&>th]:px-2 [&>th]:py-1.5 [&>th]:font-medium">
              <th className="w-8">#</th>
              {fixed && <th className="w-20">ตำแหน่ง</th>}
              <th>ชื่อช่อง (ตามสเปก)</th>
              <th>ข้อมูลจาก</th>
              <th>ชนิด</th>
              <th className="w-16">{fixed ? "ยาว" : "ยาวสุด"}</th>
              <th>รูปแบบ</th>
              {edit && <th className="w-24" />}
            </tr>
          </thead>
          <tbody>
            {fields.map((f, i) => {
              const start = starts[i];
              return (
                <tr key={i} className="border-t border-line-soft align-top [&>td]:px-2 [&>td]:py-1.5">
                  <td className="num text-ink-mute">{i + 1}</td>
                  {fixed && <td className="num text-ink-soft">{f.len ? `${start}–${start + f.len - 1}` : "-"}</td>}
                  <td>{edit ? <Input className="h-8 min-w-40 text-[13px]" value={f.label} onChange={(e) => set(i, { label: e.target.value })} /> : <span>{f.label}{f.required && <span className="text-rust"> *</span>}</span>}</td>
                  <td>
                    {edit ? (
                      <div className="flex min-w-52 flex-col gap-1">
                        <Select className="h-8 text-[13px]" value={f.source} onChange={(e) => set(i, { source: e.target.value })}>
                          <option value="const">ค่าคงที่</option>
                          <option value="blank">ว่าง (เติมช่องว่าง)</option>
                          {section === "detail" && <option value="seq">ลำดับที่ (1, 2, 3 …)</option>}
                          {vars.map((v) => (
                            <option key={v.key} value={v.key}>
                              {v.label}
                            </option>
                          ))}
                        </Select>
                        {f.source === "const" && <Input className="h-8 font-mono text-[13px]" value={f.value ?? ""} onChange={(e) => set(i, { value: e.target.value })} placeholder="ค่าที่ใส่ทุกบรรทัด" />}
                      </div>
                    ) : f.source === "const" ? (
                      <code className="rounded bg-paper px-1 text-xs">&quot;{f.value}&quot;</code>
                    ) : (
                      <span className="text-ink-soft">{varLabel(f.source)}</span>
                    )}
                  </td>
                  <td>
                    {edit ? (
                      <Select className="h-8 text-[13px]" value={f.type} onChange={(e) => set(i, { type: e.target.value as FieldDef["type"] })}>
                        {Object.entries(TYPE_LABEL).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      <span className="text-ink-soft">{TYPE_LABEL[f.type]}</span>
                    )}
                  </td>
                  <td>{edit ? <Input type="number" min={0} className="h-8 w-16 text-[13px]" value={f.len ?? ""} onChange={(e) => set(i, { len: e.target.value ? Number(e.target.value) : undefined })} /> : <span className="num">{f.len ?? "-"}</span>}</td>
                  <td>
                    {edit ? (
                      <div className="flex min-w-48 flex-wrap gap-1">
                        {f.type === "date" && (
                          <>
                            <Input className="h-8 w-28 font-mono text-[13px]" value={f.format ?? "DDMMYYYY"} onChange={(e) => set(i, { format: e.target.value })} title="DD MM YYYY YY" />
                            <Select className="h-8 w-20 text-[13px]" value={f.era ?? "BE"} onChange={(e) => set(i, { era: e.target.value as "BE" | "CE" })}>
                              <option value="BE">พ.ศ.</option>
                              <option value="CE">ค.ศ.</option>
                            </Select>
                          </>
                        )}
                        {fixed && (
                          <>
                            <Select className="h-8 w-24 text-[13px]" value={f.align ?? ""} onChange={(e) => set(i, { align: (e.target.value || undefined) as FieldDef["align"] })}>
                              <option value="">ชิดอัตโนมัติ</option>
                              <option value="left">ชิดซ้าย</option>
                              <option value="right">ชิดขวา</option>
                            </Select>
                            <Select className="h-8 w-24 text-[13px]" value={f.pad ?? ""} onChange={(e) => set(i, { pad: e.target.value || undefined })}>
                              <option value="">เติมอัตโนมัติ</option>
                              <option value=" ">เติมช่องว่าง</option>
                              <option value="0">เติม 0</option>
                            </Select>
                          </>
                        )}
                        <Checkbox label="ต้องมีค่า" checked={!!f.required} onChange={(v) => set(i, { required: v })} />
                      </div>
                    ) : (
                      <span className="text-xs text-ink-mute">
                        {[f.type === "date" && `${f.format} ${f.era === "CE" ? "ค.ศ." : "พ.ศ."}`, f.align === "right" && "ชิดขวา", f.pad === "0" && "เติม 0", f.note].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </td>
                  {edit && (
                    <td className="whitespace-nowrap">
                      <button type="button" className="rounded p-1 text-ink-mute hover:bg-paper hover:text-ink" onClick={() => move(i, -1)} aria-label="เลื่อนขึ้น">
                        <ArrowUp className="size-4" />
                      </button>
                      <button type="button" className="rounded p-1 text-ink-mute hover:bg-paper hover:text-ink" onClick={() => move(i, 1)} aria-label="เลื่อนลง">
                        <ArrowDown className="size-4" />
                      </button>
                      <button type="button" className="rounded p-1 text-ink-mute hover:bg-rust-soft hover:text-rust" onClick={() => onChange(fields.filter((_, j) => j !== i))} aria-label="ลบช่อง">
                        <Trash2 className="size-4" />
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
            {fields.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-4 text-center text-ink-mute">
                  ไม่มีส่วนนี้ — กด เพิ่มช่อง หากสเปกของธนาคารมี{SECTION_LABEL[section]}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function PreviewPanel({ layout }: { layout: FileLayout }) {
  const [periods, setPeriods] = useState<PeriodLite[] | null>(null);
  const [pid, setPid] = useState<number | null>(null);
  const [file, setFile] = useState<(RenderedFile & { ok: boolean }) | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    loadPeriods().then((p) => {
      setPeriods(p);
      if (p.length) setPid(p[0].id);
    });
  }, []);
  const period = periods?.find((p) => p.id === pid);
  const layoutJson = useMemo(() => JSON.stringify(layout), [layout]);
  useEffect(() => {
    if (!period) return;
    let alive = true;
    setBusy(true);
    const l = JSON.parse(layoutJson) as FileLayout;
    loadPreviewData(l, period)
      .then((d) => alive && setFile(buildExport(l, d)))
      .catch((e) => toast.error(e))
      .finally(() => alive && setBusy(false));
    return () => {
      alive = false;
    };
  }, [layoutJson, period]);
  return (
    <Panel
      title="ตัวอย่างไฟล์จากข้อมูลจริง"
      actions={
        <div className="flex items-center gap-2">
          <Select className="h-8 w-48 text-sm" value={pid ?? ""} onChange={(e) => setPid(Number(e.target.value))} aria-label="งวดเงินเดือน">
            {(periods ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
          <Button size="sm" variant="secondary" icon={<Download className="size-4" />} disabled={!file} onClick={() => file && downloadBuilt(file)}>
            ดาวน์โหลดตัวอย่าง
          </Button>
        </div>
      }
    >
      {periods === null || (busy && !file) ? (
        <Spinner className="mx-auto my-6" />
      ) : !periods.length ? (
        <p className="text-sm text-ink-mute">ยังไม่มีงวดเงินเดือน</p>
      ) : file ? (
        <div className="space-y-3">
          <FilePreview file={file} layout={layout} lines={8} />
          <IssueList issues={file.issues} max={8} />
          <p className="text-xs text-ink-mute">ตัวอย่างใช้ข้อมูลทุกคนในงวด (ไฟล์ประกันสังคมใช้สำนักงานใหญ่) — ไฟล์จริงสร้างจากหน้า งวดเงินเดือน › ไฟล์โอนธนาคาร, รายงาน › สปส.1-10 และ ภ.ง.ด.1</p>
        </div>
      ) : null}
    </Panel>
  );
}


