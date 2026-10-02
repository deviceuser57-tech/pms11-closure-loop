create type public.app_role as enum ('admin','reviewer','contributor','viewer');

create table public.user_roles (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, role app_role not null, unique(user_id, role));
grant select on public.user_roles to authenticated; grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role) returns boolean language sql stable security definer set search_path = public as $$ select exists (select 1 from public.user_roles where user_id=_user_id and role=_role) $$;
create or replace function public.can_edit(_u uuid) returns boolean language sql stable security definer set search_path = public as $$ select exists (select 1 from public.user_roles where user_id=_u and role in ('admin','reviewer','contributor')) $$;
create or replace function public.can_review(_u uuid) returns boolean language sql stable security definer set search_path = public as $$ select exists (select 1 from public.user_roles where user_id=_u and role in ('admin','reviewer')) $$;

create policy "read roles" on public.user_roles for select to authenticated using (true);
create policy "admin manage roles" on public.user_roles for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
grant insert, update, delete on public.user_roles to authenticated;

create table public.profiles (id uuid primary key references auth.users(id) on delete cascade, email text, display_name text, created_at timestamptz not null default now());
grant select, update on public.profiles to authenticated; grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "read profiles" on public.profiles for select to authenticated using (true);
create policy "update own profile" on public.profiles for update to authenticated using (auth.uid()=id) with check (auth.uid()=id);

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id,email,display_name) values (new.id,new.email,coalesce(new.raw_user_meta_data->>'full_name',split_part(new.email,'@',1)));
  if not exists (select 1 from public.user_roles where role='admin') then
    insert into public.user_roles(user_id,role) values (new.id,'admin');
  else
    insert into public.user_roles(user_id,role) values (new.id,'viewer');
  end if;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create table public.records (
  id uuid primary key default gen_random_uuid(),
  entity text not null,
  rid text not null,
  title text not null,
  description text,
  wps_id text, gate_id text, parent_id text,
  status text not null default 'Open',
  owner text, reviewer text, approver text,
  due_date date, expiry_date date,
  criticality text,
  source_kind text not null default 'user',
  applicability text,
  execution_note text,
  review_status text not null default 'Pending',
  evidence_ids text[] not null default '{}',
  acceptance_ids text[] not null default '{}',
  rule_ids text[] not null default '{}',
  links text[] not null default '{}',
  doc_number text, revision text, issuer text, doc_source text,
  closure_pct int not null default 0,
  no_go_active boolean not null default false,
  data jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  unique(entity, rid)
);
create index on public.records(entity); create index on public.records(wps_id); create index on public.records(gate_id);
grant select, insert, update, delete on public.records to authenticated; grant all on public.records to service_role;
alter table public.records enable row level security;
create policy "read records" on public.records for select to authenticated using (true);
create policy "edit insert" on public.records for insert to authenticated with check (public.can_edit(auth.uid()));
create policy "edit update" on public.records for update to authenticated using (public.can_edit(auth.uid())) with check (public.can_edit(auth.uid()));
create policy "admin delete" on public.records for delete to authenticated using (public.has_role(auth.uid(),'admin'));

