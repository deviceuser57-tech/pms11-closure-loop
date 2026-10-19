-- Migration: add employee_id column to profiles and optional index
alter table public.profiles add column employee_id text;
grant update(employee_id) on public.profiles to authenticated;
-- Ensure employee_id uniqueness across the organization (optional but recommended)
create unique index if not exists employee_id_idx on public.profiles(employee_id);
