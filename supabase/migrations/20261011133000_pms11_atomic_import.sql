-- One transaction for the entire approved workbook import.
-- If any statement fails, PostgreSQL rolls back governance, records, links,
-- department assignments, and the import-run audit row together.
create or replace function public.apply_pms11_workbook_import(
  p_departments jsonb,
  p_owner_roles jsonb,
  p_owner_mappings jsonb,
  p_app_role_mappings jsonb,
  p_records jsonb,
  p_links jsonb,
  p_department_assignments jsonb,
  p_summary jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_added integer := 0;
  v_changed integer := 0;
  v_unchanged integer := 0;
  v_links integer := 0;
  v_assignments integer := 0;
  v_summary jsonb;
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'admin'::public.app_role) then
    raise exception 'Only Admins can run workbook updates';
  end if;

  -- Do not allow an imported workbook to overwrite records created manually.
  if exists (
    select 1
    from jsonb_to_recordset(coalesce(p_records, '[]'::jsonb)) as x(entity text, rid text)
    join public.records r on r.entity = x.entity and r.rid = x.rid
    where r.source_kind <> 'imported'
  ) then
    raise exception 'Workbook record ID conflicts with a non-imported record';
  end if;

  select
    count(*) filter (where r.id is null),
    count(*) filter (where r.id is not null and r.data is distinct from x.data),
    count(*) filter (where r.id is not null and r.data is not distinct from x.data)
  into v_added, v_changed, v_unchanged
  from jsonb_to_recordset(coalesce(p_records, '[]'::jsonb)) as x(entity text, rid text, data jsonb)
  left join public.records r on r.entity = x.entity and r.rid = x.rid and r.source_kind = 'imported';

  insert into public.departments(name, active)
  select distinct trim(value), true
  from jsonb_array_elements_text(coalesce(p_departments, '[]'::jsonb)) as d(value)
  where trim(value) <> ''
  on conflict (name) do nothing;

  insert into public.owner_roles(name, active)
  select distinct trim(value), true
  from jsonb_array_elements_text(coalesce(p_owner_roles, '[]'::jsonb)) as r(value)
  where trim(value) <> ''
  on conflict (name) do nothing;

  insert into public.department_owner_roles(department_id, owner_role_id)
  select distinct d.id, r.id
  from jsonb_to_recordset(coalesce(p_owner_mappings, '[]'::jsonb)) as m(department text, "ownerRole" text)
  join public.departments d on d.name = trim(m.department)
  join public.owner_roles r on r.name = trim(m."ownerRole")
  on conflict (department_id, owner_role_id) do nothing;

  insert into public.department_app_roles(department_id, role)
  select distinct d.id, lower(trim(m.role))
  from jsonb_to_recordset(coalesce(p_app_role_mappings, '[]'::jsonb)) as m(department text, role text)
  join public.departments d on d.name = trim(m.department)
  where lower(trim(m.role)) in ('admin','reviewer','contributor','viewer')
  on conflict (department_id, role) do nothing;

  insert into public.records(
    entity, rid, title, description, wps_id, gate_id, parent_id, status, owner, reviewer, approver,
    due_date, expiry_date, criticality, source_kind, applicability, evidence_ids, acceptance_ids,
    rule_ids, links, doc_number, revision, issuer, department, data
  )
  select
    x.entity, x.rid, x.title, x.description, x.wps_id, x.gate_id, x.parent_id, coalesce(x.status, 'Open'),
    x.owner, x.reviewer, x.approver, x.due_date, x.expiry_date, x.criticality, 'imported', x.applicability,
    coalesce(x.evidence_ids, '{}'::text[]), coalesce(x.acceptance_ids, '{}'::text[]),
    coalesce(x.rule_ids, '{}'::text[]), coalesce(x.links, '{}'::text[]), x.doc_number, x.revision,
    x.issuer, x.department, coalesce(x.data, '{}'::jsonb)
  from jsonb_to_recordset(coalesce(p_records, '[]'::jsonb)) as x(
    entity text, rid text, title text, description text, wps_id text, gate_id text, parent_id text,
    status text, owner text, reviewer text, approver text, due_date date, expiry_date date,
    criticality text, source_kind text, applicability text, evidence_ids text[], acceptance_ids text[],
    rule_ids text[], links text[], doc_number text, revision text, issuer text, department text, data jsonb
  )
  on conflict (entity, rid) do update set
    title = excluded.title,
    description = excluded.description,
    wps_id = excluded.wps_id,
    gate_id = excluded.gate_id,
    parent_id = excluded.parent_id,
    status = excluded.status,
    owner = excluded.owner,
    reviewer = excluded.reviewer,
    approver = excluded.approver,
    due_date = excluded.due_date,
    expiry_date = excluded.expiry_date,
    criticality = excluded.criticality,
    applicability = excluded.applicability,
    evidence_ids = excluded.evidence_ids,
    acceptance_ids = excluded.acceptance_ids,
    rule_ids = excluded.rule_ids,
    links = excluded.links,
    doc_number = excluded.doc_number,
    revision = excluded.revision,
    issuer = excluded.issuer,
    department = excluded.department,
    data = excluded.data
  where public.records.source_kind = 'imported'
    and public.records.data is distinct from excluded.data;

  insert into public.record_links(
    source_entity, source_rid, target_entity, target_rid, link_type, role, lag_days,
    status, source_sheet, source_field, notes
  )
  select
    x.source_entity, x.source_rid, x.target_entity, x.target_rid, x.link_type, x.role, x.lag_days,
    x.status, x.source_sheet, coalesce(x.source_field, ''), x.notes
  from jsonb_to_recordset(coalesce(p_links, '[]'::jsonb)) as x(
    source_entity text, source_rid text, target_entity text, target_rid text, link_type text,
    role text, lag_days integer, status text, source_sheet text, source_field text, notes text
  )
  where coalesce(x.source_entity, '') <> ''
    and coalesce(x.source_rid, '') <> ''
    and coalesce(x.target_entity, '') <> ''
    and coalesce(x.target_rid, '') <> ''
    and coalesce(x.link_type, '') <> ''
    and coalesce(x.source_sheet, '') <> ''
  on conflict (source_entity, source_rid, target_entity, target_rid, link_type, source_sheet, source_field)
  do update set
    role = excluded.role,
    lag_days = excluded.lag_days,
    status = excluded.status,
    notes = excluded.notes,
    updated_at = now();
  get diagnostics v_links = row_count;

  -- Reconcile only workbook-owned primary assignments for records explicitly
  -- present in this assignment payload; never remove unrelated/manual assignments.
  delete from public.record_departments rd
  using public.records r
  where rd.record_id = r.id
    and rd.role = 'primary'
    and rd.source_sheet in ('workbook','DEPARTMENT_ASSIGNMENTS')
    and exists (
      select 1
      from jsonb_to_recordset(coalesce(p_department_assignments, '[]'::jsonb)) as a(entity text, rid text, department text)
      where a.entity = r.entity and a.rid = r.rid
    )
    and not exists (
      select 1
      from jsonb_to_recordset(coalesce(p_department_assignments, '[]'::jsonb)) as a(entity text, rid text, department text)
      join public.departments d on d.name = trim(a.department)
      where a.entity = r.entity and a.rid = r.rid and d.id = rd.department_id
    );

  insert into public.record_departments(record_id, department_id, role, source_sheet, notes)
  select distinct r.id, d.id, coalesce(nullif(a.role, ''), 'primary'),
    coalesce(nullif(a.source_sheet, ''), 'workbook'), a.notes
  from jsonb_to_recordset(coalesce(p_department_assignments, '[]'::jsonb)) as a(
    entity text, rid text, department text, role text, source_sheet text, notes text
  )
  join public.records r on r.entity = a.entity and r.rid = a.rid and r.source_kind = 'imported'
  join public.departments d on d.name = trim(a.department)
  where coalesce(a.role, 'primary') in ('primary','supporting')
  on conflict (record_id, department_id) do update set
    role = excluded.role,
    source_sheet = excluded.source_sheet,
    notes = excluded.notes;
  get diagnostics v_assignments = row_count;

  v_summary := coalesce(p_summary, '{}'::jsonb) || jsonb_build_object(
    'mode', 'atomic-rev2',
    'candidates', jsonb_array_length(coalesce(p_records, '[]'::jsonb)),
    'added', v_added,
    'changed', v_changed,
    'unchanged', v_unchanged,
    'linksWritten', v_links,
    'departmentAssignments', v_assignments,
    'transactional', true
  );

  insert into public.import_runs(summary) values (v_summary);
  return v_summary;
end;
$$;

revoke all on function public.apply_pms11_workbook_import(jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb) from public, anon;
grant execute on function public.apply_pms11_workbook_import(jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb) to authenticated;
