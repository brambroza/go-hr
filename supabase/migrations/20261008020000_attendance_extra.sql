-- =====================================================================
-- GO HR — Time & Attendance extras (indexes for bulk recalculation / roster / logs)
-- idempotent
-- =====================================================================

-- recalcAttendance(onlyDirty) & cron: find rows marked dirty by app.apply_request / revert_request
create index if not exists attendance_days_dirty_idx on public.attendance_days (work_date) where status = 'dirty';

-- raw log list by date range (all employees) & device idempotency lookups
create index if not exists time_logs_log_time_idx on public.time_logs (log_time);
create index if not exists time_logs_device_idx on public.time_logs (device_id, log_time) where device_id is not null;

-- roster grid / recalculation: schedules by date range
create index if not exists work_schedules_date_idx on public.work_schedules (work_date);

-- approved leave / OT requests overlapping a date range
create index if not exists requests_type_status_dates_idx on public.requests (request_type, status, start_date, end_date);

-- special workdays by date; manpower plans by shift
create index if not exists special_workdays_date_idx on public.special_workdays (work_date);
create index if not exists manpower_plans_shift_idx on public.manpower_plans (shift_id);

-- device api keys are looked up on every push
create unique index if not exists time_devices_api_key_idx on public.time_devices (api_key);

-- device user ids are looked up per device on every push
create index if not exists device_user_maps_device_idx on public.device_user_maps (device_id, device_user_id);

-- ---------------------------------------------------------------------
-- Secrets: the column-level REVOKE in 20261007000003 has no effect while the table-level SELECT grant exists
-- (Postgres checks table privilege first). Replace the table grant with column grants so qr_secret / api_key
-- are readable only through server actions (service role). Clients must select explicit columns, not "*".
-- ---------------------------------------------------------------------
revoke select on public.work_locations from authenticated, anon;
grant select (id, name, branch_id, latitude, longitude, radius_m, wifi_ssids, wifi_bssids, beacon_uuids,
              allow_gps, allow_wifi, allow_beacon, allow_qr, require_photo, require_face, is_active, created_at, updated_at)
  on public.work_locations to authenticated;

revoke select on public.time_devices from authenticated, anon;
grant select (id, name, device_type, brand, serial_no, ip_address, branch_id, location_id, last_seen_at, is_active, created_at, updated_at)
  on public.time_devices to authenticated;
revoke update (api_key) on public.time_devices from authenticated, anon;
