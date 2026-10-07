"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, Copy, ListChecks, Mail, MessageCircle, Newspaper, Pencil, Plus, Send, Trash2, Zap } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useCan, useMe } from "@/components/app/me-context";
import { Badge, Button, Checkbox, Empty, Field, Input, Modal, PageHeader, Panel, Select, Spinner, Tabs, Textarea, Toggle, clsx, toast, useConfirm } from "@/components/ui";
import { thDateTime } from "@/lib/format";
import { CHANNEL_LABELS, PLACEHOLDER_LABELS, RECIPIENT_LABELS, TRIGGERS, TRIGGER_BY, type Channel, type RuleAction, type RuleConditions, type TriggerKey } from "@/lib/jobs/rules";
import { loadChannelsAction, saveChannelsAction, testEmailAction, testLineAction, type ChannelInput } from "@/lib/notify/actions";

type Rule = { id: number; name: string; trigger: TriggerKey; conditions: RuleConditions; actions: RuleAction[]; is_enabled: boolean; last_fired_at: string | null; created_at: string };
type Log = { id: number; rule_id: number | null; job_code: string | null; fired_at: string; ref_key: string | null; status: string; message: string | null };

export function AutomationSettings() {
  const [tab, setTab] = useState<"rules" | "channels" | "logs">("rules");
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t === "channels" || t === "logs") setTab(t);
  }, []);
  return (
    <div>
      <PageHeader title="Automation และแจ้งเตือน" description="ตั้งกฎให้ระบบแจ้งเตือน สร้างงาน หรือโพสต์ข่าวโดยอัตโนมัติ และตั้งค่าช่องทางส่งข้อความ LINE OA / อีเมล" />
      <Tabs className="mb-4" value={tab} onChange={setTab} tabs={[{ value: "rules", label: "กฎ Automation" }, { value: "channels", label: "ช่องทางแจ้งเตือน" }, { value: "logs", label: "ประวัติการทำงาน" }]} />
      {tab === "rules" && <Rules />}
      {tab === "channels" && <Channels />}
      {tab === "logs" && <Logs />}
    </div>
  );
}

