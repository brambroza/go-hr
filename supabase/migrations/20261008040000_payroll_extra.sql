-- =====================================================================
-- GO HR — Payroll extras (idempotent)
--   * Opening year-to-date balances ("ยอดยกมาต้นปี") for companies that start using the system mid-year.
--     Unlike prev_employer_* (income from a previous employer), these amounts were paid by THIS employer and are
--     therefore included in ภ.ง.ด.1ก and 50 ทวิ.
--   * Indexes used by the payroll calculation / reports.
-- =====================================================================

alter table public.employee_private add column if not exists ytd_open_year   int;
alter table public.employee_private add column if not exists ytd_open_income numeric(14,2) not null default 0;
alter table public.employee_private add column if not exists ytd_open_tax    numeric(14,2) not null default 0;
alter table public.employee_private add column if not exists ytd_open_sso    numeric(14,2) not null default 0;
alter table public.employee_private add column if not exists ytd_open_pvd    numeric(14,2) not null default 0;

comment on column public.employee_private.ytd_open_year is 'ปีภาษี (ค.ศ.) ของยอดยกมา — ใช้เฉพาะปีนี้';
comment on column public.employee_private.ytd_open_income is 'ยอดเงินได้สะสมยกมา (จ่ายโดยบริษัทนี้ก่อนเริ่มใช้ระบบ)';

create index if not exists payroll_entries_period_idx on public.payroll_entries(period_id);
create index if not exists commission_entries_period_idx on public.commission_entries(period_id);
create index if not exists loan_payments_loan_idx on public.loan_payments(loan_id);
create index if not exists loan_payments_period_idx on public.loan_payments(period_id);
create index if not exists salary_advances_emp_idx on public.salary_advances(employee_id, deduct_year, deduct_month);
create index if not exists employee_loans_emp_idx on public.employee_loans(employee_id, status);

-- Totals per period (list page / reports) — security_invoker so RLS of payroll_entries applies
create or replace view public.v_payroll_period_totals with (security_invoker = true) as
select period_id,
       count(*)::int                 as headcount,
       coalesce(sum(total_income), 0)    as total_income,
       coalesce(sum(total_deduction), 0) as total_deduction,
       coalesce(sum(net_pay), 0)         as net_pay,
       coalesce(sum(tax), 0)             as tax,
       coalesce(sum(sso_employee), 0)    as sso_employee,
       coalesce(sum(sso_employer), 0)    as sso_employer,
       coalesce(sum(pvd_employee), 0)    as pvd_employee,
       coalesce(sum(pvd_employer), 0)    as pvd_employer,
       count(*) filter (where jsonb_array_length(coalesce(calc_detail->'warnings', '[]'::jsonb)) > 0)::int as warnings
  from public.payroll_entries
 group by period_id;
grant select on public.v_payroll_period_totals to authenticated;

-- System pay items drive the calculation: they cannot be deleted and their code / system_key / direction cannot change
create or replace function app.pay_items_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.system_key is not null then raise exception 'รายการของระบบ (%) ลบไม่ได้ — ปิดการใช้งานแทน', old.name; end if;
    return old;
  end if;
  if old.system_key is not null and (new.system_key is distinct from old.system_key or new.code is distinct from old.code or new.direction is distinct from old.direction) then
    raise exception 'รายการของระบบแก้ไขรหัสหรือประเภทเงินได้/เงินหักไม่ได้';
  end if;
  return new;
end $$;
drop trigger if exists trg_pay_items_guard on public.pay_items;
create trigger trg_pay_items_guard before update or delete on public.pay_items for each row execute function app.pay_items_guard();

-- Leave usage for reports: approved leave days per employee × leave type in a year.
-- Report users (menu 'report') may not have request_admin, so requests RLS would hide them.
create or replace function public.report_leave_usage(p_year int)
returns table(employee_id bigint, leave_type_id bigint, days numeric, requests int)
language sql stable security definer set search_path = public as $$
  select r.employee_id, (r.payload->>'leave_type_id')::bigint, sum(coalesce(r.days, 0)), count(*)::int
    from requests r
   where r.request_type = 'leave' and r.status = 'approved'
     and r.start_date >= make_date(p_year, 1, 1) and r.start_date <= make_date(p_year, 12, 31)
     and (app.has_perm('report','view') or app.has_perm('request_admin','view'))
     and app.can_see_employee(r.employee_id)
   group by 1, 2
$$;
revoke all on function public.report_leave_usage(int) from anon;
grant execute on function public.report_leave_usage(int) to authenticated;
