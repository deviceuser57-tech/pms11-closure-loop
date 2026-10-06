-- PMS-11 Red-Team hardening for the unified 29-item scope.
-- This migration keeps system authentication/users intact while enforcing corporate identity,
-- department-scoped operational access, explicit application-role governance, and a complete reset scope.

alter table public.profiles add column if not exists department text;
alter table public.records add column if not exists department text;

create index if not exists profiles_department_idx on public.profiles(department);
create index if not exists records_department_idx on public.records(department);

-- Corporate domain enforcement at the Auth -> public profile boundary.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is null or lower(new.email) !~ '@pms\.eg$' then
    raise exception 'PMS-11 accounts must use an authorized @pms.eg business email';
  end if;

  insert into public.profiles(id,email,display_name,must_change_password)
  values(
    new.id,
    lower(new.email),
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
    false
  )
  on conflict(id) do update
    set email=excluded.email,
        display_name=coalesce(excluded.display_name, public.profiles.display_name);

  insert into public.user_roles(user_id,role)
  values(new.id,'viewer')
  on conflict do nothing;

  return new;
end
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Existing corporate users are normalized; no email verification workflow is required.
update public.profiles
set email = lower(email)
where email is not null;

-- Department is the authorization boundary for non-admin users.
create or replace function public.current_user_department()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select department from public.profiles where id = auth.uid()
$$;

revoke all on function public.current_user_department() from public;
grant execute on function public.current_user_department() to authenticated;

alter table public.records enable row level security;

drop policy if exists "authenticated read records by department" on public.records;
create policy "authenticated read records by department"
on public.records for select
to authenticated
using (
  public.has_role(auth.uid(),'admin')
  or (
    public.current_user_department() is not null
    and department is not null
    and lower(trim(department)) = lower(trim(public.current_user_department()))
  )
);

drop policy if exists "authenticated insert records by department" on public.records;
create policy "authenticated insert records by department"
on public.records for insert
to authenticated
with check (
  public.has_role(auth.uid(),'admin')
  or (
    public.current_user_department() is not null
    and department is not null
    and lower(trim(department)) = lower(trim(public.current_user_department()))
  )
);

drop policy if exists "authenticated update records by department" on public.records;
create policy "authenticated update records by department"
on public.records for update
to authenticated
using (
  public.has_role(auth.uid(),'admin')
  or (
    public.current_user_department() is not null
    and department is not null
    and lower(trim(department)) = lower(trim(public.current_user_department()))
  )
)
with check (
  public.has_role(auth.uid(),'admin')
  or (
    public.current_user_department() is not null
    and department is not null
    and lower(trim(department)) = lower(trim(public.current_user_department()))
  )
);

drop policy if exists "authenticated delete records by department" on public.records;
create policy "authenticated delete records by department"
on public.records for delete
to authenticated
using (public.has_role(auth.uid(),'admin'));

-- The reset must clear the complete known operational dataset, but never profiles/user_roles/admin reset events.
create or replace function public.reset_all_project_records()
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  t text;
  candidates text[] := array[
    'reviews',
    'evidence_assessments',
    'gate_reviews',
    'ai_advisory_records',
    'ai_advisories',
    'changes',
    'change_requests',
    'import_runs',
    'evidence_files',
    'records'
  ];
begin
  if not public.has_role(auth.uid(),'admin') then
    raise exception 'Only Admins can reset project records';
  end if;

  foreach t in array candidates loop
    if to_regclass('public.'||t) is not null then
      execute format('delete from public.%I',t);
    end if;
  end loop;

  if to_regclass('public.audit_log') is not null then
    delete from public.audit_log;
  end if;

  insert into public.admin_reset_events(reset_by,detail)
  values(
    auth.uid(),
    jsonb_build_object(
      'scope','project_operational_data',
      'preserved',jsonb_build_array('auth.users','profiles','user_roles','setup-lists.json'),
      'storage_bucket','evidence',
      'completed_at',now()
    )
  );

  if to_regclass('public.audit_log') is not null then
    insert into public.audit_log(actor,action,entity,rid,detail)
    values(
      auth.uid()::text,
      'ADMIN_RESET',
      'system',
      'PMS11-RESET',
      jsonb_build_object('scope','project_operational_data','completed_at',now())
    );
  end if;

  return jsonb_build_object('success',true,'completed_at',now());
end
$$;

revoke all on function public.reset_all_project_records() from public, anon;
grant execute on function public.reset_all_project_records() to authenticated;
