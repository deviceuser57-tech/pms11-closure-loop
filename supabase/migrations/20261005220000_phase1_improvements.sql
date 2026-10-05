-- Phase 1 improvements: gate quorum model, multi-stage review pipeline,
-- permission matrix helper view, and review comment enforcement.
-- 2026-10-05

-- ── Gate quorum ────────────────────────────────────────────────────────────────
-- quorum_required: how many distinct Reviewer/Admin approvals are needed to Go.
-- Defaults to 1 (existing behaviour unchanged).
alter table public.records
  add column if not exists quorum_required int not null default 1;

-- Helper: count distinct approvals recorded for a gate record.
create or replace function public.gate_approval_count(_record_id uuid)
returns int
language sql stable security definer set search_path = public as $$
  select count(distinct coalesce(reviewer, reviewer_name))::int
  from public.reviews
  where record_id = _record_id
    and kind = 'gate'
    and decision = 'Go'
$$;
revoke all on function public.gate_approval_count(uuid) from public, anon;
grant execute on function public.gate_approval_count(uuid) to authenticated;

-- ── Multi-stage review ────────────────────────────────────────────────────────
-- Add a `stage` column to reviews: 'submission' | 'check' | 'acceptance' | 'ai'.
-- Existing rows default to 'check' (the previous single stage).
alter table public.reviews
  add column if not exists stage text not null default 'check';

-- Make comment required for Rejected decisions at DB level via check constraint.
-- (Soft enforcement — UI layer must also validate.)
alter table public.reviews
  drop constraint if exists reviews_rejection_requires_comment;
alter table public.reviews
  add constraint reviews_rejection_requires_comment check (
    decision not ilike '%reject%' or (comment is not null and trim(comment) <> '')
  );

-- ── Permission matrix helper view ──────────────────────────────────────────────
-- Exposes the role permission matrix so any authenticated user can read
-- "who can do what" without an Admin-only query.
create or replace view public.role_permission_matrix as
select
  role,
  role in ('admin', 'reviewer', 'contributor') as can_edit,
  role in ('admin', 'reviewer')                as can_review,
  role = 'admin'                               as is_admin,
  case role
    when 'admin'       then 'Full access: assign roles, import workbook, delete records, approve gates.'
    when 'reviewer'    then 'Review and approve evidence, findings, and gate decisions. Cannot delete records.'
    when 'contributor' then 'Create and edit records within their department. Cannot approve or delete.'
    when 'viewer'      then 'Read-only access to records in their assigned department.'
  end as description
from (values
  ('admin'::public.app_role),
  ('reviewer'::public.app_role),
  ('contributor'::public.app_role),
  ('viewer'::public.app_role)
) t(role);

grant select on public.role_permission_matrix to authenticated;

-- ── Audit: log review stage ────────────────────────────────────────────────────
-- Extend the existing audit trigger to capture review stage transitions.
-- Reviews are insert-only so existing trigger covers the base; no change needed.
-- The stage field is visible in reviews.* select already.
