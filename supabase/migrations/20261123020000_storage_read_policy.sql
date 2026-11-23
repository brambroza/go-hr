-- =====================================================================
-- GO HR — Storage read policy: make sure it uses app.can_read_object()         (idempotent)
--
--   An early copy of 20261123010000_grants_lockdown.sql contained its statements twice and ended by
--   re-creating "go_hr_own_read" with a per-bucket rule that ignores the data scope (branch / unit).
--   A database migrated with that copy has every other change of the lockdown, but the looser policy.
--   This file sets the intended policy again; on a database migrated with the corrected file it changes nothing.
-- =====================================================================
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'objects') then
    execute $p$drop policy if exists "go_hr_own_read" on storage.objects$p$;
    execute $p$create policy "go_hr_own_read" on storage.objects for select to authenticated
               using (app.can_read_object(bucket_id, name))$p$;
  end if;
end $$;

select app.sync_grants();
notify pgrst, 'reload schema';
