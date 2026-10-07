-- =====================================================================
-- GO HR — Leave, Requests (เอกสาร) & multi-step approval
-- =====================================================================

-- วันหยุดพิเศษเฉพาะบุคคล/หน่วยงาน
alter table public.holidays add column org_unit_id bigint references public.org_units(id);
alter table public.holidays add column employee_ids bigint[];

-- ---------------------------------------------------------------------
-- Schedule resolution: what kind of day is p_date for employee p_emp?
-- ---------------------------------------------------------------------
create or replace function app.employee_day(p_emp bigint, p_date date)
returns table(shift_id bigint, day_type text)
language plpgsql stable security definer set search_path = public as $$
declare
  e employees%rowtype;
  s work_schedules%rowtype;
  v_hol boolean;
  v_sp  special_workdays%rowtype;
begin
  select * into e from employees where id = p_emp;
  if not found then return; end if;

  select * into s from work_schedules ws where ws.employee_id = p_emp and ws.work_date = p_date;

  select exists (
    select 1 from holidays h
     where h.holiday_date = p_date
       and (h.branch_id is null or h.branch_id = e.branch_id)
       and (h.org_unit_id is null or h.org_unit_id = e.org_unit_id)
       and (h.employee_ids is null or cardinality(h.employee_ids) = 0 or p_emp = any(h.employee_ids))
  ) into v_hol;

  if s.id is not null then
    if s.is_day_off then
      shift_id := coalesce(s.shift_id, e.default_shift_id); day_type := 'off';
    else
      shift_id := coalesce(s.shift_id, e.default_shift_id);
      day_type := case when v_hol then 'holiday' else 'work' end;   -- scheduled on a holiday = holiday work
    end if;
    return next; return;
  end if;

  select * into v_sp from special_workdays w
   where w.work_date = p_date
     and (w.branch_id is null or w.branch_id = e.branch_id)
     and (w.org_unit_id is null or w.org_unit_id = e.org_unit_id)
   limit 1;
  if v_sp.id is not null then
    shift_id := coalesce(v_sp.shift_id, e.default_shift_id); day_type := 'special';
    return next; return;
  end if;

  shift_id := e.default_shift_id;
  if v_hol then
    day_type := 'holiday';
  elsif extract(dow from p_date)::int = any(e.weekly_off_days) then
    day_type := 'off';
  else
    day_type := 'work';
  end if;
  return next;
end $$;

