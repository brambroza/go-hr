"use client";

import { useCallback, useEffect, useState } from "react";
import { BadgeCheck, FileUp, KeyRound, ShieldAlert } from "lucide-react";
import { useCan } from "@/components/app/me-context";
import { Badge, Button, PageHeader, Panel, Spinner, Textarea, clsx, toast, useConfirm } from "@/components/ui";
import { thDate, thDateTime } from "@/lib/format";
import { licenseInfoAction, removeLicenseAction, saveLicenseAction } from "@/lib/notify/actions";

type Info = {
  license: { valid: boolean; error?: string; licensee?: string; tax_id?: string; max_employees?: number; modules?: string[]; issued_at?: string; support_until?: string | null; support_expired?: boolean; license_id?: string; checked_at?: string; source?: string } | null;
  active: number;
  envFallback: boolean;
};

export function LicenseSettings({ version }: { version: string }) {
  const can = useCan();
  const { confirm, dialog } = useConfirm();
  const [info, setInfo] = useState<Info | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await licenseInfoAction();
    if (r.ok) setInfo(r.data as Info);
    else toast.error(r.error);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const install = async () => {
    setBusy(true);
    setErr(null);
    const r = await saveLicenseAction(text);
    setBusy(false);
    if (!r.ok) return setErr(r.error);
    toast.ok(`ติดตั้ง License ของ ${r.data?.licensee} แล้ว (สูงสุด ${r.data?.max_employees} คน)`);
    setText("");
    load();
  };
  const remove = async () => {
    if (!(await confirm("ถอน License? ระบบจะกลับเป็นรุ่นทดลอง และเพิ่มพนักงานใหม่ไม่ได้จนกว่าจะติดตั้ง License ใหม่", { danger: true, confirmText: "ถอน License" }))) return;
    const r = await removeLicenseAction();
    if (!r.ok) return toast.error(r.error);
    toast.ok(r.message!);
    load();
  };
  const onFile = async (f?: File) => {
    if (!f) return;
    setText((await f.text()).trim());
  };

  const lic = info?.license;
  const valid = !!lic?.valid;
  const max = valid ? lic!.max_employees! : 10;
  const pct = info ? Math.min(100, Math.round((info.active / max) * 100)) : 0;

  return (
    <div>
      <PageHeader title="License / ระบบ" description="GO HR เป็นซอฟต์แวร์ขายขาด ติดตั้งที่เซิร์ฟเวอร์ของบริษัท ตรวจสอบ License ได้โดยไม่ต้องเชื่อมต่ออินเทอร์เน็ต" />
      {!info ? <div className="flex justify-center py-16"><Spinner /></div> : (
        <div className="grid gap-4 xl:grid-cols-3">
          <Panel className="xl:col-span-2" title="สถานะ License">
            <div className="flex items-start gap-4">
              <span className={clsx("grid size-12 shrink-0 place-items-center rounded-full", valid ? "bg-jade-50 text-jade-700" : "bg-amber-50 text-amber-ink")}>
                {valid ? <BadgeCheck className="size-7" /> : <ShieldAlert className="size-7" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-lg font-semibold">{valid ? lic!.licensee : lic ? "License ไม่ถูกต้อง" : "รุ่นทดลอง (ยังไม่ได้ติดตั้ง License)"}</span>
                  {valid ? <Badge color="green">ใช้งานได้</Badge> : <Badge color="amber">{lic ? "ไม่ถูกต้อง" : "ทดลองใช้"}</Badge>}
                  {valid && lic!.support_expired && <Badge color="gray">หมดระยะซัพพอร์ต</Badge>}
                </div>
                {!valid && <p className="mt-1 text-sm text-ink-soft">{lic?.error ? `${lic.error} — ` : ""}รุ่นทดลองใช้งานได้ทุกฟังก์ชัน แต่มีพนักงานที่ใช้งานอยู่ได้สูงสุด 10 คน</p>}
              </div>
            </div>
            <div className="mt-5">
              <div className="mb-1 flex justify-between text-sm"><span className="text-ink-soft">พนักงานที่ใช้งานอยู่</span><span className="num font-medium">{info.active.toLocaleString("th-TH")} / {max.toLocaleString("th-TH")} คน</span></div>
              <div className="h-2.5 rounded-full bg-line-soft"><div className={clsx("h-2.5 rounded-full", pct >= 100 ? "bg-rust" : pct >= 90 ? "bg-amber-500" : "bg-jade-500")} style={{ width: `${pct}%` }} /></div>
              {pct >= 100 && <p className="mt-1 text-sm text-rust">ครบจำนวนตาม License แล้ว — เพิ่มพนักงานใหม่ไม่ได้ ติดต่อผู้ขายเพื่อเพิ่มจำนวน</p>}
              {pct >= 90 && pct < 100 && <p className="mt-1 text-sm text-amber-ink">ใกล้ครบจำนวนตาม License</p>}
            </div>
            {valid && (
              <dl className="mt-5 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                <div className="flex justify-between gap-2 border-b border-line-soft py-1.5"><dt className="text-ink-soft">ผู้ได้รับอนุญาต</dt><dd className="text-right">{lic!.licensee}</dd></div>
                <div className="flex justify-between gap-2 border-b border-line-soft py-1.5"><dt className="text-ink-soft">เลขประจำตัวผู้เสียภาษี</dt><dd>{lic!.tax_id || "-"}</dd></div>
                <div className="flex justify-between gap-2 border-b border-line-soft py-1.5"><dt className="text-ink-soft">จำนวนพนักงานสูงสุด</dt><dd className="num">{lic!.max_employees?.toLocaleString("th-TH")} คน</dd></div>
                <div className="flex justify-between gap-2 border-b border-line-soft py-1.5"><dt className="text-ink-soft">รุ่น</dt><dd>{(lic!.modules ?? []).map((m) => (m === "professional" ? "Professional" : m)).join(", ")}</dd></div>
                <div className="flex justify-between gap-2 border-b border-line-soft py-1.5"><dt className="text-ink-soft">วันที่ออก License</dt><dd>{thDate(lic!.issued_at)}</dd></div>
                <div className="flex justify-between gap-2 border-b border-line-soft py-1.5">
                  <dt className="text-ink-soft">ซัพพอร์ตและอัปเดตถึง</dt>
                  <dd className={clsx(lic!.support_expired && "text-ink-mute")}>{lic!.support_until ? thDate(lic!.support_until) : "ไม่ระบุ"}{lic!.support_expired && " (หมดระยะซัพพอร์ต)"}</dd>
                </div>
                <div className="flex justify-between gap-2 border-b border-line-soft py-1.5 sm:col-span-2"><dt className="text-ink-soft">License ID</dt><dd className="truncate font-mono text-xs">{lic!.license_id}</dd></div>
              </dl>
            )}
            {valid && lic!.support_expired && (
              <p className="mt-3 rounded-[var(--radius-ctl)] bg-paper px-3 py-2 text-sm text-ink-soft">หมดระยะซัพพอร์ตแล้ว — ระบบยังใช้งานได้ตามปกติทุกฟังก์ชัน เพียงแต่จะไม่ได้รับการอัปเดตและบริการช่วยเหลือ ติดต่อ GO Along เพื่อต่อสัญญาซัพพอร์ต</p>
            )}
          </Panel>

          <Panel title="ข้อมูลระบบ">
            <dl className="flex flex-col gap-2 text-sm">
              <div className="flex justify-between"><dt className="text-ink-soft">เวอร์ชัน</dt><dd className="num">GO HR {version}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-soft">ผู้พัฒนา</dt><dd>บริษัท โกอะลอง จำกัด</dd></div>
              <div className="flex justify-between"><dt className="text-ink-soft">ตรวจสอบล่าสุด</dt><dd>{lic?.checked_at ? thDateTime(lic.checked_at) : "-"}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-soft">ที่มาของ License</dt><dd>{lic?.source === "env" ? "ตัวแปรระบบ GOHR_LICENSE" : lic ? "ติดตั้งผ่านหน้านี้" : "-"}</dd></div>
            </dl>
          </Panel>

          {can("settings", "edit") && (
            <Panel className="xl:col-span-2" title={valid ? "เปลี่ยน License" : "ติดตั้ง License"}>
              <div className="flex flex-col gap-3">
                <Textarea value={text} onChange={(e) => (setText(e.target.value), setErr(null))} rows={4} placeholder="วางข้อความ License ที่ได้รับจาก GO Along" className="font-mono text-xs" spellCheck={false} />
                {err && <p className="text-sm text-rust">{err}</p>}
                <div className="flex flex-wrap items-center gap-2">
                  <Button icon={<KeyRound className="size-4" />} loading={busy} disabled={!text.trim()} onClick={install}>ตรวจสอบและติดตั้ง</Button>
                  <label className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-[var(--radius-ctl)] border border-line bg-white px-4 text-[15px] hover:bg-jade-50">
                    <FileUp className="size-4" /> เลือกไฟล์ License
                    <input type="file" accept=".lic,.txt,text/plain" hidden onChange={(e) => onFile(e.target.files?.[0])} />
                  </label>
                  {lic && <Button variant="ghost" className="ml-auto text-rust" onClick={remove}>ถอน License</Button>}
                </div>
              </div>
            </Panel>
          )}
        </div>
      )}
      {dialog}
    </div>
  );
}
