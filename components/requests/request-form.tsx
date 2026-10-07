"use client";

/**
 * Request form for every self-service request type (ใบลา, OT, เพิ่มเวลา, เปลี่ยนกะ, เปลี่ยนวันหยุด, เบิกเงิน,
 * สวัสดิการ, หนังสือรับรอง, ร้องเรียน, ลาออก). Submits through public.submit_request — the RPC validates
 * everything and raises Thai messages, which are shown as-is.
 *
 * Reusable: the back office passes `employeeId` to create a request on behalf of an employee.
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Banknote, CalendarClock, CalendarRange, Clock, FileBadge, FileText, HeartHandshake, LogOut, MessageSquareWarning, Plane, Plus, Receipt, Repeat, Timer, Trash2, Wallet } from "lucide-react";
import { Button, Checkbox, clsx, Field, Input, Select, Spinner, Textarea, errorText, toast } from "@/components/ui";
import { AttachmentsField, type Attachment } from "@/components/org/attachments-field";
import { supabaseBrowser } from "@/lib/supabase/client";
import { isoDate, money, thMonthYear } from "@/lib/format";

export interface RequestFormProps {
  /** create on behalf of this employee (back office / supervisor). Omit = the signed-in employee. */
  employeeId?: number;
  /** preselect a request type code (e.g. "leave") */
  defaultType?: string;
  onSubmitted?: (req: { id: number; doc_no: string }) => void;
}

type RType = { code: string; name: string; category: string; needs_attachment: boolean; self_service: boolean; description: string | null; sort_order: number };
type LType = { id: number; code: string; name: string; color: string | null; allow_full_day: boolean; allow_half_day: boolean; allow_hourly: boolean; is_unlimited: boolean; min_notice_days: number; attachment_over_days: number | null; gender: string | null; description: string | null };
type Bal = { leave_type_id: number; remaining_days: number; total_days: number; pending_days: number };
type Shift = { id: number; code: string; name: string };
type Welfare = { id: number; name: string; per_claim_limit: number | null; annual_limit: number | null };

const ICON: Record<string, ReactNode> = {
  leave: <Plane className="size-5" />,
  ot: <Timer className="size-5" />,
  time_add: <Clock className="size-5" />,
  shift_change: <Repeat className="size-5" />,
  dayoff_change: <CalendarRange className="size-5" />,
  advance: <Wallet className="size-5" />,
  petty_cash: <Receipt className="size-5" />,
  welfare: <HeartHandshake className="size-5" />,
  salary_cert: <Banknote className="size-5" />,
  work_cert: <FileBadge className="size-5" />,
  visa_doc: <FileText className="size-5" />,
  complaint: <MessageSquareWarning className="size-5" />,
  resign: <LogOut className="size-5" />,
};
const CATEGORY: Record<string, string> = { time: "เวลาทำงาน", money: "การเงิน", document: "เอกสาร", hr: "งานบุคคล" };
const SUBMIT_LABEL: Record<string, string> = {
  leave: "ส่งใบลา",
  ot: "ส่งคำขอโอที",
  time_add: "ส่งคำขอเพิ่มเวลา",
  shift_change: "ส่งคำขอเปลี่ยนกะ",
  dayoff_change: "ส่งคำขอเปลี่ยนวันหยุด",
  advance: "ส่งคำขอเบิกเงิน",
  petty_cash: "ส่งคำขอเบิกเงินสดย่อย",
  welfare: "ส่งคำขอสวัสดิการ",
  complaint: "ส่งเรื่องร้องเรียน",
  resign: "ส่งใบลาออก",
};

const bkk = (date: string, time: string) => `${date}T${time}:00+07:00`;
const nextDay = (d: string) => {
  const x = new Date(d + "T12:00:00Z");
  x.setUTCDate(x.getUTCDate() + 1);
  return x.toISOString().slice(0, 10);
};
const fmtDays = (n: number) => Number(n).toLocaleString("th-TH", { maximumFractionDigits: 2 });

export function RequestForm({ employeeId, defaultType, onSubmitted }: RequestFormProps) {
  const [types, setTypes] = useState<RType[] | null>(null);
  const [type, setType] = useState<string>(defaultType ?? "");
  const [ltypes, setLtypes] = useState<LType[]>([]);
  const [bal, setBal] = useState<Bal[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [welfare, setWelfare] = useState<Welfare[]>([]);
  const [gender, setGender] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = isoDate();
  const [f, setF] = useState<Record<string, string>>({});
  const [anon, setAnon] = useState(false);
  const [items, setItems] = useState<{ desc: string; amount: string }[]>([{ desc: "", amount: "" }]);
  const [files, setFiles] = useState<Attachment[]>([]);
  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: v }));
  const v = (k: string, d = "") => f[k] ?? d;

  useEffect(() => {
    const sb = supabaseBrowser();
    (async () => {
      const [rt, lt, sh, wf] = await Promise.all([
        sb.from("request_types").select("code, name, category, needs_attachment, self_service, description, sort_order").eq("is_active", true).order("sort_order"),
        sb.from("leave_types").select("id, code, name, color, allow_full_day, allow_half_day, allow_hourly, is_unlimited, min_notice_days, attachment_over_days, gender, description").eq("is_active", true).order("sort_order"),
        sb.from("shifts").select("id, code, name").eq("is_active", true).order("code"),
        sb.from("welfare_types").select("id, name, per_claim_limit, annual_limit").eq("is_active", true).order("id"),
      ]);
      setTypes(((rt.data as RType[]) ?? []).filter((t) => t.self_service || employeeId != null));
      setLtypes((lt.data as LType[]) ?? []);
      setShifts((sh.data as Shift[]) ?? []);
      setWelfare((wf.data as Welfare[]) ?? []);
    })();
  }, [employeeId]);

  // employee-specific: gender (leave type filter) + balances for the year of the chosen date
  const leaveYear = Number((v("start_date") || today).slice(0, 4));
  useEffect(() => {
    const sb = supabaseBrowser();
    (async () => {
      if (employeeId != null) {
        const [{ data: e }, { data: b }] = await Promise.all([
          sb.from("employees").select("gender").eq("id", employeeId).maybeSingle(),
          sb.from("v_leave_balances").select("leave_type_id, remaining_days, total_days, pending_days").eq("employee_id", employeeId).eq("leave_year", leaveYear),
        ]);
        setGender((e as { gender: string | null } | null)?.gender ?? null);
        setBal((b as Bal[]) ?? []);
      } else {
        const { data: me } = await sb.auth.getUser();
        const { data: p } = await sb.from("profiles").select("employee_id").eq("id", me.user?.id ?? "").maybeSingle();
        const empId = (p as { employee_id: number | null } | null)?.employee_id;
        const [{ data: e }, { data: b }] = await Promise.all([
          empId ? sb.from("employees").select("gender").eq("id", empId).maybeSingle() : Promise.resolve({ data: null }),
          sb.rpc("my_leave_balances", { p_year: leaveYear }),
        ]);
        setGender((e as { gender: string | null } | null)?.gender ?? null);
        setBal((b as Bal[]) ?? []);
      }
    })();
  }, [employeeId, leaveYear]);

  const rtype = types?.find((t) => t.code === type) ?? null;
  const visibleLeaveTypes = useMemo(() => ltypes.filter((l) => !l.gender || !gender || l.gender === gender), [ltypes, gender]);
  const lt = ltypes.find((l) => String(l.id) === v("leave_type_id")) ?? null;
  const lbal = lt ? bal.find((b) => b.leave_type_id === lt.id) : undefined;
  const unit = v("unit", "full");
  const pettyTotal = items.reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const wf = welfare.find((w) => String(w.id) === v("welfare_type_id"));

  function reset(next: string) {
    setType(next);
    setF({});
    setItems([{ desc: "", amount: "" }]);
    setFiles([]);
    setAnon(false);
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!type || busy) return;
    setError(null);
    const args: Record<string, unknown> = { p_type: type, p_employee_id: employeeId ?? null, p_reason: v("reason") || null, p_attachments: files, p_payload: {} };
    const payload: Record<string, unknown> = {};
    try {
      switch (type) {
        case "leave": {
          if (!lt) throw new Error("กรุณาเลือกประเภทการลา");
          payload.leave_type_id = lt.id;
          payload.unit = unit;
          args.p_start_date = v("start_date") || null;
          args.p_end_date = unit === "full" ? v("end_date") || v("start_date") || null : v("start_date") || null;
          if (unit === "hours") {
            if (!v("hours")) throw new Error("กรุณาระบุจำนวนชั่วโมงที่ลา");
            payload.hours = Number(v("hours"));
            if (v("from_time")) payload.from_time = v("from_time");
          }
          break;
        }
        case "ot": {
          const d = v("date");
          if (!d || !v("from") || !v("to")) throw new Error("กรุณาระบุวันที่และเวลาเริ่ม–สิ้นสุดโอที");
          args.p_start_date = d;
          args.p_start_at = bkk(d, v("from"));
          args.p_end_at = bkk(v("to") <= v("from") ? nextDay(d) : d, v("to"));
          payload.date = d;
          break;
        }
        case "time_add": {
          const d = v("date");
          if (!d || !v("time")) throw new Error("กรุณาระบุวันที่และเวลาที่ต้องการเพิ่ม");
          args.p_start_date = d;
          args.p_start_at = bkk(d, v("time"));
          payload.direction = v("direction", "in");
          break;
        }
        case "shift_change": {
          if (!v("shift_id")) throw new Error("กรุณาเลือกกะที่ต้องการ");
          args.p_start_date = v("start_date") || null;
          args.p_end_date = v("end_date") || v("start_date") || null;
          payload.shift_id = Number(v("shift_id"));
          payload.shift_name = shifts.find((s) => String(s.id) === v("shift_id"))?.name;
          break;
        }
        case "dayoff_change": {
          const a = v("from_date");
          const b = v("to_date");
          if (!a || !b) throw new Error("กรุณาระบุทั้งวันหยุดเดิมที่จะมาทำงาน และวันที่ต้องการหยุดแทน");
          payload.from_date = a;
          payload.to_date = b;
          args.p_start_date = a < b ? a : b;
          args.p_end_date = a < b ? b : a;
          break;
        }
        case "advance": {
          args.p_amount = Number(v("amount")) || null;
          payload.deduct_date = v("deduct_month", today.slice(0, 7)) + "-01";
          break;
        }
        case "petty_cash": {
          const list = items.filter((i) => i.desc.trim() || Number(i.amount));
          payload.items = list.map((i) => ({ desc: i.desc.trim(), amount: Number(i.amount) || 0 }));
          args.p_amount = pettyTotal || null;
          args.p_start_date = v("date") || today;
          break;
        }
        case "welfare": {
          if (!wf) throw new Error("กรุณาเลือกประเภทสวัสดิการ");
          payload.welfare_type_id = wf.id;
          payload.welfare_type_name = wf.name;
          args.p_amount = Number(v("amount")) || null;
          args.p_start_date = v("date") || today;
          break;
        }
        case "salary_cert":
        case "work_cert":
        case "visa_doc":
        case "contract": {
          if (!v("purpose").trim()) throw new Error("กรุณาระบุวัตถุประสงค์ที่ขอเอกสาร");
          payload.purpose = v("purpose").trim();
          payload.language = v("language", "th");
          payload.copies = Number(v("copies", "1")) || 1;
          if (type === "visa_doc" && v("country")) payload.country = v("country");
          if (v("need_date")) args.p_start_date = v("need_date");
          break;
        }
        case "complaint": {
          if (!v("topic").trim()) throw new Error("กรุณาระบุหัวข้อเรื่องร้องเรียน");
          if (!v("reason").trim()) throw new Error("กรุณาเล่ารายละเอียดเรื่องที่ร้องเรียน");
          payload.topic = v("topic").trim();
          payload.confidential = anon;
          break;
        }
        case "resign": {
          args.p_start_date = v("last_date") || null;
          payload.last_working_date = v("last_date") || null;
          if (!v("reason").trim()) throw new Error("กรุณาระบุเหตุผลการลาออก");
          break;
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return;
    }
    args.p_payload = payload;
    setBusy(true);
    const { data, error } = await supabaseBrowser().rpc("submit_request", args);
    setBusy(false);
    if (error) {
      const msg = errorText(error);
      setError(msg);
      toast.error(`ส่งไม่สำเร็จ: ${msg}`);
      return;
    }
    const r = data as { id: number; doc_no: string; status: string };
    toast.ok(r.status === "approved" ? `อนุมัติอัตโนมัติแล้ว เลขที่ ${r.doc_no}` : `ส่งแล้ว เลขที่ ${r.doc_no} — รออนุมัติ`);
    onSubmitted?.({ id: r.id, doc_no: r.doc_no });
  }

  if (!types) return <div className="grid h-40 place-items-center"><Spinner /></div>;

  // ---------- type picker
  if (!rtype) {
    const groups = Object.entries(CATEGORY)
      .map(([k, label]) => ({ k, label, list: types.filter((t) => t.category === k) }))
      .filter((g) => g.list.length);
    return (
      <div className="flex flex-col gap-4">
        {groups.map((g) => (
          <section key={g.k}>
            <h2 className="mb-2 text-sm font-medium text-ink-soft">{g.label}</h2>
            <div className="grid grid-cols-2 gap-2">
              {g.list.map((t) => (
                <button
                  key={t.code}
                  type="button"
                  onClick={() => reset(t.code)}
                  className="flex min-h-16 items-center gap-2.5 rounded-[var(--radius-panel)] border border-line bg-white px-3 py-2.5 text-left text-[15px] text-ink active:bg-jade-50"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-jade-50 text-jade-700">{ICON[t.code] ?? <FileText className="size-5" />}</span>
                  <span className="leading-snug">{t.name}</span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    );
  }

  // ---------- form
  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <Field label="ประเภทเอกสาร">
        <Select value={type} onChange={(e) => reset(e.target.value)} className="h-12">
          {types.map((t) => (
            <option key={t.code} value={t.code}>
              {t.name}
            </option>
          ))}
        </Select>
      </Field>
      {rtype.description && <p className="-mt-2 text-sm text-ink-soft">{rtype.description}</p>}

      {type === "leave" && (
        <>
          <Field label="ประเภทการลา" required>
            <div className="grid grid-cols-2 gap-2">
              {visibleLeaveTypes.map((l) => {
                const b = bal.find((x) => x.leave_type_id === l.id);
                const sel = v("leave_type_id") === String(l.id);
                return (
                  <button
                    key={l.id}
                    type="button"
                    aria-pressed={sel}
                    onClick={() => {
                      set("leave_type_id", String(l.id));
                      if (!l.allow_half_day && !l.allow_hourly) set("unit", "full");
                    }}
                    className={clsx("min-h-14 rounded-[var(--radius-ctl)] border px-3 py-2 text-left", sel ? "border-jade-600 bg-jade-50 ring-1 ring-jade-600" : "border-line bg-white")}
                  >
                    <span className="flex items-center gap-1.5 text-[15px] font-medium text-ink">
                      <span className="size-2 shrink-0 rounded-full" style={{ background: l.color ?? "#999" }} />
                      {l.name}
                    </span>
                    <span className="num block text-xs text-ink-mute">{l.is_unlimited ? "ไม่จำกัดวัน" : b ? `เหลือ ${fmtDays(b.remaining_days)} วัน` : "ไม่มีโควต้า"}</span>
                  </button>
                );
              })}
            </div>
          </Field>
          {lt && (
            <>
              {lt.description && <p className="-mt-2 text-sm text-ink-soft">{lt.description}</p>}
              <Field label="ลาแบบ">
                <div className="grid grid-cols-4 gap-1 rounded-[var(--radius-ctl)] bg-paper p-1">
                  {(
                    [
                      ["full", "เต็มวัน", lt.allow_full_day],
                      ["half_am", "ครึ่งเช้า", lt.allow_half_day],
                      ["half_pm", "ครึ่งบ่าย", lt.allow_half_day],
                      ["hours", "ชั่วโมง", lt.allow_hourly],
                    ] as const
                  ).map(([k, label, ok]) => (
                    <button
                      key={k}
                      type="button"
                      disabled={!ok}
                      aria-pressed={unit === k}
                      onClick={() => set("unit", k)}
                      className={clsx("h-10 rounded-md text-sm", unit === k ? "bg-white font-medium text-jade-800 shadow-sm" : "text-ink-soft", !ok && "opacity-35")}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </Field>
              <div className={clsx("grid gap-3", unit === "full" ? "grid-cols-2" : "grid-cols-1")}>
                <Field label={unit === "full" ? "ตั้งแต่วันที่" : "วันที่ลา"} required>
                  <Input type="date" className="h-12" value={v("start_date")} onChange={(e) => {
                    set("start_date", e.target.value);
                    if (!v("end_date") || v("end_date") < e.target.value) set("end_date", e.target.value);
                  }} />
                </Field>
                {unit === "full" && (
                  <Field label="ถึงวันที่" required>
                    <Input type="date" className="h-12" min={v("start_date")} value={v("end_date")} onChange={(e) => set("end_date", e.target.value)} />
                  </Field>
                )}
              </div>
              {unit === "hours" && (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="เริ่มเวลา">
                    <Input type="time" className="h-12" value={v("from_time")} onChange={(e) => set("from_time", e.target.value)} />
                  </Field>
                  <Field label="จำนวนชั่วโมง" required>
                    <Input type="number" inputMode="decimal" min={0.5} step={0.5} className="h-12" value={v("hours")} onChange={(e) => set("hours", e.target.value)} />
                  </Field>
                </div>
              )}
              {!lt.is_unlimited && (
                <p className="num -mt-1 rounded-[var(--radius-ctl)] bg-paper px-3 py-2 text-sm text-ink-soft">
                  {lbal ? (
                    <>คงเหลือ <b className="text-ink">{fmtDays(lbal.remaining_days)}</b> จาก {fmtDays(lbal.total_days)} วัน{Number(lbal.pending_days) > 0 && ` (รออนุมัติ ${fmtDays(lbal.pending_days)} วัน)`}</>
                  ) : (
                    <>ยังไม่มีโควต้า{lt.name}ปี {leaveYear + 543}</>
                  )}
                  {lt.min_notice_days > 0 && <> · ต้องยื่นล่วงหน้า {lt.min_notice_days} วัน</>}
                  {lt.attachment_over_days != null && <> · ลาเกิน {fmtDays(lt.attachment_over_days)} วันต้องแนบเอกสาร</>}
                </p>
              )}
            </>
          )}
        </>
      )}

      {type === "ot" && (
        <>
          <Field label="วันที่ทำโอที" required>
            <Input type="date" className="h-12" value={v("date")} onChange={(e) => set("date", e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="เริ่ม" required>
              <Input type="time" className="h-12" value={v("from")} onChange={(e) => set("from", e.target.value)} />
            </Field>
            <Field label="ถึง" required hint={v("from") && v("to") && v("to") <= v("from") ? "สิ้นสุดวันถัดไป" : undefined}>
              <Input type="time" className="h-12" value={v("to")} onChange={(e) => set("to", e.target.value)} />
            </Field>
          </div>
          {v("from") && v("to") && <OtDuration from={v("from")} to={v("to")} />}
        </>
      )}

      {type === "time_add" && (
        <>
          <p className="-mt-2 text-sm text-ink-soft">ใช้เมื่อลืมสแกนหรือเครื่องสแกนมีปัญหา เมื่ออนุมัติแล้วระบบจะเพิ่มเวลาให้</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="วันที่" required>
              <Input type="date" className="h-12" max={today} value={v("date")} onChange={(e) => set("date", e.target.value)} />
            </Field>
            <Field label="เวลา" required>
              <Input type="time" className="h-12" value={v("time")} onChange={(e) => set("time", e.target.value)} />
            </Field>
          </div>
          <Field label="เป็นเวลา">
            <Seg value={v("direction", "in")} onChange={(x) => set("direction", x)} options={[["in", "เข้างาน"], ["out", "ออกงาน"], ["break_out", "พักเบรค"], ["break_in", "กลับจากพัก"]]} />
          </Field>
        </>
      )}

      {type === "shift_change" && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="ตั้งแต่วันที่" required>
              <Input type="date" className="h-12" value={v("start_date")} onChange={(e) => {
                set("start_date", e.target.value);
                if (!v("end_date") || v("end_date") < e.target.value) set("end_date", e.target.value);
              }} />
            </Field>
            <Field label="ถึงวันที่">
              <Input type="date" className="h-12" min={v("start_date")} value={v("end_date")} onChange={(e) => set("end_date", e.target.value)} />
            </Field>
          </div>
          <Field label="กะที่ต้องการ" required>
            <Select className="h-12" value={v("shift_id")} onChange={(e) => set("shift_id", e.target.value)} placeholder="เลือกกะ">
              {shifts.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} · {s.name}
                </option>
              ))}
            </Select>
          </Field>
        </>
      )}

      {type === "dayoff_change" && (
        <>
          <Field label="วันหยุดเดิม (จะมาทำงานแทน)" required>
            <Input type="date" className="h-12" value={v("from_date")} onChange={(e) => set("from_date", e.target.value)} />
          </Field>
          <Field label="วันที่ต้องการหยุดแทน" required>
            <Input type="date" className="h-12" value={v("to_date")} onChange={(e) => set("to_date", e.target.value)} />
          </Field>
        </>
      )}

      {type === "advance" && (
        <>
          <Field label="จำนวนเงิน (บาท)" required>
            <Input type="number" inputMode="decimal" min={1} className="num h-12 text-lg" value={v("amount")} onChange={(e) => set("amount", e.target.value)} />
          </Field>
          <Field label="หักคืนในงวดเงินเดือน">
            <Select className="h-12" value={v("deduct_month", today.slice(0, 7))} onChange={(e) => set("deduct_month", e.target.value)}>
              {[0, 1, 2].map((i) => {
                const d = new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1 + i, 1);
                const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
                return (
                  <option key={ym} value={ym}>
                    {thMonthYear(d.getFullYear(), d.getMonth() + 1)}
                  </option>
                );
              })}
            </Select>
          </Field>
        </>
      )}

      {type === "petty_cash" && (
        <>
          <Field label="วันที่จ่าย">
            <Input type="date" className="h-12" max={today} value={v("date", today)} onChange={(e) => set("date", e.target.value)} />
          </Field>
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-ink-soft">รายการค่าใช้จ่าย<span className="ml-0.5 text-rust">*</span></span>
            {items.map((it, i) => (
              <div key={i} className="flex gap-2">
                <Input className="h-12 flex-1" placeholder="รายการ เช่น ค่าน้ำมัน" aria-label={`รายการที่ ${i + 1}`} value={it.desc} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, desc: e.target.value } : x)))} />
                <Input className="num h-12 w-28" type="number" inputMode="decimal" placeholder="บาท" aria-label={`จำนวนเงินรายการที่ ${i + 1}`} value={it.amount} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
                {items.length > 1 && (
                  <button type="button" className="grid size-12 shrink-0 place-items-center rounded-[var(--radius-ctl)] text-ink-mute active:bg-rust-soft" aria-label="ลบรายการ" onClick={() => setItems(items.filter((_, j) => j !== i))}>
                    <Trash2 className="size-5" />
                  </button>
                )}
              </div>
            ))}
            <div className="flex items-center justify-between">
              <Button type="button" variant="ghost" size="sm" icon={<Plus className="size-4" />} onClick={() => setItems([...items, { desc: "", amount: "" }])}>
                เพิ่มรายการ
              </Button>
              <span className="num text-[15px]">รวม <b>{money(pettyTotal)}</b> บาท</span>
            </div>
          </div>
        </>
      )}

      {type === "welfare" && (
        <>
          <Field label="ประเภทสวัสดิการ" required>
            <Select className="h-12" value={v("welfare_type_id")} onChange={(e) => set("welfare_type_id", e.target.value)} placeholder="เลือกสวัสดิการ">
              {welfare.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </Select>
          </Field>
          {wf && (wf.per_claim_limit != null || wf.annual_limit != null) && (
            <p className="num -mt-2 text-sm text-ink-soft">
              {wf.per_claim_limit != null && <>เบิกได้ไม่เกิน {money(wf.per_claim_limit, 0)} บาทต่อครั้ง </>}
              {wf.annual_limit != null && <>· วงเงิน {money(wf.annual_limit, 0)} บาทต่อปี</>}
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="จำนวนเงิน (บาท)" required>
              <Input type="number" inputMode="decimal" className="num h-12" value={v("amount")} onChange={(e) => set("amount", e.target.value)} />
            </Field>
            <Field label="วันที่เกิดค่าใช้จ่าย">
              <Input type="date" className="h-12" max={today} value={v("date", today)} onChange={(e) => set("date", e.target.value)} />
            </Field>
          </div>
        </>
      )}

      {(type === "salary_cert" || type === "work_cert" || type === "visa_doc" || type === "contract") && (
        <>
          <Field label="ใช้เพื่อ" required>
            <Input className="h-12" placeholder={type === "visa_doc" ? "เช่น ยื่นวีซ่าท่องเที่ยวญี่ปุ่น" : "เช่น ยื่นกู้ซื้อบ้าน, เปิดบัญชีธนาคาร"} value={v("purpose")} onChange={(e) => set("purpose", e.target.value)} />
          </Field>
          {type === "visa_doc" && (
            <Field label="ประเทศที่จะเดินทาง">
              <Input className="h-12" value={v("country")} onChange={(e) => set("country", e.target.value)} />
            </Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="ภาษา">
              <Seg value={v("language", "th")} onChange={(x) => set("language", x)} options={[["th", "ไทย"], ["en", "อังกฤษ"]]} />
            </Field>
            <Field label="จำนวน (ฉบับ)">
              <Input type="number" inputMode="numeric" min={1} max={10} className="num h-12" value={v("copies", "1")} onChange={(e) => set("copies", e.target.value)} />
            </Field>
          </div>
          <Field label="ต้องการรับภายในวันที่">
            <Input type="date" className="h-12" min={today} value={v("need_date")} onChange={(e) => set("need_date", e.target.value)} />
          </Field>
        </>
      )}

      {type === "complaint" && (
        <>
          <p className="-mt-2 rounded-[var(--radius-ctl)] bg-jade-50 px-3 py-2 text-sm text-jade-900">
            เรื่องร้องเรียนส่งถึงฝ่ายบุคคลโดยตรง ไม่ต้องผ่านการอนุมัติของหัวหน้างาน
          </p>
          <Field label="หัวข้อ" required>
            <Input className="h-12" value={v("topic")} onChange={(e) => set("topic", e.target.value)} />
          </Field>
        </>
      )}

      {type === "resign" && (
        <>
          <p className="-mt-2 rounded-[var(--radius-ctl)] bg-amber-50 px-3 py-2 text-sm text-amber-ink">
            ใบลาออกจะส่งให้หัวหน้าและฝ่ายบุคคลอนุมัติตามลำดับ ตามกฎหมายควรแจ้งล่วงหน้าอย่างน้อย 1 รอบการจ่ายค่าจ้าง
          </p>
          <Field label="วันทำงานวันสุดท้าย" required>
            <Input type="date" className="h-12" min={today} value={v("last_date")} onChange={(e) => set("last_date", e.target.value)} />
          </Field>
        </>
      )}

      <Field
        label={type === "complaint" ? "รายละเอียด" : type === "resign" ? "เหตุผลการลาออก" : "เหตุผล / หมายเหตุ"}
        required={type === "complaint" || type === "resign"}
      >
        <Textarea rows={3} value={v("reason")} onChange={(e) => set("reason", e.target.value)} className="text-base" />
      </Field>

      {type === "complaint" && <Checkbox label="ไม่ต้องการให้หัวหน้างานทราบเรื่องนี้ (ฝ่ายบุคคลจะปกปิดชื่อผู้ร้องเรียน)" checked={anon} onChange={setAnon} />}

      {(rtype.needs_attachment || ["leave", "welfare", "petty_cash", "complaint", "ot", "time_add"].includes(type)) && (
        <Field label={type === "petty_cash" ? "ใบเสร็จ" : "เอกสารแนบ"} required={rtype.needs_attachment}>
          <AttachmentsField value={files} onChange={setFiles} bucket="attachments" folder="requests" />
        </Field>
      )}

      {error && (
        <div role="alert" className="rounded-[var(--radius-ctl)] border border-rust/30 bg-rust-soft px-3 py-2.5 text-[15px] text-rust">
          {error}
        </div>
      )}

      <Button type="submit" size="lg" loading={busy} className="h-14 text-[17px]">
        {SUBMIT_LABEL[type] ?? `ส่ง${rtype.name}`}
      </Button>
    </form>
  );
}

function Seg({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: (readonly [string, string])[] }) {
  return (
    <div className="grid gap-1 rounded-[var(--radius-ctl)] bg-paper p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0,1fr))` }}>
      {options.map(([k, label]) => (
        <button key={k} type="button" aria-pressed={value === k} onClick={() => onChange(k)} className={clsx("h-10 rounded-md text-sm", value === k ? "bg-white font-medium text-jade-800 shadow-sm" : "text-ink-soft")}>
          {label}
        </button>
      ))}
    </div>
  );
}

function OtDuration({ from, to }: { from: string; to: string }) {
  const [fh, fm] = from.split(":").map(Number);
  const [th, tm] = to.split(":").map(Number);
  let m = th * 60 + tm - (fh * 60 + fm);
  if (m <= 0) m += 1440;
  return (
    <p className="num -mt-1 flex items-center gap-1.5 text-sm text-ink-soft">
      <CalendarClock className="size-4" /> รวม {Math.floor(m / 60)} ชม. {m % 60 ? `${m % 60} นาที` : ""}
    </p>
  );
}
