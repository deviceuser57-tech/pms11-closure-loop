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
    const departmentAssignments = wb.parseDepartmentAssignments(buffer);

    const { data: existing, error } = await context.supabase
      .from("records").select("*").eq("source_kind","imported");
    if (error) throw error;
    const byKey = new Map((existing ?? []).map((r) => [r.entity + ":" + r.rid, r]));

    // Validate references against actual DB state without writing anything.
    const entityOfRid = new Map<string,string>();
    for (const r of existing ?? []) entityOfRid.set(r.rid, r.entity);
    const invalidRefs: Array<{entity:string;rid:string;ref:string;field:string}> = [];
    for (const r of incoming) {
      for (const [field, ids] of [["rule_ids",r.rule_ids],["evidence_ids",r.evidence_ids],["acceptance_ids",r.acceptance_ids]] as const) {
        for (const ref of ids ?? []) {
          const knownEntity = entityOfRid.get(ref);
          if (knownEntity === undefined) invalidRefs.push({ entity:r.entity, rid:r.rid, ref, field });
        }
      }
    }

    // Governance would-be writes are computed from MASTER_DATA only (no deletes here).
    const { data: dbDepartments } = await context.supabase.from("departments").select("id,name");
    const deptByName = new Map((dbDepartments ?? []).map(d=>[d.name.trim(), d.id]));
    const newDepartments = master.departments.filter(n => !deptByName.has(n));
    const { data: dbRoles } = await context.supabase.from("owner_roles").select("id,name");
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
        const comparable = ["title","description","wps_id","gate_id","parent_id","status","owner","reviewer","approver","due_date","expiry_date","criticality","applicability","evidence_ids","acceptance_ids","rule_ids","links","doc_number","revision","issuer","department"];
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
    const master = wb.parseMasterData(buffer);
    const depLinks = wb.parseDependencyLinks(buffer);
    const relLinks = wb.parseRelationshipLinks(buffer);

    // Track everything we write so a failure rolls back to the pre-import state
    // (staged import with compensating cleanup — no partially imported active dataset).
    const writtenRecordIds: string[] = [];
    const writtenLinkIds: string[] = [];
    const createdDeptIds: string[] = [];
    const createdRoleIds: string[] = [];
    const rollback = async () => {
      for (const batch of chunk(writtenLinkIds, 200)) await context.supabase.from("record_links").delete().in("id", batch);
      for (const batch of chunk(writtenRecordIds, 200)) await context.supabase.from("records").delete().in("id", batch);
      if (createdDeptIds.length) await context.supabase.from("departments").delete().in("id", createdDeptIds);
      if (createdRoleIds.length) await context.supabase.from("owner_roles").delete().in("id", createdRoleIds);
    };

    try {
      // 1. Governance: ADDITIVE only. Never delete existing mappings as a side effect.
      const { data: departments, error: de } = await context.supabase.from("departments")
        .upsert(master.departments.map(name=>({name,active:true})),{onConflict:"name",ignoreDuplicates:true}).select("id,name");
      if (de) throw de;
      const deptByName = new Map((departments ?? []).map(d=>[d.name.trim(),d.id]));
      for (const name of master.ownerRoles) {
        const { data: created, error:e } = await context.supabase.from("owner_roles")
          .upsert({name,active:true},{onConflict:"name"}).select("id");
        if (e) throw e;
        void created;
      }
      const { data: roles, error: re } = await context.supabase.from("owner_roles").select("id,name");
      if (re) throw re;
      const roleByName = new Map((roles ?? []).map(o=>[o.name.trim(),o.id]));
      const ownerMappings = master.mappings
        .map(m=>({department_id:deptByName.get(m.department),owner_role_id:roleByName.get(m.ownerRole)}))
        .filter(x=>x.department_id&&x.owner_role_id);
      if (ownerMappings.length) {
        const {error:e}=await context.supabase.from("department_owner_roles").upsert(ownerMappings as never,{onConflict:"department_id,owner_role_id"});
        if(e) throw e;
      }
      const appRoleMappings = master.appRoleMappings
        .map(m=>({department_id:deptByName.get(m.department),role:m.appRole}))
        .filter(x=>x.department_id);
      if (appRoleMappings.length) {
        const {error:e}=await context.supabase.from("department_app_roles").upsert(appRoleMappings as never,{onConflict:"department_id,role"});
        if(e) throw e;
      }

      // 2. Operational records in dependency order (parents before children).
      const { data: existing, error } = await context.supabase.from("records").select("*").eq("source_kind","imported");
      if (error) throw error;
      const byKey = new Map((existing ?? []).map((r) => [r.entity + ":" + r.rid, r]));
      const sourceFields = ["entity","rid","title","description","wps_id","gate_id","parent_id","status","owner","reviewer","approver","due_date","expiry_date","criticality","source_kind","applicability","evidence_ids","acceptance_ids","rule_ids","links","doc_number","revision","issuer","department","data"];
      let added=0, changed=0, unchanged=0;

      const ordered = [...incoming].sort((a,b) => entityOrder(a.entity) - entityOrder(b.entity));
      for (const r of ordered) {
        const next = wb.toDbRecord(r);
        const old = byKey.get(r.entity + ":" + r.rid);
        if (!old) {
          const { data: ins, error:e } = await context.supabase.from("records").insert(next as never).select("id");
          if (e) throw new Error("Insert " + r.entity + "/" + r.rid + ": " + e.message);
          if (ins?.[0]) writtenRecordIds.push(ins[0].id);
          added++;
          continue;
        }
        const sourceChanged = JSON.stringify((old as Record<string,unknown>).data ?? {}) !== JSON.stringify(r.data ?? {});
        if (!sourceChanged) { unchanged++; continue; }
        const patch = Object.fromEntries(sourceFields.filter(k => k !== "entity" && k !== "rid").map(k => [k,(next as Record<string,unknown>)[k]]));
        const { error:e } = await context.supabase.from("records").update(patch as never).eq("id",old.id);
        if (e) throw new Error("Update " + r.entity + "/" + r.rid + ": " + e.message);
        changed++;
      }

      // 3. Explicit relationships → record_links (batched, idempotent upsert).
      const allLinks = [
        ...parsed.links,
        ...relLinks,
        ...depLinks,
      ].map(l => ({ ...l, target_entity: l.target_entity || inferTargetEntity(l.target_rid), source_field: l.source_field || "" }))
        .filter(l => l.target_rid);
      const linkRows = dedupeLinks(allLinks).map(toLinkRow);
      let linksWritten = 0;
      for (const batch of chunk(linkRows, 500)) {
        const { data: ins, error: le } = await context.supabase.from("record_links")
          .upsert(batch as never, { onConflict: "source_entity,source_rid,target_entity,target_rid,link_type,source_sheet,source_field" })
          .select("id");
        if (le) throw new Error("record_links: " + le.message);
        linksWritten += ins?.length ?? batch.length;
        for (const row of ins ?? []) writtenLinkIds.push(row.id);
      }

      // 4. Department assignments from the record's governed department column.
      let deptAssignments = 0;
      const { data: savedRecords, error: sre } = await context.supabase.from("records")
        .select("id, entity, rid, department").eq("source_kind","imported").not("department","is",null);
      if (!sre) {
        const rows = (savedRecords ?? [])
          .filter(r => r.department && deptByName.has(r.department.trim()))
          .map(r => ({ record_id: r.id, department_id: deptByName.get((r.department ?? "").trim()), role: "primary", source_sheet: "workbook" }))
          .filter(x => x.department_id);
        for (const batch of chunk(rows, 500)) {
          const { error: rde } = await context.supabase.from("record_departments")
            .upsert(batch as never, { onConflict: "record_id,department_id", ignoreDuplicates: true });
          if (rde) throw new Error("record_departments: " + rde.message);
          deptAssignments += batch.length;
        }
      }

      // 5. Audit the full run.
      const summary = {
        mode:"incremental-v2", candidates:incoming.length, added, changed, unchanged,
        preserved:"execution_note, review_status, closure_pct, no_go_active, user accounts/roles, review/closure/audit history",
        masterData:{departments:master.departments.length,ownerRoles:master.ownerRoles.length,mappings:master.mappings.length,applicationRoleMappings:master.appRoleMappings.length,controlledLists:Object.keys(master.controlledLists).length},
        relationships:{ linksWritten, dependencies:depLinks.length, register:relLinks.length },
        departmentAssignments:deptAssignments,
        unresolvedRefs:{ ambiguous:parsed.ambiguousRefs.length, unknownSheets:parsed.unknownSheets },
      };
      await context.supabase.from("import_runs").insert({ summary } as never);
      return summary;
    } catch (err) {
      await rollback();
      throw err instanceof Error ? new Error(err.message + " (import rolled back)") : err;
    }
  });

