-- =====================================================================
-- GO HR — เงินค้างจ่ายรอเข้างวดเงินเดือน (payroll_pending_items)            (idempotent)
--
--   One inbox for money that must reach a payslip but is not tied to a period yet:
--     * welfare / petty-cash requests approved through the document workflow
--     * (later) retro pay for requests approved after a period was closed, final settlement, severance ...
--   Life cycle:  pending → applied (claimed by a period when it is calculated) → paid (period marked paid)
--                any of these → cancelled (request cancelled before the money was paid)
--   The payroll calculation (lib/payroll/server.ts) reads pending + applied-to-this-period rows as pay lines
--   (source = item source, source_id = pending item id). Non-monthly periods only pick rows assigned to them.
--
--   Also fixes: approving a welfare / petty-cash request did nothing on the payroll side, and welfare limits
--   (per claim / per year / minimum service) were only displayed in the form, never enforced.
-- =====================================================================

create table if not exists public.payroll_pending_items (
  id             bigint generated always as identity primary key,
  employee_id    bigint not null references public.employees(id) on delete cascade,
  pay_item_id    bigint not null references public.pay_items(id),
  amount         numeric(14,2) not null,
  qty            numeric(10,2),
  note           text,
  source         text not null,                 -- welfare / petty_cash / retro / severance / leave_payout / final_settlement / manual / <source>_revert
  source_id      bigint,
  effective_date date not null default current_date,   -- earliest period (by end_date) that may pick this row up
  status         text not null default 'pending' check (status in ('pending','applied','paid','cancelled')),
  period_id      bigint references public.payroll_periods(id) on delete set null,
  created_by     uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create unique index if not exists payroll_pending_items_source_uq on public.payroll_pending_items(source, source_id) where source_id is not null;
create index if not exists payroll_pending_items_emp_idx on public.payroll_pending_items(employee_id, status);
create index if not exists payroll_pending_items_period_idx on public.payroll_pending_items(period_id) where period_id is not null;
comment on table public.payroll_pending_items is 'เงินค้างจ่ายที่รอเข้างวดเงินเดือน (สวัสดิการ เงินสดย่อย ตกเบิก เคลียร์เงินคนออก)';

drop trigger if exists trg_touch on public.payroll_pending_items;
create trigger trg_touch before update on public.payroll_pending_items for each row execute function app.touch_updated_at();

-- a row that loses its period (period deleted → FK set null) goes back to the inbox
create or replace function app.pending_item_orphan() returns trigger
language plpgsql as $$
begin
  if new.period_id is null and new.status in ('applied','paid') then new.status := 'pending'; end if;
  return new;
end $$;
drop trigger if exists trg_pending_orphan on public.payroll_pending_items;
create trigger trg_pending_orphan before update of period_id on public.payroll_pending_items for each row execute function app.pending_item_orphan();

select app.std_policies('public.payroll_pending_items', 'payroll', 'restrict');
grant select, insert, update, delete on public.payroll_pending_items to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Welfare limits are enforced in the database (the form only shows them)
-- ---------------------------------------------------------------------
create or replace function app.check_welfare_request() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_wt   welfare_types%rowtype;
  v_used numeric;
  v_year int;
  v_hire date;
begin
  if new.request_type <> 'welfare' or new.status not in ('draft','pending') then return new; end if;
  if (new.payload->>'welfare_type_id') is null then raise exception 'กรุณาเลือกประเภทสวัสดิการ'; end if;
  select * into v_wt from welfare_types where id = (new.payload->>'welfare_type_id')::bigint;
  if v_wt.id is null or not v_wt.is_active then raise exception 'ประเภทสวัสดิการนี้ไม่เปิดใช้งาน'; end if;
  if coalesce(new.amount, 0) <= 0 then raise exception 'กรุณาระบุจำนวนเงิน'; end if;
  if v_wt.per_claim_limit is not null and new.amount > v_wt.per_claim_limit then
    raise exception 'เกินวงเงินต่อครั้งของ % (ไม่เกิน % บาท)', v_wt.name, to_char(v_wt.per_claim_limit, 'FM999,999,999.00');
  end if;
  if v_wt.min_service_months > 0 then
    select hire_date into v_hire from employees where id = new.employee_id;
    if v_hire is not null and v_hire + make_interval(months => v_wt.min_service_months) > coalesce(new.start_date, current_date) then
      raise exception 'อายุงานยังไม่ถึง % เดือน ตามเงื่อนไขของ %', v_wt.min_service_months, v_wt.name;
    end if;
  end if;
  if v_wt.annual_limit is not null then
    v_year := extract(year from coalesce(new.start_date, current_date));
    select coalesce(sum(amount), 0) into v_used
      from requests r
     where r.employee_id = new.employee_id and r.request_type = 'welfare'
       and r.status in ('pending','approved')
       and (r.payload->>'welfare_type_id')::bigint = v_wt.id
       and extract(year from coalesce(r.start_date, r.created_at::date)) = v_year
       and (tg_op = 'INSERT' or r.id <> new.id);
    if v_used + new.amount > v_wt.annual_limit then
      raise exception 'เกินวงเงินต่อปีของ % (วงเงินคงเหลือ % บาท)', v_wt.name, to_char(greatest(v_wt.annual_limit - v_used, 0), 'FM999,999,999.00');
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_requests_welfare_check on public.requests;
create trigger trg_requests_welfare_check before insert or update of amount, payload on public.requests
  for each row execute function app.check_welfare_request();

-- ---------------------------------------------------------------------
-- Pay item used for petty-cash reimbursements: settings.payroll.petty_cash_pay_item_id,
-- otherwise the pay item with system_key = 'petty_cash' (seeded as REIMBURSE)
-- ---------------------------------------------------------------------
create or replace function app.petty_cash_pay_item() returns bigint
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select ((select value from settings where key = 'payroll')->>'petty_cash_pay_item_id')::bigint),
    (select id from pay_items where system_key = 'petty_cash' and is_active order by id limit 1))
