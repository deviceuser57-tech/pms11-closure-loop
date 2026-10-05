create or replace function public.is_member(_u uuid) returns boolean language sql stable security definer set search_path = public as $$ select exists (select 1 from public.user_roles where user_id=_u) $$;

drop policy if exists "read runs" on public.import_runs;
create policy "read runs" on public.import_runs for select to authenticated using (public.has_role(auth.uid(),'admin'));

drop policy if exists "read reviews" on public.reviews;
create policy "read reviews" on public.reviews for select to authenticated using (public.is_member(auth.uid()));

drop policy if exists "read audit" on public.audit_log;
create policy "read audit" on public.audit_log for select to authenticated using (public.can_review(auth.uid()) or actor = auth.uid());

drop policy if exists "read profiles" on public.profiles;
create policy "read profiles" on public.profiles for select to authenticated using (auth.uid() = id or public.has_role(auth.uid(),'admin'));

drop policy if exists "read files" on public.evidence_files;
create policy "read files" on public.evidence_files for select to authenticated using (public.is_member(auth.uid()));

drop policy if exists "read roles" on public.user_roles;
create policy "read roles" on public.user_roles for select to authenticated using (auth.uid() = user_id or public.has_role(auth.uid(),'admin'));

drop policy if exists "read records" on public.records;
create policy "read records" on public.records for select to authenticated using (public.is_member(auth.uid()));

drop policy if exists "evidence read" on storage.objects;
create policy "evidence read" on storage.objects for select to authenticated using (bucket_id = 'evidence' and (owner_id = (select auth.uid()::text) or public.is_member(auth.uid())));