-- =====================================================================
-- GO HR — Talent extras (recruitment / probation / learning / performance) — idempotent
--   * running numbers: applicants.ref_no (AP…), warning_letters.doc_no (WL…)
--   * eval_cycles.upward_form_id (separate form for ลูกน้องประเมินหัวหน้า)
--   * probation: supervisors may create evaluations for their team; HR approval RPC
--   * e-learning: lesson progress / quiz RPCs (score computed on the server) → employee_trainings
--   * performance: KPI scoring helper, attendance KPI pull, cycle result computation, acknowledgements
-- =====================================================================

-- ---------------------------------------------------------------- running numbers
create or replace function app.applicants_defaults() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.ref_no is null or new.ref_no = '' then new.ref_no := app.next_doc_no('AP'); end if;
  if new.consent_pdpa and new.consent_at is null then new.consent_at := now(); end if;
  return new;
end $$;
drop trigger if exists trg_applicants_defaults on public.applicants;
create trigger trg_applicants_defaults before insert on public.applicants for each row execute function app.applicants_defaults();

create or replace function app.warning_letters_defaults() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.doc_no is null or new.doc_no = '' then new.doc_no := app.next_doc_no('WL'); end if;
    if new.issued_by is null then new.issued_by := auth.uid(); end if;
  end if;
  if new.expire_date is null and new.level not in ('termination') then
    new.expire_date := (new.issue_date + interval '1 year')::date;
  end if;
  return new;
end $$;
drop trigger if exists trg_warning_letters_defaults on public.warning_letters;
create trigger trg_warning_letters_defaults before insert or update on public.warning_letters for each row execute function app.warning_letters_defaults();

-- ---------------------------------------------------------------- schema additions
alter table public.eval_cycles add column if not exists upward_form_id bigint references public.eval_forms(id);
alter table public.eval_results add column if not exists employee_comment text;
create index if not exists eval_assignments_evaluator_idx on public.eval_assignments(evaluator_employee_id, status);
create index if not exists probation_evaluations_evaluator_idx on public.probation_evaluations(evaluator_employee_id, status);
create index if not exists course_enrollments_emp_idx on public.course_enrollments(employee_id);
create index if not exists warning_letters_emp_idx on public.warning_letters(employee_id);

-- supervisors may open a probation evaluation for someone in their team
drop policy if exists p_mgr_ins on public.probation_evaluations;
create policy p_mgr_ins on public.probation_evaluations for insert to authenticated
  with check (app.is_manager_of(employee_id) and status = 'pending');

