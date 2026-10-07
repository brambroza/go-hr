"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Columns3, Download, MoreHorizontal, Plus, Search, Table2 } from "lucide-react";
import { Stars } from "@/components/recruit/stars";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useCan } from "@/components/app/me-context";
import { Badge, Button, Empty, Input, PageHeader, Panel, Select, Spinner, clsx, toast } from "@/components/ui";
import { ApplicantFormModal } from "@/components/recruit/applicant-form";
import { MOVE_TARGETS, MoveDialog } from "@/components/recruit/move-dialog";
import { SOURCE, STAGE, STAGE_COLOR, STAGES } from "@/components/recruit/labels";
import { downloadCsv } from "@/lib/csv";
import { thDate } from "@/lib/format";

type A = {
  id: number; ref_no: string | null; posting_id: number | null; prefix: string | null; first_name: string; last_name: string; nickname: string | null;
  phone: string; email: string | null; education_level: string | null; experience_years: number | null; expected_salary: number | null;
  source: string | null; stage: string; rating: number | null; tags: string[] | null; created_at: string; employee_id: number | null;
};
type Posting = { id: number; title: string; status: string };

const BOARD = [...STAGES, "rejected", "talent_pool"] as const;

export default function ApplicantsPage() {
  return (
    <Suspense fallback={<Spinner className="mx-auto mt-20" />}>
      <Applicants />
    </Suspense>
  );
}

