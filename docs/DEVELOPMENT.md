# GO HR — Developer guide

GO HR is an on-premise HR / time-attendance / payroll system for Thai companies (feature parity or better with
HumanSoft PROFESSIONAL). Sold once and installed on the customer's server.

## Stack

- **Next.js 16 (App Router) + TypeScript + Tailwind CSS v4** — one app for the admin console, the employee
  self-service PWA (`/m`), the public careers site (`/careers`) and kiosk screens (`/kiosk`).
- **Supabase** (self-hosted with Docker on the customer's server): Postgres + Auth (GoTrue) + PostgREST + Storage.
- Business rules that must be atomic or secure live in **Postgres** (RLS + `security definer` functions);
  calculations (attendance, payroll, Thai tax) live in **pure TypeScript** (`lib/**/engine.ts`, unit tested).

> Next 16 notes: middleware is now `proxy.ts`; `params` / `searchParams` are Promises; global `PageProps<'/route'>`
> and `LayoutProps<'/route'>` types (run `npx next typegen` after adding routes); `cacheComponents` is OFF.
> Read `node_modules/next/dist/docs/` when unsure.

## Folder map

```
app/(auth)/login          sign in
app/(admin)/...           back-office console (AppShell sidebar). Layout requires a back-office permission or supervisor
app/m/...                 employee self-service PWA (mobile first, bottom nav)
app/careers, app/kiosk    public pages (no login)
app/api/...               route handlers (cron, devices, LINE webhook, public apply, exports)
components/ui             UI kit (Button, Input, Select, Field, Panel, PageHeader, Badge, Modal, Tabs, toast, useConfirm, Stat, Empty)
components/crud           CrudPage (config-driven list + form), FormFields, EmployeePicker
components/charts.tsx     BarList, Donut, ColumnChart (pure SVG)
lib/permissions.ts        MENUS, can(), Me type      lib/nav.ts  sidebar items (each must have a page)
lib/auth.ts               getMe(), requireMe(), requirePerm(menu, action), safeAction()  (server only)
lib/supabase/{client,server,admin}.ts   browser / server (user session, RLS) / service-role clients
lib/format.ts             Thai dates (พ.ศ.), money, bahtText, masking, minutesToHM
lib/storage.ts            uploadFile(bucket, file), signedUrl(ref), resizeImage()
lib/csv.ts                downloadCsv, parseCsv
lib/attendance/engine.ts  computeDay(), summarize()           (pure, tests in tests/)
lib/payroll/{engine,tax}.ts  computeEntry(), monthlyWithholding(), ssoContribution()
supabase/migrations       schema (read these first — table & function names are the API)
supabase/seed.sql         base master data;  scripts/seed-demo.ts  demo company
```

## Data access rules

1. **Client components** read/write with `supabaseBrowser()` — RLS enforces permissions.
2. **Server components** use `await supabaseServer()` (user session).
3. **Privileged work** (create auth users, payroll calculation over many employees, cron jobs, public forms) goes in a
   server action / route handler: first `await requirePerm(menu, action)`, then `supabaseAdmin()`.
4. Multi-row inserts with differing keys: `.insert(rows, { defaultToNull: false })` (otherwise missing keys become NULL).
5. Workflow changes go through RPCs: `submit_request`, `act_request`, `act_requests`, `cancel_request`, `check_in`,
   `team_check_in`, `kiosk_qr_token`, `applicant_move`, `applicant_hire`, `eval_cycle_generate`, `apply_movements`,
   `dashboard_stats`, `payroll_insight`, `org_chart`, `my_team`, `my_leave_balances`, `log_sensitive_view`.
6. Views: `v_directory` (safe employee list for everyone), `v_employee_overview`, `v_requests`, `v_my_approvals`,
   `v_leave_balances`, `v_resignation_signals`.
7. Sensitive data (salary, bank, national id) is in `employee_private` — visible only to self or `employee_private` permission.
   Show masked by default (`maskNationalId`, `maskAccount`) and log reveals with `log_sensitive_view`.

## Permissions

Menus: `org, employee, employee_private, attendance, request_admin, payroll, report, recruit, learning, performance,
tools, insight, settings, security, audit` × actions `view, create, edit, delete, export, approve`.
DB: `app.has_perm(menu, action)`. UI: `useCan()(menu, action)` in client, `can(me, menu, action)` on server.
Supervisors (anyone with subordinates) see their team even without HR permissions (`app.is_manager_of`).

## UI conventions

- Thai UI, plain sentence-style labels, buttons say exactly what they do ("บันทึก", "อนุมัติ", "คำนวณเงินเดือน").
  No ALL-CAPS labels, no decorative eyebrows. Errors say what went wrong and how to fix it.
- Colors (Tailwind tokens): `jade-50…950` (brand / primary), `ink`, `ink-soft`, `ink-mute`, `paper` (page bg),
  `line`, `line-soft`, `amber-ink` + `amber-50` (pending), `rust` + `rust-soft` (problems). Use `num` class for numbers.
- Page = `PageHeader` + `Panel`s. Tables: hairline rows, `text-[14px]`. Mobile pages (`/m`) are single-column, big tap targets.
- Dates are shown in พ.ศ. via `thDate()`; store ISO `YYYY-MM-DD`. Times are Asia/Bangkok.
- Simple master tables: use `CrudPage` (see `app/(admin)/org/branches/page.tsx`).

## Local dev environment

On a developer machine use the Supabase CLI (`npx supabase start`, see README). The notes below describe the
lightweight stack used while building GO HR in a container without Docker:

- Postgres 16 `127.0.0.1:54322` db `hr` (user postgres, trust), GoTrue :9999, PostgREST :3001,
  gateway `http://localhost:54321` (`/auth/v1`, `/rest/v1`, `/storage/v1` → local file store).
- Next dev server `http://localhost:3000` (already running; hot reloads — do not start another one).
- Runtime config: the browser gets the Supabase URL/anon key from `window.__GOHR_ENV` (lib/public-env.ts) — use
  `PUBLIC_SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_URL` (server) instead of `NEXT_PUBLIC_*` so one Docker image fits every customer.
- Scripts that import server modules: `npx tsx --tsconfig scripts/tsconfig.json scripts/<file>.ts` (shims `server-only`).
- Apply a new migration: `psql -h 127.0.0.1 -p 54322 -U postgres -d hr -v ON_ERROR_STOP=1 -f <file>`
  (write migrations idempotently: `create or replace`, `if not exists`, `drop policy if exists`).
  PostgREST caches the schema: after DDL run `psql -h 127.0.0.1 -p 54322 -U postgres -d hr -c "notify pgrst, 'reload schema'"`.
- Logins (demo data): `admin / Admin@1234` (admin), `hr / Hr@12345` (HR), `payroll / Pay@12345` (SAL),
  `manager / Mgr@12345` (MANAGER, production head), `E0007 / Emp@12345` (line supervisor, employee group),
  `E0011 / Emp@12345` (plain employee).
- Screenshots: `node <scratchpad>/pw/shot.mjs <login> <password> <outdir> /path1 /path2` (env `MOBILE=1` for phone
  viewport, `FULL=1` full page). Prints h1 + console errors; view PNGs with the Read tool.
- Tests: `npx tsx --test tests/*.test.ts`. Types: `npx tsc --noEmit`.
