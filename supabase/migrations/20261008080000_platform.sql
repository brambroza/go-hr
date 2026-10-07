-- =====================================================================
-- GO HR — Platform: licensing, settings hardening, LINE linking, announcement stats,
--          to-do notifications, insight RPCs, scheduler helpers   (idempotent)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Settings RLS: 'license_status' and 'secret.%' are written only by the service role
--    (server actions verify permissions first). Secrets are readable only with settings edit.
-- ---------------------------------------------------------------------
drop policy if exists p_sel on public.settings;
drop policy if exists p_all on public.settings;
drop policy if exists p_ins on public.settings;
drop policy if exists p_upd on public.settings;
drop policy if exists p_del on public.settings;

create policy p_sel on public.settings for select using (
  case when key like 'secret.%' then app.has_perm('settings','edit')
       else is_public or app.has_perm('settings','view') or auth.role() = 'authenticated' end);
create policy p_ins on public.settings for insert to authenticated
  with check (app.has_perm('settings','edit') and key <> 'license_status' and key not like 'secret.%');
create policy p_upd on public.settings for update to authenticated
  using (app.has_perm('settings','edit') and key <> 'license_status' and key not like 'secret.%')
  with check (app.has_perm('settings','edit') and key <> 'license_status' and key not like 'secret.%');
create policy p_del on public.settings for delete to authenticated
  using (app.has_perm('settings','edit') and key <> 'license_status' and key not like 'secret.%');

-- Audit settings changes but never store secret values in the Back Log
create or replace function app.audit_settings_trigger() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_old jsonb; v_new jsonb; v_name text; v_key text;
begin
  v_key := coalesce(new.key, old.key);
  if tg_op in ('UPDATE','DELETE') then v_old := to_jsonb(old); end if;
  if tg_op in ('INSERT','UPDATE') then v_new := to_jsonb(new); end if;
  if tg_op = 'UPDATE' and v_old - 'updated_at' = v_new - 'updated_at' then return new; end if;
  if v_key like 'secret.%' then
    if v_old is not null then v_old := jsonb_set(v_old, '{value}', '"(ซ่อนค่า)"'); end if;
    if v_new is not null then v_new := jsonb_set(v_new, '{value}', '"(ซ่อนค่า)"'); end if;
  elsif v_key = 'license_status' then
    if v_old is not null then v_old := v_old #- '{value,license}'; end if;
    if v_new is not null then v_new := v_new #- '{value,license}'; end if;
  end if;
  select coalesce(display_name, username, email) into v_name from profiles where id = auth.uid();
  insert into audit_logs(user_id, user_name, action, table_name, record_id, old_data, new_data)
  values (auth.uid(), v_name, tg_op, 'settings', v_key, v_old, v_new);
  return coalesce(new, old);
end $$;
drop trigger if exists trg_audit on public.settings;
create trigger trg_audit after insert or update or delete on public.settings for each row execute function app.audit_settings_trigger();

-- Default keys used by the platform screens
insert into public.settings (key, is_public, value) values
  ('industry_benchmark', false, '{}'::jsonb)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- 2) License enforcement — active employees (status <> 'resigned') may not exceed the licensed maximum.
--    No valid license → trial limit of 10 active employees.
-- ---------------------------------------------------------------------
create or replace function app.license_max_employees() returns int
language sql stable security definer set search_path = public as $$
  select coalesce((
    select case when (value->>'valid')::boolean then (value->>'max_employees')::int end
      from settings where key = 'license_status'), 10)
$$;

