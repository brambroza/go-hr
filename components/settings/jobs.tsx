"use client";

import { useCallback, useEffect, useState } from "react";
import { History, Pencil, Play } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useCan } from "@/components/app/me-context";
import { Badge, Button, Empty, Field, Input, Modal, PageHeader, Panel, Spinner, Toggle, clsx, toast } from "@/components/ui";
import { thDateTime } from "@/lib/format";
import { CRON_PRESETS, describeCron, isValidCron, nextRun } from "@/lib/jobs/cron";
import { runJobNowAction } from "@/lib/notify/actions";

type Job = { code: string; name: string; description: string | null; cron: string; is_enabled: boolean; last_run_at: string | null; last_status: string | null; last_message: string | null; next_run_at: string | null };
type Log = { id: number; job_code: string; fired_at: string; status: string; message: string | null };

export function JobsSettings() {
  const sb = supabaseBrowser();
  const can = useCan();
  const ro = !can("settings", "edit");
  const [rows, setRows] = useState<Job[] | null>(null);
  const [editing, setEditing] = useState<Job | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [history, setHistory] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await sb.from("scheduled_jobs").select("*").order("code");
    if (error) toast.error(error.message);
    setRows((data ?? []) as Job[]);
  }, [sb]);
  useEffect(() => {
    load();
  }, [load]);

  const toggle = async (j: Job, on: boolean) => {
    setRows((l) => l?.map((x) => (x.code === j.code ? { ...x, is_enabled: on } : x)) ?? null);
    const { error } = await sb.from("scheduled_jobs").update({ is_enabled: on }).eq("code", j.code);
    if (error) (toast.error(error.message), load());
    else toast.ok(on ? `เปิดงาน “${j.name}” แล้ว` : `ปิดงาน “${j.name}” แล้ว`);
  };
  const run = async (j: Job) => {
    setRunning(j.code);
    const r = await runJobNowAction(j.code);
    setRunning(null);
    if (r.ok) toast.ok(`${j.name}: ${r.data?.message.replace("[สั่งรันเอง] ", "")}`);
    else toast.error(`${j.name}: ${r.error}`);
    load();
  };

  const [now, setNow] = useState(0);
  useEffect(() => setNow(Date.now()), [rows]);
  const stale = !!now && !!rows?.length && rows.every((j) => !j.last_run_at || now - Date.parse(j.last_run_at) > 3600_000) && rows.some((j) => j.is_enabled && j.cron.startsWith("*/"));

  return (
    <div>
      <PageHeader title="ตั้งค่าเวลารันคำสั่ง" description="งานอัตโนมัติที่ระบบรันตามเวลา (เวลาประเทศไทย) เช่น คำนวณเวลาทำงาน แจ้งเตือนเอกสารหมดอายุ และส่งข้อความ LINE" />
      {stale ? (
        <div className="mb-4 rounded-[var(--radius-panel)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-ink">
          ยังไม่พบการรันตามเวลาในชั่วโมงที่ผ่านมา — ตรวจสอบว่าตัวตั้งเวลา (scheduler) ของเซิร์ฟเวอร์เรียก <code className="rounded bg-white px-1">/api/cron</code> ทุกนาที (ดูคู่มือการติดตั้ง)
        </div>
      ) : null}
      <Panel bodyClass="p-0">
        {!rows ? <div className="flex justify-center py-12"><Spinner /></div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-[14px]">
              <thead className="text-left text-sm text-ink-soft"><tr className="border-b border-line-soft">
                <th className="px-4 py-2 font-medium">งาน</th><th className="px-3 py-2 font-medium">รอบการทำงาน</th><th className="px-3 py-2 font-medium">ล่าสุด</th><th className="px-3 py-2 font-medium">ครั้งถัดไป</th><th className="px-3 py-2 font-medium">เปิดใช้</th><th className="px-3 py-2" />
              </tr></thead>
              <tbody>
                {rows.map((j) => {
                  let next: Date | null = null;
                  try {
                    next = j.is_enabled ? nextRun(j.cron, new Date()) : null;
                  } catch {
                    next = null;
                  }
                  return (
                    <tr key={j.code} className={clsx("border-b border-line-soft align-top last:border-0", !j.is_enabled && "text-ink-mute")}>
                      <td className="max-w-xs px-4 py-3">
                        <div className="font-medium text-ink">{j.name}</div>
                        <div className="text-sm text-ink-mute">{j.description}</div>
                      </td>
                      <td className="px-3 py-3">
                        <div>{describeCron(j.cron)}</div>
                        <code className="text-xs text-ink-mute">{j.cron}</code>
                      </td>
                      <td className="max-w-sm px-3 py-3">
                        {j.last_run_at ? (
                          <>
                            <div className="flex items-center gap-2 whitespace-nowrap">
                              <Badge color={j.last_status === "error" ? "red" : j.last_status === "running" ? "amber" : "green"}>{j.last_status === "error" ? "ผิดพลาด" : j.last_status === "running" ? "กำลังรัน" : "สำเร็จ"}</Badge>
                              <span className="text-sm text-ink-soft">{thDateTime(j.last_run_at)}</span>
                            </div>
                            {j.last_message && <div className="mt-1 line-clamp-2 text-sm text-ink-soft" title={j.last_message}>{j.last_message}</div>}
                          </>
                        ) : <span className="text-sm text-ink-mute">ยังไม่เคยรัน</span>}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-sm text-ink-soft">{next ? thDateTime(next.toISOString()) : "-"}</td>
                      <td className="px-3 py-3"><Toggle checked={j.is_enabled} disabled={ro} onChange={(x) => toggle(j, x)} label={<span className="sr-only">เปิดใช้ {j.name}</span>} /></td>
                      <td className="whitespace-nowrap px-3 py-3 text-right">
                        <Button variant="ghost" size="sm" icon={<History className="size-4" />} onClick={() => setHistory(j.code)} title="ประวัติการรัน" aria-label="ประวัติการรัน" />
                        {!ro && <Button variant="ghost" size="sm" icon={<Pencil className="size-4" />} onClick={() => setEditing(j)} title="แก้ไขเวลา" aria-label="แก้ไขเวลา" />}
                        {!ro && <Button variant="secondary" size="sm" icon={<Play className="size-4" />} loading={running === j.code} disabled={!!running && running !== j.code} onClick={() => run(j)}>รันเดี๋ยวนี้</Button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      {editing && <CronEditor job={editing} onClose={() => setEditing(null)} onSaved={() => (setEditing(null), load())} />}
      {history && <JobHistory code={history} name={rows?.find((r) => r.code === history)?.name ?? history} onClose={() => setHistory(null)} />}
    </div>
  );
}

function CronEditor({ job, onClose, onSaved }: { job: Job; onClose: () => void; onSaved: () => void }) {
  const sb = supabaseBrowser();
  const [cron, setCron] = useState(job.cron);
  const [busy, setBusy] = useState(false);
  const valid = isValidCron(cron);
  const upcoming: Date[] = [];
  if (valid) {
    let t = new Date();
    for (let i = 0; i < 3; i++) {
      const n = nextRun(cron, t);
      if (!n) break;
      upcoming.push(n);
      t = n;
    }
  }
  const save = async () => {
    if (!valid) return;
    setBusy(true);
    const { error } = await sb.from("scheduled_jobs").update({ cron: cron.trim().replace(/\s+/g, " "), next_run_at: upcoming[0]?.toISOString() ?? null }).eq("code", job.code);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.ok("บันทึกเวลารันแล้ว");
    onSaved();
  };
  return (
    <Modal open onClose={onClose} title={`เวลารัน: ${job.name}`} footer={<><Button variant="secondary" onClick={onClose}>ยกเลิก</Button><Button loading={busy} disabled={!valid} onClick={save}>บันทึก</Button></>}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-1.5">
          {CRON_PRESETS.map((p) => (
            <button key={p.cron} type="button" onClick={() => setCron(p.cron)} className={clsx("rounded-full border px-2.5 py-1 text-sm", cron === p.cron ? "border-jade-600 bg-jade-50 text-jade-800" : "border-line text-ink-soft hover:bg-paper")}>{p.label}</button>
          ))}
        </div>
        <Field label="Cron (นาที ชั่วโมง วันที่ เดือน วันในสัปดาห์)" error={valid ? null : describeCron(cron)} hint={valid ? describeCron(cron) : undefined}>
          <Input value={cron} onChange={(e) => setCron(e.target.value)} className="font-mono" />
        </Field>
        {upcoming.length > 0 && (
          <div className="text-sm text-ink-soft">
            รอบถัดไป: {upcoming.map((d) => thDateTime(d.toISOString())).join(" · ")}
          </div>
        )}
        <p className="text-xs text-ink-mute">ตัวอย่าง: <code>0 8 * * 1-5</code> = จันทร์-ศุกร์ 08:00 · <code>*/15 * * * *</code> = ทุก 15 นาที · วันในสัปดาห์ 0 = อาทิตย์</p>
      </div>
    </Modal>
  );
}

function JobHistory({ code, name, onClose }: { code: string; name: string; onClose: () => void }) {
  const sb = supabaseBrowser();
  const [rows, setRows] = useState<Log[] | null>(null);
  useEffect(() => {
    sb.from("automation_logs").select("id, job_code, fired_at, status, message").eq("job_code", code).is("ref_key", null).order("id", { ascending: false }).limit(100)
      .then(({ data }: { data: Log[] | null }) => setRows(data ?? []));
  }, [sb, code]);
  return (
    <Modal open onClose={onClose} title={`ประวัติการรัน: ${name}`} size="lg">
      {!rows ? <Spinner /> : !rows.length ? <Empty title="ยังไม่มีประวัติการรัน" /> : (
        <ul className="divide-y divide-line-soft">
          {rows.map((l) => (
            <li key={l.id} className="flex gap-3 py-2 text-sm">
              <span className="w-36 shrink-0 whitespace-nowrap text-ink-soft">{thDateTime(l.fired_at)}</span>
              <Badge color={l.status === "error" ? "red" : "green"} className="h-fit">{l.status === "error" ? "ผิดพลาด" : "สำเร็จ"}</Badge>
              <span className="min-w-0 break-words">{l.message}</span>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
