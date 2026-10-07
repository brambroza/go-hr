-- pgcrypto wrappers run as owner so roles without USAGE on schema "extensions" can use column defaults (qr_secret, api_key, slug)
do $$
declare s text;
begin
  select n.nspname into s from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'pgcrypto';
  execute format($f$create or replace function app.rand_hex(n int) returns text language sql volatile security definer set search_path = pg_catalog as 'select encode(%I.gen_random_bytes(n), ''hex'')'$f$, s);
  execute format($f$create or replace function app.hmac_hex(msg text, key text) returns text language sql immutable security definer set search_path = pg_catalog as 'select encode(%I.hmac(msg, key, ''sha256''), ''hex'')'$f$, s);
end $$;
