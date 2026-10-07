-- =====================================================================
-- GO HR — Hardening (idempotent)
-- =====================================================================

-- profiles: every signed-in user may see who is who (names for feeds, approvers, signatures),
-- but never another user's pending LINE link code (could be used to hijack notifications).
do $$
declare cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'profiles'
     and column_name not in ('line_link_code', 'line_link_expires_at');
  execute 'revoke select on public.profiles from anon, authenticated';
  execute format('grant select (%s) on public.profiles to authenticated', cols);
end $$;

-- the directory view bypasses RLS by design; keep it away from anonymous visitors
revoke all on public.v_directory from anon;
