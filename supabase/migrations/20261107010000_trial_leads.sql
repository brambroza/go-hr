 
create table if not exists public.trial_leads (
  id               bigint generated always as identity primary key,
  ref_no           text generated always as ('TR' || lpad(id::text, 6, '0')) stored,
  company_name     text not null check (char_length(company_name) between 2 and 200),
  contact_name     text not null check (char_length(contact_name) between 2 and 150),
  position         text check (char_length(position) <= 100),
  phone            text not null check (phone ~ '^0[0-9]{8,9}$'),
  email            text check (char_length(email) <= 200),
  line_id          text check (char_length(line_id) <= 60),
  headcount_range  text not null check (headcount_range in ('1-50', '51-150', '151-300', '301-500', '500+')),
  industry         text check (char_length(industry) <= 60),
  note             text check (char_length(note) <= 1000),
  status           text not null default 'new' check (status in ('new', 'contacted', 'demo', 'trial', 'won', 'lost')),
  sales_note       text check (char_length(sales_note) <= 2000),
  consent_pdpa     boolean not null default false,
  consent_at       timestamptz,
  ip               text,
  user_agent       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists trial_leads_created_idx on public.trial_leads (created_at desc);
create index if not exists trial_leads_phone_idx on public.trial_leads (phone, created_at desc);

create or replace function app.trial_leads_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trial_leads_touch on public.trial_leads;
create trigger trial_leads_touch before update on public.trial_leads
  for each row execute function app.trial_leads_touch();

alter table public.trial_leads enable row level security;

drop policy if exists trial_leads_sel on public.trial_leads;
create policy trial_leads_sel on public.trial_leads for select to authenticated
  using (app.has_perm('settings', 'view'));

drop policy if exists trial_leads_upd on public.trial_leads;
create policy trial_leads_upd on public.trial_leads for update to authenticated
  using (app.has_perm('settings', 'edit'))
  with check (app.has_perm('settings', 'edit'));

-- anonymous visitors never touch the table directly (the public route uses the service role)
revoke all on public.trial_leads from public, anon;
-- signed-in users: read + change only the sales fields; the visitor's own answers stay as submitted
revoke all on public.trial_leads from authenticated;
grant select on public.trial_leads to authenticated;
grant update (status, sales_note) on public.trial_leads to authenticated;
grant all on public.trial_leads to service_role;

notify pgrst, 'reload schema';
