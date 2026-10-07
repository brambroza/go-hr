-- =====================================================================
-- GO HR — Foundation: helpers, settings, security (users / groups / audit)
-- =====================================================================

create extension if not exists pgcrypto;

create schema if not exists app;
grant usage on schema app to anon, authenticated, service_role;

-- pgcrypto lives in schema "extensions" on Supabase and in "public" on plain Postgres:
-- wrap the two functions we need so the rest of the schema works with any search_path.
do $$
declare s text;
begin
  select n.nspname into s from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'pgcrypto';
  execute format($f$create or replace function app.rand_hex(n int) returns text language sql volatile security definer set search_path = pg_catalog as 'select encode(%I.gen_random_bytes(n), ''hex'')'$f$, s);
  execute format($f$create or replace function app.hmac_hex(msg text, key text) returns text language sql immutable security definer set search_path = pg_catalog as 'select encode(%I.hmac(msg, key, ''sha256''), ''hex'')'$f$, s);
end $$;

-- ---------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------
create or replace function app.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- Key/value settings (company profile, payroll config, notify tokens, license ...)
-- ---------------------------------------------------------------------
create table public.settings (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  is_public  boolean not null default false,   -- readable without login (e.g. company name / logo)
  updated_at timestamptz not null default now(),
  updated_by uuid
);

-- ---------------------------------------------------------------------
-- Running numbers (เลขที่เอกสาร)
-- ---------------------------------------------------------------------
create table public.running_numbers (
  prefix  text not null,
  period  text not null,          -- e.g. '2569' or '256910'
  last_no int  not null default 0,
  primary key (prefix, period)
);

create or replace function app.next_doc_no(p_prefix text, p_period text default to_char(now() at time zone 'Asia/Bangkok', 'YYMM'))
returns text language plpgsql security definer set search_path = public as $$
declare v int;
begin
  insert into running_numbers(prefix, period, last_no) values (p_prefix, p_period, 1)
  on conflict (prefix, period) do update set last_no = running_numbers.last_no + 1
  returning last_no into v;
  return p_prefix || p_period || lpad(v::text, 4, '0');
end $$;

-- ---------------------------------------------------------------------
-- Role groups (กลุ่มผู้ใช้) — permission matrix per menu
--   permissions = { "<menu>": ["view","create","edit","delete","export","approve"] }
--   data_scope  = all | branch | org | team | self
-- ---------------------------------------------------------------------
create table public.role_groups (
  id          bigint generated always as identity primary key,
  code        text not null unique,
  name        text not null,
  description text,
  permissions jsonb not null default '{}'::jsonb,
  data_scope  text not null default 'self' check (data_scope in ('all','branch','org','team','self')),
  is_system   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger trg_role_groups_touch before update on public.role_groups for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------
-- Profiles: 1:1 with auth.users
-- ---------------------------------------------------------------------
create table public.profiles (
  id                   uuid primary key references auth.users(id) on delete cascade,
  username             text unique,
  display_name         text,
  email                text,
  role_group_id        bigint references public.role_groups(id),
  employee_id          bigint,                       -- FK added after employees table
  is_admin             boolean not null default false,
  is_active            boolean not null default true,
  must_change_password boolean not null default false,
  password_changed_at  timestamptz,
  line_user_id         text,
  line_link_code       text,
  signature_url        text,                          -- ลายเซ็นสำหรับเอกสาร
  locale               text not null default 'th',
  last_login_at        timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create trigger trg_profiles_touch before update on public.profiles for each row execute function app.touch_updated_at();
create index on public.profiles(employee_id);
create index on public.profiles(line_user_id);

-- ---------------------------------------------------------------------
-- Permission helpers (used everywhere in RLS)
-- ---------------------------------------------------------------------
create or replace function app.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create or replace function app.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select p.is_admin and p.is_active from profiles p where p.id = auth.uid()), false)
$$;

create or replace function app.has_perm(p_menu text, p_action text default 'view') returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select p.is_active and (
             p.is_admin
             or coalesce(g.permissions -> p_menu ? p_action, false)
           )
      from profiles p
      left join role_groups g on g.id = p.role_group_id
     where p.id = auth.uid()
  ), false)
$$;

create or replace function app.my_employee_id() returns bigint
language sql stable security definer set search_path = public as $$
  select employee_id from profiles where id = auth.uid()
$$;

create or replace function app.my_scope() returns text
language sql stable security definer set search_path = public as $$
  select case when p.is_admin then 'all' else coalesce(g.data_scope, 'self') end
    from profiles p left join role_groups g on g.id = p.role_group_id
   where p.id = auth.uid()
$$;

-- ---------------------------------------------------------------------
-- Audit log (Back Log)
-- ---------------------------------------------------------------------
create table public.audit_logs (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  user_id     uuid,
  user_name   text,
  action      text not null,          -- INSERT / UPDATE / DELETE / LOGIN / EXPORT / VIEW_SENSITIVE / ...
  table_name  text,
  record_id   text,
  old_data    jsonb,
  new_data    jsonb,
  ip          text,
  note        text
);
create index on public.audit_logs(at desc);
create index on public.audit_logs(table_name, record_id);

