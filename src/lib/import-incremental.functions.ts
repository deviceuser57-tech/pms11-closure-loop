import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const inputSchema = z.object({ base64: z.string().min(100) });

export const previewWorkbookIncremental = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => inputSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Only Admins can preview workbook updates.");

    // READ-ONLY PREVIEW: parses and validates the entire workbook and reports the
    // expected outcome. It performs NO database writes of any kind (governance,
    // records, relationships, roles, or audit).
    const wb = await import("./workbook-incremental.server");
    const bytes = Uint8Array.from(Buffer.from(data.base64, "base64"));
    const buffer = bytes.buffer as ArrayBuffer;
    const parsed = wb.parseWorkbookDetailed(buffer);
    const incoming = parsed.records;
    const master = wb.parseMasterData(buffer);
    const depLinks = wb.parseDependencyLinks(buffer);
    const relLinks = wb.parseRelationshipLinks(buffer);

    const { data: existing, error } = await context.supabase
      .from("records").select("*").eq("source_kind","imported");
    if (error) throw error;
    const byKey = new Map((existing ?? []).map((r) => [r.entity + ":" + r.rid, r]));

    // Validate references against actual DB state without writing anything.
    const knownEntityKeys = new Set<string>();
    for (const r of existing ?? []) knownEntityKeys.add(r.entity + ":" + r.rid);
    for (const r of incoming) knownEntityKeys.add(r.entity + ":" + r.rid);
    const invalidRefs: Array<{entity:string;rid:string;ref:string;field:string}> = [];
    for (const r of incoming) {
      for (const [field, ids, expected] of [
        ["rule_ids", r.rule_ids, "rule"],
        ["evidence_ids", r.evidence_ids, "evidence"],
        ["acceptance_ids", r.acceptance_ids, "acceptance"],
      ] as const) {
        for (const ref of ids ?? []) {
          if (!knownEntityKeys.has(expected + ":" + ref)) invalidRefs.push({ entity:r.entity, rid:r.rid, ref, field });
        }
      }
    }

    // Governance would-be writes are computed from MASTER_DATA only (no deletes here).
    const { data: dbDepartments, error: departmentReadError } = await context.supabase.from("departments").select("id,name");
    if (departmentReadError) throw departmentReadError;
    const deptByName = new Map((dbDepartments ?? []).map(d=>[d.name.trim(), d.id]));
    const newDepartments = master.departments.filter(n => !deptByName.has(n));
    const { data: dbRoles, error: ownerRoleReadError } = await context.supabase.from("owner_roles").select("id,name");
    if (ownerRoleReadError) throw ownerRoleReadError;
    const roleNames = new Set((dbRoles ?? []).map(o=>o.name.trim()));
    const newOwnerRoles = master.ownerRoles.filter(n => !roleNames.has(n));

    type DiffRow = { entity: string; rid: string; title?: string; fields?: string[] };
    const added: DiffRow[] = [], changed: DiffRow[] = [], unchanged: DiffRow[] = [], conflicts: DiffRow[] = [];
    const seenKeys = new Set<string>();
    for (const r of incoming) {
      const key = r.entity + ":" + r.rid;
      if (seenKeys.has(key)) conflicts.push({ entity:r.entity, rid:r.rid, title:"Duplicate ID in workbook" });
      seenKeys.add(key);
      const old = byKey.get(key);
      if (!old) added.push({ entity:r.entity, rid:r.rid, title:r.title });
      else {
        const next = wb.toDbRecord(r);
        const sourceChanged = JSON.stringify((old as Record<string,unknown>).data ?? {}) !== JSON.stringify(r.data ?? {});
        const comparable = ["title","description","wps_id","gate_id","parent_id","status","owner","reviewer","approver","due_date","expiry_date","criticality","applicability","evidence_ids","acceptance_ids","rule_ids","links","doc_number","revision","issuer","doc_source","department"];
        const diff = sourceChanged ? comparable.filter(k => JSON.stringify((old as Record<string,unknown>)[k] ?? null) !== JSON.stringify((next as Record<string,unknown>)[k] ?? null)) : [];
        if (!diff.length) unchanged.push({ entity:r.entity, rid:r.rid });
        else changed.push({ entity:r.entity, rid:r.rid, title:r.title, fields:diff });
      }
    }

    return {
      workbook:"uploaded workbook",
      candidates:incoming.length,
      added, changed, unchanged, conflicts,
      counts:{ added:added.length, changed:changed.length, unchanged:unchanged.length, conflicts:conflicts.length },
      note:"Preview is read-only: no rows were written. Only new and changed workbook records will be applied on approval. Existing execution/review/closure/department fields are preserved.",
      masterData:{ departments:master.departments.length, ownerRoles:master.ownerRoles.length, mappings:master.mappings.length, applicationRoleMappings:master.appRoleMappings.length, controlledLists:Object.keys(master.controlledLists).length, newDepartments, newOwnerRoles },
      relationships:{ derived:parsed.links.length, dependencies:depLinks.length, register:relLinks.length },
      unresolvedRefs:{ ambiguous:parsed.ambiguousRefs.slice(0,200), ambiguousTotal:parsed.ambiguousRefs.length, invalid:invalidRefs.slice(0,200), invalidTotal:invalidRefs.length },
      unknownSheets:parsed.unknownSheets,
      blockingErrors:[
        ...(conflicts.length? [`${conflicts.length} duplicate record IDs`] : []),
        ...(parsed.unknownSheets.length? [`Unrecognized sheets: ${parsed.unknownSheets.join(", ")}`] : []),
      ],
    };
  });

