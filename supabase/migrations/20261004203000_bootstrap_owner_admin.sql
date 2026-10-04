-- Bootstrap the project owner's current account as Admin if it already exists.
-- Safe to run repeatedly; unique(user_id, role) prevents duplicates.
insert into public.user_roles (user_id, role)
select id, 'admin'::public.app_role
from auth.users
where lower(email) = lower('eagle.whatsapp1@gmail.com')
on conflict (user_id, role) do nothing;
