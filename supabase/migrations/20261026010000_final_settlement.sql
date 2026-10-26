-- =====================================================================
-- GO HR — เคลียร์เงินพนักงานพ้นสภาพ (final settlement)                     (idempotent)
--
--   HR opens the settlement of a resigned employee, checks the computed amounts (lib/payroll/settlement.ts)
--   and confirms. Confirming writes one final_settlements row and one payroll_pending_items row per money line
--   (source = line key, source_id = settlement id, effective_date = last working day), so the money reaches the
--   next monthly period automatically or a special period HR pulls it into. Cancelling cancels the pending rows
--   (refused once any of them is paid).
--
--   New pay items (income, not regular):
--     SEVERANCE_EXEMPT  ค่าชดเชยส่วนที่ได้รับยกเว้นภาษี ม.42(17)  — not taxable, not SSO wage
--     LEAVE_PAYOUT      ค่าจ้างวันหยุดพักผ่อนที่ยังไม่ได้ใช้ ม.67    — taxable, SSO wage
--     NOTICE_PAY        ค่าจ้างแทนการบอกกล่าวล่วงหน้า ม.17/1        — taxable, not SSO wage
--     GUARANTEE_REFUND  คืนเงินประกันการทำงาน ม.10                 — not taxable
--   The existing SEVERANCE item (taxable) now carries only the part above the exemption.
-- =====================================================================

insert into public.pay_items (code, name, name_en, category, direction, group_id, is_taxable, is_sso, is_pvd_base, is_regular, income_type, calc_type, rate, system_key, sort_order)
select v.code, v.name, v.name_en, 'income', 1, (select id from public.pay_item_groups where name = 'เงินเพิ่ม/สวัสดิการ' order by id limit 1),
       v.is_taxable, v.is_sso, false, false, '40(1)', 'fixed', null, v.system_key, v.sort_order
  from (values
    ('SEVERANCE_EXEMPT', 'ค่าชดเชยตามกฎหมาย (ส่วนยกเว้นภาษี)', 'Severance (tax exempt)', false, false, 'severance_exempt', 31),
    ('LEAVE_PAYOUT',     'ค่าจ้างวันหยุดพักผ่อนที่ยังไม่ได้ใช้',  'Unused annual leave',    true,  true,  'leave_payout',     32),
    ('NOTICE_PAY',       'ค่าจ้างแทนการบอกกล่าวล่วงหน้า',       'Pay in lieu of notice',  true,  false, 'notice_pay',       33),
    ('GUARANTEE_REFUND', 'คืนเงินประกันการทำงาน',              'Work guarantee refund',  false, false, 'guarantee_refund', 34)
  ) as v(code, name, name_en, is_taxable, is_sso, system_key, sort_order)
 where not exists (select 1 from public.pay_items p where p.code = v.code or p.system_key = v.system_key);

create table if not exists public.final_settlements (
  id                 bigint generated always as identity primary key,
  employee_id        bigint not null references public.employees(id) on delete cascade,
  last_day           date not null,                  -- resign_date at the time of confirming
  resign_type        text,
  status             text not null default 'confirmed' check (status in ('confirmed','cancelled')),
  daily_rate         numeric(14,4) not null default 0,
  service_days       int not null default 0,
  service_years      int not null default 0,
  severance_eligible boolean not null default false,
  severance_days     numeric(6,2) not null default 0,
  severance_amount   numeric(14,2) not null default 0,
  exempt_amount      numeric(14,2) not null default 0,
  leave_days         numeric(6,2) not null default 0,
  leave_amount       numeric(14,2) not null default 0,
  notice_days        numeric(6,2) not null default 0,
  notice_amount      numeric(14,2) not null default 0,
  guarantee_refund   numeric(14,2) not null default 0,
  total              numeric(14,2) not null default 0,
  detail             jsonb,                          -- inputs, overrides, exemption used, warnings, refunded guarantee ids
  note               text,
  created_by         uuid,
  created_at         timestamptz not null default now(),
  cancelled_by       uuid,
  cancelled_at       timestamptz,
  updated_at         timestamptz not null default now()
);
create unique index if not exists final_settlements_active_uq on public.final_settlements(employee_id) where status = 'confirmed';
create index if not exists final_settlements_emp_idx on public.final_settlements(employee_id);
comment on table public.final_settlements is 'เคลียร์เงินพนักงานพ้นสภาพ: ค่าชดเชย ม.118, วันลาพักร้อนคงเหลือ, ค่าบอกกล่าวล่วงหน้า, คืนเงินประกัน';

drop trigger if exists trg_touch on public.final_settlements;
create trigger trg_touch before update on public.final_settlements for each row execute function app.touch_updated_at();

select app.std_policies('public.final_settlements', 'payroll', 'restrict');
select app.enable_audit('public.final_settlements');
grant select, insert, update, delete on public.final_settlements to authenticated, service_role;
