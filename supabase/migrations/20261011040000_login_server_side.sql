-- =====================================================================
-- GO HR — Sign-in moves to the server; lockout hardening; admins never auto-locked      (idempotent)
--
--   Security review of 1.2.1 found:
--     * public.login_failed was callable by anon → anyone could lock any known username (and keep extending the
--       lock), and audit_logs grew without limit; resolve_login handed the auth e-mail to anon (enumeration).
--     * app.sync_profile_active() could deactivate an admin (even the last one) when someone with employee:edit
--       set that admin's employee record to resigned.
--   Now:
--     * The login page calls a Server Action (app/(auth)/login/actions.ts) which uses the service role:
--       public.login_precheck(p_login) → { email, locked_minutes }; GoTrue password grant from the server;
--       public.login_failed(p_login, p_ip) only on a real wrong password. Both functions are service-role only.
--     * login_failed never extends an active lock; audit rows are written without a user_id (the victim did not act),
--       with the typed login and the client IP in the note / ip columns.
--     * resolve_login is no longer callable by anon / authenticated.
--     * app.sync_profile_active() leaves admin profiles alone (HR disables an admin only via ตั้งค่า → ผู้ใช้งาน).
-- =====================================================================

-- ---------------------------------------------------------------- lookup for the server action
create or replace function public.login_precheck(p_login text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare p profiles%rowtype; v_until timestamptz; v_minutes int := 0;
begin
  p := app.profile_by_login(p_login);
  if p.id is null or not p.is_active then return jsonb_build_object('email', null, 'locked_minutes', 0); end if;
  select locked_until into v_until from login_failures where profile_id = p.id;
  if v_until is not null and v_until > now() then v_minutes := greatest(1, ceil(extract(epoch from (v_until - now())) / 60)::int); end if;
  return jsonb_build_object('email', case when v_minutes > 0 then null else p.email end, 'locked_minutes', v_minutes);
end $$;
revoke all on function public.login_precheck(text) from public, anon, authenticated;
grant execute on function public.login_precheck(text) to service_role;

-- ---------------------------------------------------------------- failure counter (service role only)
drop function if exists public.login_failed(text);
create or replace function public.login_failed(p_login text, p_ip text default null) returns void
language plpgsql security definer set search_path = public as $$
declare p profiles%rowtype; v_max int; v_mins int; v_prev login_failures%rowtype; v_fails int; v_until timestamptz;
begin
  select o_max_failed, o_lock_minutes into v_max, v_mins from app.lockout_policy();
  if v_max <= 0 then return; end if;
  p := app.profile_by_login(p_login);
  if p.id is null then return; end if;                       -- unknown login: nothing to count
  select * into v_prev from login_failures where profile_id = p.id;
  if v_prev.locked_until is not null and v_prev.locked_until > now() then return; end if;   -- already locked: never extend
  if v_prev.profile_id is null then v_fails := 1;
  elsif v_prev.locked_until is not null and v_prev.locked_until <= now() then v_fails := 1;     -- an expired lock starts over
  elsif v_prev.last_at < now() - make_interval(mins => v_mins) then v_fails := 1;              -- old failures are forgotten
  else v_fails := v_prev.fails + 1;
  end if;
  v_until := case when v_fails >= v_max then now() + make_interval(mins => v_mins) end;
  insert into login_failures(profile_id, fails, last_at, locked_until) values (p.id, v_fails, now(), v_until)
  on conflict (profile_id) do update set fails = excluded.fails, last_at = excluded.last_at, locked_until = excluded.locked_until;
  -- the account owner did not do this — no user_id; the login that was typed and the IP go in the row
  insert into audit_logs(user_id, user_name, action, table_name, record_id, ip, note)
  values (null, 'ไม่ระบุตัวตน',
          case when v_until is null then 'LOGIN_FAILED' else 'LOGIN_LOCKED' end, 'profiles', p.id::text, left(p_ip, 64),
          case when v_until is null then 'ใส่รหัสผ่านผิดครั้งที่ ' || v_fails || ' (' || left(p_login, 80) || ')'
               else 'ล็อกบัญชี ' || v_mins || ' นาที หลังใส่รหัสผ่านผิด ' || v_fails || ' ครั้ง (' || left(p_login, 80) || ')' end);
end $$;
revoke all on function public.login_failed(text, text) from public, anon, authenticated;
grant execute on function public.login_failed(text, text) to service_role;

-- the browser no longer needs to resolve logins itself
revoke all on function public.resolve_login(text) from public, anon, authenticated;

-- ---------------------------------------------------------------- admins are never locked by the employee record
create or replace function app.sync_profile_active() returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0; m int := 0;
begin
  -- lock accounts of employees who have left (never an administrator account — those are managed in ตั้งค่า → ผู้ใช้งาน)
  update profiles p
     set is_active = false, locked_by_resign = true
    from employees e
   where e.id = p.employee_id and p.is_active and not p.is_admin and not app.employee_allowed(e.status, e.resign_date);
  get diagnostics n = row_count;
  -- re-open accounts that the system locked and whose employee is active again (rehire / date corrected)
  update profiles p
     set is_active = true, locked_by_resign = false
    from employees e
   where e.id = p.employee_id and not p.is_active and p.locked_by_resign and app.employee_allowed(e.status, e.resign_date);
  get diagnostics m = row_count;
  return n + m;
end $$;
