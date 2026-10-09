-- พื้นที่ลงเวลาตามหน่วยงาน
-- Each org unit can define its own check-in area policy; child units inherit from their parent.
--   checkin_mode = 'inherit'   → use the parent's policy (top level: every active location)
--   checkin_mode = 'locations' → only the locations in work_location_ids
--   checkin_mode = 'anywhere'  → no area check at all (e.g. sales): GPS check-in is recorded with the coordinates,
--                                 no location / radius is required
-- An employee's own work_location_ids (per-person override) still wins over the unit policy.

alter table public.org_units
  add column if not exists checkin_mode text not null default 'inherit',
  add column if not exists work_location_ids bigint[];
alter table public.org_units drop constraint if exists org_units_checkin_mode_chk;
alter table public.org_units add constraint org_units_checkin_mode_chk check (checkin_mode in ('inherit', 'locations', 'anywhere'));

-- ---------------------------------------------------------------------
-- Effective policy for one employee: mode in ('all','locations','anywhere'); location_ids only for 'locations'
-- ---------------------------------------------------------------------
create or replace function app.checkin_policy(p_emp bigint)
returns table(mode text, location_ids bigint[], source text)
language plpgsql stable security definer set search_path = public as $$
declare
  v_emp_ids bigint[];
  v_unit    bigint;
  v_row     record;
begin
  select e.work_location_ids, e.org_unit_id into v_emp_ids, v_unit from employees e where e.id = p_emp;
  if v_emp_ids is not null and cardinality(v_emp_ids) > 0 then
    return query select 'locations'::text, v_emp_ids, 'employee'::text;
    return;
  end if;
  -- walk up the org tree (max 10 levels) and take the first unit that sets a policy
  for v_row in
    with recursive chain as (
      select u.id, u.parent_id, u.checkin_mode, u.work_location_ids, 1 as depth from org_units u where u.id = v_unit
      union all
      select u.id, u.parent_id, u.checkin_mode, u.work_location_ids, c.depth + 1
        from org_units u join chain c on u.id = c.parent_id where c.depth < 10
    )
    select c.id, c.checkin_mode, c.work_location_ids from chain c where c.checkin_mode <> 'inherit' order by c.depth limit 1
  loop
    if v_row.checkin_mode = 'anywhere' then
      return query select 'anywhere'::text, null::bigint[], ('org_unit:' || v_row.id)::text;
    elsif v_row.work_location_ids is not null and cardinality(v_row.work_location_ids) > 0 then
      return query select 'locations'::text, v_row.work_location_ids, ('org_unit:' || v_row.id)::text;
    else
      return query select 'all'::text, null::bigint[], ('org_unit:' || v_row.id)::text;
    end if;
    return;
  end loop;
  return query select 'all'::text, null::bigint[], 'default'::text;
end $$;
revoke all on function app.checkin_policy(bigint) from public, anon, authenticated;

-- The signed-in employee's own policy (used by the mobile check-in screen)
create or replace function public.my_checkin_policy()
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select jsonb_build_object('mode', p.mode, 'location_ids', to_jsonb(coalesce(p.location_ids, '{}'::bigint[])), 'source', p.source)
       from app.checkin_policy(app.my_employee_id()) p),
    jsonb_build_object('mode', 'all', 'location_ids', '[]'::jsonb, 'source', 'default'));
$$;
revoke all on function public.my_checkin_policy() from public, anon;
grant execute on function public.my_checkin_policy() to authenticated;

-- ---------------------------------------------------------------------
-- Office-network matcher: respect the unit policy
-- ---------------------------------------------------------------------
create or replace function public.match_network_location(p_ip inet)
returns table(id bigint, name text)
language sql stable security definer set search_path = public as $$
  select l.id, l.name
    from work_locations l, app.checkin_policy(app.my_employee_id()) p
   where l.is_active and l.allow_wifi
     and (p.mode <> 'locations' or l.id = any(p.location_ids))
     and app.ip_in_ranges(p_ip, l.allowed_ip_ranges)
   order by l.name, l.id
