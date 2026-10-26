-- =====================================================================
-- GO HR — เพดานวันลาที่ได้รับค่าจ้าง: ต่อปี หรือ ต่อครั้ง                      (idempotent)
--
--   leave_types.paid_days_limit was always counted per calendar year, so maternity leave from December into
--   January was paid 60 + 60 days. paid_limit_scope = 'episode' counts the cap per run of leave (a gap of more
--   than 270 days starts a new one — lib/payroll/leave.ts). The quota (leave_quotas) is unchanged.
-- =====================================================================

alter table public.leave_types add column if not exists paid_limit_scope text not null default 'year';
do $$ begin
  alter table public.leave_types add constraint leave_types_paid_limit_scope_chk check (paid_limit_scope in ('year','episode'));
exception when duplicate_object then null; end $$;
comment on column public.leave_types.paid_limit_scope is 'year = เพดานค่าจ้างต่อปีปฏิทิน, episode = ต่อครั้ง (ลาคลอดต่อการตั้งครรภ์)';

update public.leave_types set paid_limit_scope = 'episode' where code = 'MATERNITY' and paid_limit_scope = 'year';
