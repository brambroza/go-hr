"use client";

import { useState } from "react";
import Link from "next/link";
import { Copy, Globe, Mail, MessageCircle, Pencil, Phone } from "lucide-react";
import { useCan, useMe } from "@/components/app/me-context";
import { useSetting } from "@/components/settings/use-setting";
import { Badge, Button, Field, Input, Modal, PageHeader, Panel, Spinner, toast } from "@/components/ui";
import { money, thDate } from "@/lib/format";
import { DEFAULT_SUPPORT, type SupportSettings } from "@/lib/support";
import type { ChangeEntry } from "@/lib/changelog";
import type { TaxBracket } from "@/lib/payroll/tax";

interface Rates {
  sso: { employee: number; employer: number; floor: number; ceiling: number; max: number; upcoming: { from: string; ceiling: number }[] };
  tax: { brackets: TaxBracket[]; expense: { rate: number; max: number }; personal: number };
}

const KIND: Record<string, { label: string; color: string }> = { feature: { label: "ความสามารถใหม่", color: "blue" }, fix: { label: "แก้ไข", color: "gray" }, law: { label: "กฎหมาย / แบบฟอร์ม", color: "amber" } };

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.ok(`คัดลอก${what}แล้ว`);
  } catch {
    toast.error("คัดลอกไม่ได้ ให้เลือกข้อความแล้วกด Ctrl+C");
  }
}

