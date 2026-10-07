-- =====================================================================
-- GO HR — Communication tools, To-do, Automation, Insight views, Storage
-- =====================================================================

-- ประกาศข่าวสาร
create table public.announcements (
  id           bigint generated always as identity primary key,
  title        text not null,
  content      text,
  image_url    text,
  attachments  jsonb not null default '[]'::jsonb,
  audience     jsonb not null default '{"all":true}'::jsonb,   -- {"all":bool,"branch_ids":[],"org_unit_ids":[]}
  is_pinned    boolean not null default false,
  publish_at   timestamptz not null default now(),
  expire_at    timestamptz,
  push_line    boolean not null default false,
  created_by   uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create table public.announcement_reads (
  announcement_id bigint not null references public.announcements(id) on delete cascade,
  user_id         uuid not null,
  read_at         timestamptz not null default now(),
  primary key (announcement_id, user_id)
);

-- News Feed
create table public.feed_posts (
  id          bigint generated always as identity primary key,
  author_id   uuid not null references auth.users(id) on delete cascade,
  content     text,
  images      text[],
  post_type   text not null default 'post' check (post_type in ('post','kudos','birthday','anniversary','welcome','system')),
  kudos_to    bigint[],                 -- employee ids
  is_hidden   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create table public.feed_comments (
  id         bigint generated always as identity primary key,
  post_id    bigint not null references public.feed_posts(id) on delete cascade,
  author_id  uuid not null references auth.users(id) on delete cascade,
  content    text not null,
  created_at timestamptz not null default now()
);
create table public.feed_reactions (
  post_id    bigint not null references public.feed_posts(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  reaction   text not null default 'like',
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

-- To-do Lists (มอบหมายงานให้บุคคล/ทีม)
create table public.todos (
  id                   bigint generated always as identity primary key,
  title                text not null,
  description          text,
  assignee_employee_id bigint references public.employees(id) on delete cascade,
  team_id              bigint references public.teams(id) on delete cascade,
  created_by           uuid,
  due_date             date,
  priority             text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  status               text not null default 'todo' check (status in ('todo','doing','done','cancelled')),
  checklist            jsonb not null default '[]'::jsonb,
  completed_at         timestamptz,
  source               text,          -- manual / automation / onboarding
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index on public.todos(assignee_employee_id, status);

-- ---------------------------------------------------------------------
-- Automation
-- ---------------------------------------------------------------------
-- ตั้งค่าเวลารันคำสั่ง (scheduled jobs executed by /api/cron)
create table public.scheduled_jobs (
  code          text primary key,
  name          text not null,
  description   text,
  cron          text not null,                 -- 5-field cron (Asia/Bangkok)
  is_enabled    boolean not null default true,
  params        jsonb not null default '{}'::jsonb,
  last_run_at   timestamptz,
  last_status   text,
  last_message  text,
  next_run_at   timestamptz
);

-- ตั้งค่า Automation (event → condition → action)
create table public.automation_rules (
  id          bigint generated always as identity primary key,
  name        text not null,
  trigger     text not null,     -- request.submitted / request.approved / employee.created / probation.due / contract.expiring /
                                 -- late.threshold / absent.threshold / birthday / document.expiring / payslip.published
  conditions  jsonb not null default '{}'::jsonb,
  actions     jsonb not null default '[]'::jsonb,   -- [{"type":"notify","to":"employee|supervisor|hr|user:<uuid>","channels":["app","line","email"],"title":"..","body":".."},{"type":"todo",...},{"type":"feed",...}]
  is_enabled  boolean not null default true,
  last_fired_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.automation_logs (
  id         bigint generated always as identity primary key,
  rule_id    bigint references public.automation_rules(id) on delete set null,
  job_code   text,
  fired_at   timestamptz not null default now(),
  ref_key    text,              -- กันยิงซ้ำ เช่น 'probation:123:2026-10-01'
  status     text not null default 'ok',
  message    text
);
create unique index automation_logs_dedupe on public.automation_logs(rule_id, ref_key) where ref_key is not null;

-- Audience helper for announcements
create or replace function app.in_audience(p_aud jsonb) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare e employees%rowtype;
begin
  if p_aud is null or coalesce((p_aud->>'all')::boolean, false) then return true; end if;
  select * into e from employees where id = app.my_employee_id();
  if not found then return false; end if;
  return (p_aud ? 'branch_ids' and e.branch_id in (select x::bigint from jsonb_array_elements_text(p_aud->'branch_ids') x))
      or (p_aud ? 'org_unit_ids' and e.org_unit_id in (select app.org_subtree(x::bigint) from jsonb_array_elements_text(p_aud->'org_unit_ids') x))
      or (p_aud ? 'employee_ids' and e.id in (select x::bigint from jsonb_array_elements_text(p_aud->'employee_ids') x));
end $$;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.announcements enable row level security;
create policy p_sel on public.announcements for select to authenticated using (
  app.has_perm('tools','view') or (publish_at <= now() and (expire_at is null or expire_at > now()) and app.in_audience(audience)));
create policy p_wr on public.announcements for all to authenticated using (app.has_perm('tools','edit')) with check (app.has_perm('tools','edit'));

alter table public.announcement_reads enable row level security;
create policy p_own on public.announcement_reads for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy p_hr on public.announcement_reads for select to authenticated using (app.has_perm('tools','view'));

alter table public.feed_posts enable row level security;
create policy p_sel on public.feed_posts for select to authenticated using (not is_hidden or author_id = auth.uid() or app.has_perm('tools','edit'));
create policy p_ins on public.feed_posts for insert to authenticated with check (author_id = auth.uid());
create policy p_upd on public.feed_posts for update to authenticated using (author_id = auth.uid() or app.has_perm('tools','edit')) with check (true);
create policy p_del on public.feed_posts for delete to authenticated using (author_id = auth.uid() or app.has_perm('tools','delete'));

alter table public.feed_comments enable row level security;
create policy p_sel on public.feed_comments for select to authenticated using (true);
create policy p_ins on public.feed_comments for insert to authenticated with check (author_id = auth.uid());
create policy p_del on public.feed_comments for delete to authenticated using (author_id = auth.uid() or app.has_perm('tools','delete'));

alter table public.feed_reactions enable row level security;
create policy p_sel on public.feed_reactions for select to authenticated using (true);
create policy p_own on public.feed_reactions for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table public.todos enable row level security;
create policy p_sel on public.todos for select to authenticated using (
  created_by = auth.uid() or assignee_employee_id = app.my_employee_id()
  or team_id in (select team_id from team_members where employee_id = app.my_employee_id())
  or app.is_manager_of(assignee_employee_id) or app.has_perm('tools','view'));
create policy p_ins on public.todos for insert to authenticated with check (created_by = auth.uid());
create policy p_upd on public.todos for update to authenticated using (
  created_by = auth.uid() or assignee_employee_id = app.my_employee_id()
  or team_id in (select team_id from team_members where employee_id = app.my_employee_id())
  or app.has_perm('tools','edit')) with check (true);
create policy p_del on public.todos for delete to authenticated using (created_by = auth.uid() or app.has_perm('tools','delete'));

select app.std_policies('public.scheduled_jobs', 'settings', 'restrict');
select app.std_policies('public.automation_rules', 'settings', 'restrict');
select app.std_policies('public.automation_logs', 'settings', 'restrict');

do $$
declare t text;
begin
  foreach t in array array['announcements','feed_posts','todos','automation_rules'] loop
    execute format('create trigger trg_touch before update on public.%I for each row execute function app.touch_updated_at()', t);
  end loop;
  perform app.enable_audit('public.announcements');
  perform app.enable_audit('public.automation_rules');
  perform app.enable_audit('public.scheduled_jobs');
end $$;

-- ---------------------------------------------------------------------
-- Insight views (HR analytics). security_invoker → respects RLS of caller
-- ---------------------------------------------------------------------
create or replace view public.v_employee_overview with (security_invoker = true) as
select e.id, e.code, e.prefix, e.first_name, e.last_name, e.nickname, e.gender, e.birth_date, e.status, e.employee_type,
       e.hire_date, e.resign_date, e.branch_id, e.org_unit_id, e.position_id, e.supervisor_id, e.photo_url, e.email, e.phone,
       o.name as org_unit_name, p.name as position_name, p.job_level, b.name as branch_name,
       s.first_name || ' ' || s.last_name as supervisor_name,
       date_part('year', age(coalesce(e.resign_date, current_date), e.hire_date)) as service_years,
       (age(coalesce(e.resign_date, current_date), e.hire_date)) as service_age,
       date_part('year', age(current_date, e.birth_date)) as age_years
  from public.employees e
  left join public.org_units o on o.id = e.org_unit_id
  left join public.positions p on p.id = e.position_id
  left join public.branches b on b.id = e.branch_id
  left join public.employees s on s.id = e.supervisor_id;

-- Resignation signal: pattern-based flight-risk score (0-100) from the last 90 days vs previous 90
create or replace view public.v_resignation_signals with (security_invoker = true) as
with recent as (
  select a.employee_id,
         count(*) filter (where a.late_minutes > 0 and a.work_date >= current_date - 90) as late_recent,
         count(*) filter (where a.late_minutes > 0 and a.work_date < current_date - 90) as late_prev,
         count(*) filter (where a.absent and a.work_date >= current_date - 90) as absent_recent,
         count(*) filter (where a.absent and a.work_date < current_date - 90) as absent_prev
    from public.attendance_days a
   where a.work_date >= current_date - 180
   group by a.employee_id
), leaves as (
  select r.employee_id,
         count(*) filter (where r.start_date >= current_date - 90 and (r.days <= 1)) as short_leaves_recent,
         count(*) filter (where r.start_date < current_date - 90 and (r.days <= 1)) as short_leaves_prev
    from public.requests r
   where r.request_type = 'leave' and r.status = 'approved' and r.start_date >= current_date - 180
   group by r.employee_id
), raise as (
  select employee_id, max(effective_date) as last_raise from public.salary_history group by employee_id
)
select e.id as employee_id, e.code, e.first_name || ' ' || e.last_name as name, e.org_unit_id, e.position_id,
       coalesce(rc.late_recent,0) as late_recent, coalesce(rc.late_prev,0) as late_prev,
       coalesce(rc.absent_recent,0) as absent_recent, coalesce(l.short_leaves_recent,0) as short_leaves_recent,
       coalesce(l.short_leaves_prev,0) as short_leaves_prev, rs.last_raise,
       least(100,
         greatest(0, (coalesce(rc.late_recent,0) - coalesce(rc.late_prev,0))) * 4
       + coalesce(rc.absent_recent,0) * 10
       + greatest(0, (coalesce(l.short_leaves_recent,0) - coalesce(l.short_leaves_prev,0))) * 12
       + case when rs.last_raise is null or rs.last_raise < current_date - 548 then 15 else 0 end
       + case when e.hire_date between current_date - 730 and current_date - 300 then 10 else 0 end
       ) as risk_score
  from public.employees e
  left join recent rc on rc.employee_id = e.id
  left join leaves l on l.employee_id = e.id
  left join raise rs on rs.employee_id = e.id
 where e.status <> 'resigned';

-- ---------------------------------------------------------------------
-- Dashboard RPC (one call → all widget numbers)
-- ---------------------------------------------------------------------
create or replace function public.dashboard_stats() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v jsonb; v_today date := (now() at time zone 'Asia/Bangkok')::date;
begin
  if not (app.has_perm('insight','view') or app.has_perm('employee','view')) then
    raise exception 'ไม่มีสิทธิ์ดู Dashboard';
  end if;
  select jsonb_build_object(
    'headcount', (select count(*) from employees where status <> 'resigned'),
    'probation', (select count(*) from employees where status = 'probation'),
    'new_this_month', (select count(*) from employees where date_trunc('month', hire_date) = date_trunc('month', v_today)),
    'resigned_this_month', (select count(*) from employees where date_trunc('month', resign_date) = date_trunc('month', v_today)),
    'resigned_12m', (select count(*) from employees where resign_date > v_today - 365),
    'avg_headcount_12m', (select count(*) from employees where hire_date <= v_today and (resign_date is null or resign_date > v_today - 365)),
    'pending_requests', (select count(*) from requests where status = 'pending'),
    'today', jsonb_build_object(
        'checked_in', (select count(distinct employee_id) from time_logs where not is_void and (log_time at time zone 'Asia/Bangkok')::date = v_today),
        'on_leave', (select count(distinct employee_id) from requests where request_type = 'leave' and status = 'approved' and v_today between start_date and end_date),
        'late', (select count(*) from attendance_days where work_date = v_today and late_minutes > 0)),
    'by_org', (select coalesce(jsonb_agg(jsonb_build_object('name', coalesce(o.name,'ไม่ระบุ'), 'count', c) order by c desc), '[]')
                 from (select org_unit_id, count(*) c from employees where status <> 'resigned' group by org_unit_id) x
                 left join org_units o on o.id = x.org_unit_id),
    'by_type', (select coalesce(jsonb_agg(jsonb_build_object('name', employee_type, 'count', c)), '[]')
                 from (select employee_type, count(*) c from employees where status <> 'resigned' group by employee_type) x),
    'by_gender', (select coalesce(jsonb_agg(jsonb_build_object('name', coalesce(gender,'-'), 'count', c)), '[]')
                 from (select gender, count(*) c from employees where status <> 'resigned' group by gender) x),
    'tenure', (select coalesce(jsonb_agg(jsonb_build_object('name', b, 'count', c) order by o), '[]') from (
                 select case when y < 1 then '< 1 ปี' when y < 3 then '1-3 ปี' when y < 5 then '3-5 ปี' when y < 10 then '5-10 ปี' else '10+ ปี' end b,
                        case when y < 1 then 1 when y < 3 then 2 when y < 5 then 3 when y < 10 then 4 else 5 end o, count(*) c
                   from (select date_part('year', age(v_today, hire_date)) y from employees where status <> 'resigned') t group by 1,2) z),
    'headcount_trend', (select coalesce(jsonb_agg(jsonb_build_object('month', to_char(m, 'YYYY-MM'),
                           'count', (select count(*) from employees e where e.hire_date <= (m + interval '1 month - 1 day')::date
                                       and (e.resign_date is null or e.resign_date > (m + interval '1 month - 1 day')::date)),
                           'hired', (select count(*) from employees e where date_trunc('month', e.hire_date) = m),
                           'resigned', (select count(*) from employees e where date_trunc('month', e.resign_date) = m)) order by m), '[]')
                          from generate_series(date_trunc('month', v_today) - interval '11 months', date_trunc('month', v_today), interval '1 month') m),
    'upcoming_birthdays', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', first_name || ' ' || last_name, 'nickname', nickname,
                              'date', to_char(birth_date, 'MM-DD'), 'photo_url', photo_url) order by to_char(birth_date,'MM-DD')), '[]')
                            from employees where status <> 'resigned' and birth_date is not null
                             and to_char(birth_date, 'MM') = to_char(v_today, 'MM')),
    'probation_due', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', first_name || ' ' || last_name, 'date', probation_end_date) order by probation_end_date), '[]')
                       from employees where status = 'probation' and probation_end_date between v_today - 7 and v_today + 30),
    'contract_expiring', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', first_name || ' ' || last_name, 'date', contract_end_date) order by contract_end_date), '[]')
                       from employees where status <> 'resigned' and contract_end_date between v_today and v_today + 60)
  ) into v;
  return v;