-- ---------------------------------------------------------------------
-- Leave types & quotas
-- ---------------------------------------------------------------------
create table public.leave_types (
  id                    bigint generated always as identity primary key,
  code                  text not null unique,
  name                  text not null,
  name_en               text,
  is_paid               boolean not null default true,
  default_quota_days    numeric(6,2) not null default 0,     -- 0 = ไม่จำกัด (ถ้า unlimited)
  is_unlimited          boolean not null default false,
  allow_full_day        boolean not null default true,
  allow_half_day        boolean not null default true,
  allow_hourly          boolean not null default false,
  min_notice_days       int not null default 0,              -- ต้องยื่นล่วงหน้า
  allow_backdate_days   int not null default 30,
  attachment_over_days  numeric(6,2),                        -- ต้องแนบเอกสารเมื่อลาเกิน x วัน
  max_per_request_days  numeric(6,2),
  count_non_workdays    boolean not null default false,      -- นับวันหยุดด้วย (เช่น ลาคลอด)
  carry_over_max_days   numeric(6,2) not null default 0,
  min_service_months    int not null default 0,
  prorate_first_year    boolean not null default false,
  gender                text check (gender in ('M','F')),
  allow_probation       boolean not null default true,
  paid_days_limit       numeric(6,2),                        -- จ่ายค่าจ้างไม่เกิน x วัน/ปี (เช่น ลาป่วย 30 วัน, ลาคลอด 60 วัน)
  pay_rate_percent      numeric(5,2) not null default 100,   -- อัตราค่าจ้างระหว่างลา (เช่น ลาดูแลบุตรต่อจากลาคลอด 50%)
  description           text,
  color                 text default '#3b82f6',
  sort_order            int not null default 0,
  is_active             boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create table public.leave_quotas (
  id             bigint generated always as identity primary key,
  employee_id    bigint not null references public.employees(id) on delete cascade,
  leave_year     int not null,
  leave_type_id  bigint not null references public.leave_types(id),
  quota_days     numeric(6,2) not null default 0,
  carried_days   numeric(6,2) not null default 0,
  adjust_days    numeric(6,2) not null default 0,
  note           text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (employee_id, leave_year, leave_type_id)
);

-- ---------------------------------------------------------------------
-- Request types & approval flows
-- ---------------------------------------------------------------------
create table public.request_types (
  code          text primary key,
  name          text not null,
  name_en       text,
  category      text not null default 'time',        -- time / money / document / hr
  icon          text,
  is_active     boolean not null default true,
  self_service  boolean not null default true,       -- พนักงานยื่นเองได้
  needs_attachment boolean not null default false,
  sort_order    int not null default 0,
  description   text
);

-- steps: [{"type":"supervisor","level":1} | {"type":"org_manager"} | {"type":"user","user_id":"uuid"} | {"type":"role","role_code":"HR"}]
create table public.approval_flows (
  id               bigint generated always as identity primary key,
  name             text not null,
  request_type     text references public.request_types(code),   -- null = ทุกประเภท
  org_unit_id      bigint references public.org_units(id),        -- null = ทุกหน่วยงาน
  branch_id        bigint references public.branches(id),
  priority         int not null default 0,
  steps            jsonb not null default '[{"type":"supervisor","level":1}]'::jsonb,
  skip_self        boolean not null default true,       -- ข้ามขั้นที่ผู้อนุมัติคือผู้ยื่นเอง
  skip_missing     boolean not null default true,       -- ข้ามขั้นที่หาผู้อนุมัติไม่พบ
  auto_approve_if_empty boolean not null default false,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table public.requests (
  id             bigint generated always as identity primary key,
  doc_no         text unique,
  request_type   text not null references public.request_types(code),
  employee_id    bigint not null references public.employees(id) on delete cascade,
  requested_by   uuid,
  status         text not null default 'pending' check (status in ('draft','pending','approved','rejected','cancelled')),
  start_at       timestamptz,
  end_at         timestamptz,
  start_date     date,
  end_date       date,
  days           numeric(8,2),
  minutes        int,
  amount         numeric(14,2),
  payload        jsonb not null default '{}'::jsonb,
  reason         text,
  attachments    jsonb not null default '[]'::jsonb,
  current_step   int not null default 1,
  total_steps    int not null default 0,
  flow_id        bigint references public.approval_flows(id),
  result_note    text,
  completed_at   timestamptz,
  cancelled_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index on public.requests(employee_id, request_type, status);
create index on public.requests(status);

create table public.request_approvals (
  id                    bigint generated always as identity primary key,
  request_id            bigint not null references public.requests(id) on delete cascade,
  step                  int not null,
  step_def              jsonb,
  approver_user_id      uuid,
  approver_role_code    text,
  status                text not null default 'waiting' check (status in ('waiting','pending','approved','rejected','skipped','cancelled')),
  comment               text,
  acted_by              uuid,
  acted_at              timestamptz,
  unique (request_id, step)
);
create index on public.request_approvals(approver_user_id, status);

-- เบิกเงินล่วงหน้า (ผลจากใบขอเบิก หรือ HR บันทึกเอง) — หักในงวดเงินเดือน
create table public.salary_advances (
  id             bigint generated always as identity primary key,
  employee_id    bigint not null references public.employees(id) on delete cascade,
  advance_date   date not null default current_date,
  amount         numeric(14,2) not null,
  deduct_year    int,
  deduct_month   int,
  status         text not null default 'approved' check (status in ('approved','paid','deducted','cancelled')),
  payroll_entry_id bigint,
  request_id     bigint references public.requests(id),
  note           text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Leave balance view
-- ---------------------------------------------------------------------
create or replace view public.v_leave_balances with (security_invoker = true) as
select q.id, q.employee_id, q.leave_year, q.leave_type_id, t.code, t.name, t.color,
       q.quota_days, q.carried_days, q.adjust_days,
       (q.quota_days + q.carried_days + q.adjust_days) as total_days,
       coalesce(u.used, 0) as used_days,
       coalesce(u.pending, 0) as pending_days,
       (q.quota_days + q.carried_days + q.adjust_days) - coalesce(u.used, 0) - coalesce(u.pending, 0) as remaining_days
  from public.leave_quotas q
  join public.leave_types t on t.id = q.leave_type_id
  left join lateral (
    select sum(r.days) filter (where r.status = 'approved') as used,
           sum(r.days) filter (where r.status = 'pending') as pending
      from public.requests r
     where r.employee_id = q.employee_id and r.request_type = 'leave'
       and (r.payload->>'leave_type_id')::bigint = q.leave_type_id
       and extract(year from r.start_date) = q.leave_year
  ) u on true;

-- ---------------------------------------------------------------------
-- Leave day calculation
-- ---------------------------------------------------------------------
create or replace function app.leave_days(p_emp bigint, p_leave_type bigint, p_from date, p_to date, p_unit text, p_hours numeric default null)
returns numeric language plpgsql stable security definer set search_path = public as $$
declare
  v_type leave_types%rowtype;
  v_days numeric := 0;
  d date;
  r record;
  v_shift_min int;
begin
  select * into v_type from leave_types where id = p_leave_type;
  if p_unit in ('half_am','half_pm') then return 0.5; end if;
  if p_unit = 'hours' then
    select coalesce(s.work_minutes, 480) into v_shift_min
      from app.employee_day(p_emp, p_from) x left join shifts s on s.id = x.shift_id;
    return round(coalesce(p_hours,0) * 60 / greatest(coalesce(v_shift_min,480),1), 4);
  end if;
  d := p_from;
  while d <= p_to loop
    select * into r from app.employee_day(p_emp, d);
    if v_type.count_non_workdays or r.day_type in ('work','special') then
      v_days := v_days + 1;
    end if;
    d := d + 1;
  end loop;
  return v_days;
end $$;

-- ---------------------------------------------------------------------
-- Approver resolution
-- ---------------------------------------------------------------------
create or replace function app.employee_user(p_emp bigint) returns uuid
language sql stable security definer set search_path = public as $$
  select id from profiles where employee_id = p_emp and is_active order by created_at limit 1
$$;

create or replace function app.resolve_approver(p_emp bigint, p_step jsonb) returns uuid
language plpgsql stable security definer set search_path = public as $$
declare
  v_type text := p_step->>'type';
  v_level int := coalesce((p_step->>'level')::int, 1);
  v_cur bigint := p_emp;
  v_org bigint;
  v_mgr bigint;
  i int;
begin
  if v_type = 'supervisor' then
    for i in 1..v_level loop
      select supervisor_id into v_cur from employees where id = v_cur;
      exit when v_cur is null;
    end loop;
    return app.employee_user(v_cur);
  elsif v_type = 'org_manager' then
    select org_unit_id into v_org from employees where id = p_emp;
    while v_org is not null loop
      select manager_employee_id, parent_id into v_mgr, v_org from org_units where id = v_org;
      if v_mgr is not null and v_mgr <> p_emp then return app.employee_user(v_mgr); end if;
    end loop;
    return null;
  elsif v_type = 'user' then
    return (p_step->>'user_id')::uuid;
  end if;
  return null;  -- role-based → approver_role_code
end $$;

-- ancestors of an org unit (inclusive)
create or replace function app.org_subtree_up(p_org bigint) returns setof bigint
language sql stable security definer set search_path = public as $$
  with recursive t(id, parent_id) as (
    select id, parent_id from org_units where id = p_org
    union all
    select o.id, o.parent_id from org_units o join t on o.id = t.parent_id
  ) select id from t
$$;

create or replace function app.find_flow(p_type text, p_emp bigint) returns approval_flows
language sql stable security definer set search_path = public as $$
  select f.* from approval_flows f, employees e
   where e.id = p_emp and f.is_active
     and (f.request_type is null or f.request_type = p_type)
     and (f.org_unit_id is null or f.org_unit_id in (select app.org_subtree_up(e.org_unit_id)))
     and (f.branch_id is null or f.branch_id = e.branch_id)
   order by (f.request_type is not null) desc, (f.org_unit_id is not null) desc, f.priority desc, f.id
   limit 1
$$;

-- Can current user act on this approval row?
create or replace function app.can_act_approval(a request_approvals) returns boolean
language sql stable security definer set search_path = public as $$
  select a.status = 'pending' and (
           a.approver_user_id = auth.uid()
        or (a.approver_role_code is not null and exists (
              select 1 from profiles p join role_groups g on g.id = p.role_group_id
               where p.id = auth.uid() and p.is_active and g.code = a.approver_role_code))
        or app.has_perm('request_admin','approve'))
$$;

-- ---------------------------------------------------------------------
-- Submit
-- ---------------------------------------------------------------------
create or replace function public.submit_request(
  p_type        text,
  p_employee_id bigint default null,
  p_start_date  date default null,
  p_end_date    date default null,
  p_start_at    timestamptz default null,
  p_end_at      timestamptz default null,
  p_amount      numeric default null,
  p_payload     jsonb default '{}'::jsonb,
  p_reason      text default null,
  p_attachments jsonb default '[]'::jsonb
) returns public.requests
language plpgsql security definer set search_path = public as $$
declare
  v_emp    bigint := coalesce(p_employee_id, app.my_employee_id());
  v_req    requests%rowtype;
  v_flow   approval_flows%rowtype;
  v_step   jsonb;
  v_user   uuid;
  v_n      int := 0;
  v_days   numeric;
  v_minutes int;
  v_lt     leave_types%rowtype;
  v_bal    numeric;
  v_rt     request_types%rowtype;
  v_e      employees%rowtype;
  v_unit   text;
  v_first  boolean := true;
begin
  if v_emp is null then raise exception 'ไม่พบข้อมูลพนักงานของผู้ใช้'; end if;
  if v_emp <> coalesce(app.my_employee_id(), -1) and not (app.has_perm('request_admin','create') or app.is_manager_of(v_emp)) then
    raise exception 'ไม่มีสิทธิ์ยื่นเอกสารแทนพนักงานคนนี้';
  end if;
  select * into v_rt from request_types where code = p_type and is_active;
  if not found then raise exception 'ประเภทเอกสารไม่ถูกต้อง'; end if;
  select * into v_e from employees where id = v_emp;
  if v_rt.needs_attachment and jsonb_array_length(coalesce(p_attachments,'[]'::jsonb)) = 0 then
    raise exception 'กรุณาแนบเอกสารประกอบ';
  end if;

  -- type specific validation ------------------------------------------
  if p_type = 'leave' then
    select * into v_lt from leave_types where id = (p_payload->>'leave_type_id')::bigint and is_active;
    if not found then raise exception 'กรุณาเลือกประเภทการลา'; end if;
    if p_start_date is null then raise exception 'กรุณาระบุวันที่ลา'; end if;
    p_end_date := coalesce(p_end_date, p_start_date);
    if p_end_date < p_start_date then raise exception 'วันที่สิ้นสุดต้องไม่น้อยกว่าวันที่เริ่ม'; end if;
    v_unit := coalesce(p_payload->>'unit', 'full');
    if v_unit in ('half_am','half_pm') and (not v_lt.allow_half_day or p_end_date <> p_start_date) then raise exception 'ประเภทการลานี้ลาครึ่งวันไม่ได้'; end if;
    if v_unit = 'hours' and not v_lt.allow_hourly then raise exception 'ประเภทการลานี้ลาเป็นชั่วโมงไม่ได้'; end if;
    if v_lt.gender is not null and v_e.gender is distinct from v_lt.gender then raise exception 'ประเภทการลานี้ไม่ตรงกับเพศของพนักงาน'; end if;
    if not v_lt.allow_probation and v_e.status = 'probation' then raise exception 'พนักงานทดลองงานใช้สิทธิ์ลาประเภทนี้ไม่ได้'; end if;
    if v_lt.min_service_months > 0 and v_e.hire_date + (v_lt.min_service_months || ' months')::interval > p_start_date then
      raise exception 'อายุงานยังไม่ถึง % เดือน', v_lt.min_service_months;
    end if;
    if not app.has_perm('request_admin','create') then
      if v_lt.min_notice_days > 0 and p_start_date < current_date + v_lt.min_notice_days then
        raise exception 'ต้องยื่นลาล่วงหน้าอย่างน้อย % วัน', v_lt.min_notice_days;
      end if;
      if p_start_date < current_date - v_lt.allow_backdate_days then
        raise exception 'ยื่นลาย้อนหลังได้ไม่เกิน % วัน', v_lt.allow_backdate_days;
      end if;
    end if;
    v_days := app.leave_days(v_emp, v_lt.id, p_start_date, p_end_date, v_unit, (p_payload->>'hours')::numeric);
    if v_days <= 0 then raise exception 'ช่วงวันที่เลือกไม่มีวันทำงาน'; end if;
    if v_lt.max_per_request_days is not null and v_days > v_lt.max_per_request_days then
      raise exception 'ลาได้ไม่เกิน % วันต่อครั้ง', v_lt.max_per_request_days;
    end if;
    if v_lt.attachment_over_days is not null and v_days > v_lt.attachment_over_days
       and jsonb_array_length(coalesce(p_attachments,'[]'::jsonb)) = 0 then
      raise exception 'ลาเกิน % วันต้องแนบเอกสาร', v_lt.attachment_over_days;
    end if;
    if not v_lt.is_unlimited then
      select remaining_days into v_bal from v_leave_balances
       where employee_id = v_emp and leave_type_id = v_lt.id and leave_year = extract(year from p_start_date);
      if coalesce(v_bal, 0) < v_days then
        raise exception 'โควต้าการลาไม่พอ (คงเหลือ % วัน, ขอ % วัน)', coalesce(v_bal,0), v_days;
      end if;
    end if;
    -- overlapping leave
    if exists (select 1 from requests r where r.employee_id = v_emp and r.request_type = 'leave' and r.status in ('pending','approved')
                 and daterange(r.start_date, r.end_date, '[]') && daterange(p_start_date, p_end_date, '[]')
                 and not (coalesce(r.payload->>'unit','full') in ('half_am','half_pm') and v_unit in ('half_am','half_pm') and r.payload->>'unit' <> v_unit)) then
      raise exception 'มีใบลาในช่วงวันที่นี้อยู่แล้ว';
    end if;
  elsif p_type = 'ot' then
    if p_start_at is null or p_end_at is null or p_end_at <= p_start_at then raise exception 'กรุณาระบุช่วงเวลา OT ให้ถูกต้อง'; end if;
    v_minutes := extract(epoch from (p_end_at - p_start_at))::int / 60;
    p_start_date := coalesce(p_start_date, (p_start_at at time zone 'Asia/Bangkok')::date);
    p_end_date := p_start_date;
  elsif p_type = 'time_add' then
    if p_start_at is null then raise exception 'กรุณาระบุเวลา'; end if;
    p_start_date := coalesce(p_start_date, (p_start_at at time zone 'Asia/Bangkok')::date);
  elsif p_type in ('shift_change','dayoff_change') then
    if p_start_date is null then raise exception 'กรุณาระบุวันที่'; end if;
  elsif p_type = 'advance' then
    if coalesce(p_amount,0) <= 0 then raise exception 'กรุณาระบุจำนวนเงิน'; end if;
    -- วงเงินเบิกล่วงหน้า (% ของเงินเดือน หรือ จำนวนเงินคงที่ ตาม settings.payroll.advance_limit_*)
    declare v_limit numeric; v_used numeric; v_cfg jsonb := coalesce((select value from settings where key='payroll'),'{}');
    begin
      select case when (v_cfg->>'advance_limit_percent') is not null
                  then salary * (v_cfg->>'advance_limit_percent')::numeric / 100
                  else coalesce((v_cfg->>'advance_limit_amount')::numeric, salary) end
        into v_limit from employee_private where employee_id = v_emp;
      select coalesce(sum(amount),0) into v_used from salary_advances
       where employee_id = v_emp and status in ('approved','paid')
         and deduct_year = extract(year from current_date) and deduct_month = extract(month from current_date);
      v_used := v_used + coalesce((select sum(amount) from requests where employee_id = v_emp and request_type='advance' and status='pending'),0);
      if v_used + p_amount > coalesce(v_limit, 0) then
        raise exception 'เกินวงเงินเบิกล่วงหน้า (วงเงินคงเหลือ % บาท)', greatest(coalesce(v_limit,0) - v_used, 0);
      end if;
    end;
  elsif p_type = 'resign' then
    if p_start_date is null then raise exception 'กรุณาระบุวันที่มีผลลาออก'; end if;
  elsif p_type in ('petty_cash','welfare') then
    if coalesce(p_amount,0) <= 0 then raise exception 'กรุณาระบุจำนวนเงิน'; end if;
  end if;

  insert into requests(doc_no, request_type, employee_id, requested_by, status, start_at, end_at, start_date, end_date,
                       days, minutes, amount, payload, reason, attachments)
  values (app.next_doc_no(upper(case p_type when 'leave' then 'LV' when 'ot' then 'OT' when 'time_add' then 'TA'
                                       when 'shift_change' then 'SC' when 'dayoff_change' then 'DC' when 'advance' then 'AD'
                                       when 'resign' then 'RS' when 'petty_cash' then 'PC' when 'welfare' then 'WF'
                                       else 'RQ' end)),
          p_type, v_emp, auth.uid(), 'pending', p_start_at, p_end_at, p_start_date, coalesce(p_end_date, p_start_date),
          v_days, v_minutes, p_amount, coalesce(p_payload,'{}'::jsonb), p_reason, coalesce(p_attachments,'[]'::jsonb))
  returning * into v_req;

  -- build approval chain ----------------------------------------------
  v_flow := app.find_flow(p_type, v_emp);
  if v_flow.id is null then
    v_flow.steps := '[{"type":"supervisor","level":1},{"type":"role","role_code":"HR"}]'::jsonb;
    v_flow.skip_self := true; v_flow.skip_missing := true;
  end if;

  for v_step in select * from jsonb_array_elements(v_flow.steps) loop
    v_user := app.resolve_approver(v_emp, v_step);
    if v_step->>'type' <> 'role' then
      if v_user is null and v_flow.skip_missing then continue; end if;
      if v_user is not null and v_flow.skip_self and v_user = app.employee_user(v_emp) then continue; end if;
      if v_user is not null and exists (select 1 from request_approvals where request_id = v_req.id and approver_user_id = v_user) then continue; end if;
    end if;
    v_n := v_n + 1;
    exit when v_n > 10;
    insert into request_approvals(request_id, step, step_def, approver_user_id, approver_role_code, status)
    values (v_req.id, v_n, v_step, v_user, case when v_step->>'type' = 'role' then v_step->>'role_code' end,
            case when v_first then 'pending' else 'waiting' end);
    v_first := false;
  end loop;

  update requests set total_steps = v_n, flow_id = v_flow.id, current_step = 1 where id = v_req.id returning * into v_req;

  if v_n = 0 then
    perform app.act_request_internal(v_req.id, 'approve', 'อนุมัติอัตโนมัติ (ไม่มีลำดับขั้นอนุมัติ)', true);
    select * into v_req from requests where id = v_req.id;
  else
    perform app.notify_approvers(v_req.id);
  end if;
  return v_req;
end $$;
revoke all on function public.submit_request from anon;

create or replace function app.notify_approvers(p_request bigint) returns void
language plpgsql security definer set search_path = public as $$
declare a request_approvals%rowtype; r requests%rowtype; v_title text; v_name text;
begin
  select * into r from requests where id = p_request;
  select * into a from request_approvals where request_id = p_request and status = 'pending';
  if not found then return; end if;
  select first_name || ' ' || last_name into v_name from employees where id = r.employee_id;
  v_title := 'รออนุมัติ: ' || (select name from request_types where code = r.request_type) || ' — ' || v_name;
  if a.approver_user_id is not null then
    perform app.notify(a.approver_user_id, v_title, r.doc_no, '/approvals?id=' || r.id, 'approval');
  elsif a.approver_role_code is not null then
    perform app.notify(p.id, v_title, r.doc_no, '/approvals?id=' || r.id, 'approval')
       from profiles p join role_groups g on g.id = p.role_group_id
      where g.code = a.approver_role_code and p.is_active;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Approve / reject
-- ---------------------------------------------------------------------
create or replace function app.act_request_internal(p_request_id bigint, p_action text, p_comment text, p_system boolean)
returns public.requests
language plpgsql security definer set search_path = public as $$
declare
  r requests%rowtype;
  a request_approvals%rowtype;
  v_requester uuid;
begin
  select * into r from requests where id = p_request_id for update;
  if not found then raise exception 'ไม่พบเอกสาร'; end if;
  if r.status <> 'pending' then raise exception 'เอกสารนี้ไม่ได้อยู่ในสถานะรออนุมัติ'; end if;
  if p_action not in ('approve','reject') then raise exception 'action ไม่ถูกต้อง'; end if;
  v_requester := coalesce(r.requested_by, app.employee_user(r.employee_id));

  if r.total_steps > 0 then
    select * into a from request_approvals where request_id = r.id and status = 'pending' order by step limit 1;
    if not found then raise exception 'ไม่พบขั้นการอนุมัติที่รออยู่'; end if;
    if not p_system and not app.can_act_approval(a) then
      raise exception 'คุณไม่มีสิทธิ์อนุมัติเอกสารนี้ในขั้นตอนปัจจุบัน';
    end if;
    update request_approvals
       set status = case p_action when 'approve' then 'approved' else 'rejected' end,
           comment = p_comment, acted_by = auth.uid(), acted_at = now()
     where id = a.id;
  end if;

  if p_action = 'reject' then
    update request_approvals set status = 'cancelled' where request_id = r.id and status = 'waiting';
    update requests set status = 'rejected', result_note = p_comment, completed_at = now() where id = r.id returning * into r;
    perform app.notify(v_requester, 'เอกสารไม่อนุมัติ: ' || r.doc_no, p_comment, '/me/requests?id=' || r.id, 'request');
    return r;
  end if;

  if exists (select 1 from request_approvals where request_id = r.id and status = 'waiting') then
    update request_approvals set status = 'pending'
     where id = (select id from request_approvals where request_id = r.id and status = 'waiting' order by step limit 1);
    update requests set current_step = current_step + 1 where id = r.id returning * into r;
    perform app.notify_approvers(r.id);
    return r;
  end if;

  update requests set status = 'approved', completed_at = now(), result_note = coalesce(p_comment, result_note)
   where id = r.id returning * into r;
  perform app.apply_request(r.id);
  perform app.notify(v_requester, 'อนุมัติแล้ว: ' || r.doc_no, null, '/me/requests?id=' || r.id, 'request');
  return r;
end $$;

create or replace function public.act_request(p_request_id bigint, p_action text, p_comment text default null)
returns public.requests language sql security definer set search_path = public as $$
  select app.act_request_internal(p_request_id, p_action, p_comment, false)
$$;
revoke all on function public.act_request from anon;

create or replace function public.cancel_request(p_request_id bigint, p_reason text default null)
returns public.requests language plpgsql security definer set search_path = public as $$
declare r requests%rowtype;
begin
  select * into r from requests where id = p_request_id for update;
  if not found then raise exception 'ไม่พบเอกสาร'; end if;
  if not (r.employee_id = app.my_employee_id() or r.requested_by = auth.uid() or app.has_perm('request_admin','edit')) then
    raise exception 'ไม่มีสิทธิ์ยกเลิกเอกสารนี้';
  end if;
  if r.status = 'approved' and not app.has_perm('request_admin','edit') then
    raise exception 'เอกสารที่อนุมัติแล้ว ต้องให้ HR เป็นผู้ยกเลิก';
  end if;
  if r.status in ('cancelled','rejected') then raise exception 'เอกสารนี้ถูกยกเลิก/ไม่อนุมัติไปแล้ว'; end if;
  if r.status = 'approved' then perform app.revert_request(r.id); end if;
  update request_approvals set status = 'cancelled' where request_id = r.id and status in ('waiting','pending');
  update requests set status = 'cancelled', cancelled_at = now(), result_note = p_reason where id = r.id returning * into r;
  return r;
end $$;
revoke all on function public.cancel_request from anon;

-- ---------------------------------------------------------------------
-- Effects of an approved request
-- ---------------------------------------------------------------------
create or replace function app.apply_request(p_request bigint) returns void
language plpgsql security definer set search_path = public as $$
declare
  r requests%rowtype;
  v_date date;
  v_cfg jsonb := coalesce((select value from settings where key='payroll'),'{}');
begin
  select * into r from requests where id = p_request;

  if r.request_type = 'time_add' then
    insert into time_logs(employee_id, log_time, direction, source, recorded_by, note)
    values (r.employee_id, r.start_at, coalesce(r.payload->>'direction','auto'), 'manual', r.requested_by,
            'จากใบขอเพิ่มเวลา ' || r.doc_no);
    if r.end_at is not null then
      insert into time_logs(employee_id, log_time, direction, source, recorded_by, note)
      values (r.employee_id, r.end_at, 'out', 'manual', r.requested_by, 'จากใบขอเพิ่มเวลา ' || r.doc_no);
    end if;

  elsif r.request_type = 'shift_change' then
    v_date := r.start_date;
    while v_date <= coalesce(r.end_date, r.start_date) loop
      insert into work_schedules(employee_id, work_date, shift_id, is_day_off, source, note)
      values (r.employee_id, v_date, (r.payload->>'shift_id')::bigint, false, 'request', r.doc_no)
      on conflict (employee_id, work_date) do update set shift_id = excluded.shift_id, is_day_off = false, source = 'request', note = excluded.note;
      v_date := v_date + 1;
    end loop;

  elsif r.request_type = 'dayoff_change' then
    -- payload: { "from_date": วันหยุดเดิม (จะมาทำงาน), "to_date": วันที่ต้องการหยุดแทน }
    insert into work_schedules(employee_id, work_date, shift_id, is_day_off, source, note)
    values (r.employee_id, coalesce((r.payload->>'to_date')::date, r.start_date), null, true, 'request', r.doc_no)
    on conflict (employee_id, work_date) do update set is_day_off = true, source = 'request', note = excluded.note;
    if r.payload ? 'from_date' then
      insert into work_schedules(employee_id, work_date, shift_id, is_day_off, source, note)
      values (r.employee_id, (r.payload->>'from_date')::date,
              (select default_shift_id from employees where id = r.employee_id), false, 'request', r.doc_no)
      on conflict (employee_id, work_date) do update set is_day_off = false, shift_id = excluded.shift_id, source = 'request', note = excluded.note;
    end if;

  elsif r.request_type = 'advance' then
    insert into salary_advances(employee_id, advance_date, amount, deduct_year, deduct_month, status, request_id, note)
    values (r.employee_id, current_date, r.amount,
            extract(year from coalesce((r.payload->>'deduct_date')::date, current_date)),
            extract(month from coalesce((r.payload->>'deduct_date')::date, current_date)),
            'approved', r.id, r.doc_no);

  elsif r.request_type = 'resign' then
    insert into employee_movements(doc_no, employee_id, movement_type, effective_date, new_status, reason, status, request_id, created_by)
    values (app.next_doc_no('MV'), r.employee_id, 'resign', r.start_date, 'resigned', r.reason, 'approved', r.id, r.requested_by);
  end if;

  -- mark attendance days to be recalculated
  if r.request_type in ('leave','ot','time_add','shift_change','dayoff_change') and r.start_date is not null then
    update attendance_days set status = 'dirty'
     where employee_id = r.employee_id and work_date between r.start_date - 1 and coalesce(r.end_date, r.start_date) + 1
       and not is_locked;
  end if;
end $$;

create or replace function app.revert_request(p_request bigint) returns void
language plpgsql security definer set search_path = public as $$
declare r requests%rowtype;
begin
  select * into r from requests where id = p_request;
  if r.request_type = 'time_add' then
    update time_logs set is_void = true, void_reason = 'ยกเลิกใบขอเพิ่มเวลา ' || r.doc_no
     where employee_id = r.employee_id and source = 'manual' and note = 'จากใบขอเพิ่มเวลา ' || r.doc_no;
  elsif r.request_type in ('shift_change','dayoff_change') then
    delete from work_schedules where employee_id = r.employee_id and source = 'request' and note = r.doc_no;
  elsif r.request_type = 'advance' then
    update salary_advances set status = 'cancelled' where request_id = r.id and status = 'approved';
  elsif r.request_type = 'resign' then
    update employee_movements set status = 'cancelled' where request_id = r.id and status <> 'applied';
  end if;
  update attendance_days set status = 'dirty'
   where employee_id = r.employee_id and work_date between coalesce(r.start_date, current_date) - 1 and coalesce(r.end_date, r.start_date, current_date) + 1
     and not is_locked;
end $$;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
create or replace function app.can_see_request(p_id bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from requests r
     where r.id = p_id and (
           r.employee_id = app.my_employee_id() or r.requested_by = auth.uid()
        or app.is_manager_of(r.employee_id)
        or (app.has_perm('request_admin','view') and app.can_see_employee(r.employee_id))
        or exists (select 1 from request_approvals a where a.request_id = r.id
                    and (a.approver_user_id = auth.uid()
                         or a.approver_role_code in (select g.code from profiles p join role_groups g on g.id = p.role_group_id where p.id = auth.uid())))))
$$;

select app.std_policies('public.leave_types', 'attendance', 'master');
select app.std_policies('public.request_types', 'request_admin', 'master');
select app.std_policies('public.approval_flows', 'request_admin', 'master');

alter table public.leave_quotas enable row level security;
create policy p_sel on public.leave_quotas for select to authenticated using (app.can_see_employee(employee_id));
create policy p_wr on public.leave_quotas for all to authenticated using (app.has_perm('attendance','edit')) with check (app.has_perm('attendance','edit'));

alter table public.requests enable row level security;
create policy p_sel on public.requests for select to authenticated using (app.can_see_request(id));
-- writes only through submit/act/cancel functions, plus HR edit of non-status fields
create policy p_hr on public.requests for update to authenticated using (app.has_perm('request_admin','edit')) with check (app.has_perm('request_admin','edit'));

alter table public.request_approvals enable row level security;
create policy p_sel on public.request_approvals for select to authenticated using (app.can_see_request(request_id));

alter table public.salary_advances enable row level security;
create policy p_sel on public.salary_advances for select to authenticated using (app.can_see_private(employee_id));
create policy p_wr on public.salary_advances for all to authenticated using (app.has_perm('payroll','edit')) with check (app.has_perm('payroll','edit'));

do $$
declare t text;
begin
  foreach t in array array['leave_types','leave_quotas','approval_flows','requests','salary_advances'] loop
    execute format('create trigger trg_touch before update on public.%I for each row execute function app.touch_updated_at()', t);
  end loop;
  foreach t in array array['leave_types','leave_quotas','approval_flows','requests','request_approvals','salary_advances','request_types'] loop
    perform app.enable_audit(('public.' || t)::regclass);
  end loop;
end $$;
