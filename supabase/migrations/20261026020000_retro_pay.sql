-- =====================================================================
-- GO HR — ตกเบิก (retro pay) หลังอนุมัติ / ปิดงวด                          (idempotent)
--
--   An approved / paid / closed period is never recalculated. When a request (OT, leave, time edit, shift change)
--   is approved or cancelled after the period was approved, or a salary change takes effect inside it, HR opens
--   "ตกเบิก": the app recalculates that period for the person in memory (lib/payroll/retro.ts) and the difference
--   per pay item goes to payroll_pending_items (source 'retro', retro_run_id = this run) for the next period.
--   payroll_retro_runs keeps what was compared, so the same change is not offered twice.
-- =====================================================================

create table if not exists public.payroll_retro_runs (
  id           bigint generated always as identity primary key,
  period_id    bigint not null references public.payroll_periods(id) on delete cascade,
  employee_id  bigint not null references public.employees(id) on delete cascade,
  reasons      jsonb not null default '[]'::jsonb,   -- what triggered it (requests, salary changes)
  lines        jsonb not null default '[]'::jsonb,   -- RetroDiff[]
  net          numeric(14,2) not null default 0,     -- before tax / SSO
  note         text,
  prev_run_id  bigint,                               -- latest earlier run of the same period + person when this one was made
  created_by   uuid,
  created_at   timestamptz not null default now()
);
create index if not exists payroll_retro_runs_period_emp_idx on public.payroll_retro_runs(period_id, employee_id, created_at desc);
alter table public.payroll_retro_runs add column if not exists prev_run_id bigint;
-- two confirms based on the same preview (double click, two tabs) cannot both be stored
create unique index if not exists payroll_retro_runs_chain_uq on public.payroll_retro_runs(period_id, employee_id, coalesce(prev_run_id, 0));
comment on table public.payroll_retro_runs is 'ตกเบิก: ผลต่างจากการคำนวณงวดที่อนุมัติแล้วใหม่ (ส่งเข้าคิวรอเข้างวด)';

select app.std_policies('public.payroll_retro_runs', 'payroll', 'restrict');
select app.enable_audit('public.payroll_retro_runs');
grant select, insert, update, delete on public.payroll_retro_runs to authenticated, service_role;

alter table public.payroll_pending_items add column if not exists retro_run_id bigint references public.payroll_retro_runs(id) on delete set null;
create index if not exists payroll_pending_items_retro_idx on public.payroll_pending_items(retro_run_id) where retro_run_id is not null;