end $$;
revoke all on function public.dashboard_stats from anon;

-- Payroll cost insight (needs payroll view)
create or replace function public.payroll_insight(p_year int) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not (app.has_perm('payroll','view') or app.has_perm('insight','view')) then raise exception 'ไม่มีสิทธิ์'; end if;
  return jsonb_build_object(
    'monthly', (select coalesce(jsonb_agg(jsonb_build_object('month', m, 'income', inc, 'net', net, 'sso_er', sso, 'pvd_er', pvd, 'headcount', hc) order by m), '[]')
                 from (select p.pay_month m, sum(e.total_income) inc, sum(e.net_pay) net, sum(e.sso_employer) sso, sum(e.pvd_employer) pvd, count(distinct e.employee_id) hc
                         from payroll_entries e join payroll_periods p on p.id = e.period_id
                        where p.pay_year = p_year and p.status in ('approved','paid','closed') group by p.pay_month) x),
    'by_org', (select coalesce(jsonb_agg(jsonb_build_object('name', coalesce(o.name,'ไม่ระบุ'), 'cost', c) order by c desc), '[]')
                 from (select e.org_unit_id, sum(e.total_income + e.sso_employer + e.pvd_employer) c
                         from payroll_entries e join payroll_periods p on p.id = e.period_id
                        where p.pay_year = p_year and p.status in ('approved','paid','closed') group by e.org_unit_id) x
                 left join org_units o on o.id = x.org_unit_id),
    'avg_salary_by_position', (select coalesce(jsonb_agg(jsonb_build_object('position', coalesce(ps.name,'ไม่ระบุ'), 'avg', a, 'min', mn, 'max', mx, 'count', c,
                                   'range_min', ps.min_salary, 'range_max', ps.max_salary) order by a desc), '[]')
                 from (select e.position_id, round(avg(pr.salary),2) a, min(pr.salary) mn, max(pr.salary) mx, count(*) c
                         from employees e join employee_private pr on pr.employee_id = e.id
                        where e.status <> 'resigned' and pr.salary_unit = 'month' group by e.position_id) x
                 left join positions ps on ps.id = x.position_id)
  );
