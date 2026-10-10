import * as xlsx from "xlsx";
import {
  SHEET_ENTITY, WORKSTREAM_SHEETS, OPERATIONAL_EXTRA_SHEETS, isValidApplicationRole, parseRefs,
} from "./workbook-contract";

export type WorkbookRecord = {
  entity: string;
  rid: string;
  title: string;
  source_kind: "imported";
  wps_id?: string;
  gate_id?: string;
  parent_id?: string;
  status?: string;
  owner?: string;
  reviewer?: string;
  approver?: string;
  due_date?: string;
  expiry_date?: string;
  criticality?: string;
  applicability?: string;
  evidence_ids?: string[];
  acceptance_ids?: string[];
  rule_ids?: string[];
  links?: string[];
  doc_number?: string;
  revision?: string;
  issuer?: string;
  department?: string;
  source_sheet?: string;
  data: Record<string, unknown>;
};

// sheet → [entity, id column, title column] — core operational families plus
// Execution/Functional/Sources and the Crew/Helideck/Accommodation workstreams.
const ENTITY: Record<string, [string,string,string]> = {
  Rules: ["rule","Rule ID","Rule Title / Requirement"],
  WPS: ["wps","WPS ID","WPS Name"],
  Activities: ["activity","Activity ID","Activity Title"],
  Deliverables: ["deliverable","Deliverable ID","Deliverable Name"],
  Tasks: ["task","Task ID","Task Title"],
  Gaps: ["gap","Gap ID","Gap Title"],
  Acceptance: ["acceptance","Acceptance Criteria ID","Criteria Statement"],
  Evidence: ["evidence","Evidence ID","Document Title / Request"],
  Gates: ["gate","Gate ID","Gate Name"],
  Responsibilities: ["responsibility","Responsibility Record ID","Owner"],
  Risks: ["risk","Record ID","Description"],
  Changes: ["change","Change ID","Change Description"],
  Execution: ["execution","Execution ID","Activity / Task Title"],
  Functional: ["functional","Functional_Activity_ID","Functional Activity / Description"],
  Sources: ["source","Source Record ID","Document Title"],
  Crew_Roles: ["crew_role","Role ID","Role / Team"],
  Crew_Requirements: ["crew_requirement","Requirement ID","Requirement"],
  Crew_Register: ["crew_register","Crew ID","Name / Role"],
  Crew_Certificates: ["crew_certificate","Certificate ID","Certificate"],
  Manning_Plan: ["manning_plan","Manning Line ID","Scenario"],
  Accommodation_Checks: ["accommodation_check","Accommodation Check ID","Item"],
  Accommodation_Capacity: ["accommodation_capacity","Capacity ID","Capacity Item"],
  Helideck_Profile: ["helideck_profile","Helideck Profile ID","Operating Scope"],
  Helideck_Checks: ["helideck_check","Helideck Check ID","Check Item"],
};

const splitIds = (v: unknown) =>
  typeof v === "string" ? v.split(/[;,]/).map((x) => x.trim()).filter(Boolean) : [];

/** Reference columns expanded into record_links (never stored as scalar FKs). */
export type WorkbookLink = {
  source_entity: string; source_rid: string; target_entity: string; target_rid: string;
  link_type: string; role?: string; lag_days?: number | null; status?: string | null;
  source_sheet: string; source_field: string; notes?: string | null; ambiguous?: boolean;
};

// Field → [target entity, link type]. Multi-valued governed references.
const REF_FIELDS: Array<[string, string, string]> = [
  ["rule_ids", "rule", "GOVERNED_BY"],
  ["evidence_ids", "evidence", "EVIDENCED_BY"],
  ["acceptance_ids", "acceptance", "ACCEPTED_BY"],
];

function collectLinks(rec: WorkbookRecord): WorkbookLink[] {
  const links: WorkbookLink[] = [];
  const push = (targetEntity: string, targetRid: string, linkType: string, field: string, extra?: Partial<WorkbookLink>) => {
    links.push({
      source_entity: rec.entity, source_rid: rec.rid, target_entity: targetEntity,
      target_rid: targetRid, link_type: linkType, source_sheet: rec.source_sheet ?? "", source_field: field, ...extra,
    });
  };
  for (const [field, target, type] of REF_FIELDS) {
    for (const id of (rec[field as keyof WorkbookRecord] as string[]) ?? []) push(target, id, type, field);
  }
  if (rec.wps_id) push("wps", rec.wps_id, "BELONGS_TO_WPS", "WPS ID");
  if (rec.gate_id) push("gate", rec.gate_id, "BLOCKS_GATE", "Readiness Gate");
  if (rec.parent_id) push("", rec.parent_id, "PARENT_OF", "parent");
  for (const id of rec.links ?? []) push("", id, "SEQUENCE_LINK", "dependencies");
  return links;
}

