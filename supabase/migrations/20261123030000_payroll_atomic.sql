-- =====================================================================
-- GO HR — Payroll: atomic period operations                                  (idempotent)
--
--   Why: "calculate", "mark paid" and "reopen" were a chain of separate API calls from the server. A failure
--   or a second click half-way left a period with entries but no pay lines, loan instalments recorded twice,
--   or a guarantee collected without the period being marked paid. Two people pressing a button at the same
--   time could both pass the status check.
--
--   What: each operation is one function = one transaction, and locks the period row first, so a second
--   caller waits and then fails the status check. All three are called by the server with the service role
--   after its own permission check (lib/payroll/server.ts); the first line of each body refuses anyone else.
--   Loan balances are summed inside the database (the API truncated the list at 1,000 rows).
-- =====================================================================

-- one instalment per loan and period (payments entered by hand have no period)
do $$
begin
  if exists (select 1 from public.loan_payments where period_id is not null group by loan_id, period_id having count(*) > 1) then
    raise warning 'loan_payments: a loan has more than one payment in the same period — unique index not created; check /payroll/loans';
  else
    create unique index if not exists loan_payments_loan_period_uq on public.loan_payments (loan_id, period_id) where period_id is not null;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- loan balance = sum of its payments; closed when fully paid, re-opened when a payment is taken back
