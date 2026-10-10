-- PMS11 import architecture: canonical relationship engine + department assignments.
-- Adds explicit M:N relationships and governed record↔department ownership without
-- touching existing records/governance data. No business data is fabricated here;
-- rows are created only by the approved, admin-gated importer from workbook sources.

-- ── Canonical many-to-many relationship table ────────────────────────────────
create table if not exists public.record_links (
  id uuid primary key default gen_random_uuid(),
  source_entity text not null,
  source_rid text not null,
  target_entity text not null,
  target_rid text not null,
  link_type text not null,            -- GOVERNED_BY / EVIDENCED_BY / DEPENDS_ON / BLOCKS_GATE / MAPPED_TO ...
  role text,                          -- primary / supporting / required / optional where the source defines it
  sequence int,                       -- priority/order when meaningful
  lag_days int,                       -- dependency timing attributes
  status text,                        -- validation status carried from the source sheet
  source_sheet text not null,         -- provenance: worksheet name
  source_field text,                  -- provenance: originating column ('' when none)
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_entity, source_rid, target_entity, target_rid, link_type, source_sheet, source_field)
);
create index if not exists record_links_source_idx on public.record_links (source_entity, source_rid);
create index if not exists record_links_target_idx on public.record_links (target_entity, target_rid);
create index if not exists record_links_type_idx on public.record_links (link_type);

-- ── Governed record ↔ department assignments (Primary / Supporting) ──────────
create table if not exists public.record_departments (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references public.records (id) on delete cascade,
  department_id uuid not null references public.departments (id) on delete cascade,
  role text not null default 'primary' check (role in ('primary','supporting')),
  source_sheet text not null default 'workbook',
  notes text,
  created_at timestamptz not null default now(),
  unique (record_id, department_id)
);
create index if not exists record_departments_dept_idx on public.record_departments (department_id);
-- At most one primary department per record; supporting departments unlimited.
create unique index if not exists record_departments_one_primary on public.record_departments (record_id) where role = 'primary';

-- ── Staging for large diagnostic sheets (never mixed with operational truth) ─
create table if not exists public.workbook_diagnostics (
  id bigint generated always as identity primary key,
  run_id uuid,
  source_sheet text not null,
  row_number int,
  payload jsonb not null,
  imported_at timestamptz not null default now()
);
create index if not exists workbook_diagnostics_sheet_idx on public.workbook_diagnostics (source_sheet, run_id);

-- ── RLS: read consistent with records visibility; writes restricted to Admins
--    (mirrors the existing has_role/can_edit pattern). Do not weaken other policies.
alter table public.record_links enable row level security;
alter table public.record_departments enable row level security;
alter table public.workbook_diagnostics enable row level security;

create policy "read record links" on public.record_links for select to authenticated using (true);
create policy "admin write record links" on public.record_links for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create policy "read record departments" on public.record_departments for select to authenticated using (true);
create policy "admin write record departments" on public.record_departments for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create policy "read diagnostics" on public.workbook_diagnostics for select to authenticated
  using (public.has_role(auth.uid(),'admin'));
create policy "admin write diagnostics" on public.workbook_diagnostics for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

grant select, insert, update, delete on public.record_links, public.record_departments to authenticated;
grant all on public.record_links, public.record_departments, public.workbook_diagnostics to service_role;