const clean = (v: unknown): unknown => {
  if (v == null || v === "") return undefined;
  if (v instanceof Date) return v.toISOString().slice(0,10);
  return v;
};

const scalar = (r: Record<string,unknown>, k: string) => {
  const v = clean(r[k]);
  return v === undefined ? undefined : v;
};

const arr = (r: Record<string,unknown>, k: string) => splitIds(r[k]);

export type ParseResult = {
  records: WorkbookRecord[];
  links: WorkbookLink[];
  /** Cells that could not be resolved deterministically — surfaced, never guessed. */
  ambiguousRefs: Array<{ sheet: string; rid: string; field: string; value: string }>;
  /** Sheets present in the workbook but with no contract disposition. */
  unknownSheets: string[];
};

export function parseWorkbookDetailed(buffer: ArrayBuffer): ParseResult {
  const wb = xlsx.read(new Uint8Array(buffer), { cellDates: true, raw: true });
  const records: WorkbookRecord[] = [];
  const ambiguousRefs: ParseResult["ambiguousRefs"] = [];

  // Known-ID universes per target entity for safe shorthand expansion (GATE-7/8).
  const universe: Record<string, Set<string>> = {};
  const ensureUniverse = (sheet: string, idKey: string) => {
    const s = new Set<string>();
    if (!wb.Sheets[sheet]) return s;
    const rows = xlsx.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheet], { defval: null, raw: true });
    for (const r of rows) { const v = r[idKey]; if (typeof v === "string" && v.trim()) s.add(v.trim().toUpperCase()); }
    return s;
  };
  const gates = ensureUniverse("Gates", "Gate ID");
  const rules = ensureUniverse("Rules", "Rule ID");
  const evidences = ensureUniverse("Evidence", "Evidence ID");
  const acceptances = ensureUniverse("Acceptance", "Acceptance Criteria ID");
  const wpsIds = ensureUniverse("WPS", "WPS ID");
  universe.rule = rules; universe.evidence = evidences; universe.acceptance = acceptances; universe.wps = wpsIds; universe.gate = gates;

  const refsOf = (raw: Record<string, unknown>, k: string, target: string): string[] => {
    const known = universe[target] ?? new Set<string>();
    const parsed = parseRefs(raw[k], known);
    for (const a of parsed.ambiguous) ambiguousRefs.push({ sheet: String((raw as Record<string, unknown>).__sheet ?? ""), rid: String(raw.__rid ?? ""), field: k, value: a });
    return parsed.ids;
  };

  for (const [sheet, [entity,idKey,titleKey]] of Object.entries(ENTITY)) {
    if (!wb.Sheets[sheet]) continue; // optional sheets are reported by disposition, not fatal
    const rows = xlsx.utils.sheet_to_json<Record<string,unknown>>(wb.Sheets[sheet], { defval: null, raw: true });

    for (const original of rows) {
      const raw = Object.fromEntries(Object.entries(original).map(([k,v]) => [String(k).trim(), clean(v)]));
      raw.__sheet = sheet;
      const rid = scalar(raw,idKey);
      if (rid == null) continue;
      raw.__rid = String(rid);
      const rec: WorkbookRecord = {
        entity, rid: String(rid), title: String(scalar(raw,titleKey) ?? rid),
        source_kind: "imported", source_sheet: sheet, data: raw,
      };
      delete raw.__sheet; delete raw.__rid;
      const put = (k: keyof WorkbookRecord, v: unknown) => {
        if (v !== undefined && v !== "") (rec as Record<string,unknown>)[k] = v;
      };
      const arrT = (k: string, target: string) => refsOf(raw, k, target);

      put("department", scalar(raw,"Department") ?? scalar(raw,"Responsible Department"));
      if (entity === "rule") {
        put("status",scalar(raw,"Status")); put("criticality",scalar(raw,"Criticality")); put("applicability",scalar(raw,"Applicability Status"));
        put("wps_id",scalar(raw,"WPS ID")); put("gate_id",scalar(raw,"Readiness Gate")); put("owner",scalar(raw,"Evidence Owner"));
        put("doc_number",scalar(raw,"Document Number")); put("rule_ids",arrT("Source Rule ID","rule")); put("evidence_ids",arrT("Required Evidence","evidence")); put("acceptance_ids",arrT("Acceptance Criteria ID","acceptance"));
      } else if (entity === "wps") {
        put("wps_id",String(rid)); put("status",scalar(raw,"WPS Status")); put("criticality",scalar(raw,"Criticality")); put("applicability",scalar(raw,"Applicability Status"));
        put("gate_id",scalar(raw,"Readiness Gate")); put("owner",scalar(raw,"Responsible Lead")); put("reviewer",scalar(raw,"Consulted Parties")); put("approver",scalar(raw,"Accountable Authority"));
        put("rule_ids",arrT("Source Rule IDs","rule")); put("acceptance_ids",arrT("WPS Acceptance Criteria ID","acceptance")); put("evidence_ids",arrT("WPS Acceptance Evidence","evidence"));
      } else if (entity === "activity") {
        put("wps_id",scalar(raw,"WPS ID")); put("status",scalar(raw,"Status")); put("applicability",scalar(raw,"Applicability Status")); put("owner",scalar(raw,"Activity Owner"));
        put("gate_id",scalar(raw,"Readiness Gate")); put("rule_ids",arrT("Source Rule IDs","rule")); put("acceptance_ids",arrT("Related Acceptance Criteria IDs","acceptance")); put("evidence_ids",arrT("Evidence Required","evidence")); put("due_date",scalar(raw,"Planned Finish"));
      } else if (entity === "deliverable") {
        put("wps_id",scalar(raw,"WPS ID")); put("parent_id",scalar(raw,"Activity ID")); put("status",scalar(raw,"Status")); put("owner",scalar(raw,"Prepared By"));
        put("reviewer",scalar(raw,"Reviewed By")); put("approver",scalar(raw,"Approved By")); put("rule_ids",arrT("Source Rule IDs","rule")); put("acceptance_ids",arrT("Acceptance Criteria ID","acceptance")); put("evidence_ids",arrT("Evidence Location","evidence"));
      } else if (entity === "task") {
        put("wps_id",scalar(raw,"WPS ID")); put("parent_id",scalar(raw,"Activity ID")); put("status",scalar(raw,"Status")); put("owner",scalar(raw,"Task Owner"));
        put("rule_ids",arrT("Source Rule IDs","rule")); put("acceptance_ids",arrT("Acceptance Criteria ID","acceptance")); put("evidence_ids",arrT("Completion Evidence","evidence")); put("due_date",scalar(raw,"Planned Finish"));
        put("links",[...arrT("Predecessor Task IDs","task"),...arrT("Successor Task IDs","task")]);
      } else if (entity === "gap") {
        put("status",scalar(raw,"Status")); put("criticality",scalar(raw,"Criticality")); put("owner",scalar(raw,"Gap Owner")); put("reviewer",scalar(raw,"Closure Authority"));
        put("gate_id",scalar(raw,"Blocked Gate")); put("rule_ids",arrT("Source Rule IDs","rule")); put("evidence_ids",arrT("Closure Evidence","evidence")); put("acceptance_ids",arrT("Acceptance Criteria IDs","acceptance")); put("due_date",scalar(raw,"Due Date"));
        const ws=arrT("Related WPS IDs","wps"); if(ws.length===1) put("wps_id",ws[0]);
      } else if (entity === "acceptance") {
        put("parent_id",scalar(raw,"Applies To ID")); put("wps_id",scalar(raw,"WPS ID")); put("status",scalar(raw,"Status")); put("owner",scalar(raw,"Acceptance Authority")); put("reviewer",scalar(raw,"Reviewer")); put("rule_ids",arrT("Rule ID","rule")); put("evidence_ids",arrT("Evidence ID","evidence"));
      } else if (entity === "evidence") {
        put("status",scalar(raw,"Status")); put("doc_number",scalar(raw,"Document Number")); put("revision",scalar(raw,"Revision")); put("expiry_date",scalar(raw,"Expiry Date")); put("issuer",scalar(raw,"Issuing Authority")); put("owner",scalar(raw,"Custodian")); put("rule_ids",arrT("Rule IDs","rule")); put("acceptance_ids",arrT("Acceptance Criteria IDs","acceptance"));
        const ws=arrT("WPS IDs","wps"); if(ws.length===1) put("wps_id",ws[0]);
      } else if (entity === "gate") {
        put("status",scalar(raw,"Status")); put("approver",scalar(raw,"Approving Authority")); put("reviewer",scalar(raw,"Approving Authority")); put("acceptance_ids",arrT("Acceptance Criteria IDs","acceptance"));
      } else if (entity === "responsibility") {
        put("status",scalar(raw,"Status")); put("owner",scalar(raw,"Owner")); put("wps_id",scalar(raw,"WPS ID")); put("parent_id",scalar(raw,"Activity ID"));
      } else if (entity === "risk") {
        put("status",scalar(raw,"Status")); put("criticality",scalar(raw,"Risk Level")); put("owner",scalar(raw,"Owner")); put("reviewer",scalar(raw,"Decision Authority"));
      } else if (entity === "change") {
        put("status",scalar(raw,"Status")); put("owner",scalar(raw,"Raised By"));
      } else if (entity === "execution") {
        put("wps_id",scalar(raw,"WPS ID")); put("status",scalar(raw,"Status")); put("owner",scalar(raw,"Discipline Lead")); put("approver",scalar(raw,"Accountable Manager"));
        put("due_date",scalar(raw,"Planned Finish")); put("criticality",scalar(raw,"Risk Level")); put("gate_id",scalar(raw,"Blocking Gate"));
        put("rule_ids",[]); put("evidence_ids",arrT("Evidence Required","evidence"));
        put("links",[...arrT("Logical Predecessor IDs","execution"),...arrT("Schedule Predecessor IDs","execution")]);
      } else if (entity === "functional") {
        put("wps_id",scalar(raw,"WPS ID")); put("status",scalar(raw,"Status")); put("criticality",scalar(raw,"Risk_Level"));
        put("rule_ids",arrT("Source Rule ID","rule")); put("evidence_ids",arrT("Evidence ID","evidence"));
      } else if (entity === "source") {
        put("status",scalar(raw,"Status")); put("issuer",scalar(raw,"Authority")); put("doc_number",scalar(raw,"Document Number")); put("revision",scalar(raw,"Edition")); put("doc_source",scalar(raw,"URL"));
        put("rule_ids",arrT("Related Rule IDs","rule"));
      } else if (entity.startsWith("crew_") || entity === "manning_plan") {
        put("wps_id",scalar(raw,"WPS ID")); put("status",scalar(raw,"Approval Status") ?? scalar(raw,"Applicability"));
        put("rule_ids",arrT("Source Rule ID","rule")); put("evidence_ids",arrT("Evidence ID","evidence"));
      } else if (entity.startsWith("accommodation_")) {
        put("wps_id",scalar(raw,"WPS ID")); put("status",scalar(raw,"Inspection Status") ?? scalar(raw,"Control Result"));
        put("rule_ids",arrT("Source Rule ID","rule")); put("evidence_ids",arrT("Evidence ID","evidence"));
      } else if (entity.startsWith("helideck_")) {
        put("wps_id",scalar(raw,"WPS ID")); put("status",scalar(raw,"Installed Status") ?? scalar(raw,"Check Status"));
        put("evidence_ids",arrT("Permissions / Certificate Evidence","evidence").concat(arrT("Evidence ID","evidence")));
      }
      records.push(rec);
    }
  }

  const links = records.flatMap(collectLinks);
  const unknownSheets = wb.SheetNames.filter((n) => !ENTITY[n] && !KNOWN_NON_INGEST.has(n));
  return { records, links, ambiguousRefs, unknownSheets };
}

