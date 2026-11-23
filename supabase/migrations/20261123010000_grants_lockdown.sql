-- =====================================================================
-- GO HR — Grants lockdown                                                    (idempotent)
--
--   Why: deploy/migrate.sh ended every run with "grant all on all tables / grant execute on all functions
--   ... to authenticated". That put back every privilege the migrations had revoked, so any signed-in
--   employee could read work_locations.qr_secret, time_devices.api_key, profiles.line_link_code and the face
--   descriptors, and could call service-only functions (check_in_network, login_failed, ...). Functions also
--   keep PostgreSQL's default EXECUTE for PUBLIC unless it is revoked, so "revoke ... from anon" alone left
--   them callable with nothing but the public anon key (apply_movements, org_chart, ...).
--
--   What: app.sync_grants() is now the single place that decides who may use what. deploy/migrate.sh calls
--   it after every run instead of the blanket grants; it is safe to call at any time:
--       select app.sync_grants();
--   A new secret column or service-only function must be added to app.sync_grants() (in a new migration that
--   re-creates the function) — a revoke written only next to the table is not enough, because the baseline
--   grants below are re-applied on every upgrade. tests/grants.test.ts checks this.
--
--   Also here: apply_movements / sync_resigned_access accept only the service role or employee:edit,
--   trial leads are admin-only, and the storage read policy follows the bucket, the folder and the data scope.
-- =====================================================================

-- ---------------------------------------------------------------------
-- helper: give "authenticated" one privilege on every column of a table except the hidden ones
-- ---------------------------------------------------------------------
create or replace function app.grant_columns_except(p_table text, p_priv text, p_hidden text[]) returns void
language plpgsql set search_path = pg_catalog, public as $$
declare cols text;
begin
  if p_priv not in ('select', 'update') then raise exception 'grant_columns_except: unsupported privilege %', p_priv; end if;
  if to_regclass(format('public.%I', p_table)) is null then return; end if;
  select string_agg(quote_ident(a.attname), ', ' order by a.attnum) into cols
    from pg_attribute a
   where a.attrelid = to_regclass(format('public.%I', p_table))
     and a.attnum > 0 and not a.attisdropped
     and a.attname <> all (p_hidden);
  -- revoking the table-level privilege also drops earlier column-level grants, so columns added later are picked up
  execute format('revoke %s on public.%I from authenticated, anon', p_priv, p_table);
  execute format('grant %s (%s) on public.%I to authenticated', p_priv, cols, p_table);
end $$;