export const runWorkbookIncremental = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => inputSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Only Admins can run workbook updates.");

    const wb = await import("./workbook-incremental.server");
    const bytes = Uint8Array.from(Buffer.from(data.base64, "base64"));
    const buffer = bytes.buffer as ArrayBuffer;
    const parsed = wb.parseWorkbookDetailed(buffer);
    const incoming = parsed.records;
    const duplicateKeys = new Set<string>();
    const seenKeys = new Set<string>();
    for (const record of incoming) {
      const key = record.entity + ":" + record.rid;
      if (seenKeys.has(key)) duplicateKeys.add(key);
      seenKeys.add(key);
    }
    if (parsed.unknownSheets.length) {
      throw new Error("Workbook contains unclassified sheets: " + parsed.unknownSheets.join(", "));
    }
    if (duplicateKeys.size) {
      throw new Error("Workbook contains duplicate entity/record IDs: " + [...duplicateKeys].slice(0, 50).join(", "));
    }

    const master = wb.parseMasterData(buffer);
    const depLinks = wb.parseDependencyLinks(buffer);
    const relLinks = wb.parseRelationshipLinks(buffer);
    const departmentAssignments = wb.parseDepartmentAssignments(buffer);
    const allLinks = [...parsed.links, ...relLinks, ...depLinks]
      .map(l => ({ ...l, target_entity: l.target_entity || inferTargetEntity(l.target_rid), source_field: l.source_field || "" }))
      .filter(l => l.source_entity && l.source_rid && l.target_entity && l.target_rid && l.link_type);
    const linkRows = dedupeLinks(allLinks).map(toLinkRow);

    const explicitAssignments = departmentAssignments.map(a => ({
      entity: a.entity,
      rid: a.rid,
      department: a.department,
      role: "primary",
      source_sheet: a.source_sheet,
      notes: [
        a.source_field ? "source_field=" + a.source_field : "",
        a.source_value ? "source_value=" + a.source_value : "",
        a.assignment_method ? "method=" + a.assignment_method : "",
        a.status ? "status=" + a.status : "",
        a.open_decision ? "open_decision=" + a.open_decision : "",
      ].filter(Boolean).join("; ") || null,
    }));
    const fallbackAssignments = incoming.filter(r => r.department).map(r => ({
      entity: r.entity, rid: r.rid, department: r.department as string,
      role: "primary", source_sheet: "workbook", notes: null,
    }));
    const assignments = departmentAssignments.length ? explicitAssignments : fallbackAssignments;

    const summary = {
      sourceWorkbook: "PMS11_MASTER_DATA_Rev.2.xlsx",
      masterData: {
        departments: master.departments.length,
        ownerRoles: master.ownerRoles.length,
        ownerMappings: master.mappings.length,
        applicationRoleMappings: master.appRoleMappings.length,
        controlledLists: Object.keys(master.controlledLists).length,
      },
      relationships: {
        derived: parsed.links.length,
        dependencies: depLinks.length,
        typedRegisters: relLinks.length,
        uniqueEdgesSubmitted: linkRows.length,
      },
      departmentAssignmentRows: assignments.length,
      unresolvedRefs: {
        ambiguous: parsed.ambiguousRefs.length,
        unknownSheets: parsed.unknownSheets,
      },
      preserved: "execution_note, review_status, closure_pct, no_go_active, user accounts/roles, review/closure/audit history",
    };

    // A single PostgreSQL RPC makes all governance, record, relationship,
    // assignment, and audit writes one transaction. Any error rolls back all of it.
    const { data: result, error } = await context.supabase.rpc("apply_pms11_workbook_import", {
      p_departments: master.departments,
      p_owner_roles: master.ownerRoles,
      p_owner_mappings: master.mappings,
      p_app_role_mappings: master.appRoleMappings,
      p_records: incoming.map(wb.toDbRecord),
      p_links: linkRows,
      p_department_assignments: assignments,
      p_summary: summary,
    });
    if (error) throw new Error("Workbook import transaction failed: " + error.message);
    return result;
  });