const KNOWN_NON_INGEST = new Set([
  "MASTER_DATA","Relationships","Gap_WPS","RULE_WPS_MAP","Dependencies","LISTS","Department_Summary",
  "MIGRATION_ISSUES","REDTEAM_RESULTS","REDTEAM_HISTORY","DATA_DICTIONARY","POWERPIVOT_RELATIONS",
  "POWERPIVOT_STATUS","POWERPIVOT_GUIDE","START_HERE","DASHBOARD","CONFIG","DROPDOWN_MAP",
  "MASTER_DATA_GUIDE","MASTER_DATA_REVIEW","OPEN_FIRST","WORKSTREAM_CONTROL","CREW_HELI_ACCOM_DASH",
  "CREW_HELI_ACCOM_GUIDE","WORKSTREAM_REDTEAM","MASTER_DATA_AUDIT","OPEN_DECISIONS","VALIDATION_RULES",
  "RELATIONSHIP_REGISTER_Rev1","ENTITY_REGISTER",
  // Rev.1 report mirrors — diagnostic only
  "Master_Departments","Master_Owner_Roles","Master_Application_Roles","Dept_Owner_Map","Dept_Application_Role_Map",
  "MASTER_DATA_CHANGE_REPORT","RELATIONSHIP_REPAIR_REPORT","UNRESOLVED_REFERENCE_REPORT","OWNERSHIP_REPORT",
  "APPLICATION_ROLE_REPORT","CREW_HELIDECK_ACCOM_REPORT","POWERPIVOT_READINESS_REPORT","QA_SUMMARY","README_REV1",
]);

