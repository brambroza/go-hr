-- =====================================================================
-- GO HR — Face recognition check-in + office-network (IP) check-in
-- Idempotent: safe to run more than once.
--
-- Face: the browser computes a 128-d face-api descriptor; the server compares it with the caller's enrolled
--   samples (employee_faces) in SQL and never trusts a client-sent score.
--     distance = euclidean distance between descriptors (0 = identical, same person typically < 0.45,
--                different people typically > 0.6)
--     score    = greatest(0, 1 - min distance)  (stored in time_logs.face_score; 0.5 distance -> 0.50 score)
--     accept   when distance <= settings attendance.face_max_distance (default 0.5)
-- Network: browsers cannot read the Wi-Fi SSID, so the server matches the client IP (seen by Caddy) against
--   work_locations.allowed_ip_ranges (CIDR). Only the service role can record a network check-in.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Settings defaults (existing keys win)
-- ---------------------------------------------------------------------
update public.settings
   set value = '{"face_max_distance": 0.5, "allow_self_face_enroll": false}'::jsonb || value
 where key = 'attendance'
   and not (value ? 'face_max_distance' and value ? 'allow_self_face_enroll');

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------
-- Euclidean distance between two descriptors (null when lengths differ)
create or replace function app.face_distance(a real[], b real[]) returns double precision
language sql immutable parallel safe as $$
  select case when cardinality(a) = cardinality(b) and cardinality(a) > 0
              then sqrt(sum(power(x.v::float8 - y.v::float8, 2))) end
    from unnest(a) with ordinality as x(v, i)
    join unnest(b) with ordinality as y(v, i) on x.i = y.i
$$;

-- 128 finite numbers
create or replace function app.face_descriptor_ok(d real[]) returns boolean
language sql immutable parallel safe as $$
  select d is not null and array_ndims(d) = 1 and cardinality(d) = 128
     and not exists (select 1 from unnest(d) x where x is null or x = 'NaN'::real or x = 'Infinity'::real or x = '-Infinity'::real)
$$;

-- text -> inet, null when invalid
create or replace function app.try_inet(p text) returns inet
language plpgsql immutable parallel safe as $$
begin
  return trim(p)::inet;
exception when others then
  return null;
end $$;

-- IPv4-mapped IPv6 (::ffff:192.168.1.5) -> plain IPv4
create or replace function app.normalize_ip(p inet) returns inet
language sql immutable parallel safe as $$
  select case when family(p) = 6 and host(p) ~* '^::ffff:\d{1,3}(\.\d{1,3}){3}$'
              then substring(host(p) from 8)::inet else p end
$$;

create or replace function app.ip_ranges_valid(p text[]) returns boolean
language sql immutable parallel safe as $$
  select p is null or not exists (select 1 from unnest(p) r where app.try_inet(r) is null)
$$;

create or replace function app.ip_in_ranges(p_ip inet, p_ranges text[]) returns boolean
language sql immutable parallel safe as $$
  select p_ip is not null and exists (
    select 1 from unnest(coalesce(p_ranges, '{}')) r
     where app.try_inet(r) is not null
       and family(app.try_inet(r)) = family(app.normalize_ip(p_ip))
       and app.normalize_ip(p_ip) <<= app.try_inet(r))
$$;

revoke execute on function app.face_distance(real[], real[]), app.face_descriptor_ok(real[]), app.try_inet(text),
  app.normalize_ip(inet), app.ip_ranges_valid(text[]), app.ip_in_ranges(inet, text[]) from anon;

-- ---------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------
alter table public.work_locations add column if not exists allowed_ip_ranges text[];
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'work_locations_ip_ranges_chk') then
    alter table public.work_locations add constraint work_locations_ip_ranges_chk check (app.ip_ranges_valid(allowed_ip_ranges));
  end if;
end $$;
comment on column public.work_locations.allowed_ip_ranges is 'เครือข่ายของบริษัท (CIDR เช่น 192.168.1.0/24, 203.0.113.10/32) — ลงเวลาแบบ "Wi-Fi บริษัท" จาก IP ของเครื่อง';
grant select (allowed_ip_ranges) on public.work_locations to authenticated;

alter table public.time_logs add column if not exists client_ip inet;

alter table public.employee_faces add column if not exists created_by uuid default auth.uid();
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'employee_faces_descriptor_chk') then
    alter table public.employee_faces add constraint employee_faces_descriptor_chk check (app.face_descriptor_ok(descriptor)) not valid;
  end if;
end $$;