-- ---------------------------------------------------------------------
-- app.sync_grants(): baseline grants, then the lockdown list
-- ---------------------------------------------------------------------
create or replace function app.sync_grants() returns void
language plpgsql set search_path = pg_catalog, public as $$
declare r record;
begin
  -- 1) baseline — objects are created by the migration role, the API roles need to reach them (RLS still applies)
  grant usage on schema public, app to anon, authenticated, service_role;
  grant all on all tables in schema public to service_role;
  grant all on all sequences in schema public to service_role;
  grant select, insert, update, delete on all tables in schema public to authenticated;
  revoke truncate, references, trigger on all tables in schema public from authenticated, anon;
  grant usage, select on all sequences in schema public to authenticated;

  -- 2) functions in "public" are the RPC surface (/rest/v1/rpc/*): nothing for anonymous callers.
  --    PUBLIC must be revoked as well — anon inherits it. Every page that works without a login uses the
  --    service role on the server. (Schema "app" is not exposed by the API; its helpers stay usable by RLS policies.)
  revoke all on all functions in schema public from public, anon;
  grant execute on all functions in schema public to authenticated, service_role;
  grant execute on all functions in schema app to authenticated, service_role;

  -- 3) service-role only (every overload): called from server code after its own checks
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where (n.nspname = 'public' and p.proname in (
              'check_in_network',             -- records a check-in for any user id
              'login_precheck', 'login_failed', 'resolve_login',   -- login lockout: returns auth e-mails, locks accounts
              'password_changed',             -- clears "must change password"; set by the change-password server action only
              'announcement_audience_users'))
        or (n.nspname = 'app' and p.proname in (
              'act_request_internal', 'apply_request', 'revert_request',   -- approval engine internals
              'check_in_core', 'checkin_policy',
              'profile_by_login', 'lockout_policy'))
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
  -- these two change privileges: only the owner (the migration role) runs them
  revoke all on function app.sync_grants() from public, anon, authenticated, service_role;
  revoke all on function app.grant_columns_except(text, text, text[]) from public, anon, authenticated, service_role;

  -- 4) app helpers that were never meant for anonymous callers
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'app' and p.proname in (
              'notify', 'next_doc_no', 'petty_cash_pay_item',
              'face_distance', 'face_descriptor_ok', 'try_inet', 'normalize_ip', 'ip_ranges_valid', 'ip_in_ranges')
  loop
    execute format('revoke all on function %s from public, anon', r.sig);
  end loop;

  -- 5) secret columns
  --    QR secret of a check-in location: whoever reads it can forge the QR token; whoever writes it can choose one
  perform app.grant_columns_except('work_locations', 'select', array['qr_secret']);
  perform app.grant_columns_except('work_locations', 'update', array['qr_secret']);
  --    device key: authorises /api/device/push (time logs for any employee)
  perform app.grant_columns_except('time_devices', 'select', array['api_key']);
  perform app.grant_columns_except('time_devices', 'update', array['api_key']);
  --    pending LINE link code: reading a colleague's code hijacks their notifications; the link itself is
  --    written only by the server (lib/notify/actions.ts, LINE webhook)
  perform app.grant_columns_except('profiles', 'select', array['line_link_code', 'line_link_expires_at']);
  perform app.grant_columns_except('profiles', 'update', array['line_link_code', 'line_link_expires_at', 'line_user_id']);
  --    face descriptor (biometric): matching happens inside check_in_face only
  perform app.grant_columns_except('employee_faces', 'select', array['descriptor']);

  if to_regclass('public.employee_faces') is not null then
    revoke update on public.employee_faces from authenticated, anon;
  end if;
  if to_regclass('public.face_check_failures') is not null then
    revoke insert, update, delete on public.face_check_failures from authenticated, anon;
  end if;
  if to_regclass('public.login_failures') is not null then
    revoke all on public.login_failures from public, anon, authenticated;
  end if;
  if to_regclass('public.trial_leads') is not null then
    -- read + change only the sales fields; the visitor's own answers stay as submitted
    revoke all on public.trial_leads from public, anon, authenticated;
    grant select on public.trial_leads to authenticated;
    grant update (status, sales_note) on public.trial_leads to authenticated;
  end if;
  -- the directory view bypasses RLS on purpose (masked columns) — never for anonymous visitors
  if to_regclass('public.v_directory') is not null then
    revoke all on public.v_directory from anon;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- apply_movements / sync_resigned_access: service role (daily job) or employee:edit — nobody else.
--   The old check "auth.uid() is not null and not has_perm" let every caller without a user id through,
--   which includes an anonymous API call. (apply_movements re-stated from 20261011010000_resigned_access.sql;
--   only the first line of the body changed.)
-- ---------------------------------------------------------------------
create or replace function public.apply_movements(p_until date default current_date) returns int
language plpgsql security definer set search_path = public as $$
declare m employee_movements%rowtype; n int := 0; snap jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' and not app.has_perm('employee','edit') then raise exception 'ไม่มีสิทธิ์'; end if;
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

create or replace function public.sync_resigned_access() returns int
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' and not app.has_perm('employee','edit') then raise exception 'ไม่มีสิทธิ์'; end if;
  return app.sync_profile_active();
end $$;

-- ---------------------------------------------------------------------
-- Trial leads (GoAlong demo server): administrators only.
--   The demo logins handed to every trial visitor can hold settings:view; with the old policy each visitor
--   could read the name, phone and e-mail of every other prospect.
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public.trial_leads') is not null then
    drop policy if exists trial_leads_sel on public.trial_leads;
    create policy trial_leads_sel on public.trial_leads for select to authenticated using (app.is_admin());
    drop policy if exists trial_leads_upd on public.trial_leads;
    create policy trial_leads_upd on public.trial_leads for update to authenticated using (app.is_admin()) with check (app.is_admin());
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Storage: who may read an object in the private buckets.
--   Before: employee:view OR request_admin:view OR attendance:view opened all three buckets for every
--   employee, whatever the user's data scope — a timekeeper or a manager of one unit could download every
--   contract, ID copy and medical certificate in the company.
--   Now (paths are "<uploader user id>/<folder>/<file>", see lib/storage.ts):
--     own uploads                          → always
--     checkins                             → attendance:view
--     attachments                          → request_admin:view, or anyone who may see a request that carries the file
--                                            (approvers; confidential complaints stay hidden via app.can_see_request)
--     documents/<uid>/policies/...         → every signed-in user (company policies shown in the employee app)
--     documents/<uid>/emp-<id>/...         → that employee, or employee:view within the user's data scope
--     documents/<uid>/faces/emp-<id>/...   → same
--     documents, anything else             → employee:view or request_admin:view (signatures on issued documents)
-- ---------------------------------------------------------------------
create or replace function app.can_read_object(p_bucket text, p_name text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  f text[] := string_to_array(coalesce(p_name, ''), '/');
  v_seg text;
  v_emp bigint;
begin
  if auth.uid() is null or p_bucket is null or p_bucket not in ('attachments', 'checkins', 'documents') then return false; end if;
  if f[1] = auth.uid()::text then return true; end if;

  if p_bucket = 'checkins' then
    return app.has_perm('attendance', 'view');
  end if;

  if p_bucket = 'attachments' then
    return app.has_perm('request_admin', 'view')
        or exists (select 1 from requests r
                    where r.attachments @> jsonb_build_array(jsonb_build_object('url', 'attachments/' || p_name))
                      and app.can_see_request(r.id));
  end if;

  -- documents
  if f[2] = 'policies' then return true; end if;
  v_seg := case when f[2] = 'faces' then f[3] else f[2] end;
  if v_seg ~ '^emp-[0-9]{1,15}$' then
    v_emp := substr(v_seg, 5)::bigint;
    return coalesce(v_emp = app.my_employee_id(), false) or (app.has_perm('employee', 'view') and app.can_see_employee(v_emp));
  end if;
  return app.has_perm('employee', 'view') or app.has_perm('request_admin', 'view');
end $$;

-- the attachment lookup above (requests.attachments @> [{"url": ...}])
create index if not exists requests_attachments_gin on public.requests using gin (attachments jsonb_path_ops);

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'objects') then
    execute $p$drop policy if exists "go_hr_own_read" on storage.objects$p$;
    execute $p$create policy "go_hr_own_read" on storage.objects for select to authenticated
               using (app.can_read_object(bucket_id, name))$p$;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- profiles: administrator rights can only be given, changed or removed by an administrator.
--   The row policy p_admin lets security:edit write any profile, and the old guard only stopped users
--   WITHOUT security:edit — so a security:edit user could set is_admin on their own row through the API,
--   or edit / delete an administrator. (The service role, auth.uid() is null, is not restricted: server
--   actions check the same rule in lib/employees/user-actions.ts.)
-- ---------------------------------------------------------------------
create or replace function app.profiles_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'INSERT' then
    if new.is_admin and not app.is_admin() then raise exception 'เฉพาะผู้ดูแลระบบเท่านั้นที่กำหนดสิทธิ์ผู้ดูแลระบบได้'; end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.is_admin and not app.is_admin() then raise exception 'บัญชีผู้ดูแลระบบแก้ไขได้เฉพาะผู้ดูแลระบบเท่านั้น'; end if;
    return old;
  end if;

  if not app.has_perm('security','edit') then
    if new.role_group_id is distinct from old.role_group_id
       or new.is_admin is distinct from old.is_admin
       or new.is_active is distinct from old.is_active
       or new.employee_id is distinct from old.employee_id
       or new.username is distinct from old.username then
      raise exception 'ไม่มีสิทธิ์แก้ไขข้อมูลสิทธิ์ผู้ใช้';
    end if;
  elsif not app.is_admin() then
    if new.is_admin is distinct from old.is_admin then
      raise exception 'เฉพาะผู้ดูแลระบบเท่านั้นที่เปลี่ยนสิทธิ์ผู้ดูแลระบบได้';
    end if;
    if old.is_admin and new.id is distinct from auth.uid() then
      raise exception 'บัญชีผู้ดูแลระบบแก้ไขได้เฉพาะผู้ดูแลระบบเท่านั้น';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_profiles_guard on public.profiles;
create trigger trg_profiles_guard before insert or update or delete on public.profiles
  for each row execute function app.profiles_guard();

select app.sync_grants();
notify pgrst, 'reload schema';
