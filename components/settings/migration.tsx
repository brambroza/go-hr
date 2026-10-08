"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight, Check, Circle, Upload } from "lucide-react";
import { useCan } from "@/components/app/me-context";
import { Badge, Button, PageHeader, Panel, Spinner, clsx, runAction, toast } from "@/components/ui";
import { money, num, thDateTime } from "@/lib/format";
import { leaveTemplate, orgTemplate, parseLeave, parseOrg, parseYtd, ytdTemplate } from "@/lib/migration/import";
import { importLeaveAction, importOrgAction, importYtdAction, migrationRefsAction, migrationStatusAction, setMigrationStepAction, type MigrationStatus } from "@/lib/migration/actions";
import { CsvImportModal } from "./csv-import-modal";

type Who = "customer" | "vendor" | "both";
const WHO: Record<Who, { label: string; color: string }> = {
  customer: { label: "ลูกค้าเตรียมข้อมูล", color: "amber" },
  vendor: { label: "GO Along ทำให้", color: "blue" },
  both: { label: "ทำร่วมกัน", color: "violet" },
};

interface Step {
  key: string;
  title: string;
  prepare: ReactNode;
  who: Who;
  auto?: boolean; // done automatically from the data
  detail?: ReactNode;
  links?: { href: string; label: string }[];
  importKind?: "ytd" | "leave" | "org";
}

