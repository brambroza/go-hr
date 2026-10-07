"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRightLeft, FileText, Mail, Phone, UserCheck } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useCan } from "@/components/app/me-context";
import { Badge, Button, Empty, Field, Input, PageHeader, Panel, Spinner, Textarea, toast } from "@/components/ui";
import { Avatar } from "@/components/employees/avatar";
import { humanError } from "@/components/crud/crud-page";
import { signedUrl } from "@/lib/storage";
import { money, thDate, thDateTime } from "@/lib/format";
import { MoveDialog } from "./move-dialog";
import { HireWizard } from "./hire-wizard";
import { InterviewsPanel, type Interview } from "./interviews";
import { Stars } from "./stars";
import { SOURCE, STAGE, STAGE_COLOR, type JobQuestion } from "./labels";

type Ap = {
  id: number; ref_no: string | null; posting_id: number | null; prefix: string | null; first_name: string; last_name: string; nickname: string | null; email: string | null; phone: string;
  birth_date: string | null; gender: string | null; address: string | null; education_level: string | null; institution: string | null; major: string | null; experience_years: number | null;
  last_company: string | null; last_position: string | null; expected_salary: number | null; available_date: string | null; resume_url: string | null; photo_url: string | null;
  cover_letter: string | null; answers: Record<string, unknown>; source: string | null; stage: string; rating: number | null; tags: string[] | null; notes: string | null;
  consent_pdpa: boolean; consent_at: string | null; employee_id: number | null; created_at: string;
};
type Act = { id: number; activity_type: string; from_stage: string | null; to_stage: string | null; note: string | null; created_at: string };
type Posting = { id: number; title: string; questions: JobQuestion[]; position_id: number | null; org_unit_id: number | null; branch_id: number | null; hiring_manager_id: number | null; salary_min: number | null };

function age(d: string | null) {
  if (!d) return null;
  const b = new Date(d);
  const n = new Date();
  return n.getFullYear() - b.getFullYear() - (n < new Date(n.getFullYear(), b.getMonth(), b.getDate()) ? 1 : 0);
}

