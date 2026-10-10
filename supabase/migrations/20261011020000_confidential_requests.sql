-- =====================================================================
-- GO HR — Confidential complaints                                           (idempotent)
--
--   The complaint form offers "ปิดชื่อจากหัวหน้า" (payload.confidential = true) and the complaint approval
--   flow goes to the HR role only, but app.can_see_request() still let the employee's supervisor chain
--   (app.is_manager_of) read the request. Supervisors now see a request through the "my team" rule only
--   when it is not confidential. HR (request_admin.view) and the assigned approvers are unchanged.
--
--   Check after applying (psql, as a supervisor who is not HR):
--     set role authenticated; select set_config('request.jwt.claim.sub', '<supervisor profile uuid>', true);
--     select count(*) from requests where request_type = 'complaint' and (payload->>'confidential')::boolean;  -- 0
-- =====================================================================

create or replace function app.can_see_request(p_id bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from requests r
     where r.id = p_id and (
           r.employee_id = app.my_employee_id() or r.requested_by = auth.uid()
        or (app.is_manager_of(r.employee_id) and not coalesce((r.payload->>'confidential')::boolean, false))
        or (app.has_perm('request_admin','view') and app.can_see_employee(r.employee_id))
        or exists (select 1 from request_approvals a where a.request_id = r.id
                    and (a.approver_user_id = auth.uid()
                         or a.approver_role_code in (select g.code from profiles p join role_groups g on g.id = p.role_group_id where p.id = auth.uid())))))
$$;
