-- =====================================================================
-- GO HR — Recruitment, Probation, Learning, Performance, Warning letters
-- =====================================================================

-- ---------------------------------------------------------------------
-- Recruitment (ระบบสมัครพนักงาน / ใบสมัครงานออนไลน์)
-- ---------------------------------------------------------------------
create table public.job_postings (
  id              bigint generated always as identity primary key,
  slug            text not null unique default encode(gen_random_bytes(5), 'hex'),
  title           text not null,
  position_id     bigint references public.positions(id),
  org_unit_id     bigint references public.org_units(id),
  branch_id       bigint references public.branches(id),
  headcount       int not null default 1,
  employment_type text not null default 'monthly',
  salary_min      numeric(14,2),
  salary_max      numeric(14,2),
  show_salary     boolean not null default true,
  location_text   text,
  description     text,
  qualifications  text,
  benefits        text,
  questions       jsonb not null default '[]'::jsonb,     -- คำถามเพิ่มเติมในใบสมัคร [{key,label,type,required,options}]
  status          text not null default 'draft' check (status in ('draft','open','paused','closed')),
  open_date       date,
  close_date      date,
  hiring_manager_id bigint references public.employees(id),
  created_by      uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table public.applicants (
  id               bigint generated always as identity primary key,
  ref_no           text unique,
  posting_id       bigint references public.job_postings(id) on delete set null,
  prefix           text,
  first_name       text not null,
  last_name        text not null,
  nickname         text,
  email            text,
  phone            text not null,
  birth_date       date,
  gender           text,
  address          text,
  education_level  text,
  institution      text,
  major            text,
  experience_years numeric(4,1),
  last_company     text,
  last_position    text,
  expected_salary  numeric(14,2),
  available_date   date,
  resume_url       text,
  photo_url        text,
  cover_letter     text,
  answers          jsonb not null default '{}'::jsonb,
  source           text default 'careers',             -- careers / walk-in / referral / jobsdb / jobthai / facebook / line
  referrer_employee_id bigint references public.employees(id),
  stage            text not null default 'applied' check (stage in ('applied','screening','interview','assessment','offer','hired','rejected','withdrawn','talent_pool')),
  rating           int check (rating between 1 and 5),
  tags             text[],
  notes            text,
  consent_pdpa     boolean not null default false,
  consent_at       timestamptz,
  employee_id      bigint references public.employees(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index on public.applicants(posting_id, stage);

create table public.applicant_activities (
  id            bigint generated always as identity primary key,
  applicant_id  bigint not null references public.applicants(id) on delete cascade,
  activity_type text not null,            -- stage_change / note / interview / email / offer
  from_stage    text,
  to_stage      text,
  note          text,
  created_by    uuid,
  created_at    timestamptz not null default now()
);

create table public.interviews (
  id              bigint generated always as identity primary key,
  applicant_id    bigint not null references public.applicants(id) on delete cascade,
  round           int not null default 1,
  scheduled_at    timestamptz not null,
  duration_min    int not null default 60,
  mode            text not null default 'onsite' check (mode in ('onsite','online','phone')),
  location        text,
  meeting_url     text,
  interviewer_ids bigint[],                       -- employees
  scores          jsonb not null default '{}'::jsonb,   -- {"<employee_id>":{"score":4,"comment":"..","criteria":{...}}}
  result          text check (result in ('pass','fail','hold')),
  comment         text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Public application (no login) — validated & rate limited by the app route, inserted via service role
-- (anon has no direct insert; see /app/careers)

-- ---------------------------------------------------------------------
-- Evaluation forms (ใช้ร่วมกัน: ทดลองงาน / ประจำปี / ประเมินหัวหน้า / 360)
--   sections: [{"title":"ความรู้ในงาน","weight":40,"criteria":[{"key":"c1","name":"..","weight":50,"description":".."}]}]
-- ---------------------------------------------------------------------
create table public.eval_forms (
  id          bigint generated always as identity primary key,
  name        text not null,
  form_type   text not null default 'annual' check (form_type in ('probation','annual','supervisor','360','custom')),
  scale_max   int not null default 5,
  scale_labels jsonb not null default '["ต้องปรับปรุง","พอใช้","ดี","ดีมาก","ดีเยี่ยม"]'::jsonb,
  sections    jsonb not null default '[]'::jsonb,
  kpi_weight  numeric(5,2) not null default 0,       -- น้ำหนัก KPI (%) — ส่วนที่เหลือเป็นสมรรถนะ
  open_questions jsonb not null default '[]'::jsonb, -- คำถามปลายเปิด
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ประเมินพนักงานทดลองงาน
create table public.probation_evaluations (
  id                    bigint generated always as identity primary key,
  employee_id           bigint not null references public.employees(id) on delete cascade,
  form_id               bigint references public.eval_forms(id),
  round                 int not null default 1,
  evaluator_employee_id bigint references public.employees(id),
  due_date              date,
  status                text not null default 'pending' check (status in ('pending','submitted','approved','cancelled')),
  scores                jsonb not null default '{}'::jsonb,
  answers               jsonb not null default '{}'::jsonb,
  total_score           numeric(6,2),
  result                text check (result in ('pass','extend','fail')),
  extend_days           int,
  comment               text,
  submitted_at          timestamptz,
  approved_by           uuid,
  approved_at           timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- KPI
-- ---------------------------------------------------------------------
create table public.kpi_profiles (
  id          bigint generated always as identity primary key,
  name        text not null,
  position_id bigint references public.positions(id),
  org_unit_id bigint references public.org_units(id),
  description text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create table public.kpi_items (
  id           bigint generated always as identity primary key,
  profile_id   bigint not null references public.kpi_profiles(id) on delete cascade,
  name         text not null,
  description  text,
  unit         text,
  target       numeric(14,2),
  weight       numeric(5,2) not null default 0,
  direction    text not null default 'higher' check (direction in ('higher','lower','exact')),
  source       text not null default 'manual' check (source in ('manual','external','attendance')),
  external_key text,                               -- ใช้จับคู่ตอน import KPI จากระบบภายนอก
  attendance_metric text,                          -- late_count / absent_days / leave_days
  scoring      jsonb,                              -- [{"min":100,"score":5},{"min":90,"score":4},...]
  sort_order   int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- รอบการประเมิน
create table public.eval_cycles (
  id                 bigint generated always as identity primary key,
  name               text not null,
  eval_year          int not null,
  form_id            bigint not null references public.eval_forms(id),
  start_date         date not null,
  end_date           date not null,
  period_from        date,
  period_to          date,
  self_eval          boolean not null default true,
  supervisor_eval    boolean not null default true,
  supervisor_weight  numeric(5,2) not null default 100,   -- น้ำหนักคะแนนหัวหน้า vs ประเมินตนเอง
  upward_eval        boolean not null default false,       -- ลูกน้องประเมินหัวหน้า
  peer_eval          boolean not null default false,
  grade_scale        jsonb not null default '[{"grade":"A","min":90},{"grade":"B","min":80},{"grade":"C","min":70},{"grade":"D","min":60},{"grade":"E","min":0}]'::jsonb,
  filter             jsonb not null default '{}'::jsonb,   -- {"org_unit_ids":[],"employee_types":[]}
  status             text not null default 'draft' check (status in ('draft','open','calibration','closed')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table public.employee_kpis (
  id           bigint generated always as identity primary key,
  cycle_id     bigint not null references public.eval_cycles(id) on delete cascade,
  employee_id  bigint not null references public.employees(id) on delete cascade,
  kpi_item_id  bigint references public.kpi_items(id),
  name         text not null,
  unit         text,
  target       numeric(14,2),
  weight       numeric(5,2) not null default 0,
  direction    text not null default 'higher',
  actual       numeric(14,2),
  score        numeric(6,2),
  source       text not null default 'manual',
  note         text,
  updated_at   timestamptz not null default now(),
  created_at   timestamptz not null default now()
);
create index on public.employee_kpis(cycle_id, employee_id);

create table public.eval_assignments (
  id                    bigint generated always as identity primary key,
  cycle_id              bigint not null references public.eval_cycles(id) on delete cascade,
  employee_id           bigint not null references public.employees(id) on delete cascade,   -- ผู้ถูกประเมิน
  evaluator_employee_id bigint not null references public.employees(id) on delete cascade,
  relation              text not null check (relation in ('self','supervisor','upward','peer')),
  status                text not null default 'pending' check (status in ('pending','draft','submitted')),
  scores                jsonb not null default '{}'::jsonb,
  answers               jsonb not null default '{}'::jsonb,
  competency_score      numeric(6,2),
  comment               text,
  submitted_at          timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (cycle_id, employee_id, evaluator_employee_id, relation)
);

create table public.eval_results (
  id                bigint generated always as identity primary key,
  cycle_id          bigint not null references public.eval_cycles(id) on delete cascade,
  employee_id       bigint not null references public.employees(id) on delete cascade,
  competency_score  numeric(6,2),
  kpi_score         numeric(6,2),
  final_score       numeric(6,2),
  grade             text,
  calibrated_grade  text,
  salary_increase_pct numeric(6,2),
  bonus_months      numeric(6,2),
  note              text,
  acknowledged_at   timestamptz,
  updated_at        timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  unique (cycle_id, employee_id)
);

-- จดหมายเตือน
create table public.warning_letters (
  id              bigint generated always as identity primary key,
  doc_no          text unique,
  employee_id     bigint not null references public.employees(id) on delete cascade,
  issue_date      date not null default current_date,
  level           text not null check (level in ('verbal','written_1','written_2','final','suspension','termination')),
  offense         text not null,
  detail          text,
  incident_date   date,
  rule_reference  text,                          -- ข้อบังคับข้อที่
  penalty         text,
  suspension_days int,
  expire_date     date,                          -- หนังสือเตือนมีผล 1 ปี (ม.119 (4))
  issued_by       uuid,
  witness         text,
  attachment_url  text,
  acknowledged_at timestamptz,
  employee_comment text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Learning (E-Library / E-Learning / Classroom training)
-- ---------------------------------------------------------------------
create table public.library_items (
  id           bigint generated always as identity primary key,
  title        text not null,
  item_type    text not null check (item_type in ('video','pdf','link','article','youtube','slide')),
  url          text,
  content      text,
  category     text,
  duration_min int,
  thumbnail_url text,
  is_active    boolean not null default true,
  created_by   uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.courses (
  id             bigint generated always as identity primary key,
  code           text unique,
  title          text not null,
  description    text,
  category       text,
  cover_url      text,
  hours          numeric(6,2),
  pass_score     numeric(5,2) not null default 70,
  quiz           jsonb not null default '[]'::jsonb,   -- [{"q":"...","choices":["a","b"],"answer":1}]
  audience       jsonb not null default '{"all":true}'::jsonb,   -- {"all":bool,"org_unit_ids":[],"position_ids":[]}
  is_mandatory   boolean not null default false,
  due_days       int,
  certificate    boolean not null default true,
  is_published   boolean not null default false,
  created_by     uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table public.course_lessons (
  id              bigint generated always as identity primary key,
  course_id       bigint not null references public.courses(id) on delete cascade,
  library_item_id bigint references public.library_items(id),
  title           text not null,
  content         text,
  sort_order      int not null default 0,
  min_minutes     int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table public.course_enrollments (
  id                bigint generated always as identity primary key,
  course_id         bigint not null references public.courses(id) on delete cascade,
  employee_id       bigint not null references public.employees(id) on delete cascade,
  status            text not null default 'enrolled' check (status in ('enrolled','in_progress','completed','failed')),
  completed_lessons bigint[] not null default '{}',
  progress          numeric(5,2) not null default 0,
  quiz_score        numeric(5,2),
  attempts          int not null default 0,
  due_date          date,
  started_at        timestamptz,
  completed_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (course_id, employee_id)
);

create table public.training_sessions (
  id           bigint generated always as identity primary key,
  title        text not null,
  course_id    bigint references public.courses(id),
  training_type text not null default 'internal' check (training_type in ('internal','external','online')),
  provider     text,
  trainer      text,
  location     text,
  start_at     timestamptz not null,
  end_at       timestamptz not null,
  hours        numeric(6,2),
  cost_total   numeric(14,2),
  capacity     int,
  is_dsd       boolean not null default false,   -- นับเป็นการฝึกอบรมตาม พ.ร.บ.ส่งเสริมการพัฒนาฝีมือแรงงาน
  status       text not null default 'planned' check (status in ('planned','open','done','cancelled')),
  description  text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.training_attendees (
  id            bigint generated always as identity primary key,
  session_id    bigint not null references public.training_sessions(id) on delete cascade,
  employee_id   bigint not null references public.employees(id) on delete cascade,
  status        text not null default 'registered' check (status in ('registered','attended','absent','cancelled')),
  pre_score     numeric(6,2),
  post_score    numeric(6,2),
  feedback      text,
  rating        int,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (session_id, employee_id)
);

-- attended → employee_trainings
create or replace function app.training_attended() returns trigger
language plpgsql security definer set search_path = public as $$
declare s training_sessions%rowtype;
begin
  if new.status = 'attended' and (tg_op = 'INSERT' or old.status is distinct from 'attended') then
    select * into s from training_sessions where id = new.session_id;
    insert into employee_trainings(employee_id, course_name, provider, start_date, end_date, hours, cost, result, source, source_id)
    values (new.employee_id, s.title, coalesce(s.provider, s.trainer), (s.start_at at time zone 'Asia/Bangkok')::date,
            (s.end_at at time zone 'Asia/Bangkok')::date, s.hours,
            case when s.cost_total is not null then round(s.cost_total / greatest((select count(*) from training_attendees where session_id = s.id and status <> 'cancelled'),1), 2) end,
            case when new.post_score is not null then 'คะแนนหลังอบรม ' || new.post_score end, 'training', s.id);
  end if;
  return new;
end $$;
create trigger trg_training_attended after insert or update of status on public.training_attendees for each row execute function app.training_attended();

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
select app.std_policies('public.job_postings', 'recruit', 'restrict');
create policy p_public on public.job_postings for select using (status = 'open');

select app.std_policies('public.applicants', 'recruit', 'restrict');
select app.std_policies('public.applicant_activities', 'recruit', 'restrict');
select app.std_policies('public.interviews', 'recruit', 'restrict');
-- interviewers can see their interviews & the applicant
create policy p_interviewer on public.interviews for select to authenticated using (app.my_employee_id() = any(interviewer_ids));
create policy p_interviewer_upd on public.interviews for update to authenticated using (app.my_employee_id() = any(interviewer_ids)) with check (app.my_employee_id() = any(interviewer_ids));
create policy p_interviewer on public.applicants for select to authenticated using (
  exists (select 1 from interviews i where i.applicant_id = applicants.id and app.my_employee_id() = any(i.interviewer_ids))
  or exists (select 1 from job_postings j where j.id = applicants.posting_id and j.hiring_manager_id = app.my_employee_id()));

select app.std_policies('public.eval_forms', 'performance', 'master');
select app.std_policies('public.kpi_profiles', 'performance', 'master');
select app.std_policies('public.kpi_items', 'performance', 'master');
select app.std_policies('public.eval_cycles', 'performance', 'master');

alter table public.probation_evaluations enable row level security;
create policy p_sel on public.probation_evaluations for select to authenticated using (
  evaluator_employee_id = app.my_employee_id() or app.is_manager_of(employee_id) or (app.has_perm('recruit','view') and app.can_see_employee(employee_id)));
create policy p_eval on public.probation_evaluations for update to authenticated using (evaluator_employee_id = app.my_employee_id() and status = 'pending')
  with check (evaluator_employee_id = app.my_employee_id());
create policy p_hr on public.probation_evaluations for all to authenticated using (app.has_perm('recruit','edit')) with check (app.has_perm('recruit','edit'));

alter table public.eval_assignments enable row level security;
create policy p_sel on public.eval_assignments for select to authenticated using (
  evaluator_employee_id = app.my_employee_id()
  or (employee_id = app.my_employee_id() and relation = 'self')
  or (app.is_manager_of(employee_id) and relation <> 'upward')
  or app.has_perm('performance','view'));
create policy p_eval on public.eval_assignments for update to authenticated using (evaluator_employee_id = app.my_employee_id() and status <> 'submitted')
  with check (evaluator_employee_id = app.my_employee_id());
create policy p_hr on public.eval_assignments for all to authenticated using (app.has_perm('performance','edit')) with check (app.has_perm('performance','edit'));

alter table public.employee_kpis enable row level security;
create policy p_sel on public.employee_kpis for select to authenticated using (employee_id = app.my_employee_id() or app.is_manager_of(employee_id) or app.has_perm('performance','view'));
create policy p_mgr on public.employee_kpis for update to authenticated using (app.is_manager_of(employee_id)) with check (app.is_manager_of(employee_id));
create policy p_hr on public.employee_kpis for all to authenticated using (app.has_perm('performance','edit')) with check (app.has_perm('performance','edit'));

alter table public.eval_results enable row level security;
create policy p_sel on public.eval_results for select to authenticated using (
  (employee_id = app.my_employee_id() and exists (select 1 from eval_cycles c where c.id = cycle_id and c.status = 'closed'))
  or app.is_manager_of(employee_id) or app.has_perm('performance','view'));
create policy p_ack on public.eval_results for update to authenticated using (employee_id = app.my_employee_id()) with check (employee_id = app.my_employee_id());
create policy p_hr on public.eval_results for all to authenticated using (app.has_perm('performance','edit')) with check (app.has_perm('performance','edit'));

alter table public.warning_letters enable row level security;
create policy p_sel on public.warning_letters for select to authenticated using (employee_id = app.my_employee_id() or app.is_manager_of(employee_id) or (app.has_perm('performance','view') and app.can_see_employee(employee_id)));
create policy p_ack on public.warning_letters for update to authenticated using (employee_id = app.my_employee_id()) with check (employee_id = app.my_employee_id());
create policy p_hr on public.warning_letters for all to authenticated using (app.has_perm('performance','edit')) with check (app.has_perm('performance','edit'));

select app.std_policies('public.library_items', 'learning', 'master');
select app.std_policies('public.courses', 'learning', 'master');
select app.std_policies('public.course_lessons', 'learning', 'master');
select app.std_policies('public.training_sessions', 'learning', 'master');

alter table public.course_enrollments enable row level security;
create policy p_sel on public.course_enrollments for select to authenticated using (employee_id = app.my_employee_id() or app.is_manager_of(employee_id) or app.has_perm('learning','view'));
create policy p_self on public.course_enrollments for all to authenticated using (employee_id = app.my_employee_id()) with check (employee_id = app.my_employee_id());
create policy p_hr on public.course_enrollments for all to authenticated using (app.has_perm('learning','edit')) with check (app.has_perm('learning','edit'));

alter table public.training_attendees enable row level security;
create policy p_sel on public.training_attendees for select to authenticated using (employee_id = app.my_employee_id() or app.is_manager_of(employee_id) or app.has_perm('learning','view'));
create policy p_self on public.training_attendees for insert to authenticated with check (employee_id = app.my_employee_id() and status = 'registered');
create policy p_feedback on public.training_attendees for update to authenticated using (employee_id = app.my_employee_id()) with check (employee_id = app.my_employee_id());
create policy p_hr on public.training_attendees for all to authenticated using (app.has_perm('learning','edit')) with check (app.has_perm('learning','edit'));

do $$
declare t text;
begin
  foreach t in array array['job_postings','applicants','interviews','eval_forms','probation_evaluations','kpi_profiles','kpi_items',
                           'eval_cycles','employee_kpis','eval_assignments','eval_results','warning_letters','library_items','courses',
                           'course_lessons','course_enrollments','training_sessions','training_attendees'] loop
    execute format('create trigger trg_touch before update on public.%I for each row execute function app.touch_updated_at()', t);
  end loop;
  foreach t in array array['job_postings','applicants','interviews','eval_forms','probation_evaluations','eval_cycles','eval_results',
                           'warning_letters','courses','training_sessions'] loop
    perform app.enable_audit(('public.' || t)::regclass);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Business functions
-- ---------------------------------------------------------------------
-- Move applicant through pipeline with history
create or replace function public.applicant_move(p_applicant_id bigint, p_stage text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_old text;
begin
  if not app.has_perm('recruit','edit') then raise exception 'ไม่มีสิทธิ์'; end if;
  select stage into v_old from applicants where id = p_applicant_id for update;
  update applicants set stage = p_stage where id = p_applicant_id;
  insert into applicant_activities(applicant_id, activity_type, from_stage, to_stage, note, created_by)
  values (p_applicant_id, 'stage_change', v_old, p_stage, p_note, auth.uid());
end $$;

-- Hire applicant → create employee
create or replace function public.applicant_hire(p_applicant_id bigint, p_code text, p_hire_date date, p_position_id bigint default null,
  p_org_unit_id bigint default null, p_branch_id bigint default null, p_supervisor_id bigint default null, p_salary numeric default null,
  p_shift_id bigint default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare a applicants%rowtype; v_emp bigint; j job_postings%rowtype;
begin
  if not (app.has_perm('recruit','edit') and app.has_perm('employee','create')) then raise exception 'ไม่มีสิทธิ์'; end if;
  select * into a from applicants where id = p_applicant_id for update;
  if a.employee_id is not null then raise exception 'ผู้สมัครนี้ถูกบรรจุเป็นพนักงานแล้ว'; end if;
  select * into j from job_postings where id = a.posting_id;
  insert into employees(code, prefix, first_name, last_name, nickname, gender, birth_date, phone, email, photo_url,
                        branch_id, org_unit_id, position_id, supervisor_id, employee_type, status, hire_date, default_shift_id)
  values (p_code, a.prefix, a.first_name, a.last_name, a.nickname, a.gender, a.birth_date, a.phone, a.email, a.photo_url,
          coalesce(p_branch_id, j.branch_id), coalesce(p_org_unit_id, j.org_unit_id), coalesce(p_position_id, j.position_id),
          coalesce(p_supervisor_id, j.hiring_manager_id), coalesce(j.employment_type,'monthly'), 'probation', p_hire_date,
          coalesce(p_shift_id, (select id from shifts where is_active order by id limit 1)))
  returning id into v_emp;
  update employee_private set salary = coalesce(p_salary, a.expected_salary, 0) where employee_id = v_emp;
  if a.education_level is not null then
    insert into employee_education(employee_id, level, institution, major) values (v_emp, a.education_level, a.institution, a.major);
  end if;
  if a.last_company is not null then
    insert into employee_work_history(employee_id, company, position) values (v_emp, a.last_company, a.last_position);
  end if;
  update applicants set stage = 'hired', employee_id = v_emp where id = a.id;
  insert into applicant_activities(applicant_id, activity_type, from_stage, to_stage, note, created_by)
  values (a.id, 'stage_change', a.stage, 'hired', 'บรรจุเป็นพนักงานรหัส ' || p_code, auth.uid());
  return v_emp;
end $$;

-- Create eval assignments for a cycle
create or replace function public.eval_cycle_generate(p_cycle_id bigint) returns int
language plpgsql security definer set search_path = public as $$
declare c eval_cycles%rowtype; e record; n int := 0; v_sub bigint;
begin
  if not app.has_perm('performance','edit') then raise exception 'ไม่มีสิทธิ์'; end if;
  select * into c from eval_cycles where id = p_cycle_id;
  for e in
    select emp.* from employees emp
     where emp.status <> 'resigned'
       and (c.filter->'org_unit_ids' is null or jsonb_array_length(c.filter->'org_unit_ids') = 0
            or emp.org_unit_id in (select (x)::bigint from jsonb_array_elements_text(c.filter->'org_unit_ids') x))
       and (c.filter->'employee_types' is null or jsonb_array_length(c.filter->'employee_types') = 0
            or emp.employee_type in (select x from jsonb_array_elements_text(c.filter->'employee_types') x))
       and emp.hire_date <= coalesce(c.period_to, c.end_date)
  loop
    if c.self_eval then
      insert into eval_assignments(cycle_id, employee_id, evaluator_employee_id, relation) values (c.id, e.id, e.id, 'self') on conflict do nothing;
      n := n + 1;
    end if;
    if c.supervisor_eval and e.supervisor_id is not null then
      insert into eval_assignments(cycle_id, employee_id, evaluator_employee_id, relation) values (c.id, e.id, e.supervisor_id, 'supervisor') on conflict do nothing;
      n := n + 1;
    end if;
    if c.upward_eval and e.supervisor_id is not null then
      -- ลูกน้อง (e) ประเมินหัวหน้า (e.supervisor_id)
      insert into eval_assignments(cycle_id, employee_id, evaluator_employee_id, relation) values (c.id, e.supervisor_id, e.id, 'upward') on conflict do nothing;
      n := n + 1;
    end if;
    -- KPI from matching profile (position first, then org unit)
    if not exists (select 1 from employee_kpis where cycle_id = c.id and employee_id = e.id) then
      insert into employee_kpis(cycle_id, employee_id, kpi_item_id, name, unit, target, weight, direction, source)
      select c.id, e.id, k.id, k.name, k.unit, k.target, k.weight, k.direction, k.source
        from kpi_items k
       where k.profile_id = (select p.id from kpi_profiles p
                               where p.is_active and (p.position_id = e.position_id or p.org_unit_id = e.org_unit_id)
                               order by (p.position_id = e.position_id) desc nulls last limit 1);
    end if;
    insert into eval_results(cycle_id, employee_id) values (c.id, e.id) on conflict do nothing;
  end loop;
  update eval_cycles set status = 'open' where id = c.id and status = 'draft';
  return n;
end $$;