/** Back-compatible wrapper used by existing callers. */
export function parseWorkbook(buffer: ArrayBuffer): WorkbookRecord[] {
  return parseWorkbookDetailed(buffer).records;
}

/** Dependencies sheet → explicit DEPENDS_ON links (first-class dependency source). */
export function parseDependencyLinks(buffer: ArrayBuffer): WorkbookLink[] {
  const wb = xlsx.read(new Uint8Array(buffer), { cellDates: true, raw: true });
  const sheet = wb.Sheets["Dependencies"];
  if (!sheet) return [];
  const rows = xlsx.utils.sheet_to_json<Record<string,unknown>>(sheet, { defval: null, raw: true });
  const out: WorkbookLink[] = [];
  for (const r of rows) {
    const pred = typeof r["Predecessor ID"] === "string" ? (r["Predecessor ID"] as string).trim() : "";
    const succ = typeof r["Successor ID"] === "string" ? (r["Successor ID"] as string).trim() : "";
    if (!pred || !succ) continue;
    out.push({
      source_entity: "dependency", source_rid: String(r["Link ID"] ?? pred + "->" + succ),
      target_entity: "", target_rid: succ, link_type: "DEPENDS_ON",
      lag_days: typeof r["Lag Days"] === "number" ? r["Lag Days"] : null,
      status: typeof r["Validation Status"] === "string" ? r["Validation Status"] : null,
      notes: typeof r["Rationale"] === "string" ? r["Rationale"] : null,
      source_sheet: "Dependencies", source_field: `Predecessor ${pred} (${String(r["Relationship"] ?? "")})`,
    });
  }
  return out;
}