create or replace function public.closure_blockers(_id uuid) returns text[] language plpgsql stable set search_path = public as $$
declare r public.records; b text[] := '{}'; bad int; g public.records;
begin
  select * into r from public.records where id=_id;
  if r.id is null then return array['not found']; end if;
  if coalesce(trim(r.owner),'')='' or r.owner ilike '%to be assigned%' or r.owner ilike 'TBC%' then b := b || 'No named owner'; end if;
  if coalesce(trim(r.execution_note),'')='' then b := b || 'No recorded execution'; end if;
  if r.review_status <> 'Approved' then b := b || 'Review not approved'; end if;
  if cardinality(r.evidence_ids)=0 then b := b || 'No linked evidence';
  else
    select count(*) into bad from unnest(r.evidence_ids) e where not exists (select 1 from public.records x where x.entity='evidence' and x.rid=e and x.status='Accepted' and (x.expiry_date is null or x.expiry_date>=current_date));
    if bad>0 then b := b || (bad||' evidence item(s) not accepted or expired'); end if;
  end if;
  if cardinality(r.acceptance_ids)=0 then b := b || 'No acceptance criteria linked';
  else
    select count(*) into bad from unnest(r.acceptance_ids) a where not exists (select 1 from public.records x where x.entity='acceptance' and x.rid=a and x.status='Met');
    if bad>0 then b := b || (bad||' acceptance criteria not met'); end if;
  end if;
  select * into g from public.records where entity='gate' and rid = coalesce(r.gate_id,(select gate_id from public.records w where w.entity='wps' and w.rid=r.wps_id limit 1)) limit 1;
  if g.id is not null and g.no_go_active then b := b || (g.rid||' has an active No-Go'); end if;
  return b;
end $$;
grant execute on function public.closure_blockers(uuid) to authenticated;

create or replace function public.records_guard() returns trigger language plpgsql set search_path = public as $$
declare bl text[];
begin
  new.updated_at := now(); new.updated_by := auth.uid();
  if tg_op='UPDATE' and new.review_status is distinct from old.review_status and auth.uid() is not null and not public.can_review(auth.uid()) then
    raise exception 'Only Reviewers or Admins can change review status';
  end if;
  if tg_op='UPDATE' and new.review_status='Rejected' and old.review_status is distinct from 'Rejected' and old.status='Closed' then
    new.status := 'Reopened';
  end if;
  if new.entity in ('rule','wps','activity','task','gap','deliverable') and new.status='Closed' and (tg_op='INSERT' or old.status is distinct from 'Closed') then
    bl := public.closure_blockers_row(new);
    if cardinality(bl)>0 then raise exception 'Closure blocked: %', array_to_string(bl,'; '); end if;
    new.closure_pct := 100;
  end if;
  return new;
end $$;

create or replace function public.closure_blockers_row(r public.records) returns text[] language plpgsql stable set search_path = public as $$
declare b text[] := '{}'; bad int; g public.records;
begin
  if coalesce(trim(r.owner),'')='' or r.owner ilike '%to be assigned%' or r.owner ilike 'TBC%' then b := b || 'No named owner'; end if;
  if coalesce(trim(r.execution_note),'')='' then b := b || 'No recorded execution'; end if;
  if r.review_status <> 'Approved' then b := b || 'Review not approved'; end if;
  if cardinality(r.evidence_ids)=0 then b := b || 'No linked evidence';
  else
    select count(*) into bad from unnest(r.evidence_ids) e where not exists (select 1 from public.records x where x.entity='evidence' and x.rid=e and x.status='Accepted' and (x.expiry_date is null or x.expiry_date>=current_date));
    if bad>0 then b := b || (bad||' evidence item(s) not accepted or expired'); end if;
  end if;
  if cardinality(r.acceptance_ids)=0 then b := b || 'No acceptance criteria linked';
  else
    select count(*) into bad from unnest(r.acceptance_ids) a where not exists (select 1 from public.records x where x.entity='acceptance' and x.rid=a and x.status='Met');
    if bad>0 then b := b || (bad||' acceptance criteria not met'); end if;
  end if;
  select * into g from public.records where entity='gate' and rid = coalesce(r.gate_id,(select gate_id from public.records w where w.entity='wps' and w.rid=r.wps_id limit 1)) limit 1;
  if g.id is not null and g.no_go_active then b := b || (g.rid||' has an active No-Go'); end if;
  return b;
end $$;
grant execute on function public.closure_blockers_row(public.records) to authenticated;

create trigger records_guard before insert or update on public.records for each row execute function public.records_guard();

create or replace function public.evidence_reopen() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.entity='evidence' and new.status in ('Rejected','Expired') and old.status is distinct from new.status then
    update public.records set status='Reopened', closure_pct=least(closure_pct,90)
      where status='Closed' and new.rid = any(evidence_ids);
  end if;
  return null;