// ------------------------------------------------------------------ channels
function Channels() {
  const me = useMe();
  const [v, setV] = useState<(ChannelInput & { has_token: boolean; token_hint: string; has_secret: boolean; has_smtp: boolean; smtp_hint: string; webhook_url: string }) | null>(null);
  const [saving, setSaving] = useState(false);
  const [testTo, setTestTo] = useState(me.email && !me.email.endsWith(".local") ? me.email : "");
  const [testing, setTesting] = useState<string | null>(null);

  useEffect(() => {
    loadChannelsAction().then((r) => {
      if (!r.ok) return toast.error(r.error);
      const d = r.data!;
      setV({
        line_enabled: d.notify.line_enabled, line_oa_id: d.notify.line_oa_id ?? "", line_liff_id: d.notify.line_liff_id ?? "", line_add_friend_url: d.notify.line_add_friend_url ?? "",
        email_enabled: d.notify.email_enabled, from_email: d.notify.from_email ?? "", line_channel_access_token: "", line_channel_secret: "", smtp_url: "",
        has_token: d.has_token, token_hint: d.token_hint, has_secret: d.has_secret, has_smtp: d.has_smtp, smtp_hint: d.smtp_hint, webhook_url: d.webhook_url,
      });
    });
  }, []);
  if (!v) return <div className="flex justify-center py-16"><Spinner /></div>;
  const set = (p: Partial<typeof v>) => setV({ ...v, ...p });

  const save = async () => {
    setSaving(true);
    const r = await saveChannelsAction(v);
    setSaving(false);
    if (!r.ok) return toast.error(r.error);
    toast.ok(r.message!);
    set({
      line_channel_access_token: "", line_channel_secret: "", smtp_url: "",
      has_token: v.has_token || !!v.line_channel_access_token, token_hint: v.line_channel_access_token ? `••••${v.line_channel_access_token.slice(-4)}` : v.token_hint,
      has_secret: v.has_secret || !!v.line_channel_secret, has_smtp: v.has_smtp || !!v.smtp_url, smtp_hint: v.smtp_url ? v.smtp_url.replace(/\/\/([^:@/]+):([^@]+)@/, "//$1:••••@") : v.smtp_hint,
    });
  };
  const test = async (kind: "line" | "email") => {
    setTesting(kind);
    const r = kind === "line" ? await testLineAction() : await testEmailAction(testTo);
    setTesting(null);
    if (r.ok) toast.ok(r.message!);
    else toast.error(r.error);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title={<span className="flex items-center gap-2"><MessageCircle className="size-4 text-[#06c755]" /> LINE Official Account</span>} actions={<Toggle checked={v.line_enabled} onChange={(x) => set({ line_enabled: x })} label="เปิดใช้" />}>
          <div className="flex flex-col gap-3">
            <Field label="Channel access token (long-lived)" hint={v.has_token ? `บันทึกไว้แล้ว (${v.token_hint}) — เว้นว่างเพื่อใช้ค่าเดิม` : "จาก LINE Developers > Messaging API"}>
              <Input type="password" autoComplete="off" value={v.line_channel_access_token} onChange={(e) => set({ line_channel_access_token: e.target.value })} placeholder={v.has_token ? "••••••••" : ""} />
            </Field>
            <Field label="Channel secret" hint={v.has_secret ? "บันทึกไว้แล้ว — เว้นว่างเพื่อใช้ค่าเดิม" : "ใช้ตรวจสอบลายเซ็นของ Webhook"}>
              <Input type="password" autoComplete="off" value={v.line_channel_secret} onChange={(e) => set({ line_channel_secret: e.target.value })} placeholder={v.has_secret ? "••••••••" : ""} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Basic ID ของ OA" hint="เช่น @gohr — แสดงให้พนักงานเพิ่มเพื่อน"><Input value={v.line_oa_id} onChange={(e) => set({ line_oa_id: e.target.value })} placeholder="@xxxxxxx" /></Field>
              <Field label="LIFF ID (ถ้ามี)"><Input value={v.line_liff_id} onChange={(e) => set({ line_liff_id: e.target.value })} /></Field>
            </div>
            <Field label="ลิงก์เพิ่มเพื่อน (ถ้าไม่กรอก ระบบสร้างจาก Basic ID)"><Input value={v.line_add_friend_url} onChange={(e) => set({ line_add_friend_url: e.target.value })} placeholder="https://lin.ee/xxxx" /></Field>
            <Field label="Webhook URL (นำไปตั้งใน LINE Developers และเปิด Use webhook)">
              <div className="flex gap-2">
                <Input readOnly value={v.webhook_url} className="bg-paper" />
                <Button variant="secondary" icon={<Copy className="size-4" />} onClick={() => navigator.clipboard?.writeText(v.webhook_url).then(() => toast.ok("คัดลอกแล้ว"))}>คัดลอก</Button>
              </div>
            </Field>
            <div className="flex items-center justify-between gap-2 border-t border-line-soft pt-3">
              <span className="text-sm text-ink-mute">ส่งข้อความทดสอบหา LINE ที่เชื่อมกับบัญชีของคุณ</span>
              <Button variant="secondary" icon={<Send className="size-4" />} loading={testing === "line"} onClick={() => test("line")}>ส่งข้อความทดสอบ</Button>
            </div>
          </div>
        </Panel>
        <Panel title={<span className="flex items-center gap-2"><Mail className="size-4 text-jade-600" /> อีเมล (SMTP)</span>} actions={<Toggle checked={v.email_enabled} onChange={(x) => set({ email_enabled: x })} label="เปิดใช้" />}>
          <div className="flex flex-col gap-3">
            <Field label="SMTP URL" hint={v.has_smtp ? `บันทึกไว้แล้ว (${v.smtp_hint}) — เว้นว่างเพื่อใช้ค่าเดิม` : "เช่น smtps://hr%40company.co.th:app-password@smtp.gmail.com:465"}>
              <Input type="password" autoComplete="off" value={v.smtp_url} onChange={(e) => set({ smtp_url: e.target.value })} placeholder={v.has_smtp ? "••••••••" : "smtp://user:pass@host:587"} />
            </Field>
            <Field label="อีเมลผู้ส่ง" hint='เช่น GO HR <hr@company.co.th>'><Input value={v.from_email} onChange={(e) => set({ from_email: e.target.value })} /></Field>
            <div className="flex flex-wrap items-end gap-2 border-t border-line-soft pt-3">
              <Field label="ส่งอีเมลทดสอบไปที่" className="min-w-56 flex-1"><Input type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} /></Field>
              <Button variant="secondary" icon={<Send className="size-4" />} loading={testing === "email"} onClick={() => test("email")}>ส่งข้อความทดสอบ</Button>
            </div>
            <p className="text-xs text-ink-mute">บันทึกการตั้งค่าก่อนทดสอบ · ระบบส่งอีเมลไปยังอีเมลในข้อมูลพนักงาน</p>
          </div>
        </Panel>
      </div>
      <p className="text-sm text-ink-mute">Token, secret และรหัสผ่าน SMTP เก็บแยกในตั้งค่าที่อ่านได้เฉพาะผู้ดูแลระบบ และไม่ถูกบันทึกค่าลง Back Log · การแจ้งเตือนจะถูกส่งโดยงาน &quot;ส่งการแจ้งเตือน LINE/Email&quot; ทุก 2 นาที</p>
      <div className="flex justify-end"><Button loading={saving} onClick={save}>บันทึก</Button></div>
    </div>
  );
}

