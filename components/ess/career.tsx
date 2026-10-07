"use client";

import { useEffect, useState } from "react";
import { ArrowDown, CheckCircle2, Clock } from "lucide-react";
import { Spinner } from "@/components/ui";
import { useMe } from "@/components/app/me-context";
import { supabaseBrowser } from "@/lib/supabase/client";
import { serviceText, yearsBetween } from "./lib";

type Pos = { id: number; code: string; name: string; job_level: number; job_grade: string | null; description: string | null; qualifications: string | null };
type Path = { id: number; min_years: number | null; requirements: string | null; to: Pos };

export function CareerView() {
  const me = useMe();
  const [pos, setPos] = useState<Pos | null | undefined>(undefined);
  const [hire, setHire] = useState<string | null>(null);
  const [paths, setPaths] = useState<(Path & { next: Path[] })[]>([]);

  useEffect(() => {
    const sb = supabaseBrowser();
    (async () => {
      const { data: e } = await sb.from("employees").select("position_id, hire_date").eq("id", me.employeeId!).maybeSingle();
      const emp = e as { position_id: number | null; hire_date: string } | null;
      setHire(emp?.hire_date ?? null);
      if (!emp?.position_id) return setPos(null);
      const cols = "id, code, name, job_level, job_grade, description, qualifications";
      const [{ data: p }, { data: cp }] = await Promise.all([
        sb.from("positions").select(cols).eq("id", emp.position_id).maybeSingle(),
        sb.from("career_paths").select(`id, min_years, requirements, to:positions!career_paths_to_position_id_fkey(${cols})`).eq("from_position_id", emp.position_id).order("sort_order"),
      ]);
      setPos(p as Pos);
      const first = ((cp as unknown as Path[]) ?? []).filter((x) => x.to);
      // one more step ahead, so people can see the longer road
      const ids = first.map((x) => x.to.id);
      const { data: cp2 } = ids.length
        ? await sb.from("career_paths").select(`id, min_years, requirements, from_position_id, to:positions!career_paths_to_position_id_fkey(${cols})`).in("from_position_id", ids)
        : { data: [] };
      const second = (cp2 as unknown as (Path & { from_position_id: number })[]) ?? [];
      setPaths(first.map((x) => ({ ...x, next: second.filter((s) => s.from_position_id === x.to.id && s.to) })));
    })();
  }, [me.employeeId]);

  if (pos === undefined) return <div className="grid h-40 place-items-center"><Spinner /></div>;
  if (pos === null) return <p className="rounded-[var(--radius-panel)] border border-line bg-white px-4 py-10 text-center text-ink-soft">ยังไม่ได้กำหนดตำแหน่งของคุณ — ติดต่อฝ่ายบุคคล</p>;

  const years = yearsBetween(hire);

  return (
    <>
      <section className="rounded-[var(--radius-panel)] bg-jade-800 px-4 py-4 text-white">
        <div className="text-sm text-jade-200">ตำแหน่งปัจจุบัน</div>
        <div className="text-[22px] font-semibold leading-tight">{pos.name}</div>
        <div className="mt-1 text-sm text-jade-200">
          ระดับ {pos.job_level}
          {pos.job_grade ? ` · เกรด ${pos.job_grade}` : ""} · อายุงาน {serviceText(hire)}
        </div>
        {pos.description && <p className="mt-2 text-sm text-jade-100">{pos.description}</p>}
      </section>

      {paths.length === 0 ? (
        <p className="mt-3 rounded-[var(--radius-panel)] border border-line bg-white px-4 py-8 text-center text-[15px] text-ink-soft">
          ยังไม่มีเส้นทางการเติบโตที่กำหนดไว้สำหรับตำแหน่งนี้ ปรึกษาหัวหน้างานหรือฝ่ายบุคคลเกี่ยวกับโอกาสก้าวหน้า
        </p>
      ) : (
        paths.map((p) => {
          const need = Number(p.min_years ?? 0);
          const ready = years >= need;
          const pct = need ? Math.min(100, (years / need) * 100) : 100;
          return (
            <div key={p.id}>
              <div className="grid h-8 place-items-center text-jade-400"><ArrowDown className="size-5" /></div>
              <section className="rounded-[var(--radius-panel)] border border-line bg-white px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm text-ink-soft">ตำแหน่งถัดไป · ระดับ {p.to.job_level}</div>
                    <div className="text-[18px] font-semibold">{p.to.name}</div>
                  </div>
                  {ready ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-jade-50 px-2 py-1 text-xs font-medium text-jade-800"><CheckCircle2 className="size-3.5" /> อายุงานถึงแล้ว</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-paper px-2 py-1 text-xs text-ink-soft"><Clock className="size-3.5" /> อีก {(need - years).toLocaleString("th-TH", { maximumFractionDigits: 1 })} ปี</span>
                  )}
                </div>
                {need > 0 && (
                  <div className="mt-3">
                    <div className="num flex justify-between text-xs text-ink-mute">
                      <span>อายุงาน {years.toLocaleString("th-TH", { maximumFractionDigits: 1 })} ปี</span>
                      <span>ขั้นต่ำ {need} ปี</span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-jade-50" role="img" aria-label={`อายุงาน ${years.toFixed(1)} จาก ${need} ปี`}>
                      <div className="h-full rounded-full bg-jade-500" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )}
                {p.requirements && (
                  <div className="mt-3">
                    <div className="text-sm font-medium text-ink-soft">สิ่งที่ต้องมี</div>
                    <ul className="mt-1 list-disc pl-5 text-[15px] text-ink">
                      {p.requirements.split(/[,\n]/).map((s) => s.trim()).filter(Boolean).map((s) => <li key={s}>{s}</li>)}
                    </ul>
                  </div>
                )}
                {p.to.qualifications && <p className="mt-2 text-sm text-ink-soft">คุณสมบัติตำแหน่ง: {p.to.qualifications}</p>}
                {p.next.length > 0 && (
                  <div className="mt-3 border-t border-line-soft pt-2 text-sm text-ink-soft">
                    จากนั้น: {p.next.map((n) => `${n.to.name}${n.min_years ? ` (อีก ${n.min_years} ปี)` : ""}`).join(", ")}
                  </div>
                )}
              </section>
            </div>
          );
        })
      )}
    </>
  );
}
