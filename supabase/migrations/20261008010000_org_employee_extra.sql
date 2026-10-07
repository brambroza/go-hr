-- =====================================================================
-- GO HR — Organization & Employees module: extra rules (idempotent)
-- =====================================================================

-- ---------------------------------------------------------------------
-- employee_movements: running document number, creator, salary guard
-- ---------------------------------------------------------------------
create or replace function app.employee_movements_defaults() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.doc_no is null or new.doc_no = '' then
      new.doc_no := app.next_doc_no('MV');
    end if;
    if new.created_by is null then new.created_by := auth.uid(); end if;
  end if;
  -- only users allowed to edit sensitive data may plan a salary change
  if auth.uid() is not null and new.new_salary is not null
     and (tg_op = 'INSERT' or new.new_salary is distinct from old.new_salary)
     and not app.has_perm('employee_private', 'edit') then
    raise exception 'ไม่มีสิทธิ์กำหนดเงินเดือนใหม่ (ต้องมีสิทธิ์แก้ไขข้อมูลอ่อนไหว)';
  end if;
  if tg_op = 'UPDATE' and old.status = 'applied' and new.status <> 'applied' then
    raise exception 'รายการที่นำไปใช้แล้วแก้ไขสถานะไม่ได้';
  end if;
  return new;
end $$;

drop trigger if exists trg_movements_defaults on public.employee_movements;
create trigger trg_movements_defaults before insert or update on public.employee_movements
  for each row execute function app.employee_movements_defaults();

-- ---------------------------------------------------------------------
-- org_units: prevent cycles; keep descendants' level in sync on re-parent
-- ---------------------------------------------------------------------
create or replace function app.org_units_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.parent_id is not null and tg_op = 'UPDATE'
     and new.parent_id in (select app.org_subtree(new.id)) then
    raise exception 'ไม่สามารถย้ายหน่วยงานไปอยู่ใต้หน่วยงานลูกของตัวเองได้';
  end if;
  return new;
end $$;
drop trigger if exists trg_org_units_guard on public.org_units;
create trigger trg_org_units_guard before update of parent_id on public.org_units
  for each row execute function app.org_units_guard();

create or replace function app.org_units_cascade_level() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.level is distinct from old.level then
    -- touching parent_id re-runs the level trigger on each child (recursively)
    update org_units set parent_id = parent_id where parent_id = new.id;
  end if;
  return null;
end $$;
drop trigger if exists trg_org_units_cascade on public.org_units;
create trigger trg_org_units_cascade after update on public.org_units
  for each row execute function app.org_units_cascade_level();

-- ---------------------------------------------------------------------
-- Position headcount (active employees per position) for the positions list
-- ---------------------------------------------------------------------
create or replace function public.position_headcounts() returns table(position_id bigint, headcount bigint)
language sql stable security definer set search_path = public as $$
  select e.position_id, count(*) from employees e
   where e.status <> 'resigned' and e.position_id is not null
   group by e.position_id
$$;
revoke all on function public.position_headcounts from anon;
grant execute on function public.position_headcounts to authenticated;

-- ---------------------------------------------------------------------
-- role_groups: system groups cannot be deleted; groups in use cannot be deleted
-- ---------------------------------------------------------------------
create or replace function app.role_groups_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.is_system then raise exception 'กลุ่มผู้ใช้มาตรฐานของระบบลบไม่ได้'; end if;
    if exists (select 1 from profiles where role_group_id = old.id) then
      raise exception 'ลบไม่ได้ เพราะยังมีผู้ใช้อยู่ในกลุ่มนี้ ย้ายผู้ใช้ไปกลุ่มอื่นก่อน';
    end if;
    return old;
  end if;
  if old.is_system and (new.code is distinct from old.code or new.is_system is distinct from old.is_system) then
    raise exception 'เปลี่ยนรหัสของกลุ่มผู้ใช้มาตรฐานไม่ได้';
  end if;
  return new;
end $$;
drop trigger if exists trg_role_groups_guard on public.role_groups;
create trigger trg_role_groups_guard before update or delete on public.role_groups
  for each row execute function app.role_groups_guard();
