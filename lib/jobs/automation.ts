import "server-only";
import { TRIGGER_BY, type RuleAction, type RuleConditions, type TriggerKey } from "./rules";
import { bkkDate, claim, daysBetween, fillTemplate, hrUsers, must, notifyUsers, plusDays, systemAuthor, thShort, type Admin } from "./util";

type Emp = {
  id: number; code: string; first_name: string; last_name: string; nickname: string | null; supervisor_id: number | null;
  status: string; birth_date: string | null; hire_date: string; probation_end_date: string | null; contract_end_date: string | null; created_at: string;
};
type Rule = { id: number; name: string; trigger: TriggerKey; conditions: RuleConditions; actions: RuleAction[]; created_at: string };
type Hit = { refKey: string; employeeId: number | null; ctx: Record<string, unknown> };

const REQ_TYPE_LABEL: Record<string, string> = {};

/** smallest remind-day bucket ≥ daysLeft (null when not inside any window) */
export function remindBucket(daysLeft: number, days: number[]): number | null {
  if (daysLeft < 0) return null;
  const ok = days.filter((d) => d >= daysLeft).sort((a, b) => a - b);
  return ok.length ? ok[0] : null;
}

async function loadEmployees(sb: Admin): Promise<Map<number, Emp>> {
  const out = new Map<number, Emp>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from("employees")
      .select("id, code, first_name, last_name, nickname, supervisor_id, status, birth_date, hire_date, probation_end_date, contract_end_date, created_at")
      .order("id")
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    for (const e of data ?? []) out.set(Number(e.id), e as Emp);
    if (!data || data.length < 1000) break;
  }
  return out;
}

function empCtx(e: Emp | undefined, emps: Map<number, Emp>, company: string): Record<string, unknown> {
  if (!e) return { company };
  const s = e.supervisor_id ? emps.get(e.supervisor_id) : undefined;
  return {
    employee_name: `${e.first_name} ${e.last_name}`,
    employee_code: e.code,
    nickname: e.nickname ?? e.first_name,
    supervisor_name: s ? `${s.first_name} ${s.last_name}` : "-",
    company,
  };
}