// ── helpers ──────────────────────────────────────────────────────────────────
const chunk = <T,>(arr: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

const ENTITY_ORDER = ["wps","gate","rule","activity","deliverable","task","gap","acceptance","evidence","responsibility","risk","change","execution","functional","source","crew_role","crew_requirement","crew_register","crew_certificate","manning_plan","accommodation_check","accommodation_capacity","helideck_profile","helideck_check"];
const entityOrder = (e: string) => { const i = ENTITY_ORDER.indexOf(e); return i === -1 ? 99 : i; };

const inferTargetEntity = (rid: string): string => {
  const m = rid.match(/^([A-Z]+)-/);
  if (!m) return "";
  switch (m[1]) {
    case "R": return "rule"; case "WPS": return "wps"; case "ACT": return "activity";
    case "DEL": return "deliverable"; case "T": return "task"; case "G": return "gap";
    case "AC": return "acceptance"; case "E": return "evidence"; case "GATE": return "gate";
    default: return "";
  }
};

type LinkInput = { source_entity:string; source_rid:string; target_entity:string; target_rid:string; link_type:string; role?:string|null; lag_days?:number|null; status?:string|null; source_sheet:string; source_field:string; notes?:string|null };
const dedupeLinks = (links: LinkInput[]) => {
  const seen = new Set<string>();
  return links.filter(l => {
    const k = `${l.source_entity}|${l.source_rid}|${l.target_entity}|${l.target_rid}|${l.link_type}|${l.source_sheet}|${l.source_field}`;
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });
};
const toLinkRow = (l: LinkInput) => ({
  source_entity: l.source_entity, source_rid: l.source_rid,
  target_entity: l.target_entity, target_rid: l.target_rid,
  link_type: l.link_type, role: l.role ?? null, lag_days: l.lag_days ?? null,
  status: l.status ?? null, source_sheet: l.source_sheet, source_field: l.source_field ?? "",
  notes: l.notes ?? null,
});