/** Relationships register → canonical record_links (authoritative M:N source). */
export function parseRelationshipLinks(buffer: ArrayBuffer): WorkbookLink[] {
  const wb = xlsx.read(new Uint8Array(buffer), { cellDates: true, raw: true });
  const sheet = wb.Sheets["Relationships"];
  if (!sheet) return [];
  const rows = xlsx.utils.sheet_to_json<Record<string,unknown>>(sheet, { defval: null, raw: true });
  const norm = (v: unknown) => typeof v === "string" ? v.trim() : "";
  const entityKey = (name: string) => SHEET_ENTITY[name] ?? WORKSTREAM_SHEETS[name] ?? OPERATIONAL_EXTRA_SHEETS[name] ?? name.toLowerCase();
  return rows.filter((r) => norm(r["Parent ID"]) && norm(r["Child ID"])).map((r) => ({
    source_entity: entityKey(norm(r["Parent Entity"])), source_rid: norm(r["Parent ID"]),
    target_entity: entityKey(norm(r["Child Entity"])), target_rid: norm(r["Child ID"]),
    link_type: "REGISTERED", role: null,
    source_sheet: "Relationships", source_field: norm(r["Source Field"]),
  }));
}

export function toDbRecord(r: WorkbookRecord) {
  return {
    entity:r.entity, rid:r.rid, title:r.title, description:typeof r.data["Description"]==="string" ? r.data["Description"] : null,
    wps_id:r.wps_id ?? null, gate_id:r.gate_id ?? null, parent_id:r.parent_id ?? null, status:r.status ?? "Open",
    owner:r.owner ?? null, reviewer:r.reviewer ?? null, approver:r.approver ?? null, due_date:r.due_date ?? null,
    expiry_date:r.expiry_date ?? null, criticality:r.criticality ?? null, source_kind:"imported",
    applicability:r.applicability ?? null, evidence_ids:r.evidence_ids ?? [], acceptance_ids:r.acceptance_ids ?? [],
    rule_ids:r.rule_ids ?? [], links:r.links ?? [], doc_number:r.doc_number ?? null, revision:r.revision ?? null,
    issuer:r.issuer ?? null, department:r.department ?? null, data:r.data ?? {},
  };
}