end $$;
create trigger evidence_reopen after update on public.records for each row execute function public.evidence_reopen();

create or replace function public.expire_evidence() returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.can_edit(auth.uid()) then raise exception 'Not allowed'; end if;
  update public.records set status='Expired' where entity='evidence' and expiry_date < current_date and status <> 'Expired';
  get diagnostics n = row_count; return n;
end $$;
grant execute on function public.expire_evidence() to authenticated;

create table public.reviews (id uuid primary key default gen_random_uuid(), record_id uuid not null references public.records(id) on delete cascade, kind text not null default 'review', decision text not null, comment text, reviewer uuid default auth.uid(), reviewer_name text, created_at timestamptz not null default now());
grant select, insert on public.reviews to authenticated; grant all on public.reviews to service_role;
alter table public.reviews enable row level security;
create policy "read reviews" on public.reviews for select to authenticated using (true);
create policy "reviewers add" on public.reviews for insert to authenticated with check (public.can_review(auth.uid()));

create table public.evidence_files (id uuid primary key default gen_random_uuid(), record_id uuid not null references public.records(id) on delete cascade, path text not null, filename text not null, category text, size bigint, uploaded_by uuid default auth.uid(), created_at timestamptz not null default now());
grant select, insert, delete on public.evidence_files to authenticated; grant all on public.evidence_files to service_role;
alter table public.evidence_files enable row level security;
create policy "read files" on public.evidence_files for select to authenticated using (true);
create policy "edit files" on public.evidence_files for insert to authenticated with check (public.can_edit(auth.uid()));
create policy "admin del files" on public.evidence_files for delete to authenticated using (public.has_role(auth.uid(),'admin'));

create table public.import_runs (id uuid primary key default gen_random_uuid(), run_at timestamptz not null default now(), run_by uuid default auth.uid(), summary jsonb not null default '{}');
grant select, insert on public.import_runs to authenticated; grant all on public.import_runs to service_role;
alter table public.import_runs enable row level security;
create policy "read runs" on public.import_runs for select to authenticated using (true);
create policy "admin runs" on public.import_runs for insert to authenticated with check (public.has_role(auth.uid(),'admin'));

create table public.audit_log (id bigserial primary key, at timestamptz not null default now(), actor uuid, entity text, rid text, action text, old_status text, new_status text, detail jsonb);
grant select on public.audit_log to authenticated; grant all on public.audit_log to service_role;
alter table public.audit_log enable row level security;
create policy "read audit" on public.audit_log for select to authenticated using (true);

create or replace function public.audit_records() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op='INSERT' then
    if new.source_kind not in ('imported','derived') then insert into public.audit_log(actor,entity,rid,action,new_status) values (auth.uid(),new.entity,new.rid,'create',new.status); end if;
  elsif tg_op='UPDATE' then
    if old.status is distinct from new.status or old.review_status is distinct from new.review_status or old.owner is distinct from new.owner or old.no_go_active is distinct from new.no_go_active then
      insert into public.audit_log(actor,entity,rid,action,old_status,new_status,detail) values (auth.uid(),new.entity,new.rid,'update',old.status,new.status,jsonb_build_object('review',new.review_status,'owner',new.owner,'no_go',new.no_go_active));
    end if;
  else
    insert into public.audit_log(actor,entity,rid,action,old_status) values (auth.uid(),old.entity,old.rid,'delete',old.status);
  end if;
  return null;
end $$;
create trigger audit_records after insert or update or delete on public.records for each row execute function public.audit_records();

create policy "evidence read" on storage.objects for select to authenticated using (bucket_id='evidence');
create policy "evidence upload" on storage.objects for insert to authenticated with check (bucket_id='evidence' and public.can_edit(auth.uid()));
create policy "evidence delete" on storage.objects for delete to authenticated using (bucket_id='evidence' and public.has_role(auth.uid(),'admin'));