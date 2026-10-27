-- =====================================================================
-- GO HR — โครงสร้างองค์กรไม่จำกัดชั้น + ย้ายหน่วยงานด้วยการลากวาง           (idempotent)
--
--   org_units.level was capped at 10 (check constraint + trigger). The cap is removed; level is still
--   derived from the parent. Re-parenting now recalculates all descendants in one statement instead of
--   one nested trigger per level, so deep trees do not hit the trigger nesting / stack limit.
--   move_org_unit() is used by the org chart's drag-and-drop: new parent + sibling order in one call.
-- =====================================================================

-- drop the 1..10 check, keep level >= 1
do $$
declare c text;
begin
  for c in
    select con.conname from pg_constraint con
     where con.conrelid = 'public.org_units'::regclass and con.contype = 'c' and pg_get_constraintdef(con.oid) like '%level%'
  loop
    execute format('alter table public.org_units drop constraint %I', c);
  end loop;
end $$;
alter table public.org_units add constraint org_units_level_check check (level >= 1);

create or replace function app.org_units_level() returns trigger
language plpgsql as $$
declare v_parent_level int;
begin
  if new.parent_id is null then
    new.level := 1;
  else
    if new.parent_id = new.id then raise exception 'หน่วยงานแม่ต้องไม่ใช่ตัวเอง'; end if;
    select level into v_parent_level from org_units where id = new.parent_id;
    new.level := coalesce(v_parent_level, 0) + 1;
  end if;
  return new;
end $$;

-- recalculate every descendant's level at once; the nested update (pg_trigger_depth() > 1) is skipped
create or replace function app.org_units_cascade_level() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if pg_trigger_depth() > 1 then return null; end if;
  if new.level is distinct from old.level then
    with recursive d(id, lvl) as (
      select o.id, new.level + 1 from org_units o where o.parent_id = new.id
      union all
      select o.id, d.lvl + 1 from org_units o join d on o.parent_id = d.id
    )
    update org_units o set level = d.lvl from d where o.id = d.id and o.level is distinct from d.lvl;
  end if;
  return null;
end $$;

-- check-in policy: walk up the whole chain (the tree is acyclic — org_units_guard; 1000 is only a runaway stop)
create or replace function app.checkin_policy(p_emp bigint)
returns table(mode text, location_ids bigint[], source text)
language plpgsql stable security definer set search_path = public as $$
declare
  v_emp_ids bigint[];
  v_unit    bigint;
  v_row     record;
begin
  select e.work_location_ids, e.org_unit_id into v_emp_ids, v_unit from employees e where e.id = p_emp;
  if v_emp_ids is not null and cardinality(v_emp_ids) > 0 then
    return query select 'locations'::text, v_emp_ids, 'employee'::text;
    return;
  end if;
  -- walk up the org tree and take the first unit that sets a policy
  for v_row in
    with recursive chain as (
      select u.id, u.parent_id, u.checkin_mode, u.work_location_ids, 1 as depth from org_units u where u.id = v_unit
      union all
      select u.id, u.parent_id, u.checkin_mode, u.work_location_ids, c.depth + 1
        from org_units u join chain c on u.id = c.parent_id where c.depth < 1000
    )
    select c.id, c.checkin_mode, c.work_location_ids from chain c where c.checkin_mode <> 'inherit' order by c.depth limit 1
  loop
    if v_row.checkin_mode = 'anywhere' then
      return query select 'anywhere'::text, null::bigint[], ('org_unit:' || v_row.id)::text;
    elsif v_row.work_location_ids is not null and cardinality(v_row.work_location_ids) > 0 then
      return query select 'locations'::text, v_row.work_location_ids, ('org_unit:' || v_row.id)::text;
    else
      return query select 'all'::text, null::bigint[], ('org_unit:' || v_row.id)::text;
    end if;
    return;
  end loop;
  return query select 'all'::text, null::bigint[], 'default'::text;
end $$;
revoke all on function app.checkin_policy(bigint) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Drag-and-drop move: put p_id under p_parent_id (null = top level) and renumber that parent's children
-- in the order of p_order (ids not under p_parent_id are ignored; siblings not listed keep their order after).
-- ---------------------------------------------------------------------
create or replace function public.move_org_unit(p_id bigint, p_parent_id bigint, p_order bigint[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not app.has_perm('org','edit') then raise exception 'ไม่มีสิทธิ์'; end if;
  if not exists (select 1 from org_units where id = p_id) then raise exception 'ไม่พบหน่วยงาน'; end if;
  if p_parent_id is not null and not exists (select 1 from org_units where id = p_parent_id) then
    raise exception 'ไม่พบหน่วยงานแม่';
  end if;
  -- guard / level / cascade triggers reject cycles and recalculate levels
  update org_units set parent_id = p_parent_id where id = p_id and parent_id is distinct from p_parent_id;

  with listed as (
    select x.id, x.ord from unnest(coalesce(p_order, '{}'::bigint[])) with ordinality as x(id, ord)
  ), ranked as (
    select o.id, row_number() over (order by l.ord nulls last, o.sort_order, o.name) as rn
      from org_units o left join listed l on l.id = o.id
     where o.parent_id is not distinct from p_parent_id
  )
  update org_units o set sort_order = r.rn * 10 from ranked r where o.id = r.id and o.sort_order is distinct from r.rn * 10;
end $$;
revoke all on function public.move_org_unit(bigint, bigint, bigint[]) from public, anon;
grant execute on function public.move_org_unit(bigint, bigint, bigint[]) to authenticated;