create or replace function app.audit_trigger() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_old jsonb; v_new jsonb; v_id text; v_name text;
begin
  if tg_op in ('UPDATE','DELETE') then v_old := to_jsonb(old); end if;
  if tg_op in ('INSERT','UPDATE') then v_new := to_jsonb(new); end if;
  v_id := coalesce(v_new ->> 'id', v_old ->> 'id', v_new ->> 'key', v_old ->> 'key');
  if tg_op = 'UPDATE' and v_old - 'updated_at' = v_new - 'updated_at' then
    return new;  -- nothing changed
  end if;
  select coalesce(display_name, username, email) into v_name from profiles where id = auth.uid();
  insert into audit_logs(user_id, user_name, action, table_name, record_id, old_data, new_data)
  values (auth.uid(), v_name, tg_op, tg_table_name, v_id, v_old, v_new);
  return coalesce(new, old);
end $$;

create or replace function app.enable_audit(p_table regclass) returns void
language plpgsql as $$
begin
  execute format('drop trigger if exists trg_audit on %s', p_table);
  execute format('create trigger trg_audit after insert or update or delete on %s for each row execute function app.audit_trigger()', p_table);
end $$;

-- ---------------------------------------------------------------------
-- Generic RLS policy installer
--   mode 'master'   : every signed-in user can read; write needs menu perms
--   mode 'restrict' : read & write need menu perms
--   mode 'public'   : anyone (even anon) can read; write needs menu perms
-- ---------------------------------------------------------------------
create or replace function app.std_policies(p_table regclass, p_menu text, p_mode text default 'master') returns void
language plpgsql as $$
declare t text := p_table::text;
begin
  execute format('alter table %s enable row level security', t);
  execute format('drop policy if exists p_sel on %s', t);
  execute format('drop policy if exists p_ins on %s', t);
  execute format('drop policy if exists p_upd on %s', t);
  execute format('drop policy if exists p_del on %s', t);
  if p_mode = 'public' then
    execute format('create policy p_sel on %s for select using (true)', t);
  elsif p_mode = 'master' then
    execute format('create policy p_sel on %s for select to authenticated using (true)', t);
  else
    execute format('create policy p_sel on %s for select to authenticated using (app.has_perm(%L, ''view''))', t, p_menu);
  end if;
  execute format('create policy p_ins on %s for insert to authenticated with check (app.has_perm(%L, ''create''))', t, p_menu);
  execute format('create policy p_upd on %s for update to authenticated using (app.has_perm(%L, ''edit'')) with check (app.has_perm(%L, ''edit''))', t, p_menu, p_menu);
  execute format('create policy p_del on %s for delete to authenticated using (app.has_perm(%L, ''delete''))', t, p_menu);
end $$;

-- ---------------------------------------------------------------------
-- Notifications (in-app inbox; also pushed to LINE / email by the app)
-- ---------------------------------------------------------------------
create table public.notifications (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  title      text not null,
  body       text,
  link       text,
  category   text,
  read_at    timestamptz,
  sent_line  boolean not null default false,
  sent_email boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.notifications(user_id, read_at);

create or replace function app.notify(p_user uuid, p_title text, p_body text default null, p_link text default null, p_category text default null)
returns void language sql security definer set search_path = public as $$
  insert into notifications(user_id, title, body, link, category)
  select p_user, p_title, p_body, p_link, p_category where p_user is not null
$$;

-- RLS: foundation tables ------------------------------------------------
alter table public.settings enable row level security;
create policy p_sel on public.settings for select using (is_public or app.has_perm('settings','view') or auth.role() = 'authenticated' and key not like 'secret.%');
create policy p_all on public.settings for all to authenticated using (app.has_perm('settings','edit')) with check (app.has_perm('settings','edit'));

alter table public.running_numbers enable row level security;
create policy p_sel on public.running_numbers for select to authenticated using (true);

select app.std_policies('public.role_groups', 'security', 'master');

alter table public.profiles enable row level security;
create policy p_sel on public.profiles for select to authenticated using (true);
create policy p_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy p_admin on public.profiles for all to authenticated
  using (app.has_perm('security','edit')) with check (app.has_perm('security','edit'));

alter table public.audit_logs enable row level security;
create policy p_sel on public.audit_logs for select to authenticated using (app.has_perm('audit','view'));

alter table public.notifications enable row level security;
create policy p_own on public.notifications for select to authenticated using (user_id = auth.uid());
create policy p_upd on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy p_del on public.notifications for delete to authenticated using (user_id = auth.uid());

-- Prevent a user from escalating their own privileges through the self-update policy
create or replace function app.profiles_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not app.has_perm('security','edit') then
    if new.role_group_id is distinct from old.role_group_id
       or new.is_admin is distinct from old.is_admin
       or new.is_active is distinct from old.is_active
       or new.employee_id is distinct from old.employee_id
       or new.username is distinct from old.username then
      raise exception 'ไม่มีสิทธิ์แก้ไขข้อมูลสิทธิ์ผู้ใช้';
    end if;
  end if;
  return new;
end $$;
create trigger trg_profiles_guard before update on public.profiles for each row execute function app.profiles_guard();

select app.enable_audit('public.role_groups');
select app.enable_audit('public.profiles');
select app.enable_audit('public.settings');
