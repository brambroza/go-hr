-- =====================================================================
-- GO HR — ไฟล์นำส่งกองทุนสำรองเลี้ยงชีพ: custom layouts of kind 'pvd'          (idempotent)
--
--   The built-in layout is a plain CSV (lib/payroll/file-layouts.ts PVD_GENERIC); HR clones it in
--   /settings/file-formats to match the fund manager's template, which needs file_formats.kind = 'pvd'.
-- =====================================================================

do $$
declare c text;
begin
  for c in
    select con.conname from pg_constraint con
     where con.conrelid = 'public.file_formats'::regclass and con.contype = 'c' and pg_get_constraintdef(con.oid) like '%kind%'
  loop
    execute format('alter table public.file_formats drop constraint %I', c);
  end loop;
end $$;
alter table public.file_formats add constraint file_formats_kind_check check (kind in ('bank','sso','pnd1','pnd1a','rd_fund','pvd'));