export type MasterData = { departments:string[]; ownerRoles:string[]; mappings:Array<{department:string;ownerRole:string}>; appRoleMappings:Array<{department:string;appRole:"admin"|"reviewer"|"contributor"|"viewer"}>; controlledLists:Record<string,string[]> };

/**
 * MASTER_DATA is a wide governed-lists sheet (one column per controlled list),
 * NOT one row per department. Departments/Owner roles are the distinct non-empty
 * values of their columns; every other column becomes a controlled list.
 * Application-role mappings exist only if an explicit valid role column is present —
 * never inferred from operational roles.
 */
export function parseMasterData(buffer: ArrayBuffer): MasterData {
  const wb = xlsx.read(new Uint8Array(buffer), { cellDates:true, raw:true });
  const sheet = wb.Sheets["MASTER_DATA"];
  if (!sheet) return { departments:[], ownerRoles:[], mappings:[], appRoleMappings:[], controlledLists:{} };

  const rows = xlsx.utils.sheet_to_json<Record<string,unknown>>(sheet,{defval:null,raw:true});
  const keys = Object.keys(rows[0] ?? {});
  const findKey = (labels:string[], fallbackIndex?:number) =>
    keys.find(k => labels.some(label => k.trim().toLowerCase() === label.toLowerCase()))
    ?? (fallbackIndex === undefined ? undefined : keys[fallbackIndex]);

  const ownerKey=findKey(["Owners and Roles","Owner Role"],17);
  const deptKey=findKey(["Departments","Department"],18);
  const appRoleKey=findKey(["Application Role","App Role","User Role","System Role"]);

  const colValues = (k?: string) =>
    k ? [...new Set(rows.map(r=>String(r[k] ?? "").trim()).filter(Boolean))] : [];

  const departments=colValues(deptKey);
  const ownerRoles=colValues(ownerKey);

  const mappings=[...new Map(rows.map(r=>{
    const d=String(deptKey ? r[deptKey] ?? "" : "").trim();
    const o=String(ownerKey ? r[ownerKey] ?? "" : "").trim();
    return [d+"\u0000"+o,{department:d,ownerRole:o}] as const;
  }).filter(([,v])=>v.department&&v.ownerRole))].map(([,v])=>v);

  // Controlled lists: every remaining column is a governed value list.
  const skip = new Set([deptKey, ownerKey, appRoleKey].filter(Boolean) as string[]);
  const controlledLists: Record<string,string[]> = {};
  for (const k of keys) {
    if (skip.has(k)) continue;
    const vals = colValues(k);
    if (vals.length && vals.length <= 60) controlledLists[k.trim()] = vals;
  }

  // Explicit application-role column only; validated against canonical roles.
  const appRoleMappings: MasterData["appRoleMappings"] = [];
  if (appRoleKey) {
    const seen = new Set<string>();
    for (const r of rows) {
      const d=String(deptKey ? r[deptKey] ?? "" : "").trim();
      const role=String(r[appRoleKey] ?? "").trim().toLowerCase();
      if (d && isValidApplicationRole(role) && !seen.has(d+role)) {
        seen.add(d+role);
        appRoleMappings.push({department:d, appRole:role});
      }
    }
  }

  return {departments,ownerRoles,mappings,appRoleMappings,controlledLists};
}
export function fingerprint(r: unknown): string {
  return JSON.stringify(r, Object.keys((r as Record<string,unknown>) ?? {}).sort());
}