export function ApplicantDetail({ id }: { id: number }) {
  const sb = supabaseBrowser();
  const can = useCan();
  const router = useRouter();
  const sp = useSearchParams();
  const canEdit = can("recruit", "edit");
  const [a, setA] = useState<Ap | null | undefined>(undefined);
  const [posting, setPosting] = useState<Posting | null>(null);
  const [acts, setActs] = useState<Act[]>([]);
  const [saving, setSaving] = useState(false);
  const [noting, setNoting] = useState(false);
  const [ivs, setIvs] = useState<Interview[]>([]);
  const [resume, setResume] = useState<string | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  const [hiring, setHiring] = useState(false);
  const [notes, setNotes] = useState("");
  const [tags, setTags] = useState("");
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    const [ap, ac, iv] = await Promise.all([
      sb.from("applicants").select("*").eq("id", id).maybeSingle(),
      sb.from("applicant_activities").select("id, activity_type, from_stage, to_stage, note, created_at").eq("applicant_id", id).order("created_at", { ascending: false }),
      sb.from("interviews").select("*").eq("applicant_id", id).order("round"),
    ]);
    const row = ap.data as Ap | null;
    setA(row);
    setActs((ac.data as Act[]) ?? []);
    setIvs((iv.data as Interview[]) ?? []);
    if (row) {
      setNotes(row.notes ?? "");
      setTags((row.tags ?? []).join(", "));
      if (row.posting_id) {
        const { data } = await sb.from("job_postings").select("id, title, questions, position_id, org_unit_id, branch_id, hiring_manager_id, salary_min").eq("id", row.posting_id).maybeSingle();
        setPosting(data as Posting | null);
      }
      signedUrl(row.resume_url).then(setResume);
      signedUrl(row.photo_url).then(setPhoto);
    }
  }, [sb, id]);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (sp.get("hire") === "1" && a && !a.employee_id && canEdit) setHiring(true);
  }, [sp, a, canEdit]);

  async function patch(p: Partial<Ap>, msg = "บันทึกแล้ว") {
    setSaving(true);
    const { error } = await sb.from("applicants").update(p).eq("id", id);
    setSaving(false);
    if (error) return toast.error(humanError(error));
    toast.ok(msg);
    load();
  }
  async function addNote() {
    if (!note.trim() || noting) return;
    setNoting(true);
    const { error } = await sb.from("applicant_activities").insert({ applicant_id: id, activity_type: "note", note: note.trim() });
    setNoting(false);
    if (error) return toast.error(humanError(error));
    toast.ok("เพิ่มบันทึกแล้ว");
    setNote("");
    load();
  }

  if (a === undefined) return <Spinner className="mx-auto mt-20" />;
  if (a === null) return <Empty title="ไม่พบผู้สมัคร" description="ผู้สมัครอาจถูกลบ หรือคุณไม่มีสิทธิ์ดูข้อมูลนี้" action={<Link href="/recruit/applicants" className="text-jade-700 underline">กลับไปหน้าผู้สมัคร</Link>} />;

  const fullName = `${a.prefix ?? ""}${a.first_name} ${a.last_name}`;
  const questions = posting?.questions ?? [];
  const answerEntries = Object.entries(a.answers ?? {});

  return (
    <div>
      <PageHeader
        back={
          <Link href="/recruit/applicants" className="mb-1 inline-flex items-center gap-1 text-sm text-ink-soft hover:text-jade-700">
            <ArrowLeft className="size-4" /> ผู้สมัครทั้งหมด
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-2">
            {fullName} {a.nickname && <span className="text-lg font-normal text-ink-mute">({a.nickname})</span>}
            <Badge color={STAGE_COLOR[a.stage]}>{STAGE[a.stage]}</Badge>
          </span>
        }
        description={
          <>
            {posting ? `สมัครตำแหน่ง ${posting.title}` : "ไม่ระบุตำแหน่ง"} · ใบสมัครเลขที่ <span className="num">{a.ref_no}</span> · {thDate(a.created_at)} · {SOURCE[a.source ?? ""] ?? a.source}
          </>
        }
        actions={
          canEdit && (
            <>
              {a.stage !== "hired" && (
                <Button variant="secondary" icon={<ArrowRightLeft className="size-4" />} onClick={() => setMoving(true)}>
                  ย้ายขั้นตอน
                </Button>
              )}
              {a.employee_id ? (
                <Link href={`/employees/${a.employee_id}`} className="inline-flex h-10 items-center gap-1.5 rounded-[var(--radius-ctl)] bg-jade-50 px-4 text-[15px] font-medium text-jade-800 hover:bg-jade-100">
                  <UserCheck className="size-4" /> ดูประวัติพนักงาน
                </Link>
              ) : (
                can("employee", "create") && (
                  <Button icon={<UserCheck className="size-4" />} onClick={() => setHiring(true)}>
                    บรรจุเป็นพนักงาน
                  </Button>
                )
              )}
            </>
          )
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-4">
          <Panel title="ข้อมูลผู้สมัคร">
            <div className="flex flex-col gap-4 sm:flex-row">
              <Avatar src={photo} name={`${a.first_name} ${a.last_name}`} size={88} className="rounded-xl" />
              <dl className="grid flex-1 gap-x-6 gap-y-2 text-[15px] sm:grid-cols-2">
                <KV k="โทรศัพท์">
                  <a href={`tel:${a.phone}`} className="num inline-flex items-center gap-1 text-jade-700 hover:underline"><Phone className="size-3.5" />{a.phone}</a>
                </KV>
                <KV k="อีเมล">{a.email ? <a href={`mailto:${a.email}`} className="inline-flex items-center gap-1 break-all text-jade-700 hover:underline"><Mail className="size-3.5" />{a.email}</a> : "-"}</KV>
                <KV k="วันเกิด / อายุ">{a.birth_date ? `${thDate(a.birth_date)} (${age(a.birth_date)} ปี)` : "-"}</KV>
                <KV k="เพศ">{a.gender === "M" ? "ชาย" : a.gender === "F" ? "หญิง" : "-"}</KV>
                <KV k="การศึกษา">{[a.education_level, a.major, a.institution].filter(Boolean).join(" · ") || "-"}</KV>
                <KV k="ประสบการณ์">{a.experience_years != null ? `${a.experience_years} ปี` : "-"}</KV>
                <KV k="งานล่าสุด">{[a.last_position, a.last_company].filter(Boolean).join(" · ") || "-"}</KV>
                <KV k="เงินเดือนที่ต้องการ">{a.expected_salary ? `${money(a.expected_salary, 0)} บาท` : "-"}</KV>
                <KV k="เริ่มงานได้">{a.available_date ? thDate(a.available_date) : "-"}</KV>
                <KV k="ความยินยอม PDPA">{a.consent_pdpa ? `ยินยอมแล้ว${a.consent_at ? ` (${thDateTime(a.consent_at)})` : ""}` : "ยังไม่ยินยอม"}</KV>
                {a.address && <KV k="ที่อยู่" className="sm:col-span-2">{a.address}</KV>}
              </dl>
            </div>
            {a.cover_letter && (
              <div className="mt-4 rounded-[var(--radius-ctl)] bg-paper p-3">
                <div className="mb-1 text-sm font-medium text-ink-soft">แนะนำตัว</div>
                <p className="whitespace-pre-line text-[15px]">{a.cover_letter}</p>
              </div>
            )}
          </Panel>

          <Panel
            title="ไฟล์ใบสมัคร / Resume"
            actions={resume && <a href={resume} target="_blank" rel="noreferrer" className="text-sm text-jade-700 hover:underline">เปิดในแท็บใหม่</a>}
          >
            {!a.resume_url ? (
              <p className="text-sm text-ink-mute">ผู้สมัครไม่ได้แนบไฟล์</p>
            ) : resume && /\.pdf($|\?)/i.test(a.resume_url) ? (
              <iframe src={resume} title="Resume" className="h-[520px] w-full rounded-[var(--radius-ctl)] border border-line" />
            ) : (
              <a href={resume ?? "#"} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-jade-700 hover:underline">
                <FileText className="size-5" /> ดาวน์โหลดไฟล์ใบสมัคร
              </a>
            )}
          </Panel>

          {(questions.length > 0 || answerEntries.length > 0) && (
            <Panel title="คำตอบคำถามเพิ่มเติม">
              <dl className="flex flex-col gap-3">
                {(questions.length ? questions.map((q) => [q.key, q.label] as const) : answerEntries.map(([k]) => [k, k] as const)).map(([k, label]) => {
                  const v = a.answers?.[k];
                  return (
                    <div key={k}>
                      <dt className="text-sm text-ink-soft">{label}</dt>
                      <dd className="text-[15px]">{v === true ? "ใช่" : v === false ? "ไม่ใช่" : v == null || v === "" ? <span className="text-ink-mute">ไม่ได้ตอบ</span> : String(v)}</dd>
                    </div>
                  );
                })}
              </dl>
            </Panel>
          )}

          <Panel title="การสัมภาษณ์">
            <InterviewsPanel applicantId={a.id} interviews={ivs} onChange={load} canEdit={canEdit} />
          </Panel>
        </div>

        <div className="flex flex-col gap-4">
          <Panel title="การประเมินของ HR">
            <div className="flex flex-col gap-3">
              <Field label="คะแนนผู้สมัคร">
                <Stars n={a.rating} size="md" onChange={canEdit ? (n) => patch({ rating: n }, "บันทึกคะแนนแล้ว") : undefined} />
              </Field>
              <Field label="แท็ก" hint="คั่นด้วย , เช่น ขับรถยกได้, มีประสบการณ์ ISO">
                <Input value={tags} onChange={(e) => setTags(e.target.value)} disabled={!canEdit} onBlur={() => canEdit && tags !== (a.tags ?? []).join(", ") && patch({ tags: tags.split(",").map((s) => s.trim()).filter(Boolean) }, "บันทึกแท็กแล้ว")} />
              </Field>
              <Field label="บันทึก">
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} disabled={!canEdit} />
              </Field>
              {canEdit && notes !== (a.notes ?? "") && (
                <div>
                  <Button size="sm" loading={saving} onClick={() => patch({ notes })}>บันทึก</Button>
                </div>
              )}
            </div>
          </Panel>

          <Panel title="ประวัติ">
            {canEdit && (
              <div className="mb-3 flex gap-2">
                <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="เพิ่มบันทึก เช่น โทรนัดแล้ว" onKeyDown={(e) => e.key === "Enter" && addNote()} className="h-9 text-sm" />
                <Button size="sm" variant="secondary" onClick={addNote} loading={noting} disabled={!note.trim()}>เพิ่ม</Button>
              </div>
            )}
            <ol className="relative ml-1.5 border-l border-line pl-4">
              {acts.map((x) => (
                <li key={x.id} className="mb-3 last:mb-0">
                  <span className="absolute -left-[5px] mt-1.5 size-2.5 rounded-full border-2 border-white bg-jade-500" />
                  <div className="text-sm">
                    {x.activity_type === "stage_change" ? (
                      <>
                        ย้าย {x.from_stage ? `“${STAGE[x.from_stage] ?? x.from_stage}” → ` : ""}“{STAGE[x.to_stage ?? ""] ?? x.to_stage}”
                      </>
                    ) : x.activity_type === "interview" ? (
                      "สัมภาษณ์"
                    ) : (
                      "บันทึก"
                    )}
                  </div>
                  {x.note && <p className="text-sm text-ink-soft">{x.note}</p>}
                  <div className="num text-xs text-ink-mute">{thDateTime(x.created_at)}</div>
                </li>
              ))}
              <li>
                <span className="absolute -left-[5px] mt-1.5 size-2.5 rounded-full border-2 border-white bg-line" />
                <div className="text-sm">ยื่นใบสมัคร</div>
                <div className="num text-xs text-ink-mute">{thDateTime(a.created_at)}</div>
              </li>
            </ol>
          </Panel>
        </div>
      </div>

      <MoveDialog applicant={moving ? { id: a.id, name: `${a.first_name} ${a.last_name}`, stage: a.stage } : null} onClose={() => setMoving(false)} onDone={load} />
      <HireWizard
        open={hiring}
        onClose={() => {
          setHiring(false);
          if (sp.get("hire")) router.replace(`/recruit/applicants/${a.id}`);
        }}
        applicant={a}
        posting={posting}
        onHired={() => load()}
      />
    </div>
  );
}

function KV({ k, children, className }: { k: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-sm text-ink-mute">{k}</dt>
      <dd className="text-ink">{children}</dd>
    </div>
  );
}
