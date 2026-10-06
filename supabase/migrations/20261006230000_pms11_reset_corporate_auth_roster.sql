-- PMS-11 unified reset + corporate identity foundation.
alter table public.profiles add column if not exists company_id text;
alter table public.profiles add column if not exists job_title text;
alter table public.profiles add column if not exists must_change_password boolean not null default false;
create unique index if not exists profiles_company_id_unique on public.profiles(company_id) where company_id is not null;
create index if not exists profiles_must_change_password_idx on public.profiles(must_change_password);

create table if not exists public.admin_reset_events (
  id uuid primary key default gen_random_uuid(),
  reset_at timestamptz not null default now(),
  reset_by uuid not null,
  detail jsonb not null default '{}'::jsonb
);
alter table public.admin_reset_events enable row level security;
drop policy if exists "admins read reset events" on public.admin_reset_events;
create policy "admins read reset events" on public.admin_reset_events for select to authenticated using (public.has_role(auth.uid(),'admin'));

create or replace function public.activate_first_login()
returns void language plpgsql security definer set search_path=public as $$
begin
  if not exists (select 1 from public.profiles where id=auth.uid() and must_change_password=true) then
    raise exception 'First-login activation is not pending for this account';
  end if;
  update public.profiles set must_change_password=false where id=auth.uid();
end $$;
revoke all on function public.activate_first_login() from public, anon;
grant execute on function public.activate_first_login() to authenticated;

create or replace function public.reset_all_project_records()
returns jsonb language plpgsql security definer set search_path=public as $$
declare t text; candidates text[] := array[
  'reviews','evidence_assessments','gate_reviews','ai_advisory_records',
  'ai_advisories','changes','change_requests','evidence_files','records'
];
begin
  if not public.has_role(auth.uid(),'admin') then
    raise exception 'Only Admins can reset project records';
  end if;
  foreach t in array candidates loop
    if to_regclass('public.'||t) is not null then
      execute format('delete from public.%I', t);
    end if;
  end loop;
  delete from public.audit_log;
  insert into public.admin_reset_events(reset_by,detail)
  values(auth.uid(), jsonb_build_object(
    'scope','project_operational_data',
    'preserved',jsonb_build_array('profiles','user_roles','setup-lists.json'),
    'storage_bucket','evidence','completed_at',now()
  ));
  insert into public.audit_log(actor,action,entity,rid,detail)
  values(auth.uid()::text,'ADMIN_RESET','system','PMS11-RESET',
    jsonb_build_object('scope','project_operational_data','completed_at',now()));
  return jsonb_build_object('success',true,'completed_at',now());
end $$;
revoke all on function public.reset_all_project_records() from public, anon;
grant execute on function public.reset_all_project_records() to authenticated;
