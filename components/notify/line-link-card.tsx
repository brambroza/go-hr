"use client";

// LINE account linking card for /m/profile (imported by the employee-app engineer)
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Copy, Link2, MessageCircle, Unlink } from "lucide-react";
import { Button, Spinner, toast, useConfirm } from "@/components/ui";
import { QrSvg } from "@/components/attendance/qr";
import { createLineLinkCodeAction, lineLinkStateAction, unlinkLineAction } from "@/lib/notify/actions";

type State = { linked: boolean; pending: { code: string; expires: string } | null; enabled: boolean; oa_id: string; add_friend_url: string };

export function LineLinkCard({ className }: { className?: string }) {
  const [s, setS] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  const [left, setLeft] = useState(0);
  const { confirm, dialog } = useConfirm();

  const load = useCallback(async () => {
    const r = await lineLinkStateAction();
    if (r.ok) setS(r.data as State);
    else toast.error(r.error);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  // countdown + poll while a code is pending (detects the successful link from LINE)
  useEffect(() => {
    if (!s?.pending) return;
    const tick = () => setLeft(Math.max(0, Math.round((Date.parse(s.pending!.expires) - Date.now()) / 1000)));
    tick();
    const t1 = setInterval(tick, 1000);
    const t2 = setInterval(load, 5000);
    return () => (clearInterval(t1), clearInterval(t2));
  }, [s?.pending, load]);

  const create = async () => {
    setBusy(true);
    const r = await createLineLinkCodeAction();
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    setS((x) => (x ? { ...x, pending: r.data as { code: string; expires: string } } : x));
  };

  const unlink = async () => {
    if (!(await confirm("ยกเลิกการเชื่อม LINE? คุณจะไม่ได้รับแจ้งเตือนทาง LINE", { danger: true, confirmText: "ยกเลิกการเชื่อม" }))) return;
    const r = await unlinkLineAction();
    if (!r.ok) return toast.error(r.error);
    toast.ok(r.message ?? "ยกเลิกแล้ว");
    load();
  };

  const expired = s?.pending && left <= 0;

  return (
    <section className={`rounded-[var(--radius-panel)] border border-line bg-white p-4 ${className ?? ""}`}>
      <div className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#06c755] text-white"><MessageCircle className="size-5" /></span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">แจ้งเตือนทาง LINE</h2>
          <p className="text-sm text-ink-soft">{!s ? "กำลังโหลด…" : s.linked ? "เชื่อมแล้ว — รับแจ้งเตือนการอนุมัติ สลิป และประกาศทาง LINE" : "เชื่อม LINE เพื่อรับแจ้งเตือนทันที"}</p>
        </div>
        {s?.linked && <CheckCircle2 className="size-6 shrink-0 text-jade-600" aria-label="เชื่อมแล้ว" />}
      </div>

      {!s ? (
        <div className="mt-3 flex justify-center"><Spinner /></div>
      ) : !s.enabled && !s.linked ? (
        <p className="mt-3 rounded-[var(--radius-ctl)] bg-paper px-3 py-2 text-sm text-ink-soft">บริษัทยังไม่ได้เปิดใช้การแจ้งเตือนทาง LINE</p>
      ) : s.linked ? (
        <Button variant="secondary" className="mt-3 h-11 w-full" icon={<Unlink className="size-4" />} onClick={unlink}>ยกเลิกการเชื่อม LINE</Button>
      ) : s.pending && !expired ? (
        <div className="mt-3 flex flex-col gap-3">
          <ol className="list-decimal space-y-1 pl-5 text-[15px] text-ink-soft">
            <li>
              เพิ่มเพื่อน LINE OA {s.oa_id && <b className="text-ink">{s.oa_id}</b>}
              {s.add_friend_url && <> — <a href={s.add_friend_url} target="_blank" rel="noopener noreferrer" className="font-medium text-jade-700 underline">เปิดใน LINE</a></>}
            </li>
            <li>พิมพ์รหัสนี้ส่งในแชท</li>
          </ol>
          <div className="flex items-center justify-between gap-3 rounded-[var(--radius-ctl)] border border-jade-200 bg-jade-50 px-4 py-3">
            <span className="num text-3xl font-semibold tracking-[0.3em] text-jade-900">{s.pending.code}</span>
            <Button variant="ghost" size="sm" icon={<Copy className="size-4" />} onClick={() => navigator.clipboard?.writeText(s.pending!.code).then(() => toast.ok("คัดลอกรหัสแล้ว"))}>คัดลอก</Button>
          </div>
          <p className="text-sm text-ink-mute">รหัสหมดอายุใน <span className="num">{Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}</span> นาที · หน้านี้จะอัปเดตเองเมื่อเชื่อมสำเร็จ</p>
          {s.add_friend_url && (
            <div className="flex flex-col items-center gap-1 border-t border-line-soft pt-3">
              <QrSvg value={s.add_friend_url} className="size-36" label="QR เพิ่มเพื่อน LINE OA" />
              <span className="text-xs text-ink-mute">สแกนเพื่อเพิ่มเพื่อนจากอีกเครื่อง</span>
            </div>
          )}
        </div>
      ) : (
        <Button className="mt-3 h-11 w-full" icon={<Link2 className="size-4" />} loading={busy} onClick={create}>
          {expired ? "รหัสหมดอายุ สร้างรหัสใหม่" : "สร้างรหัสเชื่อมต่อ LINE"}
        </Button>
      )}
      {dialog}
    </section>
  );
}
