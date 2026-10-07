-- =====================================================================
-- GO HR — custom export file layouts (bank / SSO / RD)                 (idempotent)
--
-- Built-in layouts live in code (lib/payroll/file-layouts.ts). HR clones one in /settings/file-formats and edits
-- fields / header / trailer / encoding / file name; the edited copy is stored here as JSON (FileLayout).
-- is_default marks the layout preselected for its kind (one per kind).
-- =====================================================================

create table if not exists public.file_formats (
  id          bigint generated always as identity primary key,
  key         text not null unique,
  kind        text not null check (kind in ('bank','sso','pnd1','pnd1a','rd_fund')),
  label       text not null,
  layout      jsonb not null,
  based_on    text,
  is_default  boolean not null default false,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);

create index if not exists file_formats_kind_idx on public.file_formats(kind);
create unique index if not exists file_formats_one_default on public.file_formats(kind) where is_default;

alter table public.file_formats enable row level security;

drop policy if exists p_sel on public.file_formats;
drop policy if exists p_wr on public.file_formats;
create policy p_sel on public.file_formats for select to authenticated using (
  app.has_perm('payroll','view') or app.has_perm('report','view') or app.has_perm('settings','view'));
create policy p_wr on public.file_formats for all to authenticated
  using (app.has_perm('payroll','edit') or app.has_perm('settings','edit'))
  with check (app.has_perm('payroll','edit') or app.has_perm('settings','edit'));

drop trigger if exists trg_touch on public.file_formats;
create trigger trg_touch before update on public.file_formats for each row execute function app.touch_updated_at();

select app.enable_audit('public.file_formats');

grant select, insert, update, delete on public.file_formats to authenticated;