export function HelpCenter({ version, license, rates, changelog }: { version: string; license: { id: string; licensee: string } | null; rates: Rates; changelog: ChangeEntry[] }) {
  const can = useCan();
  const me = useMe();
  const { value: sup, save, saving } = useSetting<SupportSettings>("support", DEFAULT_SUPPORT);
  const [edit, setEdit] = useState<SupportSettings | null>(null);
  if (!sup) return <div className="flex justify-center py-16"><Spinner /></div>;

  const contacts = [
    { icon: MessageCircle, label: "LINE OA", value: sup.line_oa },
    { icon: Phone, label: "โทรศัพท์", value: sup.phone },
    { icon: Mail, label: "อีเมล", value: sup.email },
    { icon: Globe, label: "เว็บไซต์", value: sup.website },
  ];
  const systemInfo = () =>
    [
      `ระบบ: GO HR ${version}`,
      license ? `License: ${license.id} (${license.licensee})` : "License: รุ่นทดลอง",
      `ผู้แจ้ง: ${me.displayName}${me.roleName ? ` (${me.roleName})` : ""}`,
      `เวลา: ${new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}`,
      `เบราว์เซอร์: ${navigator.userAgent}`,
    ].join("\n");

  return (
    <div>
      <PageHeader title="ช่วยเหลือและการดูแลระบบ" description="ช่องทางติดต่อทีมดูแลระบบ แผนอบรม อัตราตามกฎหมายที่ระบบใช้อยู่ และประวัติการอัปเดต" />
      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Panel
            title="ติดต่อทีมดูแลระบบ"
            actions={can("settings", "edit") && <Button size="sm" variant="secondary" icon={<Pencil className="size-4" />} onClick={() => setEdit(sup)}>แก้ไขช่องทางติดต่อ</Button>}
          >
            <p className="mb-3 text-[15px] font-medium">{sup.vendor}</p>
            <ul className="grid gap-3 sm:grid-cols-2">
              {contacts.map((c) => (
                <li key={c.label} className="flex items-center gap-3 rounded-[var(--radius-ctl)] border border-line-soft px-3 py-2.5">
                  <c.icon className="size-5 shrink-0 text-jade-600" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] text-ink-mute">{c.label}</div>
                    <div className="truncate select-all font-medium">{c.value || <span className="font-normal text-ink-mute">ยังไม่ได้ระบุ</span>}</div>
                  </div>
                  {c.value && <Button size="sm" variant="ghost" aria-label={`คัดลอก${c.label}`} icon={<Copy className="size-4" />} onClick={() => copy(c.value, c.label)} />}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[14px] text-ink-soft">เวลาทำการ {sup.hours}</p>
          </Panel>

          <Panel title="แจ้งปัญหาอย่างไรให้แก้ได้เร็ว">
            <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-[14.5px] text-ink-soft">
              <li>บอกว่าทำอะไรอยู่ที่หน้าไหน และกดปุ่มอะไร</li>
              <li>แนบภาพหน้าจอที่เห็นข้อความแจ้งเตือน</li>
              <li>ระบุรหัสพนักงานหรือเลขที่เอกสารที่เกี่ยวข้อง (ไม่ต้องส่งเลขบัตรหรือเงินเดือนในแชต)</li>
              <li>คัดลอกข้อมูลระบบด้านล่างแนบไปด้วย</li>
            </ol>
            <Button className="mt-3" variant="secondary" icon={<Copy className="size-4" />} onClick={() => copy(systemInfo(), "ข้อมูลระบบ")}>คัดลอกข้อมูลระบบสำหรับแจ้งปัญหา</Button>
            <p className="mt-2 text-[13px] text-ink-mute">GO HR {version}{license ? ` · License ${license.id}` : " · รุ่นทดลอง"}</p>
          </Panel>

          <Panel title={`แผนอบรมการใช้งาน ${sup.training.length} วัน`}>
            <div className="grid gap-3 lg:grid-cols-3">
              {sup.training.map((d) => (
                <section key={d.title} className="rounded-[var(--radius-ctl)] border border-line-soft p-4">
                  <h3 className="font-semibold">{d.title}</h3>
                  <p className="mt-0.5 text-[13px] text-jade-700">{d.audience}</p>
                  <ul className="mt-2 flex flex-col gap-1 text-[14px] text-ink-soft">
                    {d.topics.map((t) => <li key={t} className="flex gap-2"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-jade-500" />{t}</li>)}
                  </ul>
                </section>
              ))}
            </div>
            <p className="mt-3 text-[13.5px] text-ink-soft">หลังอบรม ทีม GO Along ดูแลการคำนวณเงินเดือนงวดแรกร่วมกับฝ่ายเงินเดือนจนส่งไฟล์ธนาคาร สปส. และ ภ.ง.ด.1 ครบ</p>
          </Panel>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Panel title="อัตราตามกฎหมายที่ระบบใช้อยู่">
            <h3 className="text-[14px] font-semibold">ประกันสังคม</h3>
            <dl className="num mt-1 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 text-[14px] [&_dd]:whitespace-nowrap [&_dd]:text-right">
              <dt className="text-ink-soft">อัตราเงินสมทบ ลูกจ้าง / นายจ้าง</dt><dd>{rates.sso.employee}% / {rates.sso.employer}%</dd>
              <dt className="text-ink-soft">ฐานค่าจ้างต่ำสุด – สูงสุด</dt><dd>{money(rates.sso.floor, 0)} – {money(rates.sso.ceiling, 0)}</dd>
              <dt className="text-ink-soft">เงินสมทบสูงสุดต่อเดือน</dt><dd>{money(rates.sso.max, 0)} บาท</dd>
            </dl>
            {rates.sso.upcoming.length > 0 && (
              <p className="mt-1 text-[13px] text-ink-mute">ตั้งล่วงหน้าแล้ว: {rates.sso.upcoming.map((u) => `เพดาน ${money(u.ceiling, 0)} ตั้งแต่ ${thDate(u.from)}`).join(" · ")}</p>
            )}
            <h3 className="mt-4 text-[14px] font-semibold">ภาษีเงินได้บุคคลธรรมดา</h3>
            <dl className="num mt-1 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 text-[14px] [&_dd]:whitespace-nowrap [&_dd]:text-right">
              <dt className="text-ink-soft">หักค่าใช้จ่าย</dt><dd>{rates.tax.expense.rate}% ไม่เกิน {money(rates.tax.expense.max, 0)}</dd>
              <dt className="text-ink-soft">ลดหย่อนส่วนตัว</dt><dd>{money(rates.tax.personal, 0)}</dd>
            </dl>
            <p className="num mt-1 text-[13.5px] text-ink-soft">อัตราภาษีขั้นบันได {rates.tax.brackets.length} ขั้น: {rates.tax.brackets.map((b) => b.rate).join(" / ")}%</p>
            <div className="mt-4 rounded-[var(--radius-ctl)] bg-paper p-3 text-[13.5px] leading-relaxed text-ink-soft">
              <p className="font-medium text-ink">เมื่อกฎหมายเปลี่ยน</p>
              <ul className="mt-1 flex flex-col gap-1">
                <li>• อัตราที่ประกาศวันมีผลไว้แล้ว เช่น เพดานประกันสังคม ระบบเปลี่ยนให้เองตามวันที่</li>
                <li>• อัตราภาษี ค่าลดหย่อน และอัตราเงินสมทบ ฝ่ายเงินเดือนแก้เองได้{can("settings") ? <> ที่ <Link href="/settings/rules" className="text-jade-700 hover:underline">ตั้งค่า › เงินเดือน / ภาษี</Link></> : " (ผู้มีสิทธิ์ตั้งค่า)"}</li>
                <li>• ถ้าแบบฟอร์มหรือรูปแบบไฟล์ของ สปส. / สรรพากร / ธนาคารเปลี่ยน ทีม GO Along ส่งชุดอัปเดตและติดตั้งให้ ระบบสำรองข้อมูลก่อนอัปเดตทุกครั้ง</li>
              </ul>
            </div>
          </Panel>

          <Panel title="ประวัติการอัปเดตระบบ">
            <ol className="flex flex-col gap-4">
              {changelog.map((c) => (
                <li key={c.version}>
                  <div className="flex items-baseline gap-2"><span className="font-semibold">GO HR {c.version}</span><span className="text-[13px] text-ink-mute">{thDate(c.date)}</span>{c.version === version && <Badge color="green">ที่ใช้อยู่</Badge>}</div>
                  <ul className="mt-1 flex flex-col gap-1 text-[13.5px] text-ink-soft">
                    {c.items.map((it) => <li key={it.text} className="flex flex-wrap items-start gap-1.5"><Badge color={KIND[it.kind].color}>{KIND[it.kind].label}</Badge><span className="min-w-0 flex-1">{it.text}</span></li>)}
                  </ul>
                </li>
              ))}
            </ol>
          </Panel>
        </div>
      </div>

      {edit && (
        <Modal
          open
          onClose={() => setEdit(null)}
          title="แก้ไขช่องทางติดต่อทีมดูแลระบบ"
          footer={<><Button variant="secondary" onClick={() => setEdit(null)}>ยกเลิก</Button><Button loading={saving} onClick={async () => { if (await save(edit, "บันทึกช่องทางติดต่อแล้ว")) setEdit(null); }}>บันทึก</Button></>}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="ผู้ดูแลระบบ (บริษัท)" className="sm:col-span-2"><Input value={edit.vendor} onChange={(e) => setEdit({ ...edit, vendor: e.target.value })} /></Field>
            <Field label="LINE OA"><Input value={edit.line_oa} onChange={(e) => setEdit({ ...edit, line_oa: e.target.value })} placeholder="@goalong" /></Field>
            <Field label="โทรศัพท์"><Input value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></Field>
            <Field label="อีเมล"><Input type="email" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></Field>
            <Field label="เว็บไซต์"><Input value={edit.website} onChange={(e) => setEdit({ ...edit, website: e.target.value })} /></Field>
            <Field label="เวลาทำการ" className="sm:col-span-2"><Input value={edit.hours} onChange={(e) => setEdit({ ...edit, hours: e.target.value })} /></Field>
          </div>
        </Modal>
      )}
    </div>
  );
}
