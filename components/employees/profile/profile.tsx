"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Camera, CalendarDays, Mail, Phone, UserX } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useCan, useMaybeMe } from "@/components/app/me-context";
import { Badge, Empty, Panel, Select, Spinner, clsx, toast } from "@/components/ui";
import { Avatar } from "@/components/employees/avatar";
import { EMP_STATUS, EMP_STATUS_COLOR, EMP_TYPE, serviceText, type Res } from "@/lib/employees/labels";
import { resizeImage, uploadFile } from "@/lib/storage";
import { thDate } from "@/lib/format";
import { humanError } from "@/components/crud/crud-page";
import type { Employee, TabProps } from "./types";
import { PersonalTab, EmploymentTab } from "./tab-basic";
import { PrivateTab } from "./tab-private";
import { AddressTab, FamilyTab, EducationTab, WorkHistoryTab, SkillsTab, GuaranteeTab, FundsTab, TrainingTab, AssetsTab, DocumentsTab, SalaryHistoryTab, MovementsTab } from "./tab-children";
import { TaxTab } from "./tab-tax";
import { AccountTab } from "./tab-account";
import { FacesTab } from "./tab-faces";

type TabKey =
  | "personal" | "employment" | "private" | "address" | "family" | "education" | "work" | "skills" | "tax" | "guarantee"
  | "funds" | "training" | "assets" | "documents" | "salary" | "movements" | "faces" | "account";

type TabDef = { key: TabKey; label: string; show: boolean; render: (p: TabProps) => ReactNode };