function buildSteps(s: MigrationStatus): Step[] {
  return [
    {
      key: "company", title: "ข้อมูลบริษัทและสาขา", who: "customer",
      prepare: "ชื่อบริษัท เลขประจำตัวผู้เสียภาษี 13 หลัก เลขที่สาขา และเลขที่บัญชีนายจ้างประกันสังคม (10 หลัก) ของทุกสาขา",
      auto: s.company.name && s.company.tax_id && s.company.sso_account,
      detail: [s.company.tax_id ? "มีเลขผู้เสียภาษี" : "ยังไม่มีเลขผู้เสียภาษี", s.company.sso_account ? "มีเลขบัญชีนายจ้าง สปส." : "ยังไม่มีเลขบัญชีนายจ้าง สปส."].join(" · "),
      links: [{ href: "/settings/company", label: "ข้อมูลบริษัท" }, { href: "/org/branches", label: "สาขา" }],
    },
    {
      key: "org", title: "สาขา โครงสร้างองค์กร และตำแหน่งงาน", who: "customer", importKind: "org",
      prepare: "รายชื่อสาขา ผังหน่วยงาน (ฝ่าย / แผนก / ไลน์) และรายชื่อตำแหน่งพร้อมระดับ ใช้รหัสและชื่อตามระบบเดิมได้เลย ต้องมีก่อนนำเข้าพนักงาน เพราะไฟล์พนักงานอ้างถึงรหัสเหล่านี้",
      auto: s.orgUnits > 0 && s.positions > 0,
      detail: `สาขา ${num(s.branches)} · หน่วยงาน ${num(s.orgUnits)} · ตำแหน่ง ${num(s.positions)}`,
      links: [{ href: "/org", label: "โครงสร้างองค์กร" }, { href: "/org/positions", label: "ตำแหน่งงาน" }],
    },
    {
      key: "employees", title: "รายชื่อพนักงาน เงินเดือน และบัญชีธนาคาร", who: "both",
      prepare: "ส่งออกรายชื่อพนักงานที่ยังทำงานจากระบบเดิมเป็น Excel: รหัส ชื่อ วันเริ่มงาน หน่วยงาน ตำแหน่ง เลขบัตรประชาชน เงินเดือน ธนาคารและเลขบัญชี",
      auto: s.employees > 0 && s.withSalary > 0,
      detail: `พนักงาน ${num(s.employees)} คน · มีเงินเดือน ${num(s.withSalary)} · มีบัญชีธนาคาร ${num(s.withBank)} · มีเลขบัตร ${num(s.withNationalId)}`,
      links: [{ href: "/employees/import", label: "นำเข้าพนักงาน" }],
    },
    {
      key: "ytd", title: `ยอดสะสมต้นปี ${s.year + 543} (เงินได้ ภาษี ประกันสังคม กองทุน)`, who: "both", importKind: "ytd",
      prepare: "รายงานยอดสะสมรายคนจากระบบเดิม ตั้งแต่ ม.ค. ถึงเดือนสุดท้ายที่จ่ายด้วยระบบเดิม ใช้คำนวณภาษีหัก ณ ที่จ่ายแบบสะสม และออก ภ.ง.ด.1ก / 50 ทวิ ให้ครบทั้งปี ถ้าเริ่มใช้ในเดือนมกราคม ข้ามขั้นนี้ได้",
      auto: s.ytdOpening > 0,
      detail: `มียอดยกมาแล้ว ${num(s.ytdOpening)} จาก ${num(s.employees)} คน`,
    },
    {
      key: "leave", title: `วันลาคงเหลือปี ${s.year + 543}`, who: "customer", importKind: "leave",
      prepare: "สิทธิ์วันลาปีนี้ ยอดยกมาจากปีก่อน และวันที่ใช้ไปแล้วในระบบเดิม แยกรายคนรายประเภทลา พนักงานจะเห็นวันลาคงเหลือถูกต้องตั้งแต่วันแรก",
      auto: s.leaveQuotas > 0,
      detail: `ตั้งสิทธิ์ลาแล้ว ${num(s.leaveQuotas)} รายการ · มีวันที่ใช้ไปจากระบบเดิม ${num(s.leaveOpening)} รายการ`,
      links: [{ href: "/leave/quotas", label: "โควต้าการลา" }],
    },
    {
      key: "recurring", title: "รายรับรายจ่ายประจำ และหนี้สินคงค้าง", who: "customer",
      prepare: "ค่าตำแหน่ง ค่าครองชีพ ค่าเดินทางที่จ่ายทุกเดือน และเงินกู้ / ผ่อนสินค้าที่ยังผ่อนไม่หมด พร้อมยอดคงเหลือและงวดละเท่าไร",
      detail: `รายการประจำ ${num(s.recurring)} · หนี้สิน ${num(s.loans)}`,
      links: [{ href: "/payroll/recurring", label: "รายรับรายจ่ายประจำ" }, { href: "/payroll/loans", label: "หนี้สินพนักงาน" }],
    },
    {
      key: "users", title: "บัญชีผู้ใช้และสิทธิ์", who: "vendor",
      prepare: "รายชื่อคนที่ใช้งานหลังบ้าน (HR เงินเดือน ผู้จัดการ) และสิทธิ์ที่ต้องการ GO Along สร้างบัญชีให้พนักงานทุกคนพร้อมกันได้",
      detail: `บัญชีที่ผูกกับพนักงานแล้ว ${num(s.linkedUsers)} บัญชี`,
      links: [{ href: "/settings/users", label: "ผู้ใช้งาน" }, { href: "/settings/roles", label: "กลุ่มสิทธิ์" }],
    },
    {
      key: "parallel", title: "ทดลองคำนวณเงินเดือนคู่ขนาน 1 งวด", who: "both",
      prepare: "คำนวณงวดเดียวกันทั้งในระบบเดิมและ GO HR แล้วเทียบเงินได้สุทธิ ภาษี และประกันสังคมรายคน ส่วนต่างทุกบาทต้องอธิบายได้ก่อนใช้จริง",
      detail: `สร้างงวดเงินเดือนแล้ว ${num(s.periods)} งวด`,
      links: [{ href: "/payroll", label: "งวดเงินเดือน" }],
    },
    {
      key: "golive", title: "เริ่มใช้งานจริง", who: "both",
      prepare: "แจ้งพนักงานติดตั้งแอปและเข้าสู่ระบบ เปิดลงเวลาด้วยแอป หยุดบันทึกข้อมูลในระบบเดิม และเก็บไฟล์สำรองจากระบบเดิมไว้อย่างน้อย 5 ปี",
    },
  ];
}

