-- =====================================================================
-- GO HR — Access of resigned employees                                      (idempotent)
--
--   Before: profiles.is_active was switched off only by the "resign" movement, on the morning of the
--   employee's LAST WORKING DAY (cron 00:10), never when HR set status = resigned directly, and never
--   switched back on by a rehire. app.my_employee_id() ignored is_active, so a still-valid token could
--   call check_in / submit_request / my_* RPCs after the account was disabled. The auth user was never banned.
--
--   Now:
--     * app.employee_allowed(status, resign_date): allowed through the end of resign_date (Asia/Bangkok),
--       blocked from the next day. status = resigned without a date → blocked.
--     * app.my_employee_id() returns null for an inactive or no-longer-allowed profile (every RPC already
--       raises a Thai error on null).
--     * app.sync_profile_active() keeps profiles.is_active in step with employees (status, resign_date) —
--       called by a trigger on employees, by apply_movements and by the daily cron (public.sync_resigned_access).
--       It re-activates only profiles it locked itself (profiles.locked_by_resign), never an account HR
--       disabled by hand.
--     * profiles.auth_banned_at: the job runner bans / unbans the Supabase auth user to match is_active.
-- =====================================================================

alter table public.profiles add column if not exists auth_banned_at   timestamptz;
alter table public.profiles add column if not exists locked_by_resign boolean not null default false;
comment on column public.profiles.auth_banned_at   is 'เวลาที่ auth user ถูก ban ให้ตรงกับ is_active = false (ตั้งโดย job apply_movements / ปิดบัญชีด้วยมือ)';
comment on column public.profiles.locked_by_resign is 'true = ระบบปิดบัญชีเองเพราะพ้นสภาพ (เปิดคืนอัตโนมัติเมื่อ rehire); false = HR ปิดเอง';

create or replace function app.employee_allowed(p_status text, p_resign date) returns boolean
language sql stable as $$
  select p_status is distinct from 'resigned'
      or (p_resign is not null and p_resign >= (now() at time zone 'Asia/Bangkok')::date)
$$;

-- employee id of the caller — null when the account is disabled or the employee has left
create or replace function app.my_employee_id() returns bigint
language sql stable security definer set search_path = public as $$
  select p.employee_id
    from profiles p
    join employees e on e.id = p.employee_id
   where p.id = auth.uid() and p.is_active and app.employee_allowed(e.status, e.resign_date)
$$;

-- employees (status, resign_date) → profiles.is_active. Returns the number of profiles changed.
create or replace function app.sync_profile_active() returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0; m int := 0;
begin
  -- lock accounts of employees who have left
  update profiles p
     set is_active = false, locked_by_resign = true
    from employees e
   where e.id = p.employee_id and p.is_active and not app.employee_allowed(e.status, e.resign_date);
  get diagnostics n = row_count;
  -- re-open accounts that the system locked and whose employee is active again (rehire / date corrected)
  update profiles p
     set is_active = true, locked_by_resign = false
    from employees e
   where e.id = p.employee_id and not p.is_active and p.locked_by_resign and app.employee_allowed(e.status, e.resign_date);
  get diagnostics m = row_count;
  return n + m;
end $$;

create or replace function app.employees_sync_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform app.sync_profile_active();
  return null;
end $$;
drop trigger if exists trg_employees_sync_profile on public.employees;
create trigger trg_employees_sync_profile
  after insert or update of status, resign_date on public.employees
  for each statement execute function app.employees_sync_profile();

-- for the daily job (and HR tools): service role / employee:edit
create or replace function public.sync_resigned_access() returns int
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not app.has_perm('employee','edit') then raise exception 'ไม่มีสิทธิ์'; end if;
  return app.sync_profile_active();
end $$;
revoke all on function public.sync_resigned_access from public, anon;

-- apply_movements: the profile lock is now handled by the trigger / sync (re-stated from 20261007000008_app_rpc.sql)
create or replace function public.apply_movements(p_until date default current_date) returns int
language plpgsql security definer set search_path = public as $$
declare m employee_movements%rowtype; n int := 0; snap jsonb;
begin
  if auth.uid() is not null and not app.has_perm('employee','edit') then raise exception 'ไม่มีสิทธิ์'; end if;
  for m in select * from employee_movements where status in ('pending','approved') and effective_date <= p_until order by effective_date, id loop
    select to_jsonb(e) || jsonb_build_object('salary', p.salary) into snap
      from employees e left join employee_private p on p.employee_id = e.id where e.id = m.employee_id;
    update employees set
      branch_id     = coalesce(m.new_branch_id, branch_id),
      org_unit_id   = coalesce(m.new_org_unit_id, org_unit_id),
      position_id   = coalesce(m.new_position_id, position_id),
      supervisor_id = coalesce(m.new_supervisor_id, supervisor_id),
      employee_type = coalesce(m.new_employee_type, employee_type),
      status        = case when m.movement_type = 'confirm' then 'permanent'
                           when m.movement_type = 'resign' then 'resigned'
                           when m.movement_type = 'rehire' then 'probation'
                           else coalesce(m.new_status, status) end,
      confirm_date  = case when m.movement_type = 'confirm' then m.effective_date else confirm_date end,
      resign_date   = case when m.movement_type = 'resign' then m.effective_date
                           when m.movement_type = 'rehire' then null else resign_date end,
      resign_reason = case when m.movement_type = 'resign' then coalesce(m.reason, resign_reason) else resign_reason end
     where id = m.employee_id;
    if m.new_salary is not null then
      perform set_config('app.salary_reason', coalesce(m.reason, m.movement_type), true);
      update employee_private set salary = m.new_salary where employee_id = m.employee_id;
      update salary_history set ref_type = 'movement', ref_id = m.id, effective_date = m.effective_date
       where id = (select max(id) from salary_history where employee_id = m.employee_id);
    end if;
    update employee_movements set status = 'applied', applied_at = now(), old_snapshot = snap where id = m.id;
    n := n + 1;
  end loop;
  perform app.sync_profile_active();
  return n;
end $$;
revoke all on function public.apply_movements from anon;

-- bring existing data in line (accounts of people who already left)
select app.sync_profile_active();