-- ---------------------------------------------------------------------
--   (runs with the caller's rights: only the functions below call it, and they run as the owner)
create or replace function app.payroll_refresh_loans(p_loan_ids bigint[]) returns void
language sql set search_path = public as $$
  update employee_loans l
     set paid_amount = s.paid,
         status = case when s.paid >= l.total_payable - 0.004 then 'closed'
                       when l.status = 'closed' then 'active'
                       else l.status end
    from (select l2.id, round(coalesce(sum(lp.amount), 0), 2) as paid
            from employee_loans l2 left join loan_payments lp on lp.loan_id = l2.id
           where l2.id = any (p_loan_ids)
           group by l2.id) s
   where s.id = l.id;
$$;

-- ---------------------------------------------------------------------
-- save a calculation: replace the entries (all, or only p_employee_ids), their pay lines, the pending-inbox
-- claims, and set the period to "calculated"
--   p_entries: [{ ...payroll_entries columns, "lines": [{ ...payroll_entry_items columns }] }]
-- ---------------------------------------------------------------------
create or replace function public.payroll_save_calculation(
  p_period_id bigint, p_employee_ids bigint[], p_entries jsonb, p_claim bigint[], p_release bigint[]
) returns int
language plpgsql security definer set search_path = public as $$
declare v_status text; n int;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'ไม่มีสิทธิ์'; end if;
  select status into v_status from payroll_periods where id = p_period_id for update;
  if not found then raise exception 'ไม่พบงวดเงินเดือนนี้'; end if;
  if v_status not in ('open', 'calculated') then
    raise exception 'งวดนี้อนุมัติแล้ว ต้องกด "เปิดแก้ไข" ก่อนจึงจะคำนวณใหม่ได้';
  end if;

  if p_employee_ids is null then
    delete from payroll_entries where period_id = p_period_id;
  else
    delete from payroll_entries where period_id = p_period_id and employee_id = any (p_employee_ids);
  end if;

  with src as (
    select e.doc, (e.doc->>'employee_id')::bigint as employee_id
      from jsonb_array_elements(coalesce(p_entries, '[]'::jsonb)) as e(doc)
  ), ins as (
    insert into payroll_entries (
      period_id, employee_id, emp_code, emp_name, branch_id, org_unit_id, position_name, bank_code, bank_account, pay_method,
      base_salary, salary_unit, work_days, paid_days, absent_days, unpaid_leave_days, late_minutes, early_minutes, ot_minutes,
      total_income, total_deduction, taxable_income, sso_wage, sso_employee, sso_employer, pvd_employee, pvd_employer, tax, net_pay,
      ytd_income, ytd_tax, ytd_sso, ytd_pvd, calc_detail)
    select p_period_id, r.employee_id, r.emp_code, r.emp_name, r.branch_id, r.org_unit_id, r.position_name, r.bank_code, r.bank_account, r.pay_method,
      coalesce(r.base_salary, 0), r.salary_unit, coalesce(r.work_days, 0), coalesce(r.paid_days, 0), coalesce(r.absent_days, 0),
      coalesce(r.unpaid_leave_days, 0), coalesce(r.late_minutes, 0), coalesce(r.early_minutes, 0), coalesce(r.ot_minutes, '{}'::jsonb),
      coalesce(r.total_income, 0), coalesce(r.total_deduction, 0), coalesce(r.taxable_income, 0), coalesce(r.sso_wage, 0),
      coalesce(r.sso_employee, 0), coalesce(r.sso_employer, 0), coalesce(r.pvd_employee, 0), coalesce(r.pvd_employer, 0),
      coalesce(r.tax, 0), coalesce(r.net_pay, 0), coalesce(r.ytd_income, 0), coalesce(r.ytd_tax, 0), coalesce(r.ytd_sso, 0),
      coalesce(r.ytd_pvd, 0), coalesce(r.calc_detail, '{}'::jsonb)
      from src, jsonb_to_record(src.doc) as r(
        employee_id bigint, emp_code text, emp_name text, branch_id bigint, org_unit_id bigint, position_name text, bank_code text,
        bank_account text, pay_method text, base_salary numeric, salary_unit text, work_days numeric, paid_days numeric,
        absent_days numeric, unpaid_leave_days numeric, late_minutes int, early_minutes int, ot_minutes jsonb,
        total_income numeric, total_deduction numeric, taxable_income numeric, sso_wage numeric, sso_employee numeric,
        sso_employer numeric, pvd_employee numeric, pvd_employer numeric, tax numeric, net_pay numeric,
        ytd_income numeric, ytd_tax numeric, ytd_sso numeric, ytd_pvd numeric, calc_detail jsonb)
    returning id, employee_id
  )
  insert into payroll_entry_items (entry_id, pay_item_id, code, name, category, direction, qty, rate, amount, is_taxable, is_sso, source, source_id, sort_order)
  select ins.id, l.pay_item_id, l.code, l.name, l.category, coalesce(l.direction, 1), l.qty, l.rate, coalesce(l.amount, 0),
         coalesce(l.is_taxable, true), coalesce(l.is_sso, false), l.source, l.source_id, coalesce(l.sort_order, 0)
    from src
    join ins on ins.employee_id = src.employee_id,
         jsonb_to_recordset(coalesce(src.doc->'lines', '[]'::jsonb)) as l(
           pay_item_id bigint, code text, name text, category text, direction smallint, qty numeric, rate numeric, amount numeric,
           is_taxable boolean, is_sso boolean, source text, source_id bigint, sort_order int);

  select count(*) into n from payroll_entries where period_id = p_period_id;

  -- pending inbox: rows now part of this period / rows that dropped out of it. Paid or cancelled rows are never touched.
  update payroll_pending_items set status = 'applied', period_id = p_period_id
   where id = any (coalesce(p_claim, '{}')) and status in ('pending', 'applied');
  update payroll_pending_items set status = 'pending', period_id = null
   where id = any (coalesce(p_release, '{}')) and status = 'applied' and period_id = p_period_id;

  update payroll_periods set status = 'calculated', calculated_at = clock_timestamp() where id = p_period_id;
  return n;
end $$;

-- ---------------------------------------------------------------------
-- approved → paid: record loan instalments, advances, guarantee collections and pending-inbox money
-- ---------------------------------------------------------------------
create or replace function public.payroll_mark_paid(p_period_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare p payroll_periods%rowtype; v_loans bigint[];
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'ไม่มีสิทธิ์'; end if;
  select * into p from payroll_periods where id = p_period_id for update;
  if not found then raise exception 'ไม่พบงวดเงินเดือนนี้'; end if;
  if p.status <> 'approved' then raise exception 'ต้องอนุมัติงวดก่อนบันทึกว่าจ่ายแล้ว'; end if;

  -- loans (one line per loan and entry; a loan deleted after approval is skipped)
  with ins as (
    insert into loan_payments (loan_id, period_id, entry_id, pay_date, amount, note)
    select i.source_id, p.id, i.entry_id, p.pay_date, sum(i.amount), p.name
      from payroll_entry_items i
      join payroll_entries e on e.id = i.entry_id
      join employee_loans l on l.id = i.source_id
     where e.period_id = p.id and i.source = 'loan' and i.source_id is not null
     group by i.source_id, i.entry_id
    returning loan_id
  )
  select array_agg(distinct loan_id) into v_loans from ins;
  if v_loans is not null then perform app.payroll_refresh_loans(v_loans); end if;

  -- salary advances
  update salary_advances a set status = 'deducted', payroll_entry_id = i.entry_id
    from payroll_entry_items i join payroll_entries e on e.id = i.entry_id
   where e.period_id = p.id and i.source = 'advance' and a.id = i.source_id;

  -- guarantee money collected
  update employee_guarantees g set collected_amount = round(g.collected_amount + s.amount, 2)
    from (select i.source_id, sum(i.amount) as amount
            from payroll_entry_items i join payroll_entries e on e.id = i.entry_id
           where e.period_id = p.id and i.source = 'guarantee' and i.source_id is not null
           group by i.source_id) s
   where g.id = s.source_id;

  -- welfare / petty cash / retro money that rode along in this period is now paid
  update payroll_pending_items set status = 'paid' where period_id = p.id and status = 'applied';
  update payroll_periods set status = 'paid' where id = p.id;
end $$;

-- ---------------------------------------------------------------------
-- approved / paid → calculated; takes back what "mark paid" recorded. Returns the status it was in.
-- ---------------------------------------------------------------------
create or replace function public.payroll_reopen(p_period_id bigint) returns text
language plpgsql security definer set search_path = public as $$
declare p payroll_periods%rowtype; v_loans bigint[];
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'ไม่มีสิทธิ์'; end if;
  select * into p from payroll_periods where id = p_period_id for update;
  if not found then raise exception 'ไม่พบงวดเงินเดือนนี้'; end if;
  if p.status = 'closed' then raise exception 'งวดที่ปิดแล้วเปิดแก้ไขไม่ได้'; end if;
  if p.status not in ('approved', 'paid') then raise exception 'งวดนี้ยังไม่ได้อนุมัติ ไม่ต้องเปิดแก้ไข'; end if;

  if p.status = 'paid' then
    update payroll_pending_items set status = 'applied' where period_id = p.id and status = 'paid';

    with del as (delete from loan_payments where period_id = p.id returning loan_id)
    select array_agg(distinct loan_id) into v_loans from del;
    if v_loans is not null then perform app.payroll_refresh_loans(v_loans); end if;

    update salary_advances a set status = 'approved', payroll_entry_id = null
      from payroll_entries e
     where e.period_id = p.id and a.payroll_entry_id = e.id and a.status = 'deducted';

    update employee_guarantees g set collected_amount = greatest(0, round(g.collected_amount - s.amount, 2))
      from (select i.source_id, sum(i.amount) as amount
              from payroll_entry_items i join payroll_entries e on e.id = i.entry_id
             where e.period_id = p.id and i.source = 'guarantee' and i.source_id is not null
             group by i.source_id) s
     where g.id = s.source_id;
  end if;

  update payroll_periods set status = 'calculated', approved_at = null, approved_by = null, payslip_published = false where id = p.id;
  return p.status;
end $$;

select app.sync_grants();
notify pgrst, 'reload schema';
