import "server-only";
import { recalcAttendance } from "@/lib/attendance/server";
import { generateLeaveQuotas } from "@/lib/leave/server";
import { loadNotifyConfig, appUrl } from "@/lib/notify/config";
import { linePush, notificationText } from "@/lib/notify/line";
import { sendEmail } from "@/lib/notify/email";
import { isDue, nextRun } from "./cron";
import { runAutomationRules, remindBucket } from "./automation";
import { admin, bkkDate, claim, daysBetween, getSettingAdmin, hrUsers, must, notifyUsers, plusDays, systemAuthor, thShort, usersOfEmployees, type Admin } from "./util";

export const JOB_CODES = ["attendance_calc", "apply_movements", "probation_remind", "expiry_remind", "birthday_feed", "leave_rollover", "automation_scan", "notify_dispatch"] as const;
export type JobCode = (typeof JOB_CODES)[number];

type JobRow = { code: string; name: string; cron: string; is_enabled: boolean; params: Record<string, unknown>; last_run_at: string | null };
type Ctx = { sb: Admin; job: JobRow; now: Date; today: string };

type Reco = {
  probation_remind_days: number[]; contract_remind_days: number[]; document_expire_days: number[];
  late_threshold_per_month: number; absent_threshold_per_month: number; birthday_post: boolean; work_anniversary_post: boolean; welcome_post?: boolean;
};
const RECO: Reco = { probation_remind_days: [30, 15, 7], contract_remind_days: [60, 30, 7], document_expire_days: [60, 30], late_threshold_per_month: 3, absent_threshold_per_month: 2, birthday_post: true, work_anniversary_post: true, welcome_post: true };

// ------------------------------------------------------------------------------------------------ jobs
const JOBS: Record<JobCode, (c: Ctx) => Promise<string>> = {
  async attendance_calc({ today }) {
    const a = await recalcAttendance({ from: plusDays(today, -1), to: today });
    let dirty = { days: 0 };
    try {
      dirty = await recalcAttendance({ from: plusDays(today, -35), to: plusDays(today, -2), onlyDirty: true });
    } catch (e) {
      return `คำนวณเมื่อวาน-วันนี้ ${a.days} รายการ; วันที่มีการแก้ไขผิดพลาด: ${(e as Error).message}`;
    }
    return `คำนวณเมื่อวาน-วันนี้ ${a.days} รายการ (${a.employees} คน), วันที่มีการแก้ไขย้อนหลัง ${dirty.days} รายการ`;
  },

  async apply_movements({ sb, today }) {
    const { data, error } = await sb.rpc("apply_movements", { p_until: today });
    if (error) throw new Error(error.message);
    return `นำรายการโอนย้าย/ปรับเงินเดือนไปใช้ ${data ?? 0} รายการ`;
  },

  async probation_remind({ sb, today }) {
    const reco = await getSettingAdmin(sb, "recommendations", RECO);
    const days = (reco.probation_remind_days ?? [30]).map(Number);
    const maxDays = Math.max(...days, 0);
    const emps = must(await sb.from("employees").select("id, code, first_name, last_name, supervisor_id, probation_end_date")
      .eq("status", "probation").not("probation_end_date", "is", null).gte("probation_end_date", plusDays(today, -7)).lte("probation_end_date", plusDays(today, maxDays))) ?? [];
    if (!emps.length) return "ไม่มีพนักงานใกล้ครบทดลองงาน";
    const { data: form } = await sb.from("eval_forms").select("id").eq("form_type", "probation").eq("is_active", true).order("id").limit(1).maybeSingle();
    const existing = new Set((must(await sb.from("probation_evaluations").select("employee_id").in("employee_id", emps.map((e) => e.id)).neq("status", "cancelled")) ?? []).map((r) => Number(r.employee_id)));
    const hr = (await hrUsers(sb)).map((u) => u.id);
    const users = await usersOfEmployees(sb, emps.map((e) => e.supervisor_id));
    let created = 0, notified = 0;
    for (const e of emps) {
      const name = `${e.first_name} ${e.last_name}`;
      const left = daysBetween(today, e.probation_end_date);
      if (!existing.has(Number(e.id))) {
        must(await sb.from("probation_evaluations").insert({ employee_id: e.id, form_id: form?.id ?? null, round: 1, evaluator_employee_id: e.supervisor_id, due_date: e.probation_end_date, status: "pending" }));
        created++;
        await claim(sb, { jobCode: "probation_remind", refKey: `prob:${e.id}:${e.probation_end_date}:created`, message: `สร้างแบบประเมินทดลองงาน ${name}` });
        const sup = e.supervisor_id ? users.get(Number(e.supervisor_id)) : null;
        notified += await notifyUsers(sb, [sup, ...hr], { title: `ประเมินทดลองงาน: ${name}`, body: `ครบทดลองงาน ${thShort(e.probation_end_date)} (อีก ${left} วัน) กรุณาประเมินก่อนครบกำหนด`, link: "/recruit/probation", category: "probation" });
        continue;
      }
      // follow-up reminders at each remind-day bucket while the evaluation is still pending
      const b = remindBucket(left, days);
      if (b === null) continue;
      if (!(await claim(sb, { jobCode: "probation_remind", refKey: `prob:${e.id}:${e.probation_end_date}:${b}`, message: `เตือนประเมินทดลองงาน ${name} (${b} วัน)` }))) continue;
      const pending = must(await sb.from("probation_evaluations").select("id").eq("employee_id", e.id).eq("status", "pending").limit(1)) ?? [];
      if (!pending.length) continue;
      const sup = e.supervisor_id ? users.get(Number(e.supervisor_id)) : null;
      notified += await notifyUsers(sb, [sup, ...hr], { title: `เตือน: ประเมินทดลองงาน ${name}`, body: `เหลืออีก ${left} วัน (ครบ ${thShort(e.probation_end_date)})`, link: "/recruit/probation", category: "probation" });
    }
    return `สร้างแบบประเมิน ${created} รายการ, แจ้งเตือน ${notified} ครั้ง`;
  },

  async expiry_remind({ sb, today }) {
    const reco = await getSettingAdmin(sb, "recommendations", RECO);
    const cDays = (reco.contract_remind_days ?? [30]).map(Number);
    const dDays = (reco.document_expire_days ?? [30]).map(Number);
    const cTo = plusDays(today, Math.max(...cDays, 0));
    const dTo = plusDays(today, Math.max(...dDays, 0));
    const items: { key: string; empId: number; what: string; date: string; bucket: number }[] = [];
    const contracts = must(await sb.from("employees").select("id, contract_end_date").neq("status", "resigned").gte("contract_end_date", today).lte("contract_end_date", cTo)) ?? [];
    for (const e of contracts) {
      const b = remindBucket(daysBetween(today, e.contract_end_date), cDays);
      if (b !== null) items.push({ key: `contract:${e.id}:${e.contract_end_date}:${b}`, empId: Number(e.id), what: "สัญญาจ้าง", date: e.contract_end_date, bucket: b });
    }
    const docs = must(await sb.from("employee_documents").select("id, employee_id, title, expire_date").gte("expire_date", today).lte("expire_date", dTo)) ?? [];
    for (const d of docs) {
      const b = remindBucket(daysBetween(today, d.expire_date), dDays);
      if (b !== null) items.push({ key: `doc:${d.id}:${d.expire_date}:${b}`, empId: Number(d.employee_id), what: d.title, date: d.expire_date, bucket: b });
    }
    const priv = must(await sb.from("employee_private").select("employee_id, passport_expire, visa_expire, work_permit_expire")
      .or(`and(passport_expire.gte.${today},passport_expire.lte.${dTo}),and(visa_expire.gte.${today},visa_expire.lte.${dTo}),and(work_permit_expire.gte.${today},work_permit_expire.lte.${dTo})`)) ?? [];
    for (const p of priv) {
      for (const [k, label, date] of [["passport", "หนังสือเดินทาง", p.passport_expire], ["visa", "วีซ่า", p.visa_expire], ["workpermit", "ใบอนุญาตทำงาน", p.work_permit_expire]] as const) {
        if (!date || date < today || date > dTo) continue;
        const b = remindBucket(daysBetween(today, date), dDays);
        if (b !== null) items.push({ key: `${k}:${p.employee_id}:${date}:${b}`, empId: Number(p.employee_id), what: label, date, bucket: b });
      }
    }
    if (!items.length) return "ไม่มีเอกสาร/สัญญาใกล้หมดอายุ";
    const names = new Map((must(await sb.from("employees").select("id, code, first_name, last_name, status").in("id", [...new Set(items.map((i) => i.empId))])) ?? []).map((e) => [Number(e.id), e]));
    const hr = (await hrUsers(sb)).map((u) => u.id);
    let sent = 0;
    for (const it of items) {
      const e = names.get(it.empId);
      if (!e || e.status === "resigned") continue;
      if (!(await claim(sb, { jobCode: "expiry_remind", refKey: it.key, message: `${it.what} ของ ${e.first_name} ${e.last_name} หมดอายุ ${it.date}` }))) continue;
      const left = daysBetween(today, it.date);
      await notifyUsers(sb, hr, { title: `${it.what}ใกล้หมดอายุ: ${e.first_name} ${e.last_name} (${e.code})`, body: `หมดอายุ ${thShort(it.date)} — อีก ${left} วัน`, link: `/employees/${e.id}`, category: "expiry" });
      sent++;
    }
    return `แจ้งเตือนเอกสาร/สัญญาใกล้หมดอายุ ${sent} รายการ (พบ ${items.length})`;
  },

  async birthday_feed({ sb, today }) {
    const reco = await getSettingAdmin(sb, "recommendations", RECO);
    const author = await systemAuthor(sb);
    if (!author) return "ไม่พบผู้ใช้สำหรับโพสต์อัตโนมัติ";
    const emps = must(await sb.from("employees").select("id, first_name, last_name, nickname, birth_date, hire_date, created_at").neq("status", "resigned")) ?? [];
    const md = today.slice(5);
    const year = Number(today.slice(0, 4));
    let posts = 0;
    const post = async (key: string, type: "birthday" | "anniversary" | "welcome", ids: number[], content: string) => {
      if (!ids.length) return;
      if (!(await claim(sb, { jobCode: "birthday_feed", refKey: key, message: content.slice(0, 120) }))) return;
      must(await sb.from("feed_posts").insert({ author_id: author, post_type: type, kudos_to: ids, content }));
      posts++;
    };
    const nm = (e: { first_name: string; nickname: string | null }) => (e.nickname ? `${e.first_name} (${e.nickname})` : e.first_name);
    if (reco.birthday_post !== false) {
      const b = emps.filter((e) => e.birth_date?.slice(5) === md);
      await post(`birthday:${today}`, "birthday", b.map((e) => e.id), `สุขสันต์วันเกิด ${b.map(nm).join(", ")} ขอให้มีความสุข สุขภาพแข็งแรง และประสบความสำเร็จในทุกเรื่องนะครับ/คะ`);
    }
    if (reco.work_anniversary_post !== false) {
      const a = emps.filter((e) => e.hire_date?.slice(5) === md && Number(e.hire_date.slice(0, 4)) < year);
      const groups = new Map<number, typeof a>();
      for (const e of a) {
        const y = year - Number(e.hire_date.slice(0, 4));
        groups.set(y, [...(groups.get(y) ?? []), e]);
      }
      for (const [y, list] of groups) await post(`anniversary:${today}:${y}`, "anniversary", list.map((e) => e.id), `ครบรอบทำงาน ${y} ปี — ขอบคุณ ${list.map(nm).join(", ")} ที่ร่วมเดินทางกับเรามาตลอด ${y} ปี`);
    }
    if (reco.welcome_post !== false) {
      const w = emps.filter((e) => e.hire_date === today || (e.hire_date <= today && e.hire_date >= plusDays(today, -3) && e.created_at.slice(0, 10) >= plusDays(today, -3)));
      for (const e of w) await post(`welcome:${e.id}`, "welcome", [e.id], `ยินดีต้อนรับ ${e.first_name} ${e.last_name}${e.nickname ? ` (${e.nickname})` : ""} สมาชิกใหม่ของเรา`);
    }
    return `โพสต์อัตโนมัติ ${posts} โพสต์`;
  },

  async leave_rollover({ today }) {
    const year = Number(today.slice(0, 4));
    const n = await generateLeaveQuotas(year, { carryOver: true });
    return `สร้าง/ปรับโควต้าวันลาปี ${year + 543} จำนวน ${n} รายการ (ยกยอดพักร้อนแล้ว)`;
  },

  async automation_scan({ sb, job, now }) {
    // event window: since last run (max 7 days back), or the last hour on first run
    const since = new Date(Math.max(job.last_run_at ? Date.parse(job.last_run_at) - 60_000 : now.getTime() - 3600_000, now.getTime() - 7 * 86400_000)).toISOString();
    return runAutomationRules(sb, since);
  },

  async notify_dispatch({ sb }) {
    // announcements with "push to LINE" become notifications for their audience once published
    const nowIso = new Date().toISOString();
    const anns = must(await sb.from("announcements").select("id, title, content").eq("push_line", true).is("pushed_at", null).lte("publish_at", nowIso).or(`expire_at.is.null,expire_at.gt.${nowIso}`)) ?? [];
    let annUsers = 0;
    for (const a of anns) {
      const { data: aud } = await sb.from("announcements").update({ pushed_at: nowIso }).eq("id", a.id).is("pushed_at", null).select("id");
      if (!aud?.length) continue;
      const { data: users } = await sb.rpc("announcement_audience_users", { p_id: a.id });
      annUsers += await notifyUsers(sb, ((users ?? []) as { user_id: string }[]).map((u) => u.user_id), {
        title: `ประกาศ: ${a.title}`,
        body: String(a.content ?? "").slice(0, 300),
        link: "/m/feed",
        category: "announcement",
        email: false,
      });
    }
    const cfg = await loadNotifyConfig();
    const lineOn = cfg.notify.line_enabled && !!cfg.line.channel_access_token;
    const mailOn = cfg.notify.email_enabled && !!cfg.smtp.url && !!cfg.notify.from_email;
    const since = new Date(Date.now() - 3 * 86400_000).toISOString();
    // older / disabled-channel rows are marked handled so the queue doesn't grow forever
    if (!lineOn) await sb.from("notifications").update({ sent_line: true }).eq("sent_line", false);
    if (!mailOn) await sb.from("notifications").update({ sent_email: true }).eq("sent_email", false);
    await sb.from("notifications").update({ sent_line: true, sent_email: true }).lt("created_at", since).or("sent_line.eq.false,sent_email.eq.false");
    const annMsg = anns.length ? `ประกาศใหม่ ${anns.length} เรื่อง → ${annUsers} คน; ` : "";
    if (!lineOn && !mailOn) return `${annMsg}ไม่ได้เปิดใช้ LINE / อีเมล — ข้ามการส่ง`;
    const rows = must(await sb.from("notifications").select("id, user_id, title, body, link, sent_line, sent_email").or("sent_line.eq.false,sent_email.eq.false").gte("created_at", since).order("id").limit(300)) ?? [];
    if (!rows.length) return `${annMsg}ไม่มีการแจ้งเตือนค้างส่ง`;
    const profs = new Map((must(await sb.from("profiles").select("id, line_user_id, email, employee_id").in("id", [...new Set(rows.map((r) => r.user_id))])) ?? []).map((p) => [p.id as string, p]));
    const empEmails = new Map<number, string>();
    const empIds = [...profs.values()].map((p) => p.employee_id).filter(Boolean);
    if (empIds.length) for (const e of must(await sb.from("employees").select("id, email").in("id", empIds)) ?? []) if (e.email) empEmails.set(Number(e.id), e.email as string);
    const base = appUrl();
    let line = 0, mail = 0, errors = 0;
    let lastErr = "";
    for (const n of rows) {
      const p = profs.get(n.user_id);
      const upd: Record<string, boolean> = {};
      if (!n.sent_line) {
        if (lineOn && p?.line_user_id) {
          try {
            await linePush(cfg.line.channel_access_token!, p.line_user_id, [{ type: "text", text: notificationText(n, base) }]);
            line++;
          } catch (e) {
            errors++;
            lastErr = (e as Error).message;
          }
        }
        upd.sent_line = true;
      }
      if (!n.sent_email) {
        const to = (p?.employee_id && empEmails.get(Number(p.employee_id))) || (p?.email && !String(p.email).endsWith(".local") ? p.email : null);
        if (mailOn && to) {
          try {
            await sendEmail(cfg.smtp.url!, cfg.notify.from_email, { to, subject: n.title, text: n.body ?? "", link: n.link ? `${base}${n.link}` : null, companyName: cfg.companyName });
            mail++;
          } catch (e) {
            errors++;
            lastErr = (e as Error).message;
          }
        }
        upd.sent_email = true;
      }
      await sb.from("notifications").update(upd).eq("id", n.id);
    }
    const msg = `${annMsg}ส่ง LINE ${line} ข้อความ, อีเมล ${mail} ฉบับ จาก ${rows.length} รายการ`;
    if (errors) throw new Error(`${msg} — ผิดพลาด ${errors} รายการ: ${lastErr}`);
    return msg;
  },
};