// ── helpers ──────────────────────────────────────────────────────────────────
const inferTargetEntity = (rid: string): string => {
  const m = rid.match(/^([A-Z]+)-/);
  if (!m) return "";
  switch (m[1]) {
    case "R": return "rule"; case "WPS": return "wps"; case "ACT": return "activity"; case "A": return "activity";
    case "DEL": return "deliverable"; case "T": return "task"; case "G": return "gap";
    case "AC": return "acceptance"; case "E": return "evidence"; case "GATE": return "gate";
    default: return "";
  }
};

type LinkInput = { source_entity:string; source_rid:string; target_entity:string; target_rid:string; link_type:string; role?:string|null; lag_days?:number|null; status?:string|null; source_sheet:string; source_field:string; notes?:string|null };
const linkKey = <T extends {source_entity?:unknown;source_rid?:unknown;target_entity?:unknown;target_rid?:unknown;link_type?:unknown;source_sheet?:unknown;source_field?:unknown}>(l: T) =>
  [l.source_entity,l.source_rid,l.target_entity,l.target_rid,l.link_type,l.source_sheet,l.source_field]
    .map(v => String(v ?? "")).join("|");

const dedupeLinks = (links: LinkInput[]) => {
  const endpointKey = (l: LinkInput) => `${l.source_entity}|${l.source_rid}|${l.target_entity}|${l.target_rid}`;
  const typedPairs = new Set(links.filter(l => l.link_type !== "REGISTERED").map(endpointKey));
  const seen = new Set<string>();
  return links.filter(l => {
    if (l.link_type === "REGISTERED" && typedPairs.has(endpointKey(l))) return false;
    const k = linkKey(l);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};
const toLinkRow = (l: LinkInput) => ({
  source_entity: l.source_entity, source_rid: l.source_rid,
  target_entity: l.target_entity, target_rid: l.target_rid,
  link_type: l.link_type, role: l.role ?? null, lag_days: l.lag_days ?? null,
  status: l.status ?? null, source_sheet: l.source_sheet, source_field: l.source_field ?? "",
  notes: l.notes ?? null,
});