-- Descriptors are biometric data: nobody reads them through the API (matching happens in SQL).
revoke select on public.employee_faces from authenticated, anon;
grant select (id, employee_id, photo_url, created_at, created_by) on public.employee_faces to authenticated;
revoke update on public.employee_faces from authenticated, anon;

-- Self-enrollment from the employee app (only when settings attendance.allow_self_face_enroll = true).
-- Employees can add samples but not delete them (HR deletes) — see guard trigger below.
drop policy if exists p_self_ins on public.employee_faces;
create policy p_self_ins on public.employee_faces for insert to authenticated
  with check (employee_id = app.my_employee_id()
              and coalesce((select (value->>'allow_self_face_enroll')::boolean from public.settings where key = 'attendance'), false));

create or replace function app.employee_faces_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_cfg   jsonb := coalesce((select value from settings where key = 'attendance'), '{}'::jsonb);
  v_max   double precision := coalesce((v_cfg->>'face_max_distance')::double precision, 0.5);
  v_own   double precision;
  v_n     int;
  v_other bigint;
  v_od    double precision;
  v_hr    boolean := app.has_perm('employee', 'edit');
begin
  if not app.face_descriptor_ok(new.descriptor) then
    raise exception 'ข้อมูลใบหน้าไม่ถูกต้อง (ต้องเป็นค่า 128 มิติจากระบบสแกนใบหน้า)';
  end if;
  select count(*), min(app.face_distance(descriptor, new.descriptor)) into v_n, v_own
    from employee_faces where employee_id = new.employee_id and id is distinct from new.id;
  if v_n >= 5 then raise exception 'ลงทะเบียนใบหน้าได้สูงสุด 5 ตัวอย่างต่อคน — ลบตัวอย่างเก่าก่อน'; end if;
  if v_own is not null and v_own < 0.0001 then raise exception 'ตัวอย่างนี้ซ้ำกับที่ลงทะเบียนไว้แล้ว'; end if;

  -- the same face must not be enrolled for two employees (buddy punching)
  select f.employee_id, app.face_distance(f.descriptor, new.descriptor) into v_other, v_od
    from employee_faces f where f.employee_id <> new.employee_id
   order by app.face_distance(f.descriptor, new.descriptor) limit 1;
  if v_od is not null and v_od < 0.4 then
    if v_hr then
      raise exception 'ใบหน้านี้ใกล้เคียงกับใบหน้าของพนักงานรหัส % ที่ลงทะเบียนไว้แล้ว — ตรวจสอบว่าเลือกพนักงานถูกคน',
        (select code from employees where id = v_other);
    end if;
    raise exception 'ใบหน้านี้ตรงกับพนักงานคนอื่นที่ลงทะเบียนไว้แล้ว — ติดต่อฝ่ายบุคคล';
  end if;

  -- self-enrollment: later samples must match the ones already enrolled
  if not v_hr and v_own is not null and v_own > v_max then
    raise exception 'ใบหน้าไม่ตรงกับตัวอย่างที่ลงทะเบียนไว้ — ติดต่อฝ่ายบุคคลเพื่อลงทะเบียนใหม่';
  end if;
  return new;
end $$;
drop trigger if exists trg_face_guard on public.employee_faces;
create trigger trg_face_guard before insert or update of descriptor on public.employee_faces
  for each row execute function app.employee_faces_guard();

-- Failed face attempts (kept even though the check-in is rejected) — used for a short lock-out
create table if not exists public.face_check_failures (
  id          bigint generated always as identity primary key,
  employee_id bigint not null references public.employees(id) on delete cascade,
  distance    double precision,
  reason      text not null,
  photo_url   text,
  created_at  timestamptz not null default now()
);
create index if not exists face_check_failures_emp_idx on public.face_check_failures(employee_id, created_at);
alter table public.face_check_failures enable row level security;
drop policy if exists p_sel on public.face_check_failures;
create policy p_sel on public.face_check_failures for select to authenticated
  using (app.has_perm('attendance', 'view') and app.can_see_employee(employee_id));
revoke insert, update, delete, truncate on public.face_check_failures from authenticated, anon;

