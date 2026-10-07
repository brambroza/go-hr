-- =====================================================================
-- GO HR — Organization & Employee master data
-- =====================================================================

-- สาขา / สถานประกอบการ
create table public.branches (
  id             bigint generated always as identity primary key,
  code           text not null unique,
  name           text not null,
  name_en        text,
  address        text,
  phone          text,
  tax_branch_no  text default '00000',     -- เลขที่สาขา (ภาษี)
  sso_account_no text,                      -- เลขที่บัญชีนายจ้าง ประกันสังคม
  sso_branch_no  text default '000000',     -- ลำดับที่สาขา ประกันสังคม
  is_head_office boolean not null default false,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- โครงสร้างองค์กร (สูงสุด 10 ชั้น)
create table public.org_units (
  id            bigint generated always as identity primary key,
  code          text not null unique,
  name          text not null,
  name_en       text,
  unit_type     text,                         -- บริษัท / ฝ่าย / แผนก / ส่วน / หน่วย ...
  parent_id     bigint references public.org_units(id),
  level         int not null default 1 check (level between 1 and 10),
  branch_id     bigint references public.branches(id),
  manager_employee_id bigint,
  cost_center   text,
  sort_order    int not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on public.org_units(parent_id);

create or replace function app.org_units_level() returns trigger
language plpgsql as $$
declare v_parent_level int;
begin
  if new.parent_id is null then
    new.level := 1;
  else
    if new.parent_id = new.id then raise exception 'หน่วยงานแม่ต้องไม่ใช่ตัวเอง'; end if;
    select level into v_parent_level from org_units where id = new.parent_id;
    new.level := coalesce(v_parent_level, 0) + 1;
    if new.level > 10 then raise exception 'โครงสร้างองค์กรรองรับสูงสุด 10 ชั้น'; end if;
  end if;
  return new;
end $$;
create trigger trg_org_units_level before insert or update of parent_id on public.org_units
  for each row execute function app.org_units_level();

-- ตำแหน่งงาน (รองรับระดับ 1-20)
create table public.positions (
  id               bigint generated always as identity primary key,
  code             text not null unique,
  name             text not null,
  name_en          text,
  org_unit_id      bigint references public.org_units(id),
  parent_position_id bigint references public.positions(id),   -- สายบังคับบัญชาของตำแหน่ง
  job_level        int not null default 1 check (job_level between 1 and 20),
  job_grade        text,
  min_salary       numeric(14,2),
  max_salary       numeric(14,2),
  headcount_plan   int,
  description      text,
  qualifications   text,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- เส้นทางการเติบโตในตำแหน่ง (career path)
create table public.career_paths (
  id               bigint generated always as identity primary key,
  from_position_id bigint not null references public.positions(id) on delete cascade,
  to_position_id   bigint not null references public.positions(id) on delete cascade,
  min_years        numeric(4,1),
  requirements     text,         -- ทักษะ/หลักสูตร/KPI ที่ต้องผ่าน
  sort_order       int not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Employees
-- ---------------------------------------------------------------------
create table public.employees (
  id                 bigint generated always as identity primary key,
  code               text not null unique,
  prefix             text,                                   -- นาย / นาง / นางสาว
  first_name         text not null,
  last_name          text not null,
  first_name_en      text,
  last_name_en       text,
  nickname           text,
  gender             text check (gender in ('M','F','X')),
  birth_date         date,
  nationality        text default 'ไทย',
  religion           text,
  marital_status     text,                                   -- single / married / divorced / widowed
  blood_type         text,
  military_status    text,
  phone              text,
  email              text,
  photo_url          text,
  line_id            text,
  emergency_name     text,
  emergency_phone    text,
  emergency_relation text,

  branch_id          bigint references public.branches(id),
  org_unit_id        bigint references public.org_units(id),
  position_id        bigint references public.positions(id),
  supervisor_id      bigint references public.employees(id),
  employee_type      text not null default 'monthly' check (employee_type in ('monthly','daily','hourly','contract','intern','parttime')),
  status             text not null default 'probation' check (status in ('probation','permanent','contract','suspended','resigned')),
  hire_date          date not null default current_date,
  probation_days     int not null default 119,
  probation_end_date date,
  confirm_date       date,
  contract_end_date  date,
  resign_date        date,
  resign_reason      text,
  resign_type        text,          -- ลาออกเอง / เลิกจ้าง / เกษียณ / หมดสัญญา / เสียชีวิต

  default_shift_id   bigint,        -- FK added in attendance migration
  weekly_off_days    int[] not null default '{0}',   -- 0=อาทิตย์ … 6=เสาร์
  work_location_ids  bigint[],
  attendance_exempt  boolean not null default false, -- ไม่ต้องลงเวลา (ผู้บริหาร)

  is_active          boolean generated always as (status <> 'resigned') stored,
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index on public.employees(org_unit_id);
create index on public.employees(supervisor_id);
create index on public.employees(branch_id);
create index on public.employees(status);

alter table public.org_units add constraint org_units_manager_fk foreign key (manager_employee_id) references public.employees(id);
alter table public.profiles  add constraint profiles_employee_fk foreign key (employee_id) references public.employees(id);

-- PDPA: sensitive data split into its own table with stricter access
create table public.employee_private (
  employee_id        bigint primary key references public.employees(id) on delete cascade,
  national_id        text,
  passport_no        text,
  passport_expire    date,
  work_permit_no     text,
  work_permit_expire date,
  visa_no            text,
  visa_expire        date,
  tax_id             text,
  salary             numeric(14,2) not null default 0,     -- เงินเดือน / ค่าจ้างต่อวัน / ต่อชั่วโมง ตาม employee_type
  salary_unit        text not null default 'month' check (salary_unit in ('month','day','hour')),
  pay_method         text not null default 'bank' check (pay_method in ('bank','cash','cheque')),
  bank_code          text,                                  -- 004 KBANK, 014 SCB, 002 BBL, 006 KTB, 025 BAY, 011 TTB ...
  bank_branch        text,
  bank_account       text,
  bank_account_name  text,
  sso_enabled        boolean not null default true,
  sso_no             text,
  sso_hospital       text,                                  -- โรงพยาบาลที่มีสิทธิ
  sso_hospital_code  text,
  pvd_enabled        boolean not null default false,        -- กองทุนสำรองเลี้ยงชีพ
  pvd_no             text,
  pvd_employee_rate  numeric(5,2) default 0,
  pvd_employer_rate  numeric(5,2) default 0,
  pvd_join_date      date,
  tax_method         text not null default 'annualized' check (tax_method in ('annualized','none','fixed_rate')),
  tax_fixed_rate     numeric(5,2),
  tax_paid_by_employer boolean not null default false,
  prev_employer_income numeric(14,2) not null default 0,    -- เงินได้จากนายจ้างเดิมในปีภาษี
  prev_employer_tax    numeric(14,2) not null default 0,
  prev_employer_sso    numeric(14,2) not null default 0,
  prev_employer_pvd    numeric(14,2) not null default 0,
  updated_at         timestamptz not null default now()
);

create table public.employee_addresses (
  id            bigint generated always as identity primary key,
  employee_id   bigint not null references public.employees(id) on delete cascade,
  address_type  text not null default 'current' check (address_type in ('registered','current','contact')),
  house_no      text, moo text, village text, soi text, road text,
  subdistrict   text, district text, province text, postcode text, country text default 'ไทย',
  phone         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on public.employee_addresses(employee_id);

create table public.employee_family (
  id               bigint generated always as identity primary key,
  employee_id      bigint not null references public.employees(id) on delete cascade,
  relation         text not null,           -- spouse / child / father / mother / sibling / other
  prefix           text,
  first_name       text not null,
  last_name        text,
  birth_date       date,
  national_id      text,
  occupation       text,
  phone            text,
  is_alive         boolean not null default true,
  is_tax_allowance boolean not null default false,   -- ใช้สิทธิ์ลดหย่อน
  is_disabled      boolean not null default false,
  is_studying      boolean not null default false,
  child_order      int,                                -- บุตรคนที่ (ลดหย่อนบุตรคนที่ 2 เกิดปี 2561+)
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index on public.employee_family(employee_id);

create table public.employee_education (
  id            bigint generated always as identity primary key,
  employee_id   bigint not null references public.employees(id) on delete cascade,
  level         text not null,             -- ม.6 / ปวช / ปวส / ป.ตรี / ป.โท / ป.เอก
  institution   text,
  faculty       text,
  major         text,
  gpa           numeric(4,2),
  year_from     int,
  year_to       int,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on public.employee_education(employee_id);

create table public.employee_work_history (
  id             bigint generated always as identity primary key,
  employee_id    bigint not null references public.employees(id) on delete cascade,
  company        text not null,
  position       text,
  start_date     date,
  end_date       date,
  last_salary    numeric(14,2),
  responsibility text,
  reason_leaving text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index on public.employee_work_history(employee_id);

create table public.employee_skills (
  id           bigint generated always as identity primary key,
  employee_id  bigint not null references public.employees(id) on delete cascade,
  category     text not null default 'other',  -- language / computer / driving / certificate / other
  name         text not null,
  level        text,
  expire_date  date,
  note         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index on public.employee_skills(employee_id);

-- ข้อมูลลดหย่อนภาษี (ต่อปีภาษี)
create table public.employee_tax_deductions (
  id            bigint generated always as identity primary key,
  employee_id   bigint not null references public.employees(id) on delete cascade,
  tax_year      int not null,                   -- ค.ศ.
  deduction_code text not null,                 -- อ้างอิง settings.tax_config.deductions[].code
  amount        numeric(14,2) not null default 0,
  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (employee_id, tax_year, deduction_code)
);

-- เงินประกันการทำงาน
create table public.employee_guarantees (
  id               bigint generated always as identity primary key,
  employee_id      bigint not null references public.employees(id) on delete cascade,
  total_amount     numeric(14,2) not null default 0,
  monthly_amount   numeric(14,2) not null default 0,  -- หักต่องวด (0 = เก็บครั้งเดียว)
  collected_amount numeric(14,2) not null default 0,
  start_date       date,
  bank_deposit_ref text,                              -- เลขบัญชีเงินฝากที่นำฝาก
  refunded_date    date,
  refunded_amount  numeric(14,2),
  note             text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- กองทุนอื่น ๆ / สหกรณ์
create table public.employee_funds (
  id              bigint generated always as identity primary key,
  employee_id     bigint not null references public.employees(id) on delete cascade,
  fund_name       text not null,
  member_no       text,
  monthly_amount  numeric(14,2) not null default 0,
  rate_percent    numeric(5,2),
  start_date      date,
  end_date        date,
  note            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ประวัติการฝึกอบรม (บันทึกเองหรือมาจาก training_attendees)
create table public.employee_trainings (
  id            bigint generated always as identity primary key,
  employee_id   bigint not null references public.employees(id) on delete cascade,
  course_name   text not null,
  provider      text,
  start_date    date,
  end_date      date,
  hours         numeric(6,2),
  cost          numeric(14,2),
  result        text,
  certificate_url text,
  source        text not null default 'manual',      -- manual / training / elearning
  source_id     bigint,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on public.employee_trainings(employee_id);

-- สินทรัพย์ถือครอง
create table public.employee_assets (
  id            bigint generated always as identity primary key,
  employee_id   bigint not null references public.employees(id) on delete cascade,
  asset_code    text,
  asset_name    text not null,
  serial_no     text,
  value         numeric(14,2),
  issued_date   date,
  returned_date date,
  condition     text,
  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on public.employee_assets(employee_id);

-- เอกสารแนบพนักงาน (สัญญาจ้าง, บัตร ปชช., วีซ่า ...)
create table public.employee_documents (
  id            bigint generated always as identity primary key,
  employee_id   bigint not null references public.employees(id) on delete cascade,
  doc_type      text not null,
  title         text not null,
  file_url      text,
  issue_date    date,
  expire_date   date,
  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on public.employee_documents(employee_id);

-- ประวัติเงินเดือน
create table public.salary_history (
  id             bigint generated always as identity primary key,
  employee_id    bigint not null references public.employees(id) on delete cascade,
  effective_date date not null,
  old_salary     numeric(14,2),
  new_salary     numeric(14,2) not null,
  change_percent numeric(7,2),
  reason         text,                 -- ปรับประจำปี / เลื่อนตำแหน่ง / ผ่านทดลองงาน ...
  ref_type       text,
  ref_id         bigint,
  created_by     uuid,
  created_at     timestamptz not null default now()
);
create index on public.salary_history(employee_id, effective_date);

-- ข้อมูลใบหน้า (Face Recognition) — descriptor 128 มิติจาก face-api
create table public.employee_faces (
  id            bigint generated always as identity primary key,
  employee_id   bigint not null references public.employees(id) on delete cascade,
  descriptor    real[] not null,
  photo_url     text,
  created_at    timestamptz not null default now()
);
create index on public.employee_faces(employee_id);

-- ทีมงาน
create table public.teams (
  id                 bigint generated always as identity primary key,
  name               text not null,
  description        text,
  leader_employee_id bigint references public.employees(id),
  is_active          boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create table public.team_members (
  team_id     bigint not null references public.teams(id) on delete cascade,
  employee_id bigint not null references public.employees(id) on delete cascade,
  role        text,
  primary key (team_id, employee_id)
);

-- นโยบายบริษัท
create table public.policies (
  id            bigint generated always as identity primary key,
  title         text not null,
  category      text,
  content       text,
  attachments   jsonb not null default '[]'::jsonb,     -- [{name,url,type}]
  effective_date date,
  require_ack   boolean not null default false,
  is_active     boolean not null default true,
  created_by    uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create table public.policy_acks (
  policy_id   bigint not null references public.policies(id) on delete cascade,
  employee_id bigint not null references public.employees(id) on delete cascade,
  acked_at    timestamptz not null default now(),
  primary key (policy_id, employee_id)
);

-- ปรับโครงสร้างองค์กร/ตำแหน่ง/โอนย้าย/แต่งตั้ง/ปรับเงินเดือน (ล่วงหน้าได้)
create table public.employee_movements (
  id                 bigint generated always as identity primary key,
  doc_no             text unique,
  employee_id        bigint not null references public.employees(id) on delete cascade,
  movement_type      text not null check (movement_type in ('transfer','promote','demote','appoint','salary_adjust','confirm','status_change','resign','rehire')),
  effective_date     date not null,
  new_branch_id      bigint references public.branches(id),
  new_org_unit_id    bigint references public.org_units(id),
  new_position_id    bigint references public.positions(id),
  new_supervisor_id  bigint references public.employees(id),
  new_employee_type  text,
  new_status         text,
  new_salary         numeric(14,2),
  old_snapshot       jsonb,
  reason             text,
  status             text not null default 'pending' check (status in ('draft','pending','approved','applied','cancelled')),
  request_id         bigint,
  applied_at         timestamptz,
  created_by         uuid,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index on public.employee_movements(status, effective_date);

-- ---------------------------------------------------------------------
-- Visibility helpers
-- ---------------------------------------------------------------------
-- subordinates (direct & indirect) of an employee
create or replace function app.subordinate_ids(p_emp bigint) returns setof bigint
language sql stable security definer set search_path = public as $$
  with recursive t(id, depth) as (
    select id, 1 from employees where supervisor_id = p_emp
    union all
    select e.id, t.depth + 1 from employees e join t on e.supervisor_id = t.id where t.depth < 20
  ) select id from t
$$;

create or replace function app.org_subtree(p_org bigint) returns setof bigint
language sql stable security definer set search_path = public as $$
  with recursive t(id) as (
    select p_org
    union all
    select o.id from org_units o join t on o.parent_id = t.id
  ) select id from t
$$;

-- Can the current user see this employee's (non-sensitive) data?
create or replace function app.can_see_employee(p_emp bigint) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  v_me bigint := app.my_employee_id();
  v_scope text;
  v_has boolean := app.has_perm('employee','view');
begin
  if p_emp is null then return false; end if;
  if v_me is not null and p_emp = v_me then return true; end if;
  if v_me is not null and exists (select 1 from app.subordinate_ids(v_me) s where s = p_emp) then return true; end if;
  if not v_has then return false; end if;
  v_scope := app.my_scope();
  if v_scope = 'all' then return true; end if;
  if v_me is null then return false; end if;
  if v_scope = 'branch' then
    return exists (select 1 from employees a, employees b where a.id = p_emp and b.id = v_me and a.branch_id is not distinct from b.branch_id);
  elsif v_scope = 'org' then
    return exists (select 1 from employees a where a.id = p_emp and a.org_unit_id in (select app.org_subtree((select org_unit_id from employees where id = v_me))));
  elsif v_scope = 'team' then
    return exists (select 1 from team_members a join team_members b on a.team_id = b.team_id where a.employee_id = p_emp and b.employee_id = v_me);
  end if;
  return false;
end $$;

-- Sensitive (PDPA) data: only self or users with employee_private perm (within scope)
create or replace function app.can_see_private(p_emp bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select p_emp = app.my_employee_id()
      or (app.has_perm('employee_private','view') and app.can_see_employee(p_emp))
$$;

-- is the current user the supervisor (any level) of p_emp?
create or replace function app.is_manager_of(p_emp bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select app.my_employee_id() is not null
     and exists (select 1 from app.subordinate_ids(app.my_employee_id()) s where s = p_emp)
$$;

-- ---------------------------------------------------------------------
-- Masked directory view (ข้อมูลผู้ติดต่อภายใน) — readable by every employee
-- ---------------------------------------------------------------------
create or replace view public.v_directory with (security_invoker = false) as
select e.id, e.code, e.prefix, e.first_name, e.last_name, e.nickname, e.first_name_en, e.last_name_en,
       e.email, e.phone, e.photo_url, e.branch_id, e.org_unit_id, e.position_id, e.supervisor_id, e.status,
       o.name as org_unit_name, p.name as position_name, b.name as branch_name
  from public.employees e
  left join public.org_units o on o.id = e.org_unit_id
  left join public.positions p on p.id = e.position_id
  left join public.branches b on b.id = e.branch_id
 where e.status <> 'resigned';
revoke all on public.v_directory from anon;
grant select on public.v_directory to authenticated;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
select app.std_policies('public.branches', 'org', 'master');
select app.std_policies('public.org_units', 'org', 'master');
select app.std_policies('public.positions', 'org', 'master');
select app.std_policies('public.career_paths', 'org', 'master');
select app.std_policies('public.teams', 'org', 'master');
select app.std_policies('public.team_members', 'org', 'master');
select app.std_policies('public.policies', 'org', 'master');

alter table public.policy_acks enable row level security;
create policy p_sel on public.policy_acks for select to authenticated using (employee_id = app.my_employee_id() or app.has_perm('org','view'));
create policy p_ins on public.policy_acks for insert to authenticated with check (employee_id = app.my_employee_id());

-- employees
alter table public.employees enable row level security;
create policy p_sel on public.employees for select to authenticated using (app.can_see_employee(id));
create policy p_ins on public.employees for insert to authenticated with check (app.has_perm('employee','create'));
create policy p_upd on public.employees for update to authenticated using (app.has_perm('employee','edit') and app.can_see_employee(id)) with check (app.has_perm('employee','edit'));
create policy p_del on public.employees for delete to authenticated using (app.has_perm('employee','delete'));

alter table public.employee_private enable row level security;
create policy p_sel on public.employee_private for select to authenticated using (app.can_see_private(employee_id));
create policy p_all on public.employee_private for all to authenticated
  using (app.has_perm('employee_private','edit') and app.can_see_employee(employee_id))
  with check (app.has_perm('employee_private','edit'));

-- child tables of employees: read = can_see_employee; write = employee/edit (or self for some)
do $$
declare t text;
begin
  foreach t in array array['employee_addresses','employee_family','employee_education','employee_work_history',
                           'employee_skills','employee_trainings','employee_assets','employee_documents',
                           'employee_funds','employee_guarantees','employee_faces','employee_movements'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy p_sel on public.%I for select to authenticated using (app.can_see_employee(employee_id))', t);
    execute format('create policy p_wr on public.%I for all to authenticated using (app.has_perm(''employee'',''edit'') and app.can_see_employee(employee_id)) with check (app.has_perm(''employee'',''edit''))', t);
  end loop;
end $$;

-- Self-service edits allowed on a few tabs (ข้อมูลส่วนตัวที่พนักงานแก้เองได้)
create policy p_self on public.employee_addresses for all to authenticated using (employee_id = app.my_employee_id()) with check (employee_id = app.my_employee_id());
create policy p_self on public.employee_family for all to authenticated using (employee_id = app.my_employee_id()) with check (employee_id = app.my_employee_id());
create policy p_self on public.employee_education for all to authenticated using (employee_id = app.my_employee_id()) with check (employee_id = app.my_employee_id());
create policy p_self on public.employee_skills for all to authenticated using (employee_id = app.my_employee_id()) with check (employee_id = app.my_employee_id());

alter table public.employee_tax_deductions enable row level security;
create policy p_sel on public.employee_tax_deductions for select to authenticated using (app.can_see_private(employee_id));
create policy p_self on public.employee_tax_deductions for all to authenticated using (employee_id = app.my_employee_id()) with check (employee_id = app.my_employee_id());
create policy p_hr on public.employee_tax_deductions for all to authenticated using (app.has_perm('employee_private','edit')) with check (app.has_perm('employee_private','edit'));

alter table public.salary_history enable row level security;
create policy p_sel on public.salary_history for select to authenticated using (app.can_see_private(employee_id));
create policy p_wr on public.salary_history for all to authenticated using (app.has_perm('employee_private','edit')) with check (app.has_perm('employee_private','edit'));

-- triggers
do $$
declare t text;
begin
  foreach t in array array['branches','org_units','positions','career_paths','employees','employee_private','employee_addresses',
                           'employee_family','employee_education','employee_work_history','employee_skills','employee_tax_deductions',
                           'employee_guarantees','employee_funds','employee_trainings','employee_assets','employee_documents',
                           'teams','policies','employee_movements'] loop
    if exists (select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name='updated_at') then
      execute format('create trigger trg_touch before update on public.%I for each row execute function app.touch_updated_at()', t);
    end if;
    perform app.enable_audit(('public.' || t)::regclass);
  end loop;
end $$;

-- default probation end date / private row
create or replace function app.employees_defaults() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.probation_end_date is null and new.hire_date is not null and new.status = 'probation' then
    new.probation_end_date := new.hire_date + (coalesce(new.probation_days, 119) || ' days')::interval;
  end if;
  return new;
end $$;
create trigger trg_employees_defaults before insert on public.employees for each row execute function app.employees_defaults();

create or replace function app.employees_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into employee_private(employee_id) values (new.id) on conflict do nothing;
  return new;
end $$;
create trigger trg_employees_ai after insert on public.employees for each row execute function app.employees_after_insert();

-- salary change → history
create or replace function app.salary_history_trigger() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.salary is distinct from old.salary then
    insert into salary_history(employee_id, effective_date, old_salary, new_salary, change_percent, reason, created_by)
    values (new.employee_id, current_date, old.salary, new.salary,
            case when coalesce(old.salary,0) > 0 then round((new.salary - old.salary) * 100 / old.salary, 2) end,
            coalesce(current_setting('app.salary_reason', true), 'แก้ไขข้อมูลเงินเดือน'), auth.uid());
  end if;
  return new;
end $$;
create trigger trg_salary_history after update of salary on public.employee_private for each row execute function app.salary_history_trigger();
