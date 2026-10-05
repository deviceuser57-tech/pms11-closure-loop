-- Temporary PMS-11 test mode:
-- Anonymous Supabase users receive the admin role so the application can be
-- exercised end-to-end without weakening RLS or granting access to the anon role.
-- REMOVE/REVERT this migration before production user/department authentication.
create or replace function public.handle_new_user() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles(id,email,display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name',
             new.raw_user_meta_data->>'display_name',
             case when new.is_anonymous then 'PMS-11 Test Admin' else split_part(new.email,'@',1) end)
  );

  if new.is_anonymous then
    insert into public.user_roles(user_id,role)
    values (new.id,'admin');
  elsif not exists (select 1 from public.user_roles where role='admin') then
    insert into public.user_roles(user_id,role)
    values (new.id,'admin');
  else
    insert into public.user_roles(user_id,role)
    values (new.id,'viewer');
  end if;

  return new;
end
$$;
