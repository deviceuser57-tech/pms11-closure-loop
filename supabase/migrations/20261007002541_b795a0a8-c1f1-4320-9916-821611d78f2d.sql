drop policy if exists "auth read owner roles" on public.owner_roles;
create policy "members read owner roles" on public.owner_roles for select to authenticated using (public.is_member(auth.uid()));
drop policy if exists "auth read departments" on public.departments;
create policy "members read departments" on public.departments for select to authenticated using (public.is_member(auth.uid()));
drop policy if exists "auth read dept app roles" on public.department_app_roles;
create policy "members read dept app roles" on public.department_app_roles for select to authenticated using (public.is_member(auth.uid()));
drop policy if exists "auth read dept owner roles" on public.department_owner_roles;
create policy "members read dept owner roles" on public.department_owner_roles for select to authenticated using (public.is_member(auth.uid()));

do $$ declare t text; begin
  foreach t in array array['admin_reset_events','audit_log','department_app_roles','department_owner_roles','departments','evidence_files','import_runs','owner_roles','profiles','records','reviews','user_roles'] loop
    execute format('drop policy if exists "block anonymous sessions" on public.%I', t);
    execute format('create policy "block anonymous sessions" on public.%I as restrictive for all to authenticated using (coalesce((auth.jwt()->>''is_anonymous'')::boolean,false) is not true) with check (coalesce((auth.jwt()->>''is_anonymous'')::boolean,false) is not true)', t);
  end loop;
end $$;