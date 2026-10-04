-- PMS-11 functional completion: evidence backfill, security hardening and expiry helper.
-- Do not fabricate business data: only extract evidence IDs that already exist in records.

create or replace function public.closure_blockers(_id uuid) returns text[] language plpgsql stable security invoker set search_path = public as $$
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
alter function public.closure_blockers(uuid) set search_path = public;
alter function public.closure_blockers_row(public.records) set search_path = public;
alter function public.handle_new_user() set search_path = public;

-- Backfill deliverable evidence links from the workbook's preserved Evidence Location field.
update public.records d
set evidence_ids = q.ids
from (
  select d2.id,
    array(
      select distinct m[1]
      from regexp_matches(coalesce(d2.data->>'Evidence Location',''), '(E-[A-Za-z0-9-]+)', 'g') m
      where exists (select 1 from public.records e where e.entity='evidence' and e.rid=m[1])
    )::text[] as ids
  from public.records d2
  where d2.entity='deliverable' and cardinality(d2.evidence_ids)=0
) q
where d.id=q.id and cardinality(q.ids)>0;

-- Also recover task completion evidence where the source explicitly names evidence IDs.
update public.records t
set evidence_ids = q.ids
from (
  select t2.id,
    array(
      select distinct m[1]
      from regexp_matches(coalesce(t2.data->>'Completion Evidence',''), '(E-[A-Za-z0-9-]+)', 'g') m
      where exists (select 1 from public.records e where e.entity='evidence' and e.rid=m[1])
    )::text[] as ids
  from public.records t2
  where t2.entity='task' and cardinality(t2.evidence_ids)=0
) q
where t.id=q.id and cardinality(q.ids)>0;

-- Keep the scheduled/manual expiry operation available to Admins.
alter function public.expire_evidence() set search_path = public;