// ------------------------------------------------------------------------------------------------ runner
export interface JobResult { code: string; status: "ok" | "error" | "skipped"; message: string; ms: number }

/** Run one job now and record the result (last_run_at / status / message, automation_logs). */
export async function runJob(code: string, opts: { now?: Date; trigger?: "cron" | "manual" } = {}): Promise<JobResult> {
  const sb = admin();
  const now = opts.now ?? new Date();
  const t0 = Date.now();
  const { data: job } = await sb.from("scheduled_jobs").select("code, name, cron, is_enabled, params, last_run_at").eq("code", code).maybeSingle();
  if (!job) return { code, status: "error", message: `ไม่พบงาน ${code}`, ms: 0 };
  const fn = JOBS[code as JobCode];
  if (!fn) return { code, status: "error", message: `ยังไม่รองรับงาน ${code}`, ms: 0 };
  let status: "ok" | "error" = "ok";
  let message: string;
  try {
    message = await fn({ sb, job: job as JobRow, now, today: bkkDate(now) });
  } catch (e) {
    status = "error";
    message = (e as Error).message || String(e);
  }
  if (opts.trigger === "manual") message = `[สั่งรันเอง] ${message}`;
  let next: string | null = null;
  try {
    next = nextRun(job.cron, now)?.toISOString() ?? null;
  } catch {
    /* invalid cron */
  }
  await sb.from("scheduled_jobs").update({ last_run_at: now.toISOString(), last_status: status, last_message: message.slice(0, 1000), next_run_at: next }).eq("code", code);
  await sb.from("automation_logs").insert({ job_code: code, status, message: message.slice(0, 2000) });
  return { code, status, message, ms: Date.now() - t0 };
}

/** Run every enabled job whose cron is due. Jobs run sequentially (keeps DB load predictable). */
export async function runDueJobs(now = new Date()): Promise<JobResult[]> {
  const sb = admin();
  const jobs = (must(await sb.from("scheduled_jobs").select("code, name, cron, is_enabled, params, last_run_at").eq("is_enabled", true).order("code")) ?? []) as JobRow[];
  const out: JobResult[] = [];
  for (const j of jobs) {
    let due = false;
    try {
      due = isDue(j.cron, j.last_run_at ? new Date(j.last_run_at) : null, now);
    } catch (e) {
      out.push({ code: j.code, status: "error", message: `cron ไม่ถูกต้อง: ${(e as Error).message}`, ms: 0 });
      continue;
    }
    if (!due) continue;
    // claim: move last_run_at first so an overlapping request (next minute) doesn't run the same job twice
    const { data: claimed } = await sb.from("scheduled_jobs").update({ last_run_at: now.toISOString(), last_status: "running" })
      .eq("code", j.code).filter("last_run_at", j.last_run_at ? "eq" : "is", j.last_run_at ?? null).select("code");
    if (!claimed?.length) continue;
    out.push(await runJob(j.code, { now }));
  }
  return out;
}