create or replace function app.employees_license_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_max int; v_count int; v_licensed boolean;
begin
  if new.status = 'resigned' then return new; end if;
  if tg_op = 'UPDATE' and old.status <> 'resigned' then return new; end if;  -- already counted
  v_max := app.license_max_employees();
  select count(*) into v_count from employees where status <> 'resigned' and id is distinct from new.id;
  if v_count >= v_max then
    select coalesce((value->>'valid')::boolean, false) into v_licensed from settings where key = 'license_status';
    if coalesce(v_licensed, false) then
      raise exception 'จำนวนพนักงานที่ใช้งานอยู่ (% คน) ครบตามสิทธิ์ License แล้ว (สูงสุด % คน) — กรุณาติดต่อผู้ขายเพื่อเพิ่มจำนวนพนักงานใน License หรือปรับสถานะพนักงานที่ลาออกแล้ว', v_count, v_max
        using errcode = 'P0001';
    else
      raise exception 'ยังไม่ได้ติดตั้ง License — รุ่นทดลองใช้ได้สูงสุด % คน (ตอนนี้มี % คน) กรุณาติดตั้ง License ที่เมนู ตั้งค่า > License / ระบบ', v_max, v_count
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_employees_license on public.employees;
create trigger trg_employees_license before insert or update of status on public.employees
  for each row execute function app.employees_license_guard();

create or replace function public.license_usage() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('active_employees', (select count(*) from employees where status <> 'resigned'),
                            'max_employees', app.license_max_employees())
$$;
revoke all on function public.license_usage from anon;

-- ---------------------------------------------------------------------
-- 3) LINE account linking (6-digit code valid 15 minutes)
-- ---------------------------------------------------------------------
alter table public.profiles add column if not exists line_link_expires_at timestamptz;
create index if not exists profiles_line_link_code_idx on public.profiles(line_link_code) where line_link_code is not null;

-- users may unlink themselves but may not set a LINE user id / link code directly (server only)
create or replace function app.profiles_line_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not app.has_perm('security','edit') then
    if (new.line_user_id is distinct from old.line_user_id and new.line_user_id is not null)
       or (new.line_link_code is distinct from old.line_link_code and new.line_link_code is not null) then
      raise exception 'เชื่อมต่อ LINE ได้ผ่านรหัสเชื่อมต่อเท่านั้น';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_profiles_line_guard on public.profiles;
create trigger trg_profiles_line_guard before update on public.profiles for each row execute function app.profiles_line_guard();

-- ---------------------------------------------------------------------
-- 4) Announcements: audience evaluation for any employee, read statistics, LINE push marker
-- ---------------------------------------------------------------------
alter table public.announcements add column if not exists pushed_at timestamptz;

create or replace function app.emp_in_audience(p_aud jsonb, p_emp bigint) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare e employees%rowtype;
begin
  select * into e from employees where id = p_emp;
  if not found or e.status = 'resigned' then return false; end if;
  if p_aud is null or coalesce((p_aud->>'all')::boolean, false) then return true; end if;
  return (p_aud ? 'branch_ids' and e.branch_id in (select x::bigint from jsonb_array_elements_text(p_aud->'branch_ids') x))
      or (p_aud ? 'org_unit_ids' and e.org_unit_id in (select app.org_subtree(x::bigint) from jsonb_array_elements_text(p_aud->'org_unit_ids') x))
      or (p_aud ? 'employee_ids' and e.id in (select x::bigint from jsonb_array_elements_text(p_aud->'employee_ids') x));
end $$;

create or replace function public.announcement_stats(p_ids bigint[]) returns table(announcement_id bigint, audience int, reads int)
language sql stable security definer set search_path = public as $$
  select a.id,
         (select count(*) from employees e where e.status <> 'resigned' and app.emp_in_audience(a.audience, e.id))::int,
         (select count(*) from announcement_reads r where r.announcement_id = a.id)::int
    from announcements a
   where a.id = any(p_ids) and app.has_perm('tools','view')
$$;
revoke all on function public.announcement_stats from anon;

create or replace function public.announcement_readers(p_id bigint)
returns table(employee_id bigint, code text, name text, org_unit_name text, read_at timestamptz)
language sql stable security definer set search_path = public as $$
  select e.id, e.code, e.first_name || ' ' || e.last_name, o.name, r.read_at
    from announcements a
    join employees e on e.status <> 'resigned' and app.emp_in_audience(a.audience, e.id)
    left join org_units o on o.id = e.org_unit_id
    left join lateral (select rr.read_at from announcement_reads rr join profiles p on p.id = rr.user_id
                        where rr.announcement_id = a.id and p.employee_id = e.id order by rr.read_at limit 1) r on true
   where a.id = p_id and app.has_perm('tools','view')
   order by r.read_at nulls first, e.code