function Applicants() {
  const sb = supabaseBrowser();
  const can = useCan();
  const router = useRouter();
  const sp = useSearchParams();
  const [rows, setRows] = useState<A[] | null>(null);
  const [postings, setPostings] = useState<Posting[]>([]);
  const [view, setView] = useState<"board" | "table">("board");
  const [posting, setPosting] = useState(sp.get("posting") ?? "");
  const [stage, setStage] = useState("");
  const [source, setSource] = useState("");
  const [rating, setRating] = useState("");
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [moving, setMoving] = useState<{ a: A; to: string | null } | null>(null);
  const [dragId, setDragId] = useState<number | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [menu, setMenu] = useState<number | null>(null);
  const canEdit = can("recruit", "edit");

  const load = useCallback(async () => {
    let query = sb
      .from("applicants")
      .select("id, ref_no, posting_id, prefix, first_name, last_name, nickname, phone, email, education_level, experience_years, expected_salary, source, stage, rating, tags, created_at, employee_id")
      .order("created_at", { ascending: false })
      .limit(2000);
    if (posting) query = query.eq("posting_id", Number(posting));
    const { data, error } = await query;
    if (error) toast.error(error.message);
    setRows((data as A[]) ?? []);
  }, [sb, posting]);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    sb.from("job_postings").select("id, title, status").order("id", { ascending: false }).then(({ data }: { data: unknown }) => setPostings((data as Posting[]) ?? []));
  }, [sb]);
  useEffect(() => {
    const close = () => setMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  const pName = useMemo(() => new Map(postings.map((p) => [p.id, p.title])), [postings]);
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (rows ?? []).filter(
      (a) =>
        (!stage || a.stage === stage) &&
        (!source || a.source === source) &&
        (!rating || (a.rating ?? 0) >= Number(rating)) &&
        (!t || `${a.first_name} ${a.last_name} ${a.nickname ?? ""} ${a.phone} ${a.ref_no ?? ""} ${a.email ?? ""}`.toLowerCase().includes(t)),
    );
  }, [rows, stage, source, rating, q]);

  const name = (a: A) => `${a.first_name} ${a.last_name}`;

  function drop(target: string) {
    setOver(null);
    const a = rows?.find((r) => r.id === dragId);
    setDragId(null);
    if (!a || a.stage === target) return;
    if (target === "hired") {
      router.push(`/recruit/applicants/${a.id}?hire=1`);
      return;
    }
    setMoving({ a, to: target });
  }

  function exportCsv() {
    downloadCsv("applicants.csv", [
      ["เลขที่ใบสมัคร", "ชื่อ", "นามสกุล", "ชื่อเล่น", "ตำแหน่งที่สมัคร", "โทร", "อีเมล", "วุฒิ", "ประสบการณ์ (ปี)", "เงินเดือนที่ต้องการ", "ช่องทาง", "ขั้นตอน", "คะแนน", "วันที่สมัคร"],
      ...filtered.map((a) => [a.ref_no, a.first_name, a.last_name, a.nickname, a.posting_id ? pName.get(a.posting_id) : "", a.phone, a.email, a.education_level, a.experience_years, a.expected_salary, SOURCE[a.source ?? ""] ?? a.source, STAGE[a.stage], a.rating, a.created_at.slice(0, 10)]),
    ]);
  }

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-full sm:w-56">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-mute" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ชื่อ เบอร์โทร เลขที่ใบสมัคร" className="h-9 pl-8 text-sm" />
      </div>
      <Select className="h-9 !w-auto min-w-44 text-sm" value={posting} onChange={(e) => setPosting(e.target.value)} placeholder="ทุกประกาศ">
        {postings.map((p) => (
          <option key={p.id} value={p.id}>{p.title}</option>
        ))}
      </Select>
      {view === "table" && (
        <Select className="h-9 !w-auto text-sm" value={stage} onChange={(e) => setStage(e.target.value)} placeholder="ทุกขั้นตอน">
          {Object.entries(STAGE).map(([k, l]) => (
            <option key={k} value={k}>{l}</option>
          ))}
        </Select>
      )}
      <Select className="h-9 !w-auto text-sm" value={source} onChange={(e) => setSource(e.target.value)} placeholder="ทุกช่องทาง">
        {Object.entries(SOURCE).map(([k, l]) => (
          <option key={k} value={k}>{l}</option>
        ))}
      </Select>
      <Select className="h-9 !w-auto text-sm" value={rating} onChange={(e) => setRating(e.target.value)} placeholder="ทุกคะแนน">
        {[5, 4, 3, 2, 1].map((r) => (
          <option key={r} value={r}>{"★".repeat(r)} ขึ้นไป</option>
        ))}
      </Select>
    </div>
  );

  return (
    <div>
      <PageHeader
        title="ผู้สมัคร"
        description="ลากการ์ดเพื่อย้ายขั้นตอน หรือใช้เมนู ⋯ บนการ์ด — ทุกการย้ายถูกบันทึกในประวัติผู้สมัคร"
        actions={
          <>
            <div className="flex rounded-[var(--radius-ctl)] border border-line bg-white p-0.5">
              <button onClick={() => setView("board")} className={clsx("flex h-8 items-center gap-1 rounded-md px-2.5 text-sm", view === "board" ? "bg-jade-600 text-white" : "text-ink-soft")}>
                <Columns3 className="size-4" /> บอร์ด
              </button>
              <button onClick={() => setView("table")} className={clsx("flex h-8 items-center gap-1 rounded-md px-2.5 text-sm", view === "table" ? "bg-jade-600 text-white" : "text-ink-soft")}>
                <Table2 className="size-4" /> ตาราง
              </button>
            </div>
            {can("recruit", "export") && (
              <Button variant="secondary" icon={<Download className="size-4" />} onClick={exportCsv}>ส่งออก</Button>
            )}
            {can("recruit", "create") && (
              <Button icon={<Plus className="size-4" />} onClick={() => setAdding(true)}>เพิ่มผู้สมัคร</Button>
            )}
          </>
        }
      />

      <div className="mb-3">{toolbar}</div>

      {rows === null ? (
        <Spinner className="mx-auto mt-16" />
      ) : view === "board" ? (
        <div className="thin-scroll -mx-3 flex gap-3 overflow-x-auto px-3 pb-3 sm:-mx-6 sm:px-6">
          {BOARD.map((s) => {
            const list = filtered.filter((a) => a.stage === s || (s === "rejected" && a.stage === "withdrawn"));
            return (
              <section
                key={s}
                onDragOver={(e) => {
                  if (!canEdit) return;
                  e.preventDefault();
                  setOver(s);
                }}
                onDragLeave={() => setOver((o) => (o === s ? null : o))}
                onDrop={() => drop(s)}
                className={clsx(
                  "flex w-64 shrink-0 flex-col rounded-[var(--radius-panel)] border bg-paper/70",
                  over === s ? "border-jade-400 bg-jade-50" : "border-line",
                  (s === "rejected" || s === "talent_pool") && "opacity-90",
                )}
              >
                <header className="flex items-center justify-between px-3 py-2.5">
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                    <span className={clsx("size-2 rounded-full", { blue: "bg-sky-500", violet: "bg-violet-500", amber: "bg-amber-500", green: "bg-jade-500", red: "bg-rust", gray: "bg-ink-mute" }[STAGE_COLOR[s]])} />
                    {STAGE[s]}
                  </span>
                  <span className="num rounded-full bg-white px-2 text-xs text-ink-soft">{list.length}</span>
                </header>
                <ul className="flex min-h-24 flex-col gap-2 px-2 pb-2">
                  {list.map((a) => (
                    <li
                      key={a.id}
                      draggable={canEdit && a.stage !== "hired"}
                      onDragStart={() => setDragId(a.id)}
                      onDragEnd={() => setDragId(null)}
                      className={clsx("relative rounded-[var(--radius-ctl)] border border-line bg-white p-2.5 shadow-[0_1px_0_rgba(0,0,0,0.03)]", canEdit && a.stage !== "hired" && "cursor-grab active:cursor-grabbing", dragId === a.id && "opacity-50")}
                    >
                      <Link href={`/recruit/applicants/${a.id}`} className="block pr-6">
                        <div className="truncate text-[15px] font-medium text-ink hover:text-jade-700">
                          {name(a)} {a.nickname && <span className="font-normal text-ink-mute">({a.nickname})</span>}
                        </div>
                        <div className="truncate text-xs text-ink-soft">{a.posting_id ? pName.get(a.posting_id) : "ไม่ระบุตำแหน่ง"}</div>
                        <div className="mt-1.5 flex items-center justify-between text-xs text-ink-mute">
                          <span className="num">{thDate(a.created_at)}</span>
                          <Stars n={a.rating} />
                        </div>
                        {(a.tags?.length ?? 0) > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {a.tags!.slice(0, 3).map((t) => (
                              <span key={t} className="rounded bg-jade-50 px-1.5 text-[11px] text-jade-800">{t}</span>
                            ))}
                          </div>
                        )}
                        {a.stage === "withdrawn" && <Badge className="mt-1">ถอนใบสมัคร</Badge>}
                      </Link>
                      {canEdit && a.stage !== "hired" && (
                        <div className="absolute right-1 top-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setMenu(menu === a.id ? null : a.id);
                            }}
                            className="rounded p-1 text-ink-mute hover:bg-paper hover:text-ink"
                            aria-label="ย้ายขั้นตอน"
                          >
                            <MoreHorizontal className="size-4" />
                          </button>
                          {menu === a.id && (
                            <div className="absolute right-0 z-20 mt-1 w-48 overflow-hidden rounded-[var(--radius-ctl)] border border-line bg-white py-1 shadow-lg" onClick={(e) => e.stopPropagation()}>
                              <div className="px-3 py-1 text-xs text-ink-mute">ย้ายไปขั้น</div>
                              {MOVE_TARGETS.filter((t) => t !== a.stage).map((t) => (
                                <button key={t} className="block w-full px-3 py-1.5 text-left text-sm hover:bg-jade-50" onClick={() => (setMenu(null), setMoving({ a, to: t }))}>
                                  {STAGE[t]}
                                </button>
                              ))}
                              <button className="block w-full border-t border-line-soft px-3 py-1.5 text-left text-sm font-medium text-jade-700 hover:bg-jade-50" onClick={() => router.push(`/recruit/applicants/${a.id}?hire=1`)}>
                                บรรจุเป็นพนักงาน…
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </li>
                  ))}
                  {list.length === 0 && <li className="grid h-16 place-items-center rounded-[var(--radius-ctl)] border border-dashed border-line text-xs text-ink-mute">ไม่มีผู้สมัคร</li>}
                </ul>
              </section>
            );
          })}
        </div>
      ) : (
        <Panel bodyClass="p-0">
          <div className="thin-scroll overflow-x-auto">
            <table className="w-full text-[14px]">
              <thead>
                <tr className="border-b border-line bg-paper/60 text-left text-[13px] text-ink-soft">
                  <th className="px-3 py-2 font-medium">ผู้สมัคร</th>
                  <th className="px-3 py-2 font-medium">ตำแหน่งที่สมัคร</th>
                  <th className="px-3 py-2 font-medium">โทร</th>
                  <th className="px-3 py-2 font-medium">วุฒิ / ประสบการณ์</th>
                  <th className="px-3 py-2 text-right font-medium">เงินเดือนที่ต้องการ</th>
                  <th className="px-3 py-2 font-medium">ช่องทาง</th>
                  <th className="px-3 py-2 font-medium">ขั้นตอน</th>
                  <th className="px-3 py-2 font-medium">คะแนน</th>
                  <th className="px-3 py-2 font-medium">วันที่สมัคร</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={9}>
                      <Empty title="ไม่พบผู้สมัครที่ตรงกับเงื่อนไข" />
                    </td>
                  </tr>
                ) : (
                  filtered.map((a) => (
                    <tr key={a.id} className="cursor-pointer border-b border-line-soft last:border-0 hover:bg-jade-50/40" onClick={() => router.push(`/recruit/applicants/${a.id}`)}>
                      <td className="px-3 py-2">
                        <div className="font-medium">{name(a)}</div>
                        <div className="num text-xs text-ink-mute">{a.ref_no}</div>
                      </td>
                      <td className="px-3 py-2 text-ink-soft">{a.posting_id ? pName.get(a.posting_id) : "-"}</td>
                      <td className="num px-3 py-2">{a.phone}</td>
                      <td className="px-3 py-2 text-ink-soft">
                        {a.education_level ?? "-"}
                        {a.experience_years != null && <span className="num"> · {a.experience_years} ปี</span>}
                      </td>
                      <td className="num px-3 py-2 text-right">{a.expected_salary ? Number(a.expected_salary).toLocaleString("th-TH") : "-"}</td>
                      <td className="px-3 py-2 text-ink-soft">{SOURCE[a.source ?? ""] ?? a.source ?? "-"}</td>
                      <td className="px-3 py-2">
                        <Badge color={STAGE_COLOR[a.stage]}>{STAGE[a.stage]}</Badge>
                      </td>
                      <td className="px-3 py-2">
                        <Stars n={a.rating} />
                      </td>
                      <td className="num whitespace-nowrap px-3 py-2">{thDate(a.created_at)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      <ApplicantFormModal open={adding} onClose={() => setAdding(false)} postings={postings.filter((p) => p.status !== "closed")} defaultPosting={posting} onSaved={() => load()} />
      <MoveDialog applicant={moving ? { id: moving.a.id, name: name(moving.a), stage: moving.a.stage } : null} to={moving?.to} onClose={() => setMoving(null)} onDone={load} />
    </div>
  );
}
