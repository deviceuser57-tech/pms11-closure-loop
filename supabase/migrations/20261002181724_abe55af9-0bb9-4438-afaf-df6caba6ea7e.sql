create or replace function public.audit_records() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op='INSERT' then
    if new.source_kind not in ('imported','derived') then insert into public.audit_log(actor,entity,rid,action,new_status) values (auth.uid(),new.entity,new.rid,'create',new.status); end if;
  elsif tg_op='UPDATE' then
    if old.status is distinct from new.status or old.review_status is distinct from new.review_status or old.owner is distinct from new.owner
       or old.no_go_active is distinct from new.no_go_active or old.due_date is distinct from new.due_date
       or old.evidence_ids is distinct from new.evidence_ids or old.acceptance_ids is distinct from new.acceptance_ids
       or old.execution_note is distinct from new.execution_note or old.title is distinct from new.title then
      insert into public.audit_log(actor,entity,rid,action,old_status,new_status,detail) values (auth.uid(),new.entity,new.rid,'update',old.status,new.status,
        jsonb_strip_nulls(jsonb_build_object(
          'owner', case when old.owner is distinct from new.owner then jsonb_build_array(old.owner,new.owner) end,
          'due_date', case when old.due_date is distinct from new.due_date then jsonb_build_array(old.due_date,new.due_date) end,
          'review', case when old.review_status is distinct from new.review_status then jsonb_build_array(old.review_status,new.review_status) end,
          'evidence', case when old.evidence_ids is distinct from new.evidence_ids then jsonb_build_array(old.evidence_ids,new.evidence_ids) end,
          'acceptance', case when old.acceptance_ids is distinct from new.acceptance_ids then jsonb_build_array(old.acceptance_ids,new.acceptance_ids) end,
          'no_go', case when old.no_go_active is distinct from new.no_go_active then jsonb_build_array(old.no_go_active,new.no_go_active) end,
          'execution', case when old.execution_note is distinct from new.execution_note then 'updated' end,
          'title', case when old.title is distinct from new.title then 'updated' end)));
    end if;
  else
    insert into public.audit_log(actor,entity,rid,action,old_status) values (auth.uid(),old.entity,old.rid,'delete',old.status);
  end if;
  return null;
end $$;
revoke execute on function public.audit_records() from public, anon, authenticated;