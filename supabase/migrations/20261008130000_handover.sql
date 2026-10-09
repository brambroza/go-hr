-- =====================================================================
-- GO HR — go-live & handover support                                    (idempotent)
--
--   1) leave_quotas.opening_used_days — leave already taken in the old system this year
--      (imported when moving from a previous HR system mid-year); counted as "used" in v_leave_balances.
--   2) payroll_filings — what was sent to the bank / SSO / Revenue Department for each pay month
--      (date, reference no., amount) so the monthly payroll checklist knows what is still open.
-- =====================================================================

-- 1) opening leave usage ------------------------------------------------
alter table public.leave_quotas add column if not exists opening_used_days numeric(6,2) not null default 0;
comment on column public.leave_quotas.opening_used_days is 'วันลาที่ใช้ไปแล้วในระบบเดิม (ยอดยกมาตอนเริ่มใช้ GO HR)';

create or replace view public.v_leave_balances with (security_invoker = true) as
select q.id, q.employee_id, q.leave_year, q.leave_type_id, t.code, t.name, t.color,
       q.quota_days, q.carried_days, q.adjust_days,
       (q.quota_days + q.carried_days + q.adjust_days) as total_days,
       coalesce(u.used, 0) + q.opening_used_days as used_days,
       coalesce(u.pending, 0) as pending_days,
       (q.quota_days + q.carried_days + q.adjust_days) - q.opening_used_days - coalesce(u.used, 0) - coalesce(u.pending, 0) as remaining_days
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

-- 2) payroll filings ------------------------------------------------------
create table if not exists public.payroll_filings (
  id            bigint generated always as identity primary key,
  pay_year      int  not null,
  pay_month     int  not null check (pay_month between 1 and 12),
  kind          text not null check (kind in ('bank','sso','pnd1','pnd1a','pvd')),
  submitted_on  date not null,
  ref_no        text,
  amount        numeric(14,2),
  note          text,
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (pay_year, pay_month, kind)
);
comment on table public.payroll_filings is 'การส่งไฟล์ธนาคาร / ยื่น สปส.1-10 / ภ.ง.ด.1 ของแต่ละเดือน (ใช้ในหน้า งานเงินเดือนประจำเดือน)';

alter table public.payroll_filings enable row level security;
drop policy if exists p_sel on public.payroll_filings;
drop policy if exists p_wr on public.payroll_filings;
create policy p_sel on public.payroll_filings for select to authenticated using (
  app.has_perm('payroll','view') or app.has_perm('report','view'));
create policy p_wr on public.payroll_filings for all to authenticated
  using (app.has_perm('payroll','edit') or app.has_perm('payroll','approve'))
  with check (app.has_perm('payroll','edit') or app.has_perm('payroll','approve'));

drop trigger if exists trg_touch on public.payroll_filings;
create trigger trg_touch before update on public.payroll_filings for each row execute function app.touch_updated_at();
select app.enable_audit('public.payroll_filings');

grant select, insert, update, delete on public.payroll_filings to authenticated;
