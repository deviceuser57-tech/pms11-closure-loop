-- PMS-11 operational completion: incremental workbook imports, Smart Reporting, AI command chat and department scoping.
alter table public.profiles add column if not exists department text;
alter table public.records add column if not exists department text;
create index if not exists records_department_idx on public.records(department);
create index if not exists profiles_department_idx on public.profiles(department);

create or replace function public.current_department()
returns text
language sql stable security definer set search_path = public
as $$ select department from public.profiles where id = auth.uid() limit 1 $$;

drop policy if exists "read records" on public.records;
create policy "read records by role and department" on public.records
for select to authenticated
using (
  public.has_role(auth.uid(),'admin')
  or (
    public.current_department() is not null
    and department = public.current_department()
  )
);

drop policy if exists "edit insert" on public.records;
create policy "edit records by role and department" on public.records
for insert to authenticated
with check (
  public.has_role(auth.uid(),'admin')
  or (
    public.can_edit(auth.uid())
    and public.current_department() is not null
    and department = public.current_department()
  )
);

drop policy if exists "edit update" on public.records;
create policy "update records by role and department" on public.records
for update to authenticated
using (
  public.has_role(auth.uid(),'admin')
  or (
    public.can_edit(auth.uid())
    and public.current_department() is not null
    and department = public.current_department()
  )
)
with check (
  public.has_role(auth.uid(),'admin')
  or (
    public.can_edit(auth.uid())
    and public.current_department() is not null
    and department = public.current_department()
  )
);

drop policy if exists "update own profile" on public.profiles;
create policy "update own or admin profiles" on public.profiles
for update to authenticated
using (auth.uid() = id or public.has_role(auth.uid(),'admin'))
with check (auth.uid() = id or public.has_role(auth.uid(),'admin'));

-- Existing source rows remain unassigned until an Admin explicitly assigns a department.
-- This prevents accidental cross-department exposure.

create or replace function public.set_user_department(_user_id uuid, _department text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.has_role(auth.uid(),'admin') then
    raise exception 'Only Admins can manage departments';
  end if;
  update public.profiles
  set department = nullif(trim(_department),'')
  where id = _user_id;
end
$$;
revoke all on function public.set_user_department(uuid,text) from public, anon;
grant execute on function public.set_user_department(uuid,text) to authenticated;

create or replace function public.set_record_department(_record_id uuid, _department text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.has_role(auth.uid(),'admin') then
    raise exception 'Only Admins can assign record departments';
  end if;
  update public.records
  set department = nullif(trim(_department),'')
  where id = _record_id;
end
$$;
revoke all on function public.set_record_department(uuid,text) from public, anon;
grant execute on function public.set_record_department(uuid,text) to authenticated;


-- Assign a WPS to a department and cascade that scope to every record
-- explicitly linked to the WPS in the normalized wps_id or source workbook data.
create or replace function public.set_wps_department(_wps_rid text, _department text)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  affected integer;
begin
  if not public.has_role(auth.uid(),'admin') then
    raise exception 'Only Admins can assign WPS departments';
  end if;

  update public.records
  set department = nullif(trim(_department),'')
  where rid = _wps_rid
     or wps_id = _wps_rid
     or data::text ~ ('"' || regexp_replace(_wps_rid, '([\\.\\+*?\\[\\^\\]$(){}=!<>|:-])', '\\\\1', 'g') || '"');

  get diagnostics affected = row_count;
  return affected;
end
$$;
revoke all on function public.set_wps_department(text,text) from public, anon;
grant execute on function public.set_wps_department(text,text) to authenticated;