end $$;
revoke all on function public.payroll_insight from anon;

-- ---------------------------------------------------------------------
-- Storage buckets (only when running on real Supabase)
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') and exists (select 1 from information_schema.tables where table_schema='storage' and table_name='buckets') then
    insert into storage.buckets (id, name, public) values
      ('public', 'public', true),          -- โลโก้, รูปข่าวสาร, หน้าปกคอร์ส
      ('avatars', 'avatars', true),        -- รูปพนักงาน (path แบบสุ่ม)
      ('documents', 'documents', false),   -- เอกสารพนักงาน/สัญญา/ใบเตือน (signed URL)
      ('attachments', 'attachments', false), -- ไฟล์แนบใบคำขอ
      ('checkins', 'checkins', false),     -- รูปถ่ายตอนลงเวลา
      ('resumes', 'resumes', false)        -- ไฟล์ใบสมัคร
    on conflict (id) do nothing;

    execute $p$create policy "go_hr_public_read" on storage.objects for select using (bucket_id in ('public','avatars'))$p$;
    execute $p$create policy "go_hr_auth_upload" on storage.objects for insert to authenticated
               with check (bucket_id in ('public','avatars','attachments','checkins','documents') and (storage.foldername(name))[1] = auth.uid()::text
                           or (bucket_id in ('public','avatars','documents') and app.has_perm('employee','edit')))$p$;
    execute $p$create policy "go_hr_own_read" on storage.objects for select to authenticated
               using (bucket_id in ('attachments','checkins','documents') and ((storage.foldername(name))[1] = auth.uid()::text
                      or app.has_perm('employee','view') or app.has_perm('request_admin','view') or app.has_perm('attendance','view')))$p$;
    execute $p$create policy "go_hr_resume_read" on storage.objects for select to authenticated using (bucket_id = 'resumes' and app.has_perm('recruit','view'))$p$;
    execute $p$create policy "go_hr_owner_delete" on storage.objects for delete to authenticated using (owner = auth.uid() or app.has_perm('settings','edit'))$p$;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Hardening: internal functions not callable directly
-- ---------------------------------------------------------------------
revoke execute on function app.act_request_internal(bigint, text, text, boolean) from public, anon, authenticated;
revoke execute on function app.apply_request(bigint) from public, anon, authenticated;
revoke execute on function app.revert_request(bigint) from public, anon, authenticated;
revoke execute on function app.notify(uuid, text, text, text, text) from public, anon;
revoke execute on function app.next_doc_no(text, text) from public, anon;
