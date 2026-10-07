"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, ChevronDown, FileText } from "lucide-react";
import { Badge, Button, clsx, Spinner, toast } from "@/components/ui";
import { useMe } from "@/components/app/me-context";
import { openStored } from "@/components/org/attachments-field";
import { supabaseBrowser } from "@/lib/supabase/client";
import { thDate, thDateTime } from "@/lib/format";

type Policy = { id: number; title: string; category: string | null; content: string | null; attachments: { name: string; url: string }[]; effective_date: string | null; require_ack: boolean };

export function PoliciesView() {
  const me = useMe();
  const [rows, setRows] = useState<Policy[] | null>(null);
  const [acks, setAcks] = useState<Map<number, string>>(new Map());
  const [open, setOpen] = useState<number | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  useEffect(() => {
    const sb = supabaseBrowser();
    (async () => {
      const [{ data: p }, { data: a }] = await Promise.all([
        sb.from("policies").select("id, title, category, content, attachments, effective_date, require_ack").eq("is_active", true).order("effective_date", { ascending: false, nullsFirst: false }),
        sb.from("policy_acks").select("policy_id, acked_at").eq("employee_id", me.employeeId!),
      ]);
      setRows((p as Policy[]) ?? []);
      setAcks(new Map(((a as { policy_id: number; acked_at: string }[]) ?? []).map((x) => [x.policy_id, x.acked_at])));
    })();
  }, [me.employeeId]);

  async function ack(p: Policy) {
    setBusy(p.id);
    const { error } = await supabaseBrowser().from("policy_acks").insert({ policy_id: p.id, employee_id: me.employeeId });
    setBusy(null);
    if (error && !error.message.includes("duplicate")) return toast.error(error.message);
    setAcks(new Map(acks).set(p.id, new Date().toISOString()));
    toast.ok("บันทึกการรับทราบแล้ว");
  }

  if (rows === null) return <div className="grid h-40 place-items-center"><Spinner /></div>;
  if (rows.length === 0)
    return (
      <div className="flex flex-col items-center gap-2 rounded-[var(--radius-panel)] border border-line bg-white px-6 py-12 text-center">
        <FileText className="size-8 text-jade-400" />
        <p className="font-medium">ยังไม่มีนโยบายบริษัท</p>
        <p className="text-sm text-ink-soft">เมื่อฝ่ายบุคคลเผยแพร่นโยบายหรือระเบียบ จะแสดงที่นี่</p>
      </div>
    );

  const pending = rows.filter((p) => p.require_ack && !acks.has(p.id)).length;
  return (
    <>
      {pending > 0 && <p className="mb-3 rounded-[var(--radius-panel)] bg-amber-50 px-4 py-2.5 text-[15px] text-amber-ink">มี {pending} เรื่องที่ต้องอ่านและกดรับทราบ</p>}
      <ul className="flex flex-col gap-2">
        {rows.map((p) => {
          const acked = acks.get(p.id);
          const isOpen = open === p.id;
          return (
            <li key={p.id} className="rounded-[var(--radius-panel)] border border-line bg-white">
              <button className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : p.id)}>
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{p.title}</div>
                  <div className="text-sm text-ink-mute">
                    {[p.category, p.effective_date ? `มีผล ${thDate(p.effective_date)}` : null].filter(Boolean).join(" · ")}
                  </div>
                </div>
                {p.require_ack && (acked ? <Badge color="green">รับทราบแล้ว</Badge> : <Badge color="amber">ต้องรับทราบ</Badge>)}
                <ChevronDown className={clsx("size-5 shrink-0 text-ink-mute transition-transform", isOpen && "rotate-180")} />
              </button>
              {isOpen && (
                <div className="border-t border-line-soft px-4 py-3">
                  {p.content && <div className="whitespace-pre-wrap text-[15px] leading-relaxed text-ink">{p.content}</div>}
                  {p.attachments?.length > 0 && (
                    <ul className="mt-2 flex flex-col">
                      {p.attachments.map((a, i) => (
                        <li key={i}>
                          <button className="inline-flex min-h-11 items-center gap-2 text-[15px] text-jade-700" onClick={() => openStored(a.url)}>
                            <FileText className="size-4" /> {a.name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {p.require_ack &&
                    (acked ? (
                      <p className="mt-3 flex items-center gap-2 text-sm text-jade-800"><CheckCircle2 className="size-4" /> คุณรับทราบเมื่อ {thDateTime(acked)}</p>
                    ) : (
                      <Button size="lg" className="mt-3 w-full" loading={busy === p.id} onClick={() => ack(p)}>
                        ฉันอ่านและรับทราบแล้ว
                      </Button>
                    ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