-- ---------------------------------------------------------------------
-- Check-in core (shared by check_in / check_in_face / check_in_network). Not callable by clients.
-- p_face_score must be a SERVER-computed score; p_network_location + p_client_ip only from check_in_network.
-- ---------------------------------------------------------------------
create or replace function app.check_in_core(
  p_emp        bigint,
  p_uid        uuid,
  p_method     text,
  p_latitude   double precision default null,
  p_longitude  double precision default null,
  p_accuracy   double precision default null,
  p_wifi_ssid  text default null,
  p_wifi_bssid text default null,
  p_beacon     text default null,
  p_qr_token   text default null,
  p_photo_url  text default null,
  p_face_score real default null,
  p_direction  text default 'auto',
  p_log_time   timestamptz default null,
  p_client_ref text default null,
  p_note       text default null,
  p_network_location bigint default null,
  p_client_ip  inet default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_emp     bigint := p_emp;
  v_loc     work_locations%rowtype;
  v_best    bigint;
  v_dist    double precision;
  v_ok      boolean := false;
  v_time    timestamptz := now();
  v_id      bigint;
  v_cfg     jsonb := coalesce((select value from settings where key = 'attendance'), '{}'::jsonb);
  v_allowed bigint[];
  v_parts   text[];
begin
  if v_emp is null then raise exception 'บัญชีนี้ยังไม่ผูกกับพนักงาน'; end if;
  if p_method not in ('gps','wifi','beacon','qr','face','offline') then raise exception 'วิธีลงเวลาไม่ถูกต้อง'; end if;

  if p_method = 'offline' then
    if p_log_time is null or p_log_time > now() + interval '5 minutes' or p_log_time < now() - interval '72 hours' then
      raise exception 'เวลาออฟไลน์ไม่ถูกต้อง (ต้องซิงก์ภายใน 72 ชม.)';
    end if;
    v_time := p_log_time;
  end if;

  select work_location_ids into v_allowed from employees where id = v_emp;

  if p_method = 'qr' then
    -- token format: <location_id>.<unix_minute>.<hmac>  (rotating QR from kiosk) or <location_id>.<qr_secret>
    v_parts := string_to_array(coalesce(p_qr_token,''), '.');
    if array_length(v_parts,1) = 3 then
      select * into v_loc from work_locations where id = v_parts[1]::bigint and is_active and allow_qr;
      if found and abs(extract(epoch from now())/60 - v_parts[2]::bigint) <= 2
         and app.hmac_hex(v_parts[1] || '.' || v_parts[2], v_loc.qr_secret) = v_parts[3] then
        v_ok := true;
      end if;
    elsif array_length(v_parts,1) = 2 then
      select * into v_loc from work_locations where id = v_parts[1]::bigint and is_active and allow_qr and qr_secret = v_parts[2];
      v_ok := found;
    end if;
    if not v_ok then raise exception 'QR Code ไม่ถูกต้องหรือหมดอายุ'; end if;
  elsif p_method in ('gps','offline','face') then
    if p_latitude is null or p_longitude is null then raise exception 'ไม่พบพิกัด GPS'; end if;
    select l.id, app.distance_m(p_latitude, p_longitude, l.latitude, l.longitude)
      into v_best, v_dist
      from work_locations l
     where l.is_active and l.allow_gps and l.latitude is not null
       and (v_allowed is null or cardinality(v_allowed) = 0 or l.id = any(v_allowed))
     order by app.distance_m(p_latitude, p_longitude, l.latitude, l.longitude)
     limit 1;
    if v_best is null then raise exception 'ยังไม่ได้ตั้งค่าพื้นที่ลงเวลา'; end if;
    select * into v_loc from work_locations where id = v_best;
    v_ok := v_dist <= v_loc.radius_m + least(coalesce(p_accuracy, 0), 100);
    if not v_ok and not coalesce((v_cfg->>'allow_outside_area')::boolean, false) then
      raise exception 'อยู่นอกพื้นที่ลงเวลา (ห่าง % ม. จาก %)', round(v_dist), v_loc.name;
    end if;
  elsif p_method = 'wifi' and p_network_location is not null then
    -- office network (server-derived client IP)
    select * into v_loc from work_locations l
     where l.id = p_network_location and l.is_active and l.allow_wifi
       and (v_allowed is null or cardinality(v_allowed) = 0 or l.id = any(v_allowed))
       and app.ip_in_ranges(p_client_ip, l.allowed_ip_ranges);
    v_ok := found;
    if not v_ok then raise exception 'เครือข่ายนี้ไม่ได้รับอนุญาตให้ลงเวลา (IP %)', coalesce(host(app.normalize_ip(p_client_ip)), '-'); end if;
  elsif p_method = 'wifi' then
    select * into v_loc from work_locations l
     where l.is_active and l.allow_wifi
       and (v_allowed is null or cardinality(v_allowed) = 0 or l.id = any(v_allowed))
       and ((p_wifi_bssid is not null and lower(p_wifi_bssid) = any(select lower(x) from unnest(l.wifi_bssids) x))
         or (p_wifi_ssid is not null and p_wifi_ssid = any(l.wifi_ssids)))
     limit 1;
    v_ok := found;
    if not v_ok then raise exception 'Wi-Fi นี้ไม่ได้รับอนุญาตให้ลงเวลา'; end if;
  elsif p_method = 'beacon' then
    select * into v_loc from work_locations l
     where l.is_active and l.allow_beacon and lower(p_beacon) = any(select lower(x) from unnest(l.beacon_uuids) x)
     limit 1;
    v_ok := found;
    if not v_ok then raise exception 'ไม่พบ Beacon ที่ได้รับอนุญาต'; end if;
  end if;

  if v_loc.require_photo and p_photo_url is null then raise exception 'จุดนี้ต้องถ่ายรูปประกอบการลงเวลา'; end if;
  -- require_face: only a score computed by check_in_face (server side) counts; the distance threshold
  -- (attendance.face_max_distance) was already enforced there.
  if v_loc.require_face and (p_method <> 'face' or p_face_score is null) then
    raise exception 'จุด % ต้องลงเวลาด้วยการสแกนใบหน้า', v_loc.name;
  end if;

  insert into time_logs(employee_id, log_time, direction, source, location_id, latitude, longitude, accuracy_m, distance_m,
                        wifi_ssid, photo_url, face_score, recorded_by, note, client_ref, client_ip)
  values (v_emp, v_time, coalesce(p_direction,'auto'), p_method, v_loc.id, p_latitude, p_longitude, p_accuracy, v_dist,
          p_wifi_ssid, p_photo_url, p_face_score, p_uid, p_note, p_client_ref, app.normalize_ip(p_client_ip))
  on conflict (client_ref) do nothing
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'time', v_time, 'location', v_loc.name, 'distance', round(coalesce(v_dist,0)), 'in_area', v_ok);
end $$;
revoke all on function app.check_in_core(bigint, uuid, text, double precision, double precision, double precision, text, text, text, text,
  text, real, text, timestamptz, text, text, bigint, inet) from public, anon, authenticated;