/** Find the subjects that match a rule right now. `since` = start of the event window. */
async function findHits(sb: Admin, rule: Rule, emps: Map<number, Emp>, since: string, today: string, company: string): Promise<Hit[]> {
  const c = rule.conditions ?? {};
  const types = c.request_types?.length ? c.request_types : null;
  const hits: Hit[] = [];
  const ctx = (empId: number | null, extra: Record<string, unknown>) => ({ ...empCtx(empId ? emps.get(empId) : undefined, emps, company), ...extra });
  const activeEmps = [...emps.values()].filter((e) => e.status !== "resigned");
  const daysList = (c.days_before?.length ? c.days_before : [7]).map(Number).filter((n) => n >= 0);

  switch (rule.trigger) {
    case "request.submitted":
    case "request.approved":
    case "request.rejected": {
      const status = rule.trigger === "request.submitted" ? null : rule.trigger === "request.approved" ? "approved" : "rejected";
      let q = sb.from("requests").select("id, doc_no, request_type, employee_id, status, start_date, created_at, updated_at, result_note").order("id").limit(1000);
      q = status ? q.eq("status", status).gte("updated_at", since) : q.neq("status", "draft").gte("created_at", since);
      if (types) q = q.in("request_type", types);
      const rows = must(await q) ?? [];
      if (!Object.keys(REQ_TYPE_LABEL).length) {
        for (const t of must(await sb.from("request_types").select("code, name")) ?? []) REQ_TYPE_LABEL[t.code as string] = t.name as string;
      }
      for (const r of rows)
        hits.push({
          refKey: `req:${r.id}:${rule.trigger}`,
          employeeId: Number(r.employee_id),
          ctx: ctx(Number(r.employee_id), { doc_no: r.doc_no ?? `#${r.id}`, request_type: REQ_TYPE_LABEL[r.request_type as string] ?? r.request_type, date: thShort(r.start_date ?? r.created_at), note: r.result_note ?? "" }),
        });
      break;
    }
    case "employee.created":
      for (const e of emps.values()) if (e.created_at >= since) hits.push({ refKey: `emp:${e.id}:created`, employeeId: e.id, ctx: ctx(e.id, { date: thShort(e.hire_date) }) });
      break;
    case "payslip.published": {
      const periods = must(await sb.from("payroll_periods").select("id, name").eq("payslip_published", true).gte("updated_at", since)) ?? [];
      for (const p of periods) {
        const entries = must(await sb.from("payroll_entries").select("employee_id").eq("period_id", p.id)) ?? [];
        for (const en of entries) hits.push({ refKey: `payslip:${p.id}:${en.employee_id}`, employeeId: Number(en.employee_id), ctx: ctx(Number(en.employee_id), { period: p.name }) });
      }
      break;
    }
    case "probation.due":
    case "contract.expiring": {
      const field = rule.trigger === "probation.due" ? "probation_end_date" : "contract_end_date";
      for (const e of activeEmps) {
        const d = e[field];
        if (!d || (rule.trigger === "probation.due" && e.status !== "probation")) continue;
        const left = daysBetween(today, d);
        const b = remindBucket(left, daysList);
        if (b === null) continue;
        hits.push({ refKey: `${field}:${e.id}:${d}:${b}`, employeeId: e.id, ctx: ctx(e.id, { date: thShort(d), days: left }) });
      }
      break;
    }
    case "document.expiring": {
      const max = Math.max(...daysList, 0);
      const to = plusDays(today, max);
      const docs = must(await sb.from("employee_documents").select("id, employee_id, title, expire_date").gte("expire_date", today).lte("expire_date", to)) ?? [];
      const priv = must(await sb.from("employee_private").select("employee_id, passport_expire, visa_expire, work_permit_expire")
        .or(`and(passport_expire.gte.${today},passport_expire.lte.${to}),and(visa_expire.gte.${today},visa_expire.lte.${to}),and(work_permit_expire.gte.${today},work_permit_expire.lte.${to})`)) ?? [];
      const items: { key: string; emp: number; title: string; date: string }[] = docs.map((d) => ({ key: `doc:${d.id}`, emp: Number(d.employee_id), title: d.title as string, date: d.expire_date as string }));
      for (const p of priv) {
        const add = (k: string, title: string, date: string | null) => date && date >= today && date <= to && items.push({ key: `${k}:${p.employee_id}`, emp: Number(p.employee_id), title, date });
        add("passport", "หนังสือเดินทาง (Passport)", p.passport_expire);
        add("visa", "วีซ่า", p.visa_expire);
        add("workpermit", "ใบอนุญาตทำงาน", p.work_permit_expire);
      }
      for (const it of items) {
        const e = emps.get(it.emp);
        if (!e || e.status === "resigned") continue;
        const left = daysBetween(today, it.date);
        const b = remindBucket(left, daysList);
        if (b === null) continue;
        hits.push({ refKey: `${it.key}:${it.date}:${b}`, employeeId: it.emp, ctx: ctx(it.emp, { document: it.title, date: thShort(it.date), days: left }) });
      }
      break;
    }
    case "late.threshold":
    case "absent.threshold": {
      const month = today.slice(0, 7);
      const threshold = Math.max(1, Number(c.threshold ?? (rule.trigger === "late.threshold" ? 3 : 2)));
      let q = sb.from("attendance_days").select("employee_id").gte("work_date", `${month}-01`).lte("work_date", today);
      q = rule.trigger === "late.threshold" ? q.gt("late_minutes", 0) : q.eq("absent", true);
      const counts = new Map<number, number>();
      for (let from = 0; ; from += 1000) {
        const { data, error } = await q.order("id").range(from, from + 999);
        if (error) throw new Error(error.message);
        for (const r of data ?? []) counts.set(Number(r.employee_id), (counts.get(Number(r.employee_id)) ?? 0) + 1);
        if (!data || data.length < 1000) break;
      }
      const [y, m] = month.split("-").map(Number);
      for (const [emp, n] of counts)
        if (n >= threshold) hits.push({ refKey: `${rule.trigger}:${emp}:${month}:${threshold}`, employeeId: emp, ctx: ctx(emp, { count: n, month: `${m}/${y + 543}` }) });
      break;
    }
    case "missing_scan": {
      const rows = must(await sb.from("attendance_days").select("employee_id, work_date").eq("missing_scan", true).gte("work_date", plusDays(today, -3)).lt("work_date", today).limit(2000)) ?? [];
      for (const r of rows) hits.push({ refKey: `miss:${r.employee_id}:${r.work_date}`, employeeId: Number(r.employee_id), ctx: ctx(Number(r.employee_id), { date: thShort(r.work_date as string) }) });
      break;
    }
    case "birthday": {
      const md = today.slice(5);
      for (const e of activeEmps) if (e.birth_date?.slice(5) === md) hits.push({ refKey: `bday:${e.id}:${today.slice(0, 4)}`, employeeId: e.id, ctx: ctx(e.id, { date: thShort(today) }) });
      break;
    }
  }
  return hits;
}