$$;
revoke all on function public.announcement_readers from anon;

-- users in an announcement's audience (service role only — used by the LINE push job)
create or replace function public.announcement_audience_users(p_id bigint) returns table(user_id uuid)
language sql stable security definer set search_path = public as $$
  select distinct app.employee_user(e.id)
    from announcements a join employees e on e.status <> 'resigned' and app.emp_in_audience(a.audience, e.id)
   where a.id = p_id and app.employee_user(e.id) is not null
$$;
revoke all on function public.announcement_audience_users from public, anon, authenticated;
grant execute on function public.announcement_audience_users to service_role;

-- ---------------------------------------------------------------------
-- 5) To-do: notify the assignee (or team members) when a task is assigned
-- ---------------------------------------------------------------------
create or replace function app.todos_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_actor uuid := auth.uid(); v_title text; v_u uuid;
begin
  if new.status in ('done','cancelled') then return new; end if;
  if tg_op = 'UPDATE' and new.assignee_employee_id is not distinct from old.assignee_employee_id
     and new.team_id is not distinct from old.team_id then return new; end if;
  v_title := 'งานใหม่: ' || new.title;
  if new.assignee_employee_id is not null then
    v_u := app.employee_user(new.assignee_employee_id);
    if v_u is distinct from v_actor then
      perform app.notify(v_u, v_title, coalesce('กำหนดเสร็จ ' || to_char(new.due_date, 'DD/MM/') || (extract(year from new.due_date)::int + 543), null), '/m/todos?id=' || new.id, 'todo');
    end if;
  elsif new.team_id is not null then
    for v_u in select app.employee_user(tm.employee_id) from team_members tm where tm.team_id = new.team_id loop
      if v_u is distinct from v_actor then
        perform app.notify(v_u, v_title || ' (งานของทีม)', null, '/m/todos?id=' || new.id, 'todo');
      end if;
    end loop;
  end if;
  return new;
end $$;
drop trigger if exists trg_todos_notify on public.todos;
create trigger trg_todos_notify after insert or update of assignee_employee_id, team_id on public.todos
  for each row execute function app.todos_notify();

create or replace function app.todos_completed() returns trigger
language plpgsql as $$
begin
  if new.status = 'done' and old.status is distinct from 'done' then new.completed_at := now();
  elsif new.status <> 'done' then new.completed_at := null; end if;
  return new;
end $$;
drop trigger if exists trg_todos_completed on public.todos;
create trigger trg_todos_completed before update of status on public.todos for each row execute function app.todos_completed();

