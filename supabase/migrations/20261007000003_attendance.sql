-- =====================================================================
-- GO HR — Time & Attendance
-- =====================================================================

-- กะการทำงาน
create table public.shifts (
  id                 bigint generated always as identity primary key,
  code               text not null unique,
  name               text not null,
  start_time         time not null,
  end_time           time not null,
  is_overnight       boolean not null default false,       -- เลิกงานวันถัดไป
  break_start        time,
  break_end          time,
  break_minutes      int not null default 60,
  work_minutes       int not null default 480,
  -- ช่วงเวลาที่ยอมรับการสแกน
  scan_in_before_min  int not null default 180,
  scan_out_after_min  int not null default 480,
  -- เกณฑ์
  late_grace_min      int not null default 0,              -- สายได้ไม่เกิน x นาทีไม่นับสาย
  early_grace_min     int not null default 0,
  break_over_grace_min int not null default 0,
  ot_before_min       int not null default 0,              -- OT ก่อนเข้างาน ต้องเกิน x นาที
  ot_after_start_min  int not null default 30,             -- OT หลังเลิกงาน นับหลังเลิกงาน x นาที
  ot_min_minutes      int not null default 30,             -- OT ขั้นต่ำ
  ot_round_minutes    int not null default 15,             -- ปัดเศษ OT ลงทีละ x นาที
  late_round_minutes  int not null default 1,
  require_ot_request  boolean not null default true,       -- OT ต้องมีใบขอ OT อนุมัติ
  color              text default '#10b981',
  is_active          boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
alter table public.employees add constraint employees_default_shift_fk foreign key (default_shift_id) references public.shifts(id);

-- วันหยุดประจำปี (null branch = ทุกสาขา)
create table public.holidays (
  id          bigint generated always as identity primary key,
  holiday_date date not null,
  name        text not null,
  branch_id   bigint references public.branches(id),
  holiday_type text not null default 'public' check (holiday_type in ('public','company','special')),
  is_paid     boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index on public.holidays(holiday_date);

-- วันทำงานพิเศษ (วันหยุดที่ต้องทำงาน / ทำงานชดเชย)
create table public.special_workdays (
  id          bigint generated always as identity primary key,
  work_date   date not null,
  name        text not null,
  branch_id   bigint references public.branches(id),
  org_unit_id bigint references public.org_units(id),
  shift_id    bigint references public.shifts(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ตารางกะ/วันหยุดรายบุคคล (override จาก default shift + weekly off)
create table public.work_schedules (
  id           bigint generated always as identity primary key,
  employee_id  bigint not null references public.employees(id) on delete cascade,
  work_date    date not null,
  shift_id     bigint references public.shifts(id),
  is_day_off   boolean not null default false,
  source       text not null default 'hr' check (source in ('hr','self','request','import','template')),
  note         text,
  created_by   uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (employee_id, work_date)
);

-- ผังกำลังพล (จำนวนคนที่ต้องการต่อกะ)
create table public.manpower_plans (
  id             bigint generated always as identity primary key,
  org_unit_id    bigint references public.org_units(id),
  branch_id      bigint references public.branches(id),
  position_id    bigint references public.positions(id),
  shift_id       bigint not null references public.shifts(id),
  weekday        int check (weekday between 0 and 6),      -- null = ทุกวัน
  plan_date      date,                                     -- เฉพาะวัน (override)
  required_count int not null default 1,
  note           text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- พื้นที่การทำงาน (GPS / Wi-Fi / Beacon / QR)
create table public.work_locations (
  id           bigint generated always as identity primary key,
  name         text not null,
  branch_id    bigint references public.branches(id),
  latitude     double precision,
  longitude    double precision,
  radius_m     int not null default 150,
  wifi_ssids   text[],
  wifi_bssids  text[],
  beacon_uuids text[],
  qr_secret    text not null default app.rand_hex(16),
  allow_gps    boolean not null default true,
  allow_wifi   boolean not null default true,
  allow_beacon boolean not null default false,
  allow_qr     boolean not null default true,
  require_photo boolean not null default false,
  require_face boolean not null default false,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- อุปกรณ์ลงเวลา (เครื่องสแกนนิ้ว / Kiosk / Face terminal)
create table public.time_devices (
  id           bigint generated always as identity primary key,
  name         text not null,
  device_type  text not null check (device_type in ('fingerprint','face','kiosk','card','beacon')),
  brand        text,
  serial_no    text,
  ip_address   text,
  branch_id    bigint references public.branches(id),
  location_id  bigint references public.work_locations(id),
  api_key      text not null default app.rand_hex(24),
  last_seen_at timestamptz,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- รหัสพนักงานบนเครื่องสแกน (กรณีไม่ตรงกับรหัสพนักงาน)
create table public.device_user_maps (
  device_user_id text not null,
  employee_id    bigint not null references public.employees(id) on delete cascade,
  device_id      bigint references public.time_devices(id) on delete cascade,
  primary key (device_user_id, employee_id)
);

-- บันทึกเวลา (raw)
create table public.time_logs (
  id           bigint generated always as identity primary key,
  employee_id  bigint not null references public.employees(id) on delete cascade,
  log_time     timestamptz not null,
  direction    text not null default 'auto' check (direction in ('in','out','break_out','break_in','auto')),
  source       text not null check (source in ('fingerprint','gps','wifi','beacon','face','kiosk','qr','offline','import','manual','team','line')),
  location_id  bigint references public.work_locations(id),
  device_id    bigint references public.time_devices(id),
  latitude     double precision,
  longitude    double precision,
  accuracy_m   double precision,
  distance_m   double precision,
  wifi_ssid    text,
  photo_url    text,
  face_score   real,
  recorded_by  uuid,
  note         text,
  is_void      boolean not null default false,
  void_reason  text,
  client_ref   text unique,          -- idempotency for offline sync
  created_at   timestamptz not null default now()
);
create index on public.time_logs(employee_id, log_time);

-- ผลการคำนวณเวลารายวัน
create table public.attendance_days (
  id               bigint generated always as identity primary key,
  employee_id      bigint not null references public.employees(id) on delete cascade,
  work_date        date not null,
  shift_id         bigint references public.shifts(id),
  day_type         text not null default 'work' check (day_type in ('work','off','holiday','special')),
  sched_in         timestamptz,
  sched_out        timestamptz,
  actual_in        timestamptz,
  actual_out       timestamptz,
  break_out        timestamptz,
  break_in         timestamptz,
  work_minutes     int not null default 0,
  late_minutes     int not null default 0,
  early_minutes    int not null default 0,
  break_over_minutes int not null default 0,
  early_in_minutes int not null default 0,       -- มาเช้า
  late_out_minutes int not null default 0,       -- กลับช้า
  ot_before_minutes int not null default 0,
  ot_after_minutes  int not null default 0,
  ot_holiday_minutes int not null default 0,     -- ทำงานในวันหยุด
  ot_approved_minutes jsonb not null default '{}'::jsonb,   -- {"1.5":120,"1":480,"3":60}
  absent           boolean not null default false,
  missing_scan     boolean not null default false,
  leave_minutes    int not null default 0,
  leave_type_ids   bigint[],
  status           text not null default 'calculated',
  is_locked        boolean not null default false,   -- ปิดงวดแล้ว
  note             text,
  calculated_at    timestamptz not null default now(),
  unique (employee_id, work_date)
);
create index on public.attendance_days(work_date);

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
select app.std_policies('public.shifts', 'attendance', 'master');
select app.std_policies('public.holidays', 'attendance', 'master');
select app.std_policies('public.special_workdays', 'attendance', 'master');
select app.std_policies('public.manpower_plans', 'attendance', 'master');
select app.std_policies('public.work_locations', 'attendance', 'master');
select app.std_policies('public.time_devices', 'attendance', 'restrict');
select app.std_policies('public.device_user_maps', 'attendance', 'restrict');

-- api_key / qr_secret must not leak to ordinary employees
revoke select (qr_secret) on public.work_locations from authenticated;
grant select (id, name, branch_id, latitude, longitude, radius_m, wifi_ssids, wifi_bssids, beacon_uuids,
              allow_gps, allow_wifi, allow_beacon, allow_qr, require_photo, require_face, is_active, created_at, updated_at)
  on public.work_locations to authenticated;

alter table public.work_schedules enable row level security;
create policy p_sel on public.work_schedules for select to authenticated using (app.can_see_employee(employee_id));
create policy p_hr on public.work_schedules for all to authenticated
  using (app.has_perm('attendance','edit') and app.can_see_employee(employee_id))
  with check (app.has_perm('attendance','edit'));
-- วางแผนกะของตนเอง (ถ้าเปิดให้)
create policy p_self on public.work_schedules for all to authenticated
  using (employee_id = app.my_employee_id() and source = 'self'
         and coalesce((select (value->>'allow_self_schedule')::boolean from settings where key = 'attendance'), false))
  with check (employee_id = app.my_employee_id() and source = 'self'
         and coalesce((select (value->>'allow_self_schedule')::boolean from settings where key = 'attendance'), false));

alter table public.time_logs enable row level security;
create policy p_sel on public.time_logs for select to authenticated using (app.can_see_employee(employee_id));
create policy p_hr on public.time_logs for all to authenticated
  using (app.has_perm('attendance','edit')) with check (app.has_perm('attendance','edit'));
-- employee inserts go through app.check_in() (security definer) so geo-fence is enforced server side

alter table public.attendance_days enable row level security;
create policy p_sel on public.attendance_days for select to authenticated using (app.can_see_employee(employee_id));
create policy p_hr on public.attendance_days for all to authenticated
  using (app.has_perm('attendance','edit')) with check (app.has_perm('attendance','edit'));

do $$
declare t text;
begin
  foreach t in array array['shifts','holidays','special_workdays','work_schedules','manpower_plans','work_locations','time_devices'] loop
    execute format('create trigger trg_touch before update on public.%I for each row execute function app.touch_updated_at()', t);
    perform app.enable_audit(('public.' || t)::regclass);
  end loop;
  perform app.enable_audit('public.time_logs');
end $$;

-- ---------------------------------------------------------------------
-- Geo helpers & server-side check-in
-- ---------------------------------------------------------------------
create or replace function app.distance_m(lat1 double precision, lon1 double precision, lat2 double precision, lon2 double precision)
returns double precision language sql immutable as $$
  select 2 * 6371000 * asin(sqrt(
           power(sin(radians(lat2 - lat1) / 2), 2) +
           cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lon2 - lon1) / 2), 2)))
$$;

-- check-in by the signed-in employee (mobile / LINE / PWA)
create or replace function public.check_in(
  p_method     text,                      -- gps / wifi / beacon / qr / face / offline
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
  p_log_time   timestamptz default null,   -- offline sync only
  p_client_ref text default null,
  p_note       text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_emp     bigint := app.my_employee_id();
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
  if v_loc.require_face and coalesce(p_face_score, 0) < coalesce((v_cfg->>'face_threshold')::real, 0.55) then
    raise exception 'ยืนยันใบหน้าไม่ผ่าน';
  end if;

  insert into time_logs(employee_id, log_time, direction, source, location_id, latitude, longitude, accuracy_m, distance_m,
                        wifi_ssid, photo_url, face_score, recorded_by, note, client_ref)
  values (v_emp, v_time, coalesce(p_direction,'auto'), p_method, v_loc.id, p_latitude, p_longitude, p_accuracy, v_dist,
          p_wifi_ssid, p_photo_url, p_face_score, auth.uid(), p_note, p_client_ref)
  on conflict (client_ref) do nothing
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'time', v_time, 'location', v_loc.name, 'distance', round(coalesce(v_dist,0)), 'in_area', v_ok);
end $$;
revoke all on function public.check_in from anon;

-- หัวหน้าสแกนลงเวลาแทนลูกทีม (สแกนลูกทีม)
create or replace function public.team_check_in(p_employee_id bigint, p_latitude double precision default null,
  p_longitude double precision default null, p_photo_url text default null, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  if not (app.is_manager_of(p_employee_id) or app.has_perm('attendance','edit')) then
    raise exception 'ไม่มีสิทธิ์ลงเวลาแทนพนักงานคนนี้';
  end if;
  insert into time_logs(employee_id, log_time, source, latitude, longitude, photo_url, recorded_by, note)
  values (p_employee_id, now(), 'team', p_latitude, p_longitude, p_photo_url, auth.uid(), p_note)
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'time', now());
end $$;
revoke all on function public.team_check_in from anon;

-- Rotating QR for kiosk screens (needs attendance view perm or device key handled by API)
create or replace function public.kiosk_qr_token(p_location_id bigint) returns text
language plpgsql security definer set search_path = public as $$
declare v_secret text; v_min bigint := floor(extract(epoch from now()) / 60);
begin
  if not app.has_perm('attendance','view') then raise exception 'forbidden'; end if;
  select qr_secret into v_secret from work_locations where id = p_location_id and is_active;
  if v_secret is null then raise exception 'ไม่พบจุดลงเวลา'; end if;
  return p_location_id || '.' || v_min || '.' || app.hmac_hex(p_location_id || '.' || v_min, v_secret);
end $$;
revoke all on function public.kiosk_qr_token from anon;
