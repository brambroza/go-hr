-- =====================================================================
-- GO HR — Employee self-service (/m) helper RPCs
-- Idempotent: safe to run more than once.
-- =====================================================================

-- Today for the signed-in employee: shift, day type, scans, leave and a simple late/on-time status.
create or replace function public.my_today(p_date date default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_emp    bigint := app.my_employee_id();
  v_date   date := coalesce(p_date, (now() at time zone 'Asia/Bangkok')::date);
  v_day    record;
  v_shift  shifts%rowtype;
  v_hol    text;
  v_first  timestamptz;
  v_start  timestamptz;
  v_late   int := 0;
  v_scans  jsonb;
  v_leave  jsonb;
  v_exempt boolean;
  v_lo     timestamptz;
  v_hi     timestamptz;
begin
  if v_emp is null then return null; end if;
  select * into v_day from app.employee_day(v_emp, v_date);
  if v_day.shift_id is not null then select * into v_shift from shifts where id = v_day.shift_id; end if;
  select attendance_exempt into v_exempt from employees where id = v_emp;

  select h.name into v_hol from holidays h, employees e
   where e.id = v_emp and h.holiday_date = v_date
     and (h.branch_id is null or h.branch_id = e.branch_id)
     and (h.org_unit_id is null or h.org_unit_id = e.org_unit_id)
     and (h.employee_ids is null or cardinality(h.employee_ids) = 0 or v_emp = any(h.employee_ids))
   limit 1;

  -- scan window: calendar day, extended into the next morning for overnight shifts
  v_lo := (v_date::timestamp) at time zone 'Asia/Bangkok';
  v_hi := ((v_date + 1)::timestamp) at time zone 'Asia/Bangkok';
  if v_shift.id is not null and v_shift.is_overnight then
    v_hi := v_hi + make_interval(mins => extract(hour from v_shift.end_time)::int * 60 + extract(minute from v_shift.end_time)::int + 240);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'log_time', t.log_time, 'direction', t.direction, 'source', t.source,
            'location', l.name, 'distance', round(t.distance_m)) order by t.log_time), '[]'::jsonb),
         min(t.log_time)
    into v_scans, v_first
    from time_logs t left join work_locations l on l.id = t.location_id
   where t.employee_id = v_emp and not t.is_void and t.log_time >= v_lo and t.log_time < v_hi;

  if v_shift.id is not null and v_day.day_type in ('work','special') and v_first is not null then
    v_start := (v_date + v_shift.start_time) at time zone 'Asia/Bangkok';
    if v_first > v_start + make_interval(mins => coalesce(v_shift.late_grace_min, 0)) then
      v_late := ceil(extract(epoch from (v_first - v_start)) / 60);
    end if;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'doc_no', r.doc_no, 'status', r.status, 'unit', coalesce(r.payload->>'unit','full'),
            'leave_type', lt.name, 'color', lt.color, 'start_date', r.start_date, 'end_date', r.end_date)), '[]'::jsonb)
    into v_leave
    from requests r left join leave_types lt on lt.id = (r.payload->>'leave_type_id')::bigint
   where r.employee_id = v_emp and r.request_type = 'leave' and r.status in ('pending','approved')
     and v_date between r.start_date and coalesce(r.end_date, r.start_date);

  return jsonb_build_object(
    'date', v_date,
    'employee_id', v_emp,
    'day_type', coalesce(v_day.day_type, 'work'),
    'holiday', v_hol,
    'attendance_exempt', coalesce(v_exempt, false),
    'shift', case when v_shift.id is null then null else jsonb_build_object(
        'id', v_shift.id, 'code', v_shift.code, 'name', v_shift.name, 'color', v_shift.color,
        'start_time', to_char(v_shift.start_time, 'HH24:MI'), 'end_time', to_char(v_shift.end_time, 'HH24:MI'),
        'break_start', to_char(v_shift.break_start, 'HH24:MI'), 'break_end', to_char(v_shift.break_end, 'HH24:MI'),
        'is_overnight', v_shift.is_overnight, 'late_grace_min', v_shift.late_grace_min) end,
    'scans', v_scans,
    'first_scan', v_first,
    'late_minutes', v_late,
    'leave', v_leave);
end $$;
revoke all on function public.my_today(date) from anon, public;
grant execute on function public.my_today(date) to authenticated;