-- ---------------------------------------------------------------------
-- 6) Insight RPCs (security definer, need insight view)
-- ---------------------------------------------------------------------
create or replace function public.insight_extra(p_months int default 12) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_today date := (now() at time zone 'Asia/Bangkok')::date;
begin
  if not app.has_perm('insight','view') then raise exception 'ไม่มีสิทธิ์ดู Insight'; end if;
  return jsonb_build_object(
    'age_bands', (select coalesce(jsonb_agg(jsonb_build_object('name', b, 'count', c) order by o), '[]') from (
        select case when a is null then 'ไม่ระบุ' when a < 25 then '< 25 ปี' when a < 35 then '25-34 ปี' when a < 45 then '35-44 ปี' when a < 55 then '45-54 ปี' else '55+ ปี' end b,
               case when a is null then 9 when a < 25 then 1 when a < 35 then 2 when a < 45 then 3 when a < 55 then 4 else 5 end o, count(*) c
          from (select date_part('year', age(v_today, birth_date)) a from employees where status <> 'resigned') t group by 1, 2) z),
    'avg_tenure_years', (select round(avg(date_part('day', (v_today::timestamp - hire_date::timestamp)) / 365.25)::numeric, 1) from employees where status <> 'resigned'),
    'resign_reasons', (select coalesce(jsonb_agg(jsonb_build_object('name', r, 'count', c) order by c desc), '[]') from (
        select coalesce(nullif(resign_type,''), 'ไม่ระบุ') r, count(*) c from employees where resign_date > v_today - 365 group by 1) z),
    'attendance_monthly', (select coalesce(jsonb_agg(jsonb_build_object('month', to_char(m, 'YYYY-MM'),
          'late_count', (select count(*) from attendance_days a where a.late_minutes > 0 and date_trunc('month', a.work_date) = m),
          'late_minutes', (select coalesce(sum(a.late_minutes),0) from attendance_days a where date_trunc('month', a.work_date) = m),
          'absent', (select count(*) from attendance_days a where a.absent and date_trunc('month', a.work_date) = m),
          'missing_scan', (select count(*) from attendance_days a where a.missing_scan and date_trunc('month', a.work_date) = m),
          'work_days', (select count(*) from attendance_days a where a.day_type = 'work' and date_trunc('month', a.work_date) = m)) order by m), '[]')
        from generate_series(date_trunc('month', v_today) - make_interval(months => greatest(1, p_months) - 1), date_trunc('month', v_today), interval '1 month') m),
    'avg_salary_by_level', (select coalesce(jsonb_agg(jsonb_build_object('job_level', lvl, 'avg', a, 'count', c) order by lvl), '[]') from (
        select coalesce(ps.job_level, 0) lvl, round(avg(pr.salary), 2) a, count(*) c
          from employees e join employee_private pr on pr.employee_id = e.id left join positions ps on ps.id = e.position_id
         where e.status <> 'resigned' and pr.salary_unit = 'month' group by 1) z),
    'daily_wage_avg', (select round(avg(pr.salary), 2) from employees e join employee_private pr on pr.employee_id = e.id
                        where e.status <> 'resigned' and pr.salary_unit = 'day'),
    'salary_range_flags', (select coalesce(jsonb_agg(jsonb_build_object('position_id', ps.id, 'below', b, 'above', a, 'count', c)), '[]') from (
        select e.position_id, count(*) c,
               count(*) filter (where ps2.min_salary is not null and pr.salary < ps2.min_salary) b,
               count(*) filter (where ps2.max_salary is not null and pr.salary > ps2.max_salary) a
          from employees e join employee_private pr on pr.employee_id = e.id join positions ps2 on ps2.id = e.position_id
         where e.status <> 'resigned' and pr.salary_unit = 'month' group by e.position_id) z join positions ps on ps.id = z.position_id),
    'position_levels', (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'job_level', job_level, 'min', min_salary, 'max', max_salary)), '[]') from positions where is_active)
  );
end $$;
revoke all on function public.insight_extra from anon;

create or replace function public.insight_resignation_signals()
returns table(employee_id bigint, code text, name text, org_unit_name text, position_name text, photo_url text, hire_date date,
              late_recent bigint, late_prev bigint, absent_recent bigint, short_leaves_recent bigint, short_leaves_prev bigint,
              last_raise date, risk_score int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not app.has_perm('insight','view') then raise exception 'ไม่มีสิทธิ์ดู Insight'; end if;
  return query
  select s.employee_id, s.code, s.name, o.name, p.name, e.photo_url, e.hire_date,
         s.late_recent, s.late_prev, s.absent_recent, s.short_leaves_recent, s.short_leaves_prev, s.last_raise, s.risk_score::int
    from v_resignation_signals s
    join employees e on e.id = s.employee_id
    left join org_units o on o.id = e.org_unit_id
    left join positions p on p.id = e.position_id
   where app.my_scope() = 'all' or app.can_see_employee(s.employee_id) or app.is_admin()
   order by s.risk_score desc, s.code;
end $$;
revoke all on function public.insight_resignation_signals from anon;

-- ---------------------------------------------------------------------
-- 6b) News Feed helpers: announcements for me (published, in my audience), notifications for kudos/comments
-- ---------------------------------------------------------------------
create or replace function public.my_announcements(p_limit int default 20)
returns table(id bigint, title text, content text, image_url text, attachments jsonb, is_pinned boolean, publish_at timestamptz,
              expire_at timestamptz, author_name text, read_at timestamptz)
