-- =====================================================================
-- GO HR — Account lockout after failed sign-ins                              (idempotent)
--
--   settings.password_policy.max_failed / lock_minutes were shown in ตั้งค่า → กฎการคำนวณ → รหัสผ่าน but nothing
--   read them (GoTrue has rate limits, not a per-account lock). Now:
--     * public.login_failed(p_login): called by the login page after a wrong password. Counts failures per
--       profile and sets locked_until after max_failed attempts (window / lock = lock_minutes). Silent for
--       unknown logins (no account enumeration). Writes audit_logs LOGIN_FAILED / LOGIN_LOCKED.
--     * public.resolve_login(p_login): raises a Thai error while the account is locked (the page shows it).
--     * public.record_login(): a successful sign-in clears the counter.
--   max_failed = 0 switches the feature off. TS mirror + tests: lib/login-lockout.ts, tests/login-lockout.test.ts
-- =====================================================================

create table if not exists public.login_failures (
  profile_id   uuid primary key references public.profiles(id) on delete cascade,
  fails        int not null default 0,
  last_at      timestamptz not null default now(),
  locked_until timestamptz
);
alter table public.login_failures enable row level security;    -- no policies: reached only through the functions below
revoke all on public.login_failures from public, anon, authenticated;
comment on table public.login_failures is 'จำนวนครั้งที่ใส่รหัสผ่านผิดและเวลาที่บัญชีถูกล็อก (ตามนโยบายรหัสผ่าน max_failed / lock_minutes)';

-- the profile a login string refers to (username / employee code / e-mail)
create or replace function app.profile_by_login(p_login text) returns public.profiles
language sql stable security definer set search_path = public as $$
  select p.* from profiles p
   where lower(p.username) = lower(trim(p_login))
      or p.employee_id = (select id from employees where lower(code) = lower(trim(p_login)) limit 1)
      or lower(p.email) = lower(trim(p_login))
   order by (lower(p.email) = lower(trim(p_login))) desc
   limit 1
$$;
revoke all on function app.profile_by_login(text) from public, anon, authenticated;

create or replace function app.lockout_policy(out o_max_failed int, out o_lock_minutes int)
language sql stable security definer set search_path = public as $$
  select coalesce(((select value from settings where key = 'password_policy')->>'max_failed')::int, 0),
         greatest(coalesce(((select value from settings where key = 'password_policy')->>'lock_minutes')::int, 15), 1)
$$;
revoke all on function app.lockout_policy() from public, anon, authenticated;

-- returns the auth e-mail to sign in with; raises while the account is locked
create or replace function public.resolve_login(p_login text) returns text
language plpgsql stable security definer set search_path = public as $$
declare p profiles%rowtype; v_until timestamptz;
begin
  p := app.profile_by_login(p_login);
  if p.id is null or not p.is_active then return null; end if;
  select locked_until into v_until from login_failures where profile_id = p.id;
  if v_until is not null and v_until > now() then
    raise exception 'บัญชีถูกล็อกชั่วคราวเนื่องจากใส่รหัสผ่านผิดหลายครั้ง ลองใหม่ในอีก % นาที',
      ceil(extract(epoch from (v_until - now())) / 60)::int
      using errcode = 'P0001';
  end if;
  return p.email;
end $$;
grant execute on function public.resolve_login(text) to anon, authenticated;

create or replace function public.login_failed(p_login text) returns void
language plpgsql security definer set search_path = public as $$
declare p profiles%rowtype; v_max int; v_mins int; v_prev login_failures%rowtype; v_fails int; v_until timestamptz;
begin
  select o_max_failed, o_lock_minutes into v_max, v_mins from app.lockout_policy();
  if v_max <= 0 then return; end if;
  p := app.profile_by_login(p_login);
  if p.id is null then return; end if;                       -- unknown login: say nothing
  select * into v_prev from login_failures where profile_id = p.id;
  if v_prev.profile_id is null then v_fails := 1;
  elsif v_prev.locked_until is not null and v_prev.locked_until <= now() then v_fails := 1;     -- an expired lock starts over
  elsif v_prev.last_at < now() - make_interval(mins => v_mins) then v_fails := 1;              -- old failures are forgotten
  else v_fails := v_prev.fails + 1;
  end if;
  v_until := case when v_fails >= v_max then now() + make_interval(mins => v_mins) end;
  insert into login_failures(profile_id, fails, last_at, locked_until) values (p.id, v_fails, now(), v_until)
  on conflict (profile_id) do update set fails = excluded.fails, last_at = excluded.last_at, locked_until = excluded.locked_until;
  insert into audit_logs(user_id, user_name, action, table_name, record_id, note)
  values (p.id, coalesce(p.display_name, p.username, p.email),
          case when v_until is null then 'LOGIN_FAILED' else 'LOGIN_LOCKED' end, 'profiles', p.id::text,
          case when v_until is null then 'ใส่รหัสผ่านผิดครั้งที่ ' || v_fails
               else 'ล็อกบัญชี ' || v_mins || ' นาที หลังใส่รหัสผ่านผิด ' || v_fails || ' ครั้ง' end);
end $$;
grant execute on function public.login_failed(text) to anon, authenticated;

-- a successful sign-in clears the counter
create or replace function public.record_login() returns void
language plpgsql security definer set search_path = public as $$
begin
  update profiles set last_login_at = now() where id = auth.uid();
  delete from login_failures where profile_id = auth.uid();
  insert into audit_logs(user_id, user_name, action, table_name, record_id)
  select auth.uid(), coalesce(display_name, username, email), 'LOGIN', 'profiles', auth.uid()::text from profiles where id = auth.uid();
end $$;
revoke all on function public.record_login from anon;