async function runActions(sb: Admin, rule: Rule, hit: Hit, emps: Map<number, Emp>, userOf: (empId: number | null | undefined) => Promise<string | null>) {
  const e = hit.employeeId ? emps.get(hit.employeeId) : undefined;
  let done = 0;
  for (const a of rule.actions ?? []) {
    if (a.type === "notify") {
      const users: (string | null)[] = [];
      for (const to of a.to ?? []) {
        if (to === "employee") users.push(await userOf(e?.id));
        else if (to === "supervisor") users.push(await userOf(e?.supervisor_id));
        else if (to === "hr") users.push(...(await hrUsers(sb)).map((u) => u.id));
        else if (to.startsWith("role:")) users.push(...(await hrUsers(sb, to.slice(5))).map((u) => u.id));
        else if (to.startsWith("user:")) users.push(to.slice(5));
      }
      const ch = a.channels?.length ? a.channels : ["app"];
      done += await notifyUsers(sb, users, {
        title: fillTemplate(a.title || rule.name, hit.ctx),
        body: fillTemplate(a.body, hit.ctx) || null,
        link: e ? `/employees/${e.id}` : null,
        category: "automation",
        line: ch.includes("line"),
        email: ch.includes("email"),
      });
    } else if (a.type === "todo") {
      let assignee: number | null = null;
      if (a.assign_to === "employee") assignee = e?.id ?? null;
      else if (a.assign_to === "supervisor") assignee = e?.supervisor_id ?? null;
      else assignee = (await hrUsers(sb)).find((u) => u.employee_id)?.employee_id ?? null;
      const due = a.due_days != null ? plusDays(bkkDate(), Number(a.due_days)) : null;
      must(await sb.from("todos").insert({
        title: fillTemplate(a.title || rule.name, hit.ctx).slice(0, 300),
        description: fillTemplate(a.description, hit.ctx) || null,
        assignee_employee_id: assignee,
        due_date: due,
        priority: a.priority ?? "normal",
        source: "automation",
        created_by: null,
      }));
      done++;
    } else if (a.type === "feed") {
      const author = await systemAuthor(sb);
      if (!author) continue;
      must(await sb.from("feed_posts").insert({ author_id: author, content: fillTemplate(a.content, hit.ctx), post_type: "system", kudos_to: e ? [e.id] : null }));
      done++;
    }
  }
  return done;
}

/** Evaluate all enabled automation rules. `since` = start of the event window (ISO). */
export async function runAutomationRules(sb: Admin, since: string, opts: { ruleIds?: number[] } = {}): Promise<string> {
  let q = sb.from("automation_rules").select("id, name, trigger, conditions, actions, created_at").eq("is_enabled", true).order("id");
  if (opts.ruleIds?.length) q = q.in("id", opts.ruleIds);
  const rules = (must(await q) ?? []) as Rule[];
  if (!rules.length) return "ไม่มีกฎ Automation ที่เปิดใช้งาน";
  const emps = await loadEmployees(sb);
  const { data: comp } = await sb.from("settings").select("value").eq("key", "company").maybeSingle();
  const company = String((comp?.value as { name?: string } | null)?.name ?? "");
  const today = bkkDate();
  const userCache = new Map<number, string | null>();
  const userOf = async (id: number | null | undefined) => {
    if (!id) return null;
    if (!userCache.has(id)) {
      const { data } = await sb.from("profiles").select("id").eq("employee_id", id).eq("is_active", true).order("created_at").limit(1);
      userCache.set(id, (data?.[0]?.id as string) ?? null);
    }
    return userCache.get(id) ?? null;
  };

  const parts: string[] = [];
  for (const rule of rules) {
    if (!TRIGGER_BY[rule.trigger]) continue;
    // event triggers never look further back than the rule's creation (no backfill of old events)
    const ruleSince = rule.created_at > since ? rule.created_at : since;
    let fired = 0;
    try {
      const hits = await findHits(sb, rule, emps, ruleSince, today, company);
      for (const h of hits) {
        if (!(await claim(sb, { ruleId: rule.id, refKey: h.refKey, message: `${rule.name}: ${h.ctx.employee_name ?? ""}`.trim() }))) continue;
        try {
          await runActions(sb, rule, h, emps, userOf);
          fired++;
        } catch (err) {
          await sb.from("automation_logs").update({ status: "error", message: `${rule.name}: ${(err as Error).message}` }).eq("rule_id", rule.id).eq("ref_key", h.refKey);
        }
      }
      if (fired) await sb.from("automation_rules").update({ last_fired_at: new Date().toISOString() }).eq("id", rule.id);
      parts.push(`${rule.name}: ${fired}`);
    } catch (err) {
      await sb.from("automation_logs").insert({ rule_id: rule.id, status: "error", message: `${rule.name}: ${(err as Error).message}` });
      parts.push(`${rule.name}: ผิดพลาด (${(err as Error).message})`);
    }
  }
  return `ตรวจ ${rules.length} กฎ — ${parts.join(", ")}`;
}