language sql stable security definer set search_path = public as $$
  select a.id, a.title, a.content, a.image_url, a.attachments, a.is_pinned, a.publish_at, a.expire_at,
         coalesce(p.display_name, p.username), r.read_at
    from announcements a
    left join profiles p on p.id = a.created_by
    left join announcement_reads r on r.announcement_id = a.id and r.user_id = auth.uid()
   where a.publish_at <= now() and (a.expire_at is null or a.expire_at > now()) and app.in_audience(a.audience)
   order by a.is_pinned desc, a.publish_at desc
   limit greatest(1, least(p_limit, 100))
$$;
revoke all on function public.my_announcements from anon;

create or replace function app.feed_posts_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_u uuid; v_name text;
begin
  if new.post_type = 'kudos' and new.kudos_to is not null then
    select coalesce(e.first_name || ' ' || e.last_name, p.display_name, p.username) into v_name
      from profiles p left join employees e on e.id = p.employee_id where p.id = new.author_id;
    for v_u in select app.employee_user(x) from unnest(new.kudos_to) x loop
      if v_u is distinct from new.author_id then
        perform app.notify(v_u, coalesce(v_name, 'เพื่อนร่วมงาน') || ' ส่งคำชื่นชมถึงคุณ', left(new.content, 200), '/m/feed?post=' || new.id, 'feed');
      end if;
    end loop;
  end if;
  return new;
end $$;
drop trigger if exists trg_feed_posts_notify on public.feed_posts;
create trigger trg_feed_posts_notify after insert on public.feed_posts for each row execute function app.feed_posts_notify();

create or replace function app.feed_comments_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_author uuid; v_name text;
begin
  select author_id into v_author from feed_posts where id = new.post_id;
  if v_author is null or v_author = new.author_id then return new; end if;
  select coalesce(e.first_name || ' ' || e.last_name, p.display_name, p.username) into v_name
    from profiles p left join employees e on e.id = p.employee_id where p.id = new.author_id;
  perform app.notify(v_author, coalesce(v_name, 'มีคน') || ' แสดงความคิดเห็นในโพสต์ของคุณ', left(new.content, 200), '/m/feed?post=' || new.post_id, 'feed');
  return new;
end $$;
drop trigger if exists trg_feed_comments_notify on public.feed_comments;
create trigger trg_feed_comments_notify after insert on public.feed_comments for each row execute function app.feed_comments_notify();

-- authors may not un-hide a post HR has hidden
create or replace function app.feed_posts_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and new.is_hidden is distinct from old.is_hidden and not app.has_perm('tools','edit') then
    raise exception 'ซ่อน/แสดงโพสต์ได้เฉพาะผู้ดูแล News Feed';
  end if;
  if auth.uid() is not null and new.author_id is distinct from old.author_id then
    raise exception 'เปลี่ยนผู้เขียนโพสต์ไม่ได้';
  end if;
  return new;
end $$;
drop trigger if exists trg_feed_posts_guard on public.feed_posts;
create trigger trg_feed_posts_guard before update on public.feed_posts for each row execute function app.feed_posts_guard();

-- Record a data export in the Back Log (any module may call it after downloading a file)
create or replace function public.log_export(p_table text, p_note text default null) returns void
language sql security definer set search_path = public as $$
  insert into audit_logs(user_id, user_name, action, table_name, note)
  select auth.uid(), coalesce(display_name, username, email), 'EXPORT', p_table, p_note from profiles where id = auth.uid()
$$;
revoke all on function public.log_export from anon;

-- ---------------------------------------------------------------------
-- 7) Scheduler helpers: job-level dedupe keys, lookups
-- ---------------------------------------------------------------------
create unique index if not exists automation_logs_job_dedupe on public.automation_logs(job_code, ref_key)
  where rule_id is null and ref_key is not null;
create index if not exists automation_logs_fired_idx on public.automation_logs(fired_at desc);
create index if not exists notifications_unsent_idx on public.notifications(created_at) where not (sent_line and sent_email);

notify pgrst, 'reload schema';