-- ---------------------------------------------------------------- probation approval
-- pass → movement 'confirm' (approved, effective = probation_end_date or p_effective)
-- extend → employees.probation_end_date += extend_days
-- fail → movement 'resign' with reason
create or replace function public.probation_approve(p_id bigint, p_effective date default null, p_apply_now boolean default false, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  ev probation_evaluations%rowtype; emp employees%rowtype; v_eff date; v_mv bigint; v_new_end date;
begin
  if not (app.has_perm('recruit','edit') and app.has_perm('employee','edit')) then raise exception 'ไม่มีสิทธิ์อนุมัติผลทดลองงาน'; end if;
  select * into ev from probation_evaluations where id = p_id for update;
  if not found then raise exception 'ไม่พบแบบประเมิน'; end if;
  if ev.status <> 'submitted' then raise exception 'อนุมัติได้เฉพาะแบบประเมินที่ส่งแล้ว'; end if;
  if ev.result is null then raise exception 'แบบประเมินยังไม่ระบุผล (ผ่าน / ขยาย / ไม่ผ่าน)'; end if;
  select * into emp from employees where id = ev.employee_id;
  v_eff := coalesce(p_effective, emp.probation_end_date, current_date);
  if p_apply_now then v_eff := least(v_eff, current_date); end if;

  if ev.result = 'pass' then
    insert into employee_movements(employee_id, movement_type, effective_date, reason, status)
    values (emp.id, 'confirm', v_eff, coalesce(p_note, 'ผ่านการทดลองงาน (แบบประเมินรอบที่ ' || ev.round || ')'), 'approved')
    returning id into v_mv;
  elsif ev.result = 'extend' then
    v_new_end := coalesce(emp.probation_end_date, current_date) + coalesce(ev.extend_days, 30);
    update employees set probation_end_date = v_new_end where id = emp.id;
  else
    insert into employee_movements(employee_id, movement_type, effective_date, reason, status)
    values (emp.id, 'resign', v_eff, coalesce(p_note, 'ไม่ผ่านการทดลองงาน'), 'approved')
    returning id into v_mv;
  end if;

  update probation_evaluations set status = 'approved', approved_by = auth.uid(), approved_at = now() where id = ev.id;

  if p_apply_now and v_mv is not null then
    perform public.apply_movements(current_date);
  end if;
  return jsonb_build_object('movement_id', v_mv, 'effective_date', v_eff, 'new_probation_end', v_new_end);
end $$;
revoke all on function public.probation_approve(bigint, date, boolean, text) from public, anon;
grant execute on function public.probation_approve(bigint, date, boolean, text) to authenticated;

-- ---------------------------------------------------------------- e-learning
-- audience check: {"all":true} or org_unit_ids / position_ids
create or replace function app.course_for_employee(p_course courses, p_emp bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((p_course.audience->>'all')::boolean, false)
      or exists (select 1 from employees e where e.id = p_emp and (
           e.org_unit_id in (select x::bigint from jsonb_array_elements_text(coalesce(p_course.audience->'org_unit_ids','[]')) x)
        or e.position_id in (select x::bigint from jsonb_array_elements_text(coalesce(p_course.audience->'position_ids','[]')) x)))
$$;

create or replace function app.course_finish(p_enr course_enrollments) returns void
language plpgsql security definer set search_path = public as $$
declare c courses%rowtype;
begin
  select * into c from courses where id = p_enr.course_id;
  if not exists (select 1 from employee_trainings where employee_id = p_enr.employee_id and source = 'elearning' and source_id = c.id) then
    insert into employee_trainings(employee_id, course_name, provider, start_date, end_date, hours, result, source, source_id)
    values (p_enr.employee_id, c.title, 'E-Learning', coalesce((p_enr.started_at at time zone 'Asia/Bangkok')::date, current_date), current_date, c.hours,
            case when p_enr.quiz_score is not null then 'ผ่าน คะแนนแบบทดสอบ ' || p_enr.quiz_score || '%' else 'เรียนครบ' end, 'elearning', c.id);
  end if;
end $$;

-- self-enroll into a published course (audience must match)
create or replace function public.course_enroll_self(p_course_id bigint) returns bigint
language plpgsql security definer set search_path = public as $$
declare c courses%rowtype; v_me bigint := app.my_employee_id(); v_id bigint;
begin
  if v_me is null then raise exception 'บัญชีนี้ไม่ได้ผูกกับพนักงาน'; end if;
  select * into c from courses where id = p_course_id and is_published;
  if not found then raise exception 'ไม่พบหลักสูตร หรือหลักสูตรยังไม่เปิด'; end if;
  if not app.course_for_employee(c, v_me) then raise exception 'หลักสูตรนี้ไม่ได้เปิดสำหรับตำแหน่ง/หน่วยงานของคุณ'; end if;
  insert into course_enrollments(course_id, employee_id, due_date)
  values (c.id, v_me, case when c.due_days is not null then current_date + c.due_days end)
  on conflict (course_id, employee_id) do update set updated_at = now()
  returning id into v_id;
  return v_id;
end $$;

-- mark a lesson complete (min_minutes is checked on the client timer, total time sanity-checked here)
create or replace function public.course_lesson_done(p_course_id bigint, p_lesson_id bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_me bigint := app.my_employee_id(); e course_enrollments%rowtype; c courses%rowtype; n_total int; n_done int; v_lessons bigint[];
begin
  if v_me is null then raise exception 'บัญชีนี้ไม่ได้ผูกกับพนักงาน'; end if;
  if not exists (select 1 from course_lessons where id = p_lesson_id and course_id = p_course_id) then raise exception 'บทเรียนไม่อยู่ในหลักสูตรนี้'; end if;
  select * into c from courses where id = p_course_id;
  select * into e from course_enrollments where course_id = p_course_id and employee_id = v_me for update;
  if not found then
    perform public.course_enroll_self(p_course_id);
    select * into e from course_enrollments where course_id = p_course_id and employee_id = v_me for update;
  end if;
  v_lessons := (select array_agg(distinct x) from unnest(e.completed_lessons || p_lesson_id) x
                 where x in (select id from course_lessons where course_id = p_course_id));
  select count(*) into n_total from course_lessons where course_id = p_course_id;
  n_done := coalesce(array_length(v_lessons, 1), 0);
  update course_enrollments set
    completed_lessons = v_lessons,
    started_at = coalesce(started_at, now()),
    progress = round(100.0 * n_done / greatest(n_total + case when jsonb_array_length(c.quiz) > 0 then 1 else 0 end, 1), 2),
    status = case when status = 'completed' then status
                  when n_done >= n_total and jsonb_array_length(c.quiz) = 0 then 'completed' else 'in_progress' end,
    completed_at = case when completed_at is null and n_done >= n_total and jsonb_array_length(c.quiz) = 0 then now() else completed_at end
  where id = e.id
  returning * into e;
  if e.status = 'completed' then
    update course_enrollments set progress = 100 where id = e.id;
    perform app.course_finish(e);
  end if;
  return jsonb_build_object('completed_lessons', e.completed_lessons, 'status', e.status, 'progress', e.progress);
end $$;

-- submit the end-of-course quiz; p_answers = [choiceIndex, ...] in question order
create or replace function public.course_submit_quiz(p_course_id bigint, p_answers jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_me bigint := app.my_employee_id(); e course_enrollments%rowtype; c courses%rowtype; n int; ok int := 0; i int; v_score numeric; n_total int; v_pass boolean;
begin
  if v_me is null then raise exception 'บัญชีนี้ไม่ได้ผูกกับพนักงาน'; end if;
  select * into c from courses where id = p_course_id;
  select * into e from course_enrollments where course_id = p_course_id and employee_id = v_me for update;
  if not found then raise exception 'ยังไม่ได้ลงทะเบียนหลักสูตรนี้'; end if;
  select count(*) into n_total from course_lessons where course_id = p_course_id;
  if coalesce(array_length(e.completed_lessons, 1), 0) < n_total then raise exception 'กรุณาเรียนให้ครบทุกบทก่อนทำแบบทดสอบ'; end if;
  n := jsonb_array_length(c.quiz);
  if n = 0 then raise exception 'หลักสูตรนี้ไม่มีแบบทดสอบ'; end if;
  for i in 0 .. n - 1 loop
    if (p_answers->>i) is not null and (p_answers->>i)::int = (c.quiz->i->>'answer')::int then ok := ok + 1; end if;
  end loop;
  v_score := round(100.0 * ok / n, 2);
  v_pass := v_score >= c.pass_score;
  update course_enrollments set
    attempts = attempts + 1,
    quiz_score = greatest(coalesce(quiz_score, 0), v_score),
    status = case when status = 'completed' or v_pass then 'completed' else 'in_progress' end,
    progress = case when v_pass or status = 'completed' then 100 else progress end,
    completed_at = case when completed_at is null and v_pass then now() else completed_at end
  where id = e.id returning * into e;
  if e.status = 'completed' then perform app.course_finish(e); end if;
  return jsonb_build_object('score', v_score, 'correct', ok, 'total', n, 'passed', v_pass, 'attempts', e.attempts, 'pass_score', c.pass_score);
end $$;

-- HR assigns a course to its audience (or to the given employees)
create or replace function public.course_assign(p_course_id bigint, p_employee_ids bigint[] default null) returns int
language plpgsql security definer set search_path = public as $$
declare c courses%rowtype; n int;
begin
  if not app.has_perm('learning','edit') then raise exception 'ไม่มีสิทธิ์มอบหมายหลักสูตร'; end if;
  select * into c from courses where id = p_course_id;
  insert into course_enrollments(course_id, employee_id, due_date)
  select c.id, e.id, case when c.due_days is not null then current_date + c.due_days end
    from employees e
   where e.status <> 'resigned'
     and (case when p_employee_ids is not null then e.id = any(p_employee_ids) else app.course_for_employee(c, e.id) end)
  on conflict (course_id, employee_id) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------------------------------------------------------------- KPI scoring
-- achievement % by direction, then mapped through scoring table [{"min":100,"score":5},…] (normalised to 0–100) or linear (cap 100)
create or replace function app.kpi_score(p_actual numeric, p_target numeric, p_direction text, p_scoring jsonb) returns numeric
language plpgsql immutable as $$
declare ach numeric; s numeric; mx numeric; r jsonb;
begin
  if p_actual is null then return null; end if;
  if p_target is null or p_target = 0 then
    if p_direction = 'lower' then ach := case when p_actual <= 0 then 100 else greatest(0, 100 - p_actual * 10) end;
    else return null; end if;
  elsif p_direction = 'lower' then ach := case when p_actual <= 0 then 120 else p_target / p_actual * 100 end;
  elsif p_direction = 'exact' then ach := greatest(0, 100 - abs(p_actual - p_target) / abs(p_target) * 100);
  else ach := p_actual / p_target * 100;
  end if;
  ach := least(greatest(ach, 0), 150);
  if p_scoring is not null and jsonb_typeof(p_scoring) = 'array' and jsonb_array_length(p_scoring) > 0 then
    select max((x->>'score')::numeric) into mx from jsonb_array_elements(p_scoring) x;
    s := 0;
    for r in select x from jsonb_array_elements(p_scoring) x order by (x->>'min')::numeric desc loop
      if ach >= (r->>'min')::numeric then s := (r->>'score')::numeric; exit; end if;
    end loop;
    return round(100 * s / nullif(mx, 0), 2);
  end if;
  return round(least(ach, 100), 2);
end $$;

-- fill actuals of attendance-based KPIs from attendance_days within the cycle period
create or replace function public.eval_cycle_attendance_kpis(p_cycle_id bigint) returns int
language plpgsql security definer set search_path = public as $$
declare c eval_cycles%rowtype; n int;
begin
  if not app.has_perm('performance','edit') then raise exception 'ไม่มีสิทธิ์'; end if;
  select * into c from eval_cycles where id = p_cycle_id;
  with m as (
    select k.id, k.target, k.direction, i.scoring,
      case i.attendance_metric
        when 'late_count'   then (select count(*) from attendance_days d where d.employee_id = k.employee_id and d.work_date between coalesce(c.period_from, c.start_date) and coalesce(c.period_to, c.end_date) and d.late_minutes > 0)
        when 'late_minutes' then (select coalesce(sum(late_minutes),0) from attendance_days d where d.employee_id = k.employee_id and d.work_date between coalesce(c.period_from, c.start_date) and coalesce(c.period_to, c.end_date))
        when 'absent_days'  then (select count(*) from attendance_days d where d.employee_id = k.employee_id and d.work_date between coalesce(c.period_from, c.start_date) and coalesce(c.period_to, c.end_date) and d.absent)
        when 'leave_days'   then (select round(coalesce(sum(leave_minutes),0) / 480.0, 1) from attendance_days d where d.employee_id = k.employee_id and d.work_date between coalesce(c.period_from, c.start_date) and coalesce(c.period_to, c.end_date))
      end as actual
      from employee_kpis k join kpi_items i on i.id = k.kpi_item_id
     where k.cycle_id = c.id and i.source = 'attendance' and i.attendance_metric is not null)
  update employee_kpis k set actual = m.actual, score = app.kpi_score(m.actual, m.target, m.direction, m.scoring), note = 'ดึงจากระบบเวลาทำงาน'
    from m where m.id = k.id;
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------------------------------------------------------------- cycle results
create or replace function public.eval_cycle_compute(p_cycle_id bigint) returns int
language plpgsql security definer set search_path = public as $$
declare c eval_cycles%rowtype; f eval_forms%rowtype; n int; kw numeric; sw numeric;
begin
  if not app.has_perm('performance','edit') then raise exception 'ไม่มีสิทธิ์'; end if;
  select * into c from eval_cycles where id = p_cycle_id;
  if c.status = 'closed' then raise exception 'รอบนี้ปิดแล้ว คำนวณใหม่ไม่ได้'; end if;
  select * into f from eval_forms where id = c.form_id;
  kw := coalesce(f.kpi_weight, 0) / 100.0;
  sw := coalesce(c.supervisor_weight, 100) / 100.0;
  insert into eval_results(cycle_id, employee_id)
  select distinct c.id, a.employee_id from eval_assignments a where a.cycle_id = c.id and a.relation <> 'upward'
  on conflict do nothing;
  with s as (
    select r.id,
      (select avg(competency_score) from eval_assignments a where a.cycle_id = c.id and a.employee_id = r.employee_id and a.relation = 'supervisor' and a.status = 'submitted') as sup,
      (select avg(competency_score) from eval_assignments a where a.cycle_id = c.id and a.employee_id = r.employee_id and a.relation = 'self' and a.status = 'submitted') as slf,
      (select sum(score * weight) / nullif(sum(weight), 0) from employee_kpis k where k.cycle_id = c.id and k.employee_id = r.employee_id and k.score is not null) as kpi,
      (select count(*) from employee_kpis k where k.cycle_id = c.id and k.employee_id = r.employee_id) as kpi_n
      from eval_results r where r.cycle_id = c.id),
  t as (
    select id,
      round(case when sup is not null and slf is not null then sup * sw + slf * (1 - sw) else coalesce(sup, slf) end, 2) as comp,
      round(kpi, 2) as kpi, kpi_n from s),
  u as (
    select id, comp, kpi,
      -- competency evaluation is required; KPI part counts only when the employee has KPIs (otherwise competency = 100%)
      round(case when comp is null then null
                 when kpi is not null then comp * (1 - kw) + kpi * kw
                 else comp end, 2) as fin
      from t)
  update eval_results r set competency_score = u.comp, kpi_score = u.kpi, final_score = u.fin,
         grade = (select g->>'grade' from jsonb_array_elements(c.grade_scale) g where u.fin >= (g->>'min')::numeric order by (g->>'min')::numeric desc limit 1)
    from u where u.id = r.id;
  get diagnostics n = row_count;
  if c.status = 'open' then update eval_cycles set status = 'calibration' where id = c.id; end if;
  return n;
end $$;

-- ---------------------------------------------------------------- acknowledgements (employee only touches ack fields)
create or replace function public.warning_ack(p_id bigint, p_comment text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  update warning_letters set acknowledged_at = coalesce(acknowledged_at, now()), employee_comment = coalesce(p_comment, employee_comment)
   where id = p_id and employee_id = app.my_employee_id();
  if not found then raise exception 'ไม่พบหนังสือเตือนของคุณ'; end if;
end $$;

create or replace function public.eval_result_ack(p_id bigint, p_comment text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  update eval_results r set acknowledged_at = coalesce(acknowledged_at, now()), employee_comment = coalesce(p_comment, employee_comment)
   where r.id = p_id and r.employee_id = app.my_employee_id()
     and exists (select 1 from eval_cycles c where c.id = r.cycle_id and c.status = 'closed');
  if not found then raise exception 'ไม่พบผลการประเมินที่ประกาศแล้ว'; end if;
end $$;

-- employee-facing tables: the broad "update own row" policies are replaced by the RPCs above
drop policy if exists p_ack on public.warning_letters;
drop policy if exists p_ack on public.eval_results;
-- enrollment progress / quiz score only change through the RPCs (employees could otherwise mark themselves complete)
drop policy if exists p_self on public.course_enrollments;

do $$
declare f text;
begin
  foreach f in array array['course_enroll_self(bigint)','course_lesson_done(bigint, bigint)','course_submit_quiz(bigint, jsonb)','course_assign(bigint, bigint[])',
                           'eval_cycle_attendance_kpis(bigint)','eval_cycle_compute(bigint)','warning_ack(bigint, text)','eval_result_ack(bigint, text)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