export function EmployeeProfile({ id }: { id: number }) {
  const sb = supabaseBrowser();
  const can = useCan();
  const me = useMaybeMe();
  const router = useRouter();
  const sp = useSearchParams();
  const [emp, setEmp] = useState<Employee | null | undefined>(undefined);
  const [names, setNames] = useState<{ org?: string; pos?: string; branch?: string; sup?: string }>({});
  const isSelf = me?.employeeId === id;
  const canPrivate = isSelf || can("employee_private", "view");

  const load = useCallback(async () => {
    const { data, error } = await sb.from("employees").select("*").eq("id", id).maybeSingle();
    if (error) toast.error(error.message);
    const e = (data as Employee) ?? null;
    setEmp(e);
    if (e) {
      const { data: ov } = await sb.from("v_employee_overview").select("org_unit_name, position_name, branch_name, supervisor_name").eq("id", id).maybeSingle();
      setNames({ org: ov?.org_unit_name ?? undefined, pos: ov?.position_name ?? undefined, branch: ov?.branch_name ?? undefined, sup: ov?.supervisor_name ?? undefined });
    }
  }, [sb, id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount / reset form when opened
    load();
  }, [load]);

  const tabs: TabDef[] = [
    { key: "personal", label: "ข้อมูลส่วนตัว", show: true, render: (p) => <PersonalTab {...p} /> },
    { key: "employment", label: "การจ้างงาน", show: true, render: (p) => <EmploymentTab {...p} /> },
    { key: "private", label: "เงินเดือนและบัญชี", show: canPrivate, render: (p) => <PrivateTab {...p} /> },
    { key: "address", label: "ที่อยู่", show: true, render: (p) => <AddressTab {...p} /> },
    { key: "family", label: "ครอบครัว", show: true, render: (p) => <FamilyTab {...p} /> },
    { key: "education", label: "การศึกษา", show: true, render: (p) => <EducationTab {...p} /> },
    { key: "work", label: "ประวัติการทำงาน", show: true, render: (p) => <WorkHistoryTab {...p} /> },
    { key: "skills", label: "ความสามารถพิเศษ", show: true, render: (p) => <SkillsTab {...p} /> },
    { key: "tax", label: "ลดหย่อนภาษี", show: canPrivate, render: (p) => <TaxTab {...p} /> },
    { key: "guarantee", label: "เงินประกันการทำงาน", show: true, render: (p) => <GuaranteeTab {...p} /> },
    { key: "funds", label: "กองทุน", show: true, render: (p) => <FundsTab {...p} /> },
    { key: "training", label: "การฝึกอบรม", show: true, render: (p) => <TrainingTab {...p} /> },
    { key: "assets", label: "สินทรัพย์ถือครอง", show: true, render: (p) => <AssetsTab {...p} /> },
    { key: "documents", label: "เอกสาร", show: true, render: (p) => <DocumentsTab {...p} /> },
    { key: "salary", label: "ประวัติเงินเดือน", show: canPrivate, render: (p) => <SalaryHistoryTab {...p} /> },
    { key: "movements", label: "ประวัติการเคลื่อนไหว", show: true, render: (p) => <MovementsTab {...p} /> },
    { key: "faces", label: "ข้อมูลใบหน้า", show: can("employee", "edit") || can("attendance", "view"), render: (p) => <FacesTab {...p} /> },
    { key: "account", label: "บัญชีผู้ใช้", show: can("security", "view") || isSelf, render: (p) => <AccountTab {...p} /> },
  ];
  const visible = tabs.filter((t) => t.show);
  const requested = sp.get("tab") as TabKey | null;
  const tab = visible.find((t) => t.key === requested)?.key ?? "personal";
  const setTab = (k: TabKey) => {
    const u = new URLSearchParams(sp.toString());
    u.set("tab", k);
    router.replace(`/employees/${id}?${u.toString()}`, { scroll: false });
  };

  if (emp === undefined) return <div className="py-24"><Spinner className="mx-auto" /></div>;
  if (emp === null)
    return (
      <Panel>
        <Empty icon={<UserX className="size-8" />} title="ไม่พบพนักงาน" description="พนักงานอาจถูกลบไปแล้ว หรือคุณไม่มีสิทธิ์ดูข้อมูลของพนักงานคนนี้" action={<Link className="text-jade-700 hover:underline" href="/employees">กลับไปหน้ารายชื่อพนักงาน</Link>} />
      </Panel>
    );

  const current = visible.find((t) => t.key === tab)!;
  return (
    <div>
      <Link href="/employees" className="mb-3 inline-flex items-center gap-1 text-sm text-ink-soft hover:text-jade-700">
        <ArrowLeft className="size-4" /> รายชื่อพนักงาน
      </Link>
      <Header emp={emp} names={names} reload={load} />
      <LeaveStrip employeeId={emp.id} />
      <div className="mt-4 grid gap-4 lg:grid-cols-[210px_minmax(0,1fr)]">
        <div className="lg:hidden">
          <label className="sr-only" htmlFor="emp-tab">เลือกหัวข้อ</label>
          <Select id="emp-tab" value={tab} onChange={(e) => setTab(e.target.value as TabKey)}>
            {visible.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </Select>
        </div>
        <nav className="hidden lg:block" aria-label="หัวข้อประวัติพนักงาน">
          <ul role="tablist" aria-orientation="vertical" className="sticky top-4 flex flex-col gap-0.5 rounded-[var(--radius-panel)] border border-line bg-white p-1.5">
            {visible.map((t) => (
              <li key={t.key}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === t.key}
                  onClick={() => setTab(t.key)}
                  className={clsx("w-full rounded-md px-3 py-1.5 text-left text-[14px] transition-colors", tab === t.key ? "bg-jade-50 font-medium text-jade-800" : "text-ink-soft hover:bg-paper hover:text-ink")}
                >
                  {t.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <div role="tabpanel" aria-label={current.label} className="min-w-0">
          {current.render({ emp, reload: load, isSelf })}
        </div>
      </div>
    </div>
  );
}

function Header({ emp, names, reload }: { emp: Employee; names: { org?: string; pos?: string; branch?: string; sup?: string }; reload: () => Promise<void> }) {
  const can = useCan();
  const canEdit = can("employee", "edit");
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const name = `${emp.prefix ?? ""}${emp.first_name} ${emp.last_name}`;

  async function onPhoto(f: File | undefined) {
    if (!f) return;
    if (!f.type.startsWith("image/")) return toast.error("เลือกไฟล์รูปภาพ (JPG, PNG)");
    setBusy(true);
    try {
      const blob = await resizeImage(f, 512, 0.85);
      const up = await uploadFile("avatars", blob, { folder: `emp-${emp.id}`, name: "photo.jpg" });
      const { error } = await supabaseBrowser().from("employees").update({ photo_url: up.url }).eq("id", emp.id);
      if (error) throw error;
      toast.ok("เปลี่ยนรูปแล้ว");
      await reload();
    } catch (e) {
      toast.error(`อัปโหลดรูปไม่สำเร็จ: ${humanError(e)}`);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <Panel bodyClass="p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative w-fit">
          <Avatar src={emp.photo_url} name={`${emp.first_name} ${emp.last_name}`} size={88} />
          {canEdit && (
            <>
              <input ref={input} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => onPhoto(e.target.files?.[0])} />
              <button
                type="button"
                onClick={() => input.current?.click()}
                disabled={busy}
                aria-label="เปลี่ยนรูปพนักงาน"
                className="absolute -bottom-1 -right-1 grid size-8 place-items-center rounded-full border-2 border-white bg-jade-600 text-white hover:bg-jade-700 disabled:bg-line disabled:text-ink-mute disabled:hover:bg-line"
              >
                {busy ? <Spinner className="size-4 text-white" /> : <Camera className="size-4" />}
              </button>
            </>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{name}</h1>
            {emp.nickname && <span className="text-lg text-ink-soft">({emp.nickname})</span>}
            <Badge color={EMP_STATUS_COLOR[emp.status]}>{EMP_STATUS[emp.status]}</Badge>
          </div>
          <p className="mt-0.5 text-[15px] text-ink-soft">{[names.pos, names.org, names.branch].filter(Boolean).join(" · ") || "ยังไม่ระบุตำแหน่ง / หน่วยงาน"}</p>
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:flex sm:flex-wrap">
            <Meta label="รหัสพนักงาน" value={<span className="num">{emp.code}</span>} />
            <Meta label="ประเภท" value={EMP_TYPE[emp.employee_type]} />
            <Meta label="วันเริ่มงาน" value={<span className="num">{thDate(emp.hire_date)}</span>} />
            <Meta label="อายุงาน" value={serviceText(emp.hire_date, emp.resign_date)} />
            {names.sup && <Meta label="หัวหน้างาน" value={names.sup} />}
            {emp.status === "probation" && emp.probation_end_date && <Meta label="ครบทดลองงาน" value={<span className="num">{thDate(emp.probation_end_date)}</span>} />}
            {emp.resign_date && <Meta label="วันที่ลาออก" value={<span className="num">{thDate(emp.resign_date)}</span>} />}
          </dl>
        </div>
        <div className="flex flex-col gap-1 text-sm sm:items-end">
          {emp.phone && <a href={`tel:${emp.phone.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-1.5 text-jade-800 hover:underline"><Phone className="size-4" /><span className="num">{emp.phone}</span></a>}
          {emp.email && <a href={`mailto:${emp.email}`} className="inline-flex items-center gap-1.5 text-jade-800 hover:underline"><Mail className="size-4" />{emp.email}</a>}
        </div>
      </div>
    </Panel>
  );
}

function Meta({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-ink-mute">{label}</dt>
      <dd className="font-medium text-ink">{value}</dd>
    </div>
  );
}

type Bal = { leave_type_id: number; name: string; color: string | null; total_days: number; used_days: number; pending_days: number; remaining_days: number };

function LeaveStrip({ employeeId }: { employeeId: number }) {
  const [rows, setRows] = useState<Bal[] | null>(null);
  const year = new Date().getFullYear();
  useEffect(() => {
    supabaseBrowser()
      .from("v_leave_balances")
      .select("leave_type_id, name, color, total_days, used_days, pending_days, remaining_days")
      .eq("employee_id", employeeId)
      .eq("leave_year", year)
      .order("leave_type_id")
      .then(({ data }: Res) => setRows((data as Bal[]) ?? []));
  }, [employeeId, year]);
  if (!rows || !rows.length) return null;
  return (
    <div className="mt-3 rounded-[var(--radius-panel)] border border-line bg-white px-4 py-3">
      <div className="mb-2 flex items-center gap-1.5 text-sm font-medium text-ink-soft">
        <CalendarDays className="size-4 text-jade-600" /> สิทธิ์วันลาปี {year + 543}
      </div>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {rows.map((r) => {
          const pct = r.total_days > 0 ? Math.min(100, ((Number(r.used_days) + Number(r.pending_days)) / Number(r.total_days)) * 100) : 0;
          return (
            <li key={r.leave_type_id} className="min-w-0">
              <div className="flex items-baseline justify-between gap-1 text-[13px]">
                <span className="truncate text-ink-soft">{r.name}</span>
                <span className="num whitespace-nowrap font-medium">{fmt(r.remaining_days)}<span className="font-normal text-ink-mute">/{fmt(r.total_days)}</span></span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-paper" title={`ใช้ไป ${fmt(r.used_days)} วัน · รออนุมัติ ${fmt(r.pending_days)} วัน`}>
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: r.color ?? "var(--color-jade-500)" }} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
const fmt = (n: number) => Number(n).toLocaleString("th-TH", { maximumFractionDigits: 1 });