$$;
revoke all on function app.petty_cash_pay_item() from public, anon;

-- ---------------------------------------------------------------------
-- Effects of an approved request (adds welfare / petty_cash → payroll_pending_items)
-- ---------------------------------------------------------------------
create or replace function app.apply_request(p_request bigint) returns void
language plpgsql security definer set search_path = public as $$
declare
  r requests%rowtype;
  v_date date;
  v_cfg jsonb := coalesce((select value from settings where key='payroll'),'{}');
  v_wt welfare_types%rowtype;
  v_item bigint;
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

  elsif r.request_type = 'welfare' then
    select * into v_wt from welfare_types where id = (r.payload->>'welfare_type_id')::bigint;
    if v_wt.id is null then raise exception 'ไม่พบประเภทสวัสดิการของเอกสาร %', r.doc_no; end if;
    if v_wt.pay_via_payroll then
      if v_wt.pay_item_id is null then
        raise exception 'สวัสดิการ "%" ยังไม่ได้กำหนดรายการเงินเดือนที่ใช้จ่าย (ตั้งค่าที่ เงินเดือน → สวัสดิการ)', v_wt.name;
      end if;
      insert into payroll_pending_items(employee_id, pay_item_id, amount, note, source, source_id, effective_date, created_by)
      values (r.employee_id, v_wt.pay_item_id, r.amount, v_wt.name || ' (' || r.doc_no || ')', 'welfare', r.id, current_date, auth.uid())
      on conflict (source, source_id) where source_id is not null do update
        set amount = excluded.amount, pay_item_id = excluded.pay_item_id, note = excluded.note,
            status = case when payroll_pending_items.status = 'cancelled' then 'pending' else payroll_pending_items.status end;
    end if;

  elsif r.request_type = 'petty_cash' then
    if coalesce(v_cfg->>'petty_cash_mode', 'payroll') = 'payroll' then
      v_item := app.petty_cash_pay_item();
      if v_item is null then
        raise exception 'ยังไม่ได้กำหนดรายการเงินเดือนสำหรับเงินสดย่อย (ตั้งค่า → กฎการคำนวณ → เงินเดือน)';
      end if;
      insert into payroll_pending_items(employee_id, pay_item_id, amount, note, source, source_id, effective_date, created_by)
      values (r.employee_id, v_item, r.amount, 'เบิกเงินสดย่อย (' || r.doc_no || ')', 'petty_cash', r.id, current_date, auth.uid())
      on conflict (source, source_id) where source_id is not null do update
        set amount = excluded.amount, pay_item_id = excluded.pay_item_id, note = excluded.note,
            status = case when payroll_pending_items.status = 'cancelled' then 'pending' else payroll_pending_items.status end;
    end if;
  end if;

  -- mark attendance days to be recalculated
  if r.request_type in ('leave','ot','time_add','shift_change','dayoff_change') and r.start_date is not null then
    update attendance_days set status = 'dirty'
     where employee_id = r.employee_id and work_date between r.start_date - 1 and coalesce(r.end_date, r.start_date) + 1
       and not is_locked;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Undo of a cancelled (previously approved) request
--   pending / applied to an unapproved period → cancelled (the next calculation drops it)
--   applied to an approved period or already paid  → a negative row so the next period deducts it
-- ---------------------------------------------------------------------
create or replace function app.revert_request(p_request bigint) returns void
language plpgsql security definer set search_path = public as $$
declare
  r requests%rowtype;
  v_pi payroll_pending_items%rowtype;
  v_period_status text;
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
  elsif r.request_type in ('welfare','petty_cash') then
    for v_pi in select * from payroll_pending_items where source = r.request_type and source_id = r.id loop
      v_period_status := null;
      if v_pi.period_id is not null then select status into v_period_status from payroll_periods where id = v_pi.period_id; end if;
      if v_pi.status = 'pending' or (v_pi.status = 'applied' and coalesce(v_period_status, 'open') in ('open','calculated')) then
        update payroll_pending_items set status = 'cancelled' where id = v_pi.id;
      elsif v_pi.status in ('applied','paid') then
        insert into payroll_pending_items(employee_id, pay_item_id, amount, note, source, source_id, effective_date, created_by)
        values (v_pi.employee_id, v_pi.pay_item_id, -v_pi.amount, 'ยกเลิก ' || coalesce(v_pi.note, r.doc_no), r.request_type || '_revert', r.id, current_date, auth.uid())
        on conflict (source, source_id) where source_id is not null do nothing;
      end if;
    end loop;
  end if;
  update attendance_days set status = 'dirty'
   where employee_id = r.employee_id and work_date between coalesce(r.start_date, current_date) - 1 and coalesce(r.end_date, r.start_date, current_date) + 1
     and not is_locked;
end $$;

revoke execute on function app.apply_request(bigint) from public, anon, authenticated;
revoke execute on function app.revert_request(bigint) from public, anon, authenticated;