// ------------------------------------------------------------------ rules
const ACTION_ICON = { notify: Bell, todo: ListChecks, feed: Newspaper } as const;

function describeAction(a: RuleAction): string {
  if (a.type === "notify") return `แจ้ง ${a.to.map((t) => RECIPIENT_LABELS[t] ?? (t.startsWith("role:") ? `กลุ่ม ${t.slice(5)}` : "ผู้ใช้ที่ระบุ")).join(", ")} ผ่าน ${a.channels.map((c) => CHANNEL_LABELS[c]).join("/")}`;
  if (a.type === "todo") return `สร้างงานให้${a.assign_to === "hr" ? " HR" : a.assign_to === "supervisor" ? "หัวหน้า" : "พนักงาน"}: ${a.title}`;
  return "โพสต์ใน News Feed";
}
function describeCond(r: Rule): string {
  const c = r.conditions ?? {};
  const out: string[] = [];
  if (c.request_types?.length) out.push(`ประเภท: ${c.request_types.join(", ")}`);
  if (c.threshold) out.push(`ตั้งแต่ ${c.threshold} ครั้ง/เดือน`);
  if (c.days_before?.length) out.push(`ล่วงหน้า ${c.days_before.join(", ")} วัน`);
  return out.join(" · ");
}

const TEMPLATES: Omit<Rule, "id" | "last_fired_at" | "created_at" | "is_enabled">[] = [
  { name: "แจ้งหัวหน้าเมื่อลูกน้องมาสายเกิน 3 ครั้ง", trigger: "late.threshold", conditions: { threshold: 3 }, actions: [{ type: "notify", to: ["supervisor", "employee"], channels: ["app", "line"], title: "{{employee_name}} มาสาย {{count}} ครั้งในเดือน {{month}}", body: "กรุณาพูดคุยและติดตามการมาทำงาน" }] },
  { name: "สร้างงานให้ HR เมื่อสัญญาจ้างใกล้หมด", trigger: "contract.expiring", conditions: { days_before: [30] }, actions: [{ type: "todo", assign_to: "hr", title: "ต่อสัญญา/แจ้งสิ้นสุดสัญญา {{employee_name}} ({{date}})", due_days: 14, priority: "high" }] },
  { name: "แจ้งพนักงานเมื่อเอกสารได้รับอนุมัติ ทาง LINE", trigger: "request.approved", conditions: {}, actions: [{ type: "notify", to: ["employee"], channels: ["line"], title: "{{request_type}} {{doc_no}} อนุมัติแล้ว" }] },
  { name: "ต้อนรับพนักงานใหม่ใน News Feed", trigger: "employee.created", conditions: {}, actions: [{ type: "feed", content: "ยินดีต้อนรับ {{employee_name}} ({{nickname}}) สมาชิกใหม่ของ {{company}}" }] },
  { name: "แจ้งพนักงานที่ลืมสแกนเวลา", trigger: "missing_scan", conditions: {}, actions: [{ type: "notify", to: ["employee"], channels: ["app", "line"], title: "ลืมสแกนเวลาวันที่ {{date}}", body: "กรุณายื่นคำขอเพิ่มเวลาในแอป GO HR" }] },
];

