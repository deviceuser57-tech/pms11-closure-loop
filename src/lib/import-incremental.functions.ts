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

    const { parseWorkbook, parseMasterData, toDbRecord } = await import("./workbook-incremental.server");
    const bytes = Uint8Array.from(Buffer.from(data.base64, "base64"));
    const incoming = parseWorkbook(bytes.buffer);
    const master = parseMasterData(bytes.buffer);
    const { data: existing, error } = await context.supabase
      .from("records").select("*").eq("source_kind","imported").in("rid", [...new Set(incoming.map(r=>r.rid))]);
    if (error) throw error;

    const byKey = new Map((existing ?? []).map((r) => [r.entity + ":" + r.rid, r]));
    const { data: departments, error: de } = await context.supabase.from("departments").upsert(master.departments.map(name=>({name,active:true})),{onConflict:"name"}).select("id,name");
    if (de) throw de;
    const deptByName = new Map((departments ?? []).map(d=>[d.name.trim(),d.id]));
    for (const name of master.ownerRoles) {
      const { error:e } = await context.supabase.from("owner_roles").upsert({name,active:true},{onConflict:"name"});
      if (e) throw e;
    }
    const { data: roles, error: re } = await context.supabase.from("owner_roles").select("id,name");
    if (re) throw re;
    const roleByName = new Map((roles ?? []).map(o=>[o.name.trim(),o.id]));
    const { error: ownerMapDeleteError } = await context.supabase.from("department_owner_roles").delete().neq("department_id","00000000-0000-0000-0000-000000000000");
    if (ownerMapDeleteError) throw ownerMapDeleteError;
    const { error: appRoleDeleteError } = await context.supabase.from("department_app_roles").delete().neq("department_id","00000000-0000-0000-0000-000000000000");
    if (appRoleDeleteError) throw appRoleDeleteError;
    const mappings = master.mappings.map(m=>({department_id:deptByName.get(m.department),owner_role_id:roleByName.get(m.ownerRole)})).filter(x=>x.department_id&&x.owner_role_id);
    if (mappings.length) { const {error:e}=await context.supabase.from("department_owner_roles").upsert(mappings as never,{onConflict:"department_id,owner_role_id"}); if(e) throw e; }
    const appRoleMap = master.appRoleMappings
      .map(m=>({department_id:deptByName.get(m.department),role:m.appRole}))
      .filter(x=>x.department_id);
    if (appRoleMap.length) { const {error:e}=await context.supabase.from("department_app_roles").upsert(appRoleMap as never,{onConflict:"department_id,role"}); if(e) throw e; }
    const masterSummary = { departments: master.departments.length, ownerRoles: master.ownerRoles.length, mappings: master.mappings.length };
    type DiffRow = { entity: string; rid: string; title?: string; fields?: string[] };
    const added: DiffRow[] = [], changed: DiffRow[] = [], unchanged: DiffRow[] = [], conflicts: DiffRow[] = [];

    for (const r of incoming) {
      const old = byKey.get(r.entity + ":" + r.rid);
      if (!old) added.push({ entity:r.entity, rid:r.rid, title:r.title });
      else {
        const next = toDbRecord(r);
        const sourceChanged = JSON.stringify((old as Record<string,unknown>).data ?? {}) !== JSON.stringify(r.data ?? {});
        const comparable = ["title","description","wps_id","gate_id","parent_id","status","owner","reviewer","approver","due_date","expiry_date","criticality","applicability","evidence_ids","acceptance_ids","rule_ids","links","doc_number","revision","issuer","department"];
        const diff = sourceChanged ? comparable.filter(k => JSON.stringify((old as Record<string,unknown>)[k] ?? null) !== JSON.stringify((next as Record<string,unknown>)[k] ?? null)) : [];
        if (!diff.length) unchanged.push({ entity:r.entity, rid:r.rid });
        else changed.push({ entity:r.entity, rid:r.rid, title:r.title, fields:diff });
      }
    }
    return {
      workbook:"PMS11_POWERPIVOT_READY.xlsx",
      candidates:incoming.length,
      added, changed, unchanged, conflicts,
      counts:{ added:added.length, changed:changed.length, unchanged:unchanged.length, conflicts:conflicts.length },
      note:"Only new and changed workbook records will be applied. Existing execution/review/closure/department fields are preserved.",
      masterData:{...masterSummary, applicationRoleMappings:master.appRoleMappings.length},
    };
  });

export const runWorkbookIncremental = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => inputSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Only Admins can run workbook updates.");

    const { parseWorkbook, parseMasterData, toDbRecord } = await import("./workbook-incremental.server");
    const bytes = Uint8Array.from(Buffer.from(data.base64, "base64"));
    const incoming = parseWorkbook(bytes.buffer);
    const master = parseMasterData(bytes.buffer);
    const { data: existing, error } = await context.supabase.from("records").select("*").eq("source_kind","imported");
    if (error) throw error;
    const byKey = new Map((existing ?? []).map((r) => [r.entity + ":" + r.rid, r]));
    const sourceFields = ["entity","rid","title","description","wps_id","gate_id","parent_id","status","owner","reviewer","approver","due_date","expiry_date","criticality","source_kind","applicability","evidence_ids","acceptance_ids","rule_ids","links","doc_number","revision","issuer","data"];
    let added=0, changed=0, unchanged=0;

    for (const r of incoming) {
      const next = toDbRecord(r);
      const old = byKey.get(r.entity + ":" + r.rid);
      if (!old) {
        const { error:e } = await context.supabase.from("records").insert(next as never);
        if (e) throw new Error("Insert " + r.entity + "/" + r.rid + ": " + e.message);
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

    const summary = {
      mode:"incremental", candidates:incoming.length, added, changed, unchanged,
      preserved:"execution_note, review_status, closure_pct, no_go_active and audit history",
      masterData:{departments:master.departments.length,ownerRoles:master.ownerRoles.length,mappings:master.mappings.length,applicationRoleMappings:master.appRoleMappings.length},
    };
    await context.supabase.from("import_runs").insert({ summary } as never);
    return summary;
  });