-- My schedule for a date range (calendar): resolved shift + day type + holiday name per day.
create or replace function public.my_days(p_from date, p_to date)
returns table(work_date date, shift_id bigint, day_type text, holiday text, is_override boolean)
language plpgsql stable security definer set search_path = public as $$
declare
  v_emp bigint := app.my_employee_id();
  d date;
  r record;
  e employees%rowtype;
begin
  if v_emp is null or p_from is null or p_to is null or p_to < p_from or p_to - p_from > 62 then return; end if;
  select * into e from employees where id = v_emp;
  d := p_from;
  while d <= p_to loop
    select * into r from app.employee_day(v_emp, d);
    work_date := d;
    shift_id := r.shift_id;
    day_type := r.day_type;
    select h.name into holiday from holidays h
     where h.holiday_date = d
       and (h.branch_id is null or h.branch_id = e.branch_id)
       and (h.org_unit_id is null or h.org_unit_id = e.org_unit_id)
       and (h.employee_ids is null or cardinality(h.employee_ids) = 0 or v_emp = any(h.employee_ids))
     limit 1;
    if not found then holiday := null; end if;
    is_override := exists (select 1 from work_schedules ws where ws.employee_id = v_emp and ws.work_date = d);
    return next;
    d := d + 1;
  end loop;
end $$;
revoke all on function public.my_days(date, date) from anon, public;
grant execute on function public.my_days(date, date) to authenticated;

-- Team status today for supervisors (direct + indirect subordinates).
create or replace function public.my_team_today()
returns table(employee_id bigint, code text, first_name text, last_name text, nickname text, photo_url text,
              position_name text, supervisor_id bigint, shift_code text, shift_color text, shift_start text, shift_end text,
              day_type text, scans int, first_in timestamptz, last_scan timestamptz, late_minutes int, leave_type text,
              attendance_exempt boolean)
language plpgsql stable security definer set search_path = public as $$
declare
  v_me   bigint := app.my_employee_id();
  v_date date := (now() at time zone 'Asia/Bangkok')::date;
  v_lo   timestamptz := (v_date::timestamp) at time zone 'Asia/Bangkok';
  v_hi   timestamptz := ((v_date + 1)::timestamp) at time zone 'Asia/Bangkok';
begin
  if v_me is null then return; end if;
  return query
  select e.id, e.code, e.first_name, e.last_name, e.nickname, e.photo_url, p.name, e.supervisor_id,
         s.code, s.color, to_char(s.start_time, 'HH24:MI'), to_char(s.end_time, 'HH24:MI'),
         d.day_type, coalesce(t.n, 0)::int, t.first_in, t.last_scan,
         case when s.id is not null and d.day_type in ('work','special') and t.first_in is not null
                   and t.first_in > ((v_date + s.start_time) at time zone 'Asia/Bangkok') + make_interval(mins => coalesce(s.late_grace_min, 0))
              then ceil(extract(epoch from (t.first_in - ((v_date + s.start_time) at time zone 'Asia/Bangkok'))) / 60)::int
              else 0 end,
         lv.name, e.attendance_exempt
    from employees e
    left join positions p on p.id = e.position_id
    cross join lateral app.employee_day(e.id, v_date) d
    left join shifts s on s.id = d.shift_id
    left join lateral (
      select count(*) as n, min(x.log_time) as first_in, max(x.log_time) as last_scan
        from time_logs x where x.employee_id = e.id and not x.is_void and x.log_time >= v_lo and x.log_time < v_hi
    ) t on true
    left join lateral (
      select lt.name from requests r join leave_types lt on lt.id = (r.payload->>'leave_type_id')::bigint
       where r.employee_id = e.id and r.request_type = 'leave' and r.status = 'approved'
         and v_date between r.start_date and coalesce(r.end_date, r.start_date)
       limit 1
    ) lv on true
   where e.id in (select app.subordinate_ids(v_me)) and e.status <> 'resigned'
   order by (e.supervisor_id = v_me) desc, e.code;
end $$;
revoke all on function public.my_team_today() from anon, public;
grant execute on function public.my_team_today() to authenticated;

-- Pending counters for the home screen badge.
create or replace function public.my_pending_counts()
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'my_pending', (select count(*) from requests r where r.employee_id = app.my_employee_id() and r.status = 'pending'),
    'to_approve', (select count(*) from request_approvals a where app.can_act_approval(a)
                     and (a.approver_user_id = auth.uid()
                          or a.approver_role_code in (select g.code from profiles p join role_groups g on g.id = p.role_group_id where p.id = auth.uid()))))
$$;
revoke all on function public.my_pending_counts() from anon, public;
grant execute on function public.my_pending_counts() to authenticated;