function Rules() {
  const sb = supabaseBrowser();
  const can = useCan();
  const { confirm, dialog } = useConfirm();
  const [rows, setRows] = useState<Rule[] | null>(null);
  const [counts, setCounts] = useState<Map<number, number>>(new Map());
  const [editing, setEditing] = useState<Partial<Rule> | null>(null);
  const [pickTpl, setPickTpl] = useState(false);
  const ro = !can("settings", "edit");

  const load = useCallback(async () => {
    const { data, error } = await sb.from("automation_rules").select("*").order("id");
    if (error) toast.error(error.message);
    setRows((data ?? []) as Rule[]);
    const { data: logs } = await sb.from("automation_logs").select("rule_id").not("rule_id", "is", null).gte("fired_at", new Date(Date.now() - 30 * 86400000).toISOString()).limit(5000);
    const m = new Map<number, number>();
    for (const l of logs ?? []) m.set(l.rule_id as number, (m.get(l.rule_id as number) ?? 0) + 1);
    setCounts(m);
  }, [sb]);
  useEffect(() => {
    load();
  }, [load]);

  const toggle = async (r: Rule, on: boolean) => {
    setRows((l) => l?.map((x) => (x.id === r.id ? { ...x, is_enabled: on } : x)) ?? null);
    const { error } = await sb.from("automation_rules").update({ is_enabled: on }).eq("id", r.id);
    if (error) (toast.error(error.message), load());
    else toast.ok(on ? `เปิดใช้กฎ “${r.name}” แล้ว` : `ปิดกฎ “${r.name}” แล้ว`);
  };
  const remove = async (r: Rule) => {
    if (!(await confirm(`ลบกฎ "${r.name}"?`, { danger: true, confirmText: "ลบกฎ" }))) return;
    const { error } = await sb.from("automation_rules").delete().eq("id", r.id);
    if (error) return toast.error(error.message);
    toast.ok("ลบกฎแล้ว");
    load();
  };

  return (
    <div className="flex flex-col gap-4">
      {!ro && (
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={() => setPickTpl(true)}>เริ่มจากตัวอย่าง</Button>
          <Button icon={<Plus className="size-4" />} onClick={() => setEditing({ trigger: "request.submitted", conditions: {}, actions: [{ type: "notify", to: ["hr"], channels: ["app"], title: "" }], is_enabled: true })}>สร้างกฎ</Button>
        </div>
      )}
      <Panel bodyClass="p-0">
        {!rows ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : !rows.length ? (
          <Empty icon={<Zap className="size-8" />} title="ยังไม่มีกฎ Automation" description="เช่น แจ้งหัวหน้าเมื่อพนักงานมาสายเกิน 3 ครั้ง หรือสร้างงานให้ HR เมื่อสัญญาใกล้หมด" action={!ro && <Button variant="secondary" onClick={() => setPickTpl(true)}>เริ่มจากตัวอย่าง</Button>} />
        ) : (
          <ul className="divide-y divide-line-soft">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{r.name}</span>
                    <Badge color={TRIGGER_BY[r.trigger]?.kind === "event" ? "blue" : "violet"}>{TRIGGER_BY[r.trigger]?.label ?? r.trigger}</Badge>
                  </div>
                  {describeCond(r) && <div className="mt-0.5 text-sm text-ink-soft">{describeCond(r)}</div>}
                  <ul className="mt-1 flex flex-col gap-0.5">
                    {r.actions.map((a, i) => {
                      const Icon = ACTION_ICON[a.type];
                      return <li key={i} className="flex items-center gap-1.5 text-sm text-ink-soft"><Icon className="size-3.5 text-jade-600" />{describeAction(a)}</li>;
                    })}
                  </ul>
                </div>
                <div className="flex shrink-0 items-center gap-4 text-sm text-ink-mute">
                  <span className="text-right">ทำงานล่าสุด {r.last_fired_at ? thDateTime(r.last_fired_at) : "-"}<br />30 วัน: <span className="num">{counts.get(r.id) ?? 0}</span> ครั้ง</span>
                  <Toggle checked={r.is_enabled} disabled={ro} onChange={(x) => toggle(r, x)} label={<span className="sr-only">เปิดใช้</span>} />
                  {!ro && (
                    <>
                      <Button variant="ghost" size="sm" icon={<Pencil className="size-4" />} onClick={() => setEditing(r)} aria-label="แก้ไข" />
                      <Button variant="ghost" size="sm" icon={<Trash2 className="size-4" />} onClick={() => remove(r)} aria-label="ลบ" />
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <p className="text-sm text-ink-mute">กฎจะถูกตรวจโดยงาน &quot;ตรวจเงื่อนไข Automation&quot; (ทุก 30 นาที ปรับได้ที่ ตั้งค่าเวลารันคำสั่ง) · แต่ละเหตุการณ์ทำงานเพียงครั้งเดียว</p>
      <Modal open={pickTpl} onClose={() => setPickTpl(false)} title="เลือกตัวอย่างกฎ" size="md">
        <ul className="flex flex-col gap-2">
          {TEMPLATES.map((t) => (
            <li key={t.name}>
              <button type="button" onClick={() => (setPickTpl(false), setEditing({ ...structuredClone(t), is_enabled: true }))} className="w-full rounded-[var(--radius-ctl)] border border-line px-3 py-2.5 text-left hover:border-jade-300 hover:bg-jade-50">
                <div className="font-medium">{t.name}</div>
                <div className="text-sm text-ink-soft">{TRIGGER_BY[t.trigger].label} → {t.actions.map(describeAction).join(", ")}</div>
              </button>
            </li>
          ))}
        </ul>
      </Modal>
      {editing && <RuleForm value={editing} onClose={() => setEditing(null)} onSaved={() => (setEditing(null), load())} />}
      {dialog}
    </div>
  );
}

function RuleForm({ value, onClose, onSaved }: { value: Partial<Rule>; onClose: () => void; onSaved: () => void }) {
  const sb = supabaseBrowser();
  const [v, setV] = useState<Partial<Rule>>(structuredClone(value));
  const [reqTypes, setReqTypes] = useState<{ code: string; name: string }[]>([]);
  const [roles, setRoles] = useState<{ code: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const trig = TRIGGER_BY[(v.trigger ?? "request.submitted") as TriggerKey];
  const c = v.conditions ?? {};
  useEffect(() => {
    sb.from("request_types").select("code, name").order("sort_order").then(({ data }: { data: { code: string; name: string }[] | null }) => setReqTypes(data ?? []));
    sb.from("role_groups").select("code, name").order("id").then(({ data }: { data: { code: string; name: string }[] | null }) => setRoles(data ?? []));
  }, [sb]);
  const setC = (p: Partial<RuleConditions>) => setV((x) => ({ ...x, conditions: { ...(x.conditions ?? {}), ...p } }));
  const setA = (i: number, a: RuleAction) => setV((x) => ({ ...x, actions: x.actions!.map((y, j) => (j === i ? a : y)) }));

  const save = async () => {
    let e: string | null = null;
    if (!v.name?.trim()) e = "ตั้งชื่อกฎ";
    else if (!v.actions?.length) e = "เพิ่ม Action อย่างน้อย 1 รายการ";
    else
      for (const a of v.actions) {
        if (a.type === "notify" && (!a.to.length || !a.channels.length || !a.title.trim())) e = "การแจ้งเตือนต้องมีผู้รับ ช่องทาง และหัวข้อ";
        if (a.type === "todo" && !a.title.trim()) e = "กรอกชื่องานที่จะสร้าง";
        if (a.type === "feed" && !a.content.trim()) e = "กรอกข้อความที่จะโพสต์";
      }
    if (!e && trig.conditions.includes("days_before") && !c.days_before?.length) e = "กรอกจำนวนวันล่วงหน้า";
    setErr(e);
    if (e) return;
    // keep only conditions that apply to the trigger
    const conditions: RuleConditions = {};
    if (trig.conditions.includes("request_types") && c.request_types?.length) conditions.request_types = c.request_types;
    if (trig.conditions.includes("threshold")) conditions.threshold = Number(c.threshold ?? 3);
    if (trig.conditions.includes("days_before")) conditions.days_before = c.days_before;
    setBusy(true);
    const row = { name: v.name!.trim(), trigger: trig.key, conditions, actions: v.actions, is_enabled: v.is_enabled ?? true };
    const res = v.id ? await sb.from("automation_rules").update(row).eq("id", v.id) : await sb.from("automation_rules").insert(row);
    setBusy(false);
    if (res.error) return toast.error(`บันทึกไม่ได้: ${res.error.message}`);
    toast.ok("บันทึกกฎแล้ว");
    onSaved();
  };

  return (
    <Modal open onClose={onClose} size="lg" title={v.id ? "แก้ไขกฎ Automation" : "สร้างกฎ Automation"}
      footer={<>{err && <span className="mr-auto self-center text-sm text-rust">{err}</span>}<Button variant="secondary" onClick={onClose}>ยกเลิก</Button><Button loading={busy} onClick={save}>บันทึก</Button></>}>
      <div className="flex flex-col gap-4">
        <Field label="ชื่อกฎ" required><Input value={v.name ?? ""} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
        <section className="rounded-[var(--radius-ctl)] border border-line p-3">
          <h4 className="mb-2 text-sm font-semibold text-ink-soft">1. เมื่อ (Trigger)</h4>
          <Select value={trig.key} onChange={(e) => setV({ ...v, trigger: e.target.value as TriggerKey })}>
            <optgroup label="เมื่อเกิดเหตุการณ์">{TRIGGERS.filter((t) => t.kind === "event").map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</optgroup>
            <optgroup label="ตรวจตามเวลา">{TRIGGERS.filter((t) => t.kind === "time").map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</optgroup>
          </Select>
          <p className="mt-1 text-xs text-ink-mute">{trig.help}</p>
          {trig.conditions.length > 0 && (
            <div className="mt-3 flex flex-col gap-3 border-t border-line-soft pt-3">
              <h4 className="text-sm font-semibold text-ink-soft">เงื่อนไข</h4>
              {trig.conditions.includes("request_types") && (
                <Field label="ประเภทเอกสาร" hint="ไม่เลือก = ทุกประเภท">
                  <div className="flex flex-wrap gap-1.5">
                    {reqTypes.map((t) => {
                      const on = c.request_types?.includes(t.code);
                      return <button key={t.code} type="button" onClick={() => setC({ request_types: on ? c.request_types!.filter((x) => x !== t.code) : [...(c.request_types ?? []), t.code] })} className={clsx("rounded-full border px-2.5 py-1 text-sm", on ? "border-jade-600 bg-jade-50 text-jade-800" : "border-line text-ink-soft")}>{t.name}</button>;
                    })}
                  </div>
                </Field>
              )}
              {trig.conditions.includes("threshold") && <Field label="ตั้งแต่ (ครั้งต่อเดือน)"><Input type="number" min={1} value={c.threshold ?? 3} onChange={(e) => setC({ threshold: Number(e.target.value) })} className="w-32" /></Field>}
              {trig.conditions.includes("days_before") && (
                <Field label="ล่วงหน้า (วัน)" hint="หลายค่าคั่นด้วยจุลภาค เช่น 30, 7 — แจ้งครั้งเดียวต่อช่วง">
                  <Input defaultValue={(c.days_before ?? [30]).join(", ")} onBlur={(e) => setC({ days_before: [...new Set(e.target.value.split(/[,\s]+/).map(Number).filter((x) => Number.isInteger(x) && x >= 0))].sort((a, b) => b - a) })} className="w-48" />
                </Field>
              )}
            </div>
          )}
        </section>
        <section className="rounded-[var(--radius-ctl)] border border-line p-3">
          <h4 className="mb-2 text-sm font-semibold text-ink-soft">2. ให้ทำ (Actions)</h4>
          <div className="flex flex-col gap-3">
            {(v.actions ?? []).map((a, i) => (
              <ActionEditor key={i} a={a} roles={roles} onChange={(x) => setA(i, x)} onRemove={() => setV({ ...v, actions: v.actions!.filter((_, j) => j !== i) })} />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" variant="ghost" icon={<Bell className="size-4" />} onClick={() => setV({ ...v, actions: [...(v.actions ?? []), { type: "notify", to: ["hr"], channels: ["app"], title: "" }] })}>เพิ่มการแจ้งเตือน</Button>
            <Button size="sm" variant="ghost" icon={<ListChecks className="size-4" />} onClick={() => setV({ ...v, actions: [...(v.actions ?? []), { type: "todo", assign_to: "hr", title: "", due_days: 7, priority: "normal" }] })}>เพิ่มการสร้างงาน</Button>
            <Button size="sm" variant="ghost" icon={<Newspaper className="size-4" />} onClick={() => setV({ ...v, actions: [...(v.actions ?? []), { type: "feed", content: "" }] })}>เพิ่มการโพสต์</Button>
          </div>
          <div className="mt-3 border-t border-line-soft pt-2 text-xs text-ink-mute">
            ใช้ข้อความแทนค่าได้: {trig.placeholders.map((p) => <code key={p} className="mr-1.5 inline-block rounded bg-paper px-1" title={PLACEHOLDER_LABELS[p]}>{`{{${p}}}`}</code>)}
          </div>
        </section>
        <Toggle checked={v.is_enabled ?? true} onChange={(x) => setV({ ...v, is_enabled: x })} label="เปิดใช้งานกฎนี้" />
      </div>
    </Modal>
  );
}

function ActionEditor({ a, roles, onChange, onRemove }: { a: RuleAction; roles: { code: string; name: string }[]; onChange: (a: RuleAction) => void; onRemove: () => void }) {
  const Icon = ACTION_ICON[a.type];
  return (
    <div className="rounded-[var(--radius-ctl)] bg-paper p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-sm font-medium"><Icon className="size-4 text-jade-600" />{a.type === "notify" ? "ส่งการแจ้งเตือน" : a.type === "todo" ? "สร้าง To-do" : "โพสต์ News Feed"}</span>
        <button type="button" aria-label="ลบ Action" onClick={onRemove} className="p-1 text-ink-mute hover:text-rust"><Trash2 className="size-4" /></button>
      </div>
      {a.type === "notify" && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <span className="text-sm text-ink-soft">ถึง:</span>
            {(["employee", "supervisor", "hr"] as const).map((t) => <Checkbox key={t} label={RECIPIENT_LABELS[t]} checked={a.to.includes(t)} onChange={(x) => onChange({ ...a, to: x ? [...a.to, t] : a.to.filter((y) => y !== t) })} />)}
            <Select className="h-8 w-auto text-sm" value="" onChange={(e) => e.target.value && !a.to.includes(`role:${e.target.value}`) && onChange({ ...a, to: [...a.to, `role:${e.target.value}`] })}>
              <option value="">+ กลุ่มผู้ใช้</option>
              {roles.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
            </Select>
            {a.to.filter((t) => t.startsWith("role:")).map((t) => <Badge key={t} color="violet">{roles.find((r) => `role:${r.code}` === t)?.name ?? t}<button type="button" aria-label="เอาออก" onClick={() => onChange({ ...a, to: a.to.filter((y) => y !== t) })}>×</button></Badge>)}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <span className="text-sm text-ink-soft">ช่องทาง:</span>
            {(["app", "line", "email"] as Channel[]).map((ch) => <Checkbox key={ch} label={CHANNEL_LABELS[ch]} checked={a.channels.includes(ch)} onChange={(x) => onChange({ ...a, channels: x ? [...a.channels, ch] : a.channels.filter((y) => y !== ch) })} />)}
          </div>
          <Input value={a.title} onChange={(e) => onChange({ ...a, title: e.target.value })} placeholder="หัวข้อ เช่น {{employee_name}} มาสาย {{count}} ครั้ง" />
          <Textarea value={a.body ?? ""} onChange={(e) => onChange({ ...a, body: e.target.value })} placeholder="รายละเอียด (ไม่บังคับ)" className="min-h-14" />
        </div>
      )}
      {a.type === "todo" && (
        <div className="grid gap-2 sm:grid-cols-3">
          <Input className="sm:col-span-3" value={a.title} onChange={(e) => onChange({ ...a, title: e.target.value })} placeholder="ชื่องาน เช่น ติดตามเอกสาร {{employee_name}}" />
          <Select value={a.assign_to} onChange={(e) => onChange({ ...a, assign_to: e.target.value as "hr" })}><option value="hr">มอบหมายให้ HR</option><option value="supervisor">มอบหมายให้หัวหน้า</option><option value="employee">มอบหมายให้พนักงาน</option></Select>
          <div className="flex items-center gap-2"><Input type="number" min={0} value={a.due_days ?? 7} onChange={(e) => onChange({ ...a, due_days: Number(e.target.value) })} className="w-20" /><span className="text-sm text-ink-soft">วันจึงครบกำหนด</span></div>
          <Select value={a.priority ?? "normal"} onChange={(e) => onChange({ ...a, priority: e.target.value as "normal" })}><option value="low">ความสำคัญต่ำ</option><option value="normal">ปกติ</option><option value="high">สูง</option><option value="urgent">ด่วนมาก</option></Select>
        </div>
      )}
      {a.type === "feed" && <Textarea value={a.content} onChange={(e) => onChange({ ...a, content: e.target.value })} placeholder="ข้อความ เช่น ยินดีต้อนรับ {{employee_name}}" />}
    </div>
  );
}

// ------------------------------------------------------------------ logs
function Logs() {
  const sb = supabaseBrowser();
  const [rows, setRows] = useState<Log[] | null>(null);
  const [rules, setRules] = useState<Map<number, string>>(new Map());
  const [filter, setFilter] = useState<"all" | "rules" | "jobs" | "error">("all");
  useEffect(() => {
    (async () => {
      let q = sb.from("automation_logs").select("*").order("id", { ascending: false }).limit(300);
      if (filter === "rules") q = q.not("rule_id", "is", null);
      if (filter === "jobs") q = q.is("rule_id", null);
      if (filter === "error") q = q.eq("status", "error");
      const [{ data }, { data: r }] = await Promise.all([q, sb.from("automation_rules").select("id, name")]);
      setRows((data ?? []) as Log[]);
      setRules(new Map(((r ?? []) as { id: number; name: string }[]).map((x) => [x.id, x.name])));
    })();
  }, [sb, filter]);
  const list = useMemo(() => rows ?? [], [rows]);
  return (
    <Panel bodyClass="p-0" title="300 รายการล่าสุด" actions={
      <Select value={filter} onChange={(e) => setFilter(e.target.value as "all")} className="h-9 w-44">
        <option value="all">ทั้งหมด</option><option value="rules">กฎ Automation</option><option value="jobs">งานตามเวลา</option><option value="error">เฉพาะที่ผิดพลาด</option>
      </Select>}>
      {!rows ? <div className="flex justify-center py-12"><Spinner /></div> : !list.length ? <Empty title="ยังไม่มีประวัติ" /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-[14px]">
            <thead className="text-left text-sm text-ink-soft"><tr className="border-b border-line-soft"><th className="px-4 py-2 font-medium">เวลา</th><th className="px-3 py-2 font-medium">ที่มา</th><th className="px-3 py-2 font-medium">สถานะ</th><th className="px-4 py-2 font-medium">รายละเอียด</th></tr></thead>
            <tbody>
              {list.map((l) => (
                <tr key={l.id} className="border-b border-line-soft last:border-0 align-top">
                  <td className="whitespace-nowrap px-4 py-2 text-ink-soft">{thDateTime(l.fired_at)}</td>
                  <td className="px-3 py-2">{l.rule_id ? <Badge color="violet">{rules.get(l.rule_id) ?? `กฎ #${l.rule_id}`}</Badge> : <Badge color="gray">{l.job_code ?? "-"}</Badge>}</td>
                  <td className="px-3 py-2"><Badge color={l.status === "error" ? "red" : "green"}>{l.status === "error" ? "ผิดพลาด" : "สำเร็จ"}</Badge></td>
                  <td className="px-4 py-2 text-ink-soft">{l.message ?? l.ref_key}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
