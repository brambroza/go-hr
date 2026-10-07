-- =====================================================================
-- GO HR — Requests back-office extras (idempotent)
--   * preview_approval_chain()  — "ทดสอบลำดับอนุมัติ" in the flow editor
--   * issue_request_document()  — document no. + issue date for printable letters
--   * save_document_template()  — template editor (request_admin edit, not settings edit)
--   * approval_flows delete for request_admin edit (menu has no "delete" action)
-- =====================================================================

-- ---------------------------------------------------------------------
-- Preview: which flow matches an employee + request type and who approves each step.
-- Mirrors the chain building in public.submit_request (skip_self / skip_missing / duplicates / max 10).
-- ---------------------------------------------------------------------
create or replace function public.preview_approval_chain(p_type text, p_employee_id bigint)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_flow   approval_flows%rowtype;
  v_step   jsonb;
  v_user   uuid;
  v_self   uuid;
  v_n      int := 0;
  v_i      int := 0;
  v_used   uuid[] := '{}';
  v_out    jsonb := '[]'::jsonb;
  v_skip   text;
  v_name   text;
  v_members jsonb;
  v_default boolean := false;
begin
  if not app.has_perm('request_admin','view') then raise exception 'ไม่มีสิทธิ์ดูลำดับขั้นการอนุมัติ'; end if;
  if not exists (select 1 from employees where id = p_employee_id) then raise exception 'ไม่พบพนักงาน'; end if;
  v_self := app.employee_user(p_employee_id);

  v_flow := app.find_flow(p_type, p_employee_id);
  if v_flow.id is null then
    v_default := true;
    v_flow.name := 'ค่าเริ่มต้นของระบบ (หัวหน้า → HR)';
    v_flow.steps := '[{"type":"supervisor","level":1},{"type":"role","role_code":"HR"}]'::jsonb;
    v_flow.skip_self := true; v_flow.skip_missing := true; v_flow.auto_approve_if_empty := false;
  end if;

  for v_step in select * from jsonb_array_elements(v_flow.steps) loop
    v_i := v_i + 1;
    v_skip := null; v_name := null; v_members := null;
    v_user := app.resolve_approver(p_employee_id, v_step);
    if v_step->>'type' = 'role' then
      select coalesce(jsonb_agg(coalesce(p.display_name, e.first_name || ' ' || e.last_name, p.username) order by 1), '[]'::jsonb)
        into v_members
        from profiles p join role_groups g on g.id = p.role_group_id left join employees e on e.id = p.employee_id
       where g.code = v_step->>'role_code' and p.is_active;
      v_name := coalesce((select name from role_groups where code = v_step->>'role_code'), v_step->>'role_code');
      if jsonb_array_length(v_members) = 0 then v_skip := 'กลุ่มนี้ยังไม่มีผู้ใช้ — เอกสารจะค้างที่ขั้นนี้'; end if;
    else
      select coalesce(p.display_name, e.first_name || ' ' || e.last_name, p.username) into v_name
        from profiles p left join employees e on e.id = p.employee_id where p.id = v_user;
      if v_user is null and v_flow.skip_missing then v_skip := 'ข้าม: หาผู้อนุมัติไม่พบ';
      elsif v_user is null then v_skip := 'หาผู้อนุมัติไม่พบ — เอกสารจะค้างที่ขั้นนี้';
      elsif v_flow.skip_self and v_user = v_self then v_skip := 'ข้าม: ผู้อนุมัติคือผู้ยื่นเอง';
      elsif v_user = any(v_used) then v_skip := 'ข้าม: ผู้อนุมัติซ้ำกับขั้นก่อนหน้า';
      end if;
    end if;

    if v_skip is null or v_skip not like 'ข้าม:%' then
      v_n := v_n + 1;
      if v_user is not null then v_used := v_used || v_user; end if;
    end if;

    v_out := v_out || jsonb_build_object(
      'index', v_i,
      'step', case when v_skip is null or v_skip not like 'ข้าม:%' then v_n end,
      'def', v_step,
      'approver_user_id', v_user,
      'approver_name', v_name,
      'members', v_members,
      'note', v_skip,
      'over_limit', v_n > 10);
  end loop;

  return jsonb_build_object(
    'flow_id', v_flow.id,
    'flow_name', v_flow.name,
    'is_default', v_default,
    'skip_self', v_flow.skip_self,
    'skip_missing', v_flow.skip_missing,
    'auto_approve', v_n = 0,
    'total_steps', least(v_n, 10),
    'steps', v_out);
end $$;
revoke all on function public.preview_approval_chain(text, bigint) from public, anon;
grant execute on function public.preview_approval_chain(text, bigint) to authenticated;

-- ---------------------------------------------------------------------
-- Printable documents: assign a document number + issue date once (kept in payload)
-- ---------------------------------------------------------------------
create or replace function public.issue_request_document(p_request_id bigint)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare r requests%rowtype;
begin
  if not app.has_perm('request_admin','view') then raise exception 'ไม่มีสิทธิ์ออกเอกสาร'; end if;
  select * into r from requests where id = p_request_id for update;
  if not found then raise exception 'ไม่พบเอกสาร'; end if;
  if r.request_type not in ('salary_cert','work_cert','visa_doc','contract') then raise exception 'เอกสารประเภทนี้ไม่มีแบบพิมพ์'; end if;
  if r.status <> 'approved' then raise exception 'พิมพ์ได้เฉพาะเอกสารที่อนุมัติแล้ว'; end if;
  if not app.can_see_employee(r.employee_id) then raise exception 'ไม่มีสิทธิ์ดูข้อมูลพนักงานคนนี้'; end if;
  if coalesce(r.payload->>'document_no','') = '' then
    update requests
       set payload = payload || jsonb_build_object(
             'document_no', app.next_doc_no(case r.request_type when 'contract' then 'CT' else 'HRL' end,
                                            to_char(now() at time zone 'Asia/Bangkok', 'YYYY')),
             'issued_at', to_char(now() at time zone 'Asia/Bangkok', 'YYYY-MM-DD'),
             'issued_by', auth.uid())
     where id = r.id returning * into r;
  end if;
  return jsonb_build_object('document_no', r.payload->>'document_no', 'issued_at', r.payload->>'issued_at');
end $$;
revoke all on function public.issue_request_document(bigint) from public, anon;
grant execute on function public.issue_request_document(bigint) to authenticated;

-- ---------------------------------------------------------------------
-- Document templates live in settings (readable by every signed-in user);
-- request_admin edit may change them without full settings rights.
-- ---------------------------------------------------------------------
create or replace function public.save_document_template(p_key text, p_value jsonb)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not app.has_perm('request_admin','edit') then raise exception 'ไม่มีสิทธิ์แก้ไขแบบฟอร์มเอกสาร'; end if;
  if p_key not in ('contract_template','salary_cert_template','work_cert_template','visa_doc_template') then
    raise exception 'ชื่อแบบฟอร์มไม่ถูกต้อง';
  end if;
  insert into settings(key, value, updated_by) values (p_key, coalesce(p_value, '{}'::jsonb), auth.uid())
  on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = auth.uid();
end $$;
revoke all on function public.save_document_template(text, jsonb) from public, anon;
grant execute on function public.save_document_template(text, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- approval_flows: request_admin has no "delete" action → allow delete with "edit"
-- (flows already used by requests cannot be deleted because of the FK — deactivate instead)
-- ---------------------------------------------------------------------
drop policy if exists p_del_req_admin on public.approval_flows;
create policy p_del_req_admin on public.approval_flows for delete to authenticated using (app.has_perm('request_admin','edit'));