$$;

-- ---------------------------------------------------------------------
-- Core check-in: same as 20261008100000_face_network.sql, with the unit policy and the 'anywhere' mode
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
  v_mode    text := 'all';
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

  select p.mode, p.location_ids into v_mode, v_allowed from app.checkin_policy(v_emp) p;
  if v_mode <> 'locations' then v_allowed := null; end if;

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
    if v_mode = 'anywhere' then
      -- no area for this unit (e.g. sales): record the position, no location / radius check
      v_ok := true;
    else
      select l.id, app.distance_m(p_latitude, p_longitude, l.latitude, l.longitude)
        into v_best, v_dist
        from work_locations l
       where l.is_active and l.allow_gps and l.latitude is not null
         and (v_allowed is null or l.id = any(v_allowed))
       order by app.distance_m(p_latitude, p_longitude, l.latitude, l.longitude)
       limit 1;
      if v_best is null then raise exception 'ยังไม่ได้ตั้งค่าพื้นที่ลงเวลา'; end if;
      select * into v_loc from work_locations where id = v_best;
      v_ok := v_dist <= v_loc.radius_m + least(coalesce(p_accuracy, 0), 100);
      if not v_ok and not coalesce((v_cfg->>'allow_outside_area')::boolean, false) then
        raise exception 'อยู่นอกพื้นที่ลงเวลา (ห่าง % ม. จาก %)', round(v_dist), v_loc.name;
      end if;
    end if;
  elsif p_method = 'wifi' and p_network_location is not null then
    -- office network (server-derived client IP)
    select * into v_loc from work_locations l
     where l.id = p_network_location and l.is_active and l.allow_wifi
       and (v_allowed is null or l.id = any(v_allowed))
       and app.ip_in_ranges(p_client_ip, l.allowed_ip_ranges);
    v_ok := found;
    if not v_ok then raise exception 'เครือข่ายนี้ไม่ได้รับอนุญาตให้ลงเวลา (IP %)', coalesce(host(app.normalize_ip(p_client_ip)), '-'); end if;
  elsif p_method = 'wifi' then
    select * into v_loc from work_locations l
     where l.is_active and l.allow_wifi
       and (v_allowed is null or l.id = any(v_allowed))
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

  if coalesce(v_loc.require_photo, false) and p_photo_url is null then raise exception 'จุดนี้ต้องถ่ายรูปประกอบการลงเวลา'; end if;
  -- require_face: only a score computed by check_in_face (server side) counts; the distance threshold
  -- (attendance.face_max_distance) was already enforced there.
  if coalesce(v_loc.require_face, false) and (p_method <> 'face' or p_face_score is null) then
    raise exception 'จุด % ต้องลงเวลาด้วยการสแกนใบหน้า', v_loc.name;
  end if;

  insert into time_logs(employee_id, log_time, direction, source, location_id, latitude, longitude, accuracy_m, distance_m,
                        wifi_ssid, photo_url, face_score, recorded_by, note, client_ref, client_ip)
  values (v_emp, v_time, coalesce(p_direction,'auto'), p_method, v_loc.id, p_latitude, p_longitude, p_accuracy, v_dist,
          p_wifi_ssid, p_photo_url, p_face_score, p_uid, p_note, p_client_ref, app.normalize_ip(p_client_ip))
  on conflict (client_ref) do nothing
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'time', v_time, 'location', v_loc.name, 'distance', case when v_dist is null then null else round(v_dist) end,
                            'in_area', v_ok, 'anywhere', v_mode = 'anywhere');
end $$;
revoke all on function app.check_in_core(bigint, uuid, text, double precision, double precision, double precision, text, text, text, text,
  text, real, text, timestamptz, text, text, bigint, inet) from public, anon, authenticated;
