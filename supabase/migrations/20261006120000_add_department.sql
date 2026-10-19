create or replace function public.user_department(_uid uuid) returns text language sql stable security definer set search_path = public as $$
  select department from public.profiles where id = _uid limit 1;
$$;

-- Add department column to profiles
alter table public.profiles add column department text;
grant update(department) on public.profiles to authenticated;

-- Add department column to records
alter table public.records add column department text;
grant update(department) on public.records to authenticated;

-- Update read policy for records to respect department
drop policy if exists "read records" on public.records;
create policy "read records" on public.records for select to authenticated using (
  public.user_department(auth.uid()) = department
  or department is null
);

-- Update insert/update policies to ensure department is set correctly
drop policy if exists "edit insert" on public.records;
create policy "edit insert" on public.records for insert to authenticated with check (
  public.can_edit(auth.uid())
  and (public.user_department(auth.uid()) = department or department is null)
);

drop policy if exists "edit update" on public.records;
create policy "edit update" on public.records for update to authenticated using (
  public.can_edit(auth.uid()) and public.user_department(auth.uid()) = department
) with check (
  public.can_edit(auth.uid()) and public.user_department(auth.uid()) = department
);

-- Optional: Set default department on new records based on user
alter table public.records alter column department set default (select department from public.profiles where id = auth.uid());
