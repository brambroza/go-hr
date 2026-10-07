-- =====================================================================
-- GO HR — RPCs used by the web app (login helpers, self-service, misc)
-- =====================================================================

-- Allow login with username or employee code (returns the auth e-mail to sign in with)
create or replace function public.resolve_login(p_login text) returns text
language sql stable security definer set search_path = public as $$
  select p.email from profiles p
   where p.is_active and (lower(p.username) = lower(trim(p_login))
         or p.employee_id = (select id from employees where lower(code) = lower(trim(p_login)) limit 1)
         or lower(p.email) = lower(trim(p_login)))
   limit 1
$$;
grant execute on function public.resolve_login(text) to anon, authenticated;

create or replace function public.record_login() returns void
language plpgsql security definer set search_path = public as $$
begin
  update profiles set last_login_at = now() where id = auth.uid();
  insert into audit_logs(user_id, user_name, action, table_name, record_id)
  select auth.uid(), coalesce(display_name, username, email), 'LOGIN', 'profiles', auth.uid()::text from profiles where id = auth.uid();
end $$;
revoke all on function public.record_login from anon;

create or replace function public.password_changed() returns void
language sql security definer set search_path = public as $$
  update profiles set must_change_password = false, password_changed_at = now() where id = auth.uid()
$$;
revoke all on function public.password_changed from anon;

-- Log access to sensitive data (PDPA): call when HR reveals a masked field
create or replace function public.log_sensitive_view(p_table text, p_record text, p_field text) returns void
language sql security definer set search_path = public as $$
  insert into audit_logs(user_id, user_name, action, table_name, record_id, note)
  select auth.uid(), coalesce(display_name, username, email), 'VIEW_SENSITIVE', p_table, p_record, p_field from profiles where id = auth.uid()
$$;
revoke all on function public.log_sensitive_view from anon;

-- My leave balances for a year (self-service)
create or replace function public.my_leave_balances(p_year int default extract(year from current_date)::int)
returns setof public.v_leave_balances language sql stable security invoker as $$
  select * from public.v_leave_balances where employee_id = app.my_employee_id() and leave_year = p_year order by leave_type_id
$$;

-- Approvals inbox for the current user
create or replace view public.v_my_approvals with (security_invoker = true) as
select a.id as approval_id, a.step, a.status as approval_status, r.*, rt.name as request_type_name, rt.category,
       e.code as emp_code, e.first_name, e.last_name, e.nickname, e.photo_url, e.org_unit_id, e.position_id
  from public.request_approvals a
  join public.requests r on r.id = a.request_id
  join public.request_types rt on rt.code = r.request_type
  join public.employees e on e.id = r.employee_id
 where a.status = 'pending'
   and (a.approver_user_id = auth.uid()
        or a.approver_role_code in (select g.code from public.profiles p join public.role_groups g on g.id = p.role_group_id where p.id = auth.uid())
        or app.has_perm('request_admin','approve'));

-- Requests with names for lists
create or replace view public.v_requests with (security_invoker = true) as
select r.*, rt.name as request_type_name, rt.category, e.code as emp_code, e.first_name, e.last_name, e.nickname,
       e.org_unit_id, e.branch_id, e.position_id,
       lt.name as leave_type_name, lt.color as leave_color,
       (select jsonb_agg(jsonb_build_object('step', a.step, 'status', a.status, 'comment', a.comment, 'acted_at', a.acted_at,
                 'approver', coalesce(p.display_name, ap.first_name || ' ' || ap.last_name, a.approver_role_code))
                 order by a.step)
          from public.request_approvals a
          left join public.profiles p on p.id = a.approver_user_id
          left join public.employees ap on ap.id = p.employee_id
         where a.request_id = r.id) as approvals
  from public.requests r
  join public.request_types rt on rt.code = r.request_type
  join public.employees e on e.id = r.employee_id
  left join public.leave_types lt on r.request_type = 'leave' and lt.id = (r.payload->>'leave_type_id')::bigint;

-- Bulk approve
create or replace function public.act_requests(p_ids bigint[], p_action text, p_comment text default null)
returns int language plpgsql security definer set search_path = public as $$
declare v_id bigint; n int := 0;
begin
  foreach v_id in array p_ids loop
    begin
      perform app.act_request_internal(v_id, p_action, p_comment, false);
      n := n + 1;
    exception when others then
      null;   -- skip items the user cannot act on
    end;
  end loop;
  return n;
end $$;
revoke all on function public.act_requests from anon;

-- Team members of the signed-in supervisor (for team check-in / approvals)
create or replace function public.my_team() returns setof public.v_directory
language sql stable security definer set search_path = public as $$
  select d.* from v_directory d where d.id in (select app.subordinate_ids(app.my_employee_id()))
$$;
revoke all on function public.my_team from anon;

-- Org chart data
create or replace function public.org_chart() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', o.id, 'code', o.code, 'name', o.name, 'unit_type', o.unit_type, 'parent_id', o.parent_id, 'level', o.level,
      'manager', (select jsonb_build_object('id', e.id, 'name', e.first_name || ' ' || e.last_name, 'photo_url', e.photo_url,
                         'position', (select name from positions where id = e.position_id))
                    from employees e where e.id = o.manager_employee_id),
      'headcount', (select count(*) from employees e where e.org_unit_id = o.id and e.status <> 'resigned'))
    order by o.level, o.sort_order, o.name), '[]'::jsonb)
  from org_units o where o.is_active
$$;
revoke all on function public.org_chart from anon;

-- Apply pending employee movements whose effective date has arrived
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
    if m.movement_type = 'resign' then
      update profiles set is_active = false where employee_id = m.employee_id;
    end if;
    update employee_movements set status = 'applied', applied_at = now(), old_snapshot = snap where id = m.id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.apply_movements from anon;
