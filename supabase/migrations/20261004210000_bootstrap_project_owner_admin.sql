-- Promote the project owner's account to Admin when the account already exists.
-- This is idempotent and does not create an account.
insert into public.user_roles (user_id, role)
select id, 'admin'::public.app_role
from auth.users
where lower(email) = lower('eagle.whatsapp1@gmail.com')
on conflict (user_id, role) do nothing;