export function MigrationChecklist() {
  const can = useCan();
  const [s, setS] = useState<MigrationStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [modal, setModal] = useState<"ytd" | "leave" | "org" | null>(null);
  const ro = !can("settings", "edit");

  const load = useCallback(async () => {
    const r = await migrationStatusAction();
    if (!r.ok) return toast.error(r.error);
    setS(r.data!);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  if (!s) return <div className="flex justify-center py-16"><Spinner /></div>;
  const steps = buildSteps(s);
  const isDone = (st: Step) => !!s.checklist[st.key] || !!st.auto;
  const done = steps.filter(isDone).length;
  const current = steps.find((st) => !isDone(st))?.key;

  const toggle = (st: Step, v: boolean) =>
    runAction(() => setMigrationStepAction(st.key, v), { setBusy: (b) => setBusy(b ? st.key : null) }).then((r) => r && (toast.ok(v ? `“${st.title}” เสร็จแล้ว` : "ยกเลิกสถานะเสร็จแล้ว"), load()));

  const refs = async () => {
    const r = await migrationRefsAction();
    if (!r.ok) throw new Error(r.error);
    const low = (a: string[]) => new Set(a.map((x) => x.toLowerCase()));
    return { employees: low(r.data!.employees), types: low(r.data!.leaveTypes), branches: low(r.data!.branches), orgs: low(r.data!.orgs) };
  };

  return (
    <div>
      <PageHeader
        title="ย้ายข้อมูลเข้าระบบ"
        description="ทำตามลำดับจากบนลงล่างตอนเริ่มใช้ GO HR แทนระบบเดิม (เช่น HumanSoft) ขั้นที่ระบบตรวจได้จะติ๊กให้เองเมื่อมีข้อมูล ขั้นอื่นกด “ทำเสร็จแล้ว”"
      />

      <Panel className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm text-ink-soft">ความคืบหน้า</div>
            <div className="text-2xl font-semibold"><span className="num text-jade-700">{done}</span> <span className="text-ink-mute">/ {steps.length} ขั้นตอน</span></div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            {(Object.keys(WHO) as Who[]).map((w) => <Badge key={w} color={WHO[w].color}>{WHO[w].label}</Badge>)}
          </div>
        </div>
        <div className="mt-3 h-2 rounded-full bg-line-soft" role="progressbar" aria-valuenow={done} aria-valuemin={0} aria-valuemax={steps.length}>
          <div className="h-2 rounded-full bg-jade-500 transition-all" style={{ width: `${(done / steps.length) * 100}%` }} />
        </div>
      </Panel>

      <ol className="flex flex-col gap-3">
        {steps.map((st, i) => {
          const d = isDone(st);
          const mark = s.checklist[st.key];
          return (
            <li key={st.key}>
              <section className={clsx("rounded-[var(--radius-panel)] border bg-white p-4 shadow-[var(--shadow-soft)] sm:p-5", st.key === current ? "border-jade-300 ring-1 ring-jade-100" : "border-line/80")}>
                <div className="flex gap-4">
                  <span className={clsx("mt-0.5 grid size-8 shrink-0 place-items-center rounded-full text-sm font-semibold", d ? "bg-jade-600 text-white" : st.key === current ? "bg-jade-50 text-jade-700 ring-1 ring-jade-200" : "bg-paper text-ink-mute ring-1 ring-line")}>
                    {d ? <Check className="size-4" /> : i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-[16px] font-semibold">{st.title}</h2>
                      <Badge color={WHO[st.who].color}>{WHO[st.who].label}</Badge>
                      {d ? <Badge color="green">เสร็จแล้ว</Badge> : st.key === current ? <Badge color="blue">ขั้นถัดไป</Badge> : null}
                    </div>
                    <p className="mt-1 text-[14.5px] leading-relaxed text-ink-soft"><span className="font-medium text-ink">เตรียม:</span> {st.prepare}</p>
                    {st.detail && <p className="num mt-1 text-[13.5px] text-ink-mute">{st.detail}</p>}
                    {mark && <p className="mt-1 text-[13px] text-jade-700">ทำเสร็จเมื่อ {thDateTime(mark.done_at)}{mark.by ? ` โดย ${mark.by}` : ""}</p>}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {st.importKind === "org" && can("org", "create") && <Button size="sm" icon={<Upload className="size-4" />} onClick={() => setModal("org")}>นำเข้าโครงสร้างองค์กร</Button>}
                      {st.importKind === "ytd" && can("employee_private", "edit") && <Button size="sm" icon={<Upload className="size-4" />} onClick={() => setModal("ytd")}>นำเข้ายอดสะสม</Button>}
                      {st.importKind === "leave" && can("attendance", "edit") && <Button size="sm" icon={<Upload className="size-4" />} onClick={() => setModal("leave")}>นำเข้าวันลา</Button>}
                      {st.links?.map((l) => (
                        <Link key={l.href} href={l.href} className="inline-flex h-8 items-center gap-1 rounded-[var(--radius-ctl)] border border-line bg-white px-3 text-sm text-ink-soft hover:border-jade-300 hover:text-jade-700">
                          {l.label} <ArrowUpRight className="size-3.5" />
                        </Link>
                      ))}
                      {!ro && !st.auto && (
                        mark ? (
                          <Button size="sm" variant="ghost" loading={busy === st.key} onClick={() => toggle(st, false)}>ยกเลิกสถานะเสร็จ</Button>
                        ) : (
                          <Button size="sm" variant="secondary" icon={<Circle className="size-3.5" />} loading={busy === st.key} onClick={() => toggle(st, true)}>ทำเสร็จแล้ว</Button>
                        )
                      )}
                    </div>
                  </div>
                </div>
              </section>
            </li>
          );
        })}
      </ol>

      <CsvImportModal
        open={modal === "org"}
        onClose={() => setModal(null)}
        title="นำเข้าสาขา หน่วยงาน และตำแหน่ง"
        intro={<>ไฟล์เดียวใส่ได้ทั้ง 3 อย่าง คอลัมน์ <b>ประเภทข้อมูล</b> ใส่ สาขา หน่วยงาน หรือ ตำแหน่ง หน่วยงานระบุ <b>รหัสหน่วยงานแม่</b> และ <b>รหัสสาขา</b> ได้ ตำแหน่งระบุ <b>รหัสหน่วยงาน</b> ระดับ และกระบอกเงินเดือนได้ ถ้ารหัสมีอยู่แล้ว ระบบจะอัปเดตชื่อและข้อมูลของรหัสนั้น</>}
        templateName="แม่แบบโครงสร้างองค์กร.csv"
        template={orgTemplate()}
        headers={["ประเภท", "รหัส", "ชื่อ", "อยู่ใต้ / สังกัด"]}
        preview={async (t) => {
          const r = await refs();
          const p = parseOrg(t, { branches: r.branches, orgs: r.orgs });
          const KIND = { branch: "สาขา", org: "หน่วยงาน", position: "ตำแหน่ง" } as const;
          return { missing: p.missing, rows: p.rows.map((x) => ({ line: x.line, code: x.code, errors: x.errors, cells: [KIND[x.kind], x.code, x.name, x.kind === "org" ? [x.parent, x.branch].filter(Boolean).join(" · ") : x.kind === "position" ? x.unit : x.head_office ? "สำนักงานใหญ่" : ""] })) };
        }}
        submit={importOrgAction}
        onDone={load}
      />
      <CsvImportModal
        open={modal === "ytd"}
        onClose={() => setModal(null)}
        title="นำเข้ายอดสะสมต้นปี"
        intro={<>ใส่ยอดที่จ่ายด้วยระบบเดิมตั้งแต่ ม.ค. ถึงเดือนสุดท้ายก่อนใช้ GO HR รายคน: <b>เงินได้สะสม</b> (รวมเงินเดือน OT โบนัส) <b>ภาษีสะสม</b> <b>ประกันสังคมสะสม</b> (ส่วนพนักงาน) และ <b>กองทุนสำรองเลี้ยงชีพสะสม</b> นำเข้าซ้ำได้ ระบบจะแทนยอดเดิมของคนนั้น</>}
        templateName="แม่แบบยอดสะสมต้นปี.csv"
        template={ytdTemplate(s.year)}
        headers={["รหัส", "ปีภาษี", "เงินได้สะสม", "ภาษีสะสม", "ประกันสังคม", "กองทุน"]}
        preview={async (t) => {
          const r = await refs();
          const p = parseYtd(t, { defaultYear: s.year, knownCodes: r.employees });
          return { missing: p.missing, rows: p.rows.map((x) => ({ line: x.line, code: x.code, errors: x.errors, cells: [x.code, x.year + 543, money(x.income), money(x.tax), money(x.sso), money(x.pvd)] })) };
        }}
        submit={importYtdAction}
        onDone={load}
      />
      <CsvImportModal
        open={modal === "leave"}
        onClose={() => setModal(null)}
        title="นำเข้าวันลาคงเหลือ"
        intro={<>หนึ่งแถวต่อพนักงานหนึ่งคนต่อประเภทลา ใส่ <b>สิทธิ์ทั้งปี</b> <b>ยกมาจากปีก่อน</b> (ถ้ามี) และ <b>ใช้ไปแล้ว</b> ในระบบเดิม ระบบคำนวณคงเหลือให้ และนับวันลาที่ยื่นใน GO HR ต่อจากนี้ รหัสประเภทลาดูได้ที่ เอกสารและอนุมัติ › ประเภทการลา</>}
        templateName="แม่แบบวันลาคงเหลือ.csv"
        template={leaveTemplate(s.year)}
        headers={["รหัส", "ประเภทลา", "ปี", "สิทธิ์", "ยกมา", "ใช้ไป", "คงเหลือ"]}
        preview={async (t) => {
          const r = await refs();
          const p = parseLeave(t, { defaultYear: s.year, knownCodes: r.employees, leaveTypes: r.types });
          return { missing: p.missing, rows: p.rows.map((x) => ({ line: x.line, code: x.code, errors: x.errors, cells: [x.code, x.type, x.year + 543, x.quota, x.carried, x.used, x.remaining] })) };
        }}
        submit={importLeaveAction}
        onDone={load}
      />
    </div>
  );
}
