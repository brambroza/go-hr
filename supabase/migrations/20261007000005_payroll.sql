-- =====================================================================
-- GO HR — Payroll
-- =====================================================================

create table public.pay_item_groups (
  id         bigint generated always as identity primary key,
  name       text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ประเภทรายรับรายจ่าย
--   category: auto (ระบบคำนวณ) / income / expense / loan / constant / fund / welfare
create table public.pay_items (
  id             bigint generated always as identity primary key,
  code           text not null unique,
  name           text not null,
  name_en        text,
  category       text not null check (category in ('auto','income','expense','loan','constant','fund','welfare')),
  direction      smallint not null default 1 check (direction in (1,-1)),      -- 1 = เงินได้, -1 = เงินหัก
  group_id       bigint references public.pay_item_groups(id),
  is_taxable     boolean not null default true,      -- นำไปคำนวณภาษี
  is_sso         boolean not null default false,     -- นับเป็นค่าจ้างประกันสังคม
  is_pvd_base    boolean not null default false,     -- ฐานคำนวณ PVD
  is_regular     boolean not null default true,      -- เงินได้ประจำ (ใช้ annualize) / ไม่ประจำ (โบนัส)
  income_type    text not null default '40(1)',
  calc_type      text not null default 'fixed' check (calc_type in ('fixed','per_day','per_hour','percent_salary','formula')),
  rate           numeric(14,4),                      -- ใช้กับ per_day / per_hour / percent_salary
  formula        text,                               -- ใช้กับ formula: ตัวแปร salary, work_days, absent_days, late_minutes ...
  system_key     text unique,                        -- salary, ot_1, ot_1_5, ot_2, ot_3, tax, sso, pvd, advance, absent, late, early, guarantee ...
  show_on_payslip boolean not null default true,
  sort_order     int not null default 0,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- รายรับรายจ่ายประจำของพนักงาน (ค่าคงที่: ค่าตำแหน่ง ค่าเดินทาง เบี้ยขยัน ฯลฯ)
create table public.employee_pay_items (
  id            bigint generated always as identity primary key,
  employee_id   bigint not null references public.employees(id) on delete cascade,
  pay_item_id   bigint not null references public.pay_items(id),
  amount        numeric(14,2) not null default 0,
  qty           numeric(10,2),
  start_month   date,          -- วันที่ 1 ของเดือนที่เริ่ม
  end_month     date,
  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on public.employee_pay_items(employee_id);

-- งวดการจ่าย
create table public.payroll_periods (
  id              bigint generated always as identity primary key,
  code            text not null unique,
  name            text not null,
  period_type     text not null default 'monthly' check (period_type in ('monthly','semi_monthly','weekly','ot','split','special','bonus')),
  pay_year        int not null,
  pay_month       int not null check (pay_month between 1 and 12),
  start_date      date not null,
  end_date        date not null,
  att_start_date  date,          -- ช่วงตัดเวลา (OT/ขาด/สาย) อาจไม่ตรงกับงวดเงินเดือน
  att_end_date    date,
  pay_date        date not null,
  include_salary  boolean not null default true,
  include_attendance boolean not null default true,
  include_constants boolean not null default true,
  include_tax     boolean not null default true,
  include_sso     boolean not null default true,
  include_pvd     boolean not null default true,
  filter          jsonb not null default '{}'::jsonb,   -- {"branch_ids":[],"employee_types":["monthly"],"employee_ids":[]}
  status          text not null default 'open' check (status in ('open','calculated','approved','paid','closed')),
  payslip_published boolean not null default false,
  calculated_at   timestamptz,
  approved_at     timestamptz,
  approved_by     uuid,
  note            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index on public.payroll_periods(pay_year, pay_month);

-- บันทึกรายรับรายจ่ายครั้งคราวของงวด (เช่น โบนัส ค่าคอม หักค่าเสียหาย)
create table public.payroll_adjustments (
  id            bigint generated always as identity primary key,
  period_id     bigint not null references public.payroll_periods(id) on delete cascade,
  employee_id   bigint not null references public.employees(id) on delete cascade,
  pay_item_id   bigint not null references public.pay_items(id),
  amount        numeric(14,2) not null default 0,
  qty           numeric(10,2),
  note          text,
  source        text not null default 'manual',     -- manual / import / welfare / petty_cash / commission
  source_id     bigint,
  created_by    uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on public.payroll_adjustments(period_id, employee_id);

create table public.payroll_entries (
  id               bigint generated always as identity primary key,
  period_id        bigint not null references public.payroll_periods(id) on delete cascade,
  employee_id      bigint not null references public.employees(id),
  -- snapshot
  emp_code         text,
  emp_name         text,
  branch_id        bigint,
  org_unit_id      bigint,
  position_name    text,
  bank_code        text,
  bank_account     text,
  pay_method       text,
  base_salary      numeric(14,2) not null default 0,
  salary_unit      text,
  -- attendance summary
  work_days        numeric(8,2) not null default 0,
  paid_days        numeric(8,2) not null default 0,
  absent_days      numeric(8,2) not null default 0,
  unpaid_leave_days numeric(8,2) not null default 0,
  late_minutes     int not null default 0,
  early_minutes    int not null default 0,
  ot_minutes       jsonb not null default '{}'::jsonb,
  -- totals
  total_income     numeric(14,2) not null default 0,
  total_deduction  numeric(14,2) not null default 0,
  taxable_income   numeric(14,2) not null default 0,
  sso_wage         numeric(14,2) not null default 0,
  sso_employee     numeric(14,2) not null default 0,
  sso_employer     numeric(14,2) not null default 0,
  pvd_employee     numeric(14,2) not null default 0,
  pvd_employer     numeric(14,2) not null default 0,
  tax              numeric(14,2) not null default 0,
  net_pay          numeric(14,2) not null default 0,
  -- year to date (after this period)
  ytd_income       numeric(14,2) not null default 0,
  ytd_tax          numeric(14,2) not null default 0,
  ytd_sso          numeric(14,2) not null default 0,
  ytd_pvd          numeric(14,2) not null default 0,
  calc_detail      jsonb not null default '{}'::jsonb,
  is_locked        boolean not null default false,
  note             text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (period_id, employee_id)
);
create index on public.payroll_entries(employee_id);

create table public.payroll_entry_items (
  id            bigint generated always as identity primary key,
  entry_id      bigint not null references public.payroll_entries(id) on delete cascade,
  pay_item_id   bigint references public.pay_items(id),
  code          text,
  name          text not null,
  category      text,
  direction     smallint not null default 1,
  qty           numeric(10,2),
  rate          numeric(14,4),
  amount        numeric(14,2) not null default 0,
  is_taxable    boolean not null default true,
  is_sso        boolean not null default false,
  source        text,
  source_id     bigint,
  sort_order    int not null default 0
);
create index on public.payroll_entry_items(entry_id);

-- ภาระหนี้สินพนักงาน (เงินกู้ / ผ่อนชำระ)
create table public.employee_loans (
  id                 bigint generated always as identity primary key,
  doc_no             text,
  employee_id        bigint not null references public.employees(id) on delete cascade,
  pay_item_id        bigint references public.pay_items(id),
  loan_name          text not null,
  lender             text,                                -- บริษัท / กยศ. / กรมบังคับคดี / สหกรณ์
  principal          numeric(14,2) not null,
  interest_rate      numeric(6,3) not null default 0,     -- % ต่อปี (flat)
  total_payable      numeric(14,2) not null,
  installment_amount numeric(14,2) not null,
  start_month        date not null,
  paid_amount        numeric(14,2) not null default 0,
  status             text not null default 'active' check (status in ('active','paused','closed','cancelled')),
  note               text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table public.loan_payments (
  id         bigint generated always as identity primary key,
  loan_id    bigint not null references public.employee_loans(id) on delete cascade,
  period_id  bigint references public.payroll_periods(id) on delete cascade,
  entry_id   bigint references public.payroll_entries(id) on delete cascade,
  pay_date   date not null,
  amount     numeric(14,2) not null,
  note       text,
  created_at timestamptz not null default now()
);

-- ค่าคอมมิชชั่น
create table public.commission_plans (
  id          bigint generated always as identity primary key,
  name        text not null,
  basis       text not null default 'sales' check (basis in ('sales','profit','units')),
  tiers       jsonb not null default '[]'::jsonb,     -- [{"from":0,"to":100000,"rate":2},{"from":100000,"rate":3}]
  tier_mode   text not null default 'step' check (tier_mode in ('step','flat')),   -- step = ขั้นบันได, flat = อัตราเดียวตามยอดรวม
  pay_item_id bigint references public.pay_items(id),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create table public.commission_entries (
  id           bigint generated always as identity primary key,
  period_id    bigint not null references public.payroll_periods(id) on delete cascade,
  employee_id  bigint not null references public.employees(id) on delete cascade,
  plan_id      bigint references public.commission_plans(id),
  base_amount  numeric(14,2) not null default 0,
  commission   numeric(14,2) not null default 0,
  note         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (period_id, employee_id, plan_id)
);

-- สวัสดิการ (ประเภท + วงเงิน) ใช้กับใบขอสวัสดิการ
create table public.welfare_types (
  id                bigint generated always as identity primary key,
  name              text not null,
  annual_limit      numeric(14,2),
  per_claim_limit   numeric(14,2),
  min_service_months int not null default 0,
  pay_item_id       bigint references public.pay_items(id),
  pay_via_payroll   boolean not null default true,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- RLS
create or replace function app.payslip_published(p_period bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select payslip_published from payroll_periods where id = p_period), false)
$$;

-- ---------------------------------------------------------------------
select app.std_policies('public.pay_item_groups', 'payroll', 'master');
select app.std_policies('public.pay_items', 'payroll', 'master');
select app.std_policies('public.commission_plans', 'payroll', 'restrict');
select app.std_policies('public.welfare_types', 'payroll', 'master');
select app.std_policies('public.payroll_periods', 'payroll', 'restrict');
select app.std_policies('public.payroll_adjustments', 'payroll', 'restrict');
select app.std_policies('public.commission_entries', 'payroll', 'restrict');

-- employees can see the periods of their published payslips
create policy p_emp on public.payroll_periods for select to authenticated using (
  payslip_published and exists (select 1 from payroll_entries e where e.period_id = payroll_periods.id and e.employee_id = app.my_employee_id()));

alter table public.payroll_entries enable row level security;
create policy p_sel on public.payroll_entries for select to authenticated using (
  (app.has_perm('payroll','view') and app.can_see_employee(employee_id))
  or (employee_id = app.my_employee_id() and app.payslip_published(period_id)));
create policy p_wr on public.payroll_entries for all to authenticated using (app.has_perm('payroll','edit')) with check (app.has_perm('payroll','edit'));

alter table public.payroll_entry_items enable row level security;
create policy p_sel on public.payroll_entry_items for select to authenticated using (
  exists (select 1 from payroll_entries e where e.id = entry_id));
create policy p_wr on public.payroll_entry_items for all to authenticated using (app.has_perm('payroll','edit')) with check (app.has_perm('payroll','edit'));

alter table public.employee_pay_items enable row level security;
create policy p_sel on public.employee_pay_items for select to authenticated using (app.can_see_private(employee_id) or app.has_perm('payroll','view'));
create policy p_wr on public.employee_pay_items for all to authenticated using (app.has_perm('payroll','edit')) with check (app.has_perm('payroll','edit'));

alter table public.employee_loans enable row level security;
create policy p_sel on public.employee_loans for select to authenticated using (app.can_see_private(employee_id) or app.has_perm('payroll','view'));
create policy p_wr on public.employee_loans for all to authenticated using (app.has_perm('payroll','edit')) with check (app.has_perm('payroll','edit'));

alter table public.loan_payments enable row level security;
create policy p_sel on public.loan_payments for select to authenticated using (exists (select 1 from employee_loans l where l.id = loan_id));
create policy p_wr on public.loan_payments for all to authenticated using (app.has_perm('payroll','edit')) with check (app.has_perm('payroll','edit'));


do $$
declare t text;
begin
  foreach t in array array['pay_item_groups','pay_items','employee_pay_items','payroll_periods','payroll_adjustments',
                           'payroll_entries','employee_loans','commission_plans','commission_entries','welfare_types'] loop
    execute format('create trigger trg_touch before update on public.%I for each row execute function app.touch_updated_at()', t);
  end loop;
  foreach t in array array['pay_items','employee_pay_items','payroll_periods','payroll_adjustments','employee_loans','commission_plans','welfare_types'] loop
    perform app.enable_audit(('public.' || t)::regclass);
  end loop;
end $$;

-- Prevent edits to closed periods
create or replace function app.guard_period() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_status text; v_period bigint;
begin
  v_period := coalesce(new.period_id, old.period_id);
  select status into v_status from payroll_periods where id = v_period;
  if v_status in ('approved','paid','closed') and coalesce(current_setting('app.payroll_override', true), '') <> 'on' then
    raise exception 'งวดนี้อนุมัติ/ปิดแล้ว ไม่สามารถแก้ไขได้';
  end if;
  return coalesce(new, old);
end $$;
create trigger trg_guard before insert or update or delete on public.payroll_adjustments for each row execute function app.guard_period();
create trigger trg_guard before insert or update or delete on public.commission_entries for each row execute function app.guard_period();