-- Public check-in keeps its signature; a client-sent face score is ignored (face goes through check_in_face).
create or replace function public.check_in(
  p_method     text,
  p_latitude   double precision default null,
  p_longitude  double precision default null,
  p_accuracy   double precision default null,
  p_wifi_ssid  text default null,
  p_wifi_bssid text default null,
  p_beacon     text default null,
  p_qr_token   text default null,
  p_photo_url  text default null,
  p_face_score real default null,
  p_direction  text default 'auto',
  p_log_time   timestamptz default null,
  p_client_ref text default null,
  p_note       text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if p_method = 'face' then raise exception 'ลงเวลาด้วยใบหน้าต้องสแกนใบหน้าในหน้าลงเวลา'; end if;
  return app.check_in_core(app.my_employee_id(), auth.uid(), p_method, p_latitude, p_longitude, p_accuracy, p_wifi_ssid, p_wifi_bssid,
    p_beacon, p_qr_token, p_photo_url, null::real, p_direction, p_log_time, p_client_ref, p_note, null::bigint, null::inet);
end $$;
revoke all on function public.check_in(text, double precision, double precision, double precision, text, text, text, text, text, real,
  text, timestamptz, text, text) from anon, public;
grant execute on function public.check_in(text, double precision, double precision, double precision, text, text, text, text, text, real,
  text, timestamptz, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- Face check-in
-- ---------------------------------------------------------------------
create or replace function public.check_in_face(
  p_descriptor real[],
  p_latitude   double precision default null,
  p_longitude  double precision default null,
  p_accuracy   double precision default null,
  p_photo_url  text default null,
  p_direction  text default 'auto',
  p_client_ref text default null,
  p_note       text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_emp   bigint := app.my_employee_id();
  v_cfg   jsonb := coalesce((select value from settings where key = 'attendance'), '{}'::jsonb);
  v_max   double precision := coalesce((v_cfg->>'face_max_distance')::double precision, 0.5);
  v_n     int;
  v_min   double precision;
  v_fails int;
  v_score real;
  v_res   jsonb;
begin
  if v_emp is null then raise exception 'บัญชีนี้ยังไม่ผูกกับพนักงาน'; end if;
  if not app.face_descriptor_ok(p_descriptor) then raise exception 'ข้อมูลใบหน้าไม่ถูกต้อง — สแกนใหม่อีกครั้ง'; end if;
  if p_photo_url is not null and p_photo_url not like 'checkins/' || auth.uid()::text || '/%' then
    raise exception 'รูปถ่ายไม่ถูกต้อง — ถ่ายใหม่อีกครั้ง';
  end if;

  select count(*) into v_fails from face_check_failures
   where employee_id = v_emp and created_at > now() - interval '15 minutes';
  if v_fails >= 5 then
    raise exception 'สแกนใบหน้าไม่ผ่านหลายครั้งเกินไป — รอ 15 นาทีแล้วลองใหม่ หรือติดต่อหัวหน้างาน';
  end if;

  select count(*), min(app.face_distance(descriptor, p_descriptor)) into v_n, v_min
    from employee_faces where employee_id = v_emp;
  if v_n = 0 then raise exception 'ยังไม่ได้ลงทะเบียนใบหน้า — ติดต่อฝ่ายบุคคลเพื่อลงทะเบียนใบหน้าก่อน'; end if;

  -- a vector identical to an enrolled sample is a replay, not a live scan; a mismatch is logged (lock-out)
  if v_min is null or v_min < 0.0001 or v_min > v_max then
    insert into face_check_failures(employee_id, distance, reason, photo_url)
    values (v_emp, v_min, case when v_min is not null and v_min < 0.0001 then 'replay' else 'mismatch' end, p_photo_url);
    return jsonb_build_object('ok', false, 'face_distance', round(v_min::numeric, 4),
      'error', case when v_min is not null and v_min < 0.0001
                    then 'ข้อมูลใบหน้าซ้ำกับตัวอย่างที่ลงทะเบียนไว้ — ต้องสแกนจากกล้องเท่านั้น'
                    else 'ใบหน้าไม่ตรงกับที่ลงทะเบียนไว้ — หันหน้าตรง อยู่ในที่สว่าง แล้วลองใหม่' end);
  end if;

  v_score := greatest(0, 1 - v_min)::real;
  v_res := app.check_in_core(v_emp, auth.uid(), 'face', p_latitude, p_longitude, p_accuracy, null, null, null, null,
                             p_photo_url, v_score, p_direction, null, p_client_ref, p_note, null, null);
  return v_res || jsonb_build_object('ok', true, 'face_distance', round(v_min::numeric, 4), 'face_score', round(v_score::numeric, 4));
end $$;
revoke all on function public.check_in_face(real[], double precision, double precision, double precision, text, text, text, text) from public, anon;
grant execute on function public.check_in_face(real[], double precision, double precision, double precision, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- Office-network check-in
-- ---------------------------------------------------------------------
-- Locations whose office network contains p_ip and that the signed-in employee may use
create or replace function public.match_network_location(p_ip inet)
returns table(id bigint, name text)
language sql stable security definer set search_path = public as $$
  select l.id, l.name
    from work_locations l, employees e
   where e.id = app.my_employee_id()
     and l.is_active and l.allow_wifi
     and (e.work_location_ids is null or cardinality(e.work_location_ids) = 0 or l.id = any(e.work_location_ids))
     and app.ip_in_ranges(p_ip, l.allowed_ip_ranges)
   order by l.name, l.id
$$;
revoke all on function public.match_network_location(inet) from public, anon;
grant execute on function public.match_network_location(inet) to authenticated;

-- Called only by the Next.js route (service role) with the IP it saw and the user from the session cookie
create or replace function public.check_in_network(
  p_user_id     uuid,
  p_ip          inet,
  p_location_id bigint,
  p_direction   text default 'auto',
  p_client_ref  text default null,
  p_note        text default null,
  p_photo_url   text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_emp bigint;
begin
  select employee_id into v_emp from profiles where id = p_user_id and is_active;
  if v_emp is null then raise exception 'บัญชีนี้ยังไม่ผูกกับพนักงาน'; end if;
  if p_photo_url is not null and p_photo_url not like 'checkins/' || p_user_id::text || '/%' then
    raise exception 'รูปถ่ายไม่ถูกต้อง — ถ่ายใหม่อีกครั้ง';
  end if;
  return app.check_in_core(v_emp, p_user_id, 'wifi', null, null, null, null, null, null, null,
                           p_photo_url, null, p_direction, null, p_client_ref, p_note, p_location_id, p_ip);
end $$;
revoke all on function public.check_in_network(uuid, inet, bigint, text, text, text, text) from public, anon, authenticated;
grant execute on function public.check_in_network(uuid, inet, bigint, text, text, text, text) to service_role;
