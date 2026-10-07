create or replace function public.reset_all_project_records() returns jsonb language plpgsql security definer set search_path=public as $$
declare t text; candidates text[] := array['reviews','evidence_assessments','gate_reviews','ai_advisory_records','ai_advisories','changes','change_requests','import_runs','evidence_files','records'];
begin
  if not public.has_role(auth.uid(),'admin') then raise exception 'Only Admins can reset project records'; end if;
  foreach t in array candidates loop
    if to_regclass('public.'||t) is not null then execute format('delete from public.%I where true',t); end if;
  end loop;
  delete from public.audit_log where true;
  insert into public.admin_reset_events(reset_by,detail) values(auth.uid(), jsonb_build_object('scope','project_operational_data','preserved',jsonb_build_array('auth.users','profiles','user_roles','setup-lists.json'),'storage_bucket','evidence','completed_at',now()));
  insert into public.audit_log(actor,action,entity,rid,detail) values(auth.uid(),'ADMIN_RESET','system','PMS11-RESET',jsonb_build_object('scope','project_operational_data','completed_at',now()));
  return jsonb_build_object('success',true,'completed_at',now());
end $$;
revoke all on function public.reset_all_project_records() from public, anon;
grant execute on function public.reset_all_project_records() to authenticated;