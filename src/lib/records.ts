import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Rec = Tables<"records">;

export const VESSEL = "PMS 11";

export const ENTITY_LABEL: Record<string, string> = {
  rule: "Rule", wps: "Work Package", activity: "Activity", task: "Task", deliverable: "Deliverable", gap: "Gap / Finding",
  acceptance: "Acceptance Criterion", evidence: "Evidence", gate: "Gate", responsibility: "Responsibility", risk: "Risk",
  change: "Change", equipment: "Equipment",
};

// Closable entities obey the closure rule enforced in the database.
export const CLOSABLE = ["rule", "wps", "activity", "task", "gap", "deliverable"];

// TODO: Populate status options from Setup Metadata (e.g. useSetupAudit('findingStatuses')) once a setup module exists.
export const STATUS_OPTIONS: Record<string, string[]> = {
  default: ["Not Opened", "Open", "In Progress", "Blocked", "Reopened", "Closed", "Not Applicable"],
  evidence: ["Required", "Submitted", "In Review", "Accepted", "Rejected", "Expired"],
  acceptance: ["Not Met", "Partially Met", "Met", "Not Applicable"],
  gate: ["Not Started", "In Review", "Conditional", "Go", "No-Go"],
  risk: ["Open", "Mitigating", "Accepted", "Closed"],
  change: ["Raised", "In Review", "Approved", "Rejected", "Implemented"],
  equipment: ["Certification to verify", "Certified", "Expired", "Out of service"],
};
export const statusOptions = (entity: string) => STATUS_OPTIONS[entity] ?? STATUS_OPTIONS.default;

const today = () => new Date().toISOString().slice(0, 10);
export const isOverdue = (r: Rec) => !!r.due_date && r.due_date < today() && !["Closed", "Not Applicable"].includes(r.status);
export const isExpired = (r: Rec) => r.entity === "evidence" && (r.status === "Expired" || (!!r.expiry_date && r.expiry_date < today()));
export const isClosed = (r: Rec) => ["Closed", "Not Applicable", "Met", "Accepted", "Go"].includes(r.status);
export const hasPlaceholderOwner = (r: Rec) => !r.owner || /to be assigned|^tbc|^rule\/wps owner$/i.test(r.owner);

async function fetchAll(): Promise<Rec[]> {
  const out: Rec[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("records").select("*").order("rid").range(from, from + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export const recordsQuery = queryOptions({ queryKey: ["records"], queryFn: fetchAll, staleTime: 30_000 });

export function useRecords() {
  const q = useQuery(recordsQuery);
  const all = q.data ?? [];
  const byKey = new Map(all.map((r) => [`${r.entity}:${r.rid}`, r]));
  return { ...q, all, of: (e: string) => all.filter((r) => r.entity === e), get: (e: string, rid: string) => byKey.get(`${e}:${rid}`) };
}

export function useInvalidateRecords() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["records"] });
}

/**
 * Resolve source-driven relationships. The workbook is the authority for linkage;
 * normalized single-value columns are only one representation of that linkage.
 */
const RAW_LINK_FIELDS: Record<string, string[]> = {
  rule: ["Rule IDs", "Rule ID"],
  wps: ["WPS IDs", "WPS ID"],
  activity: ["Activity IDs", "Activity ID"],
  task: ["Task IDs", "Task ID"],
  deliverable: ["Deliverable IDs", "Deliverable ID"],
  gap: ["Gap IDs", "Gap ID", "Related Gap IDs"],
  acceptance: ["Acceptance Criteria IDs", "Acceptance Criteria ID", "Acceptance ID"],
  evidence: ["Evidence IDs", "Evidence ID"],
  gate: ["Gate IDs", "Gate ID"],
  responsibility: ["Responsibility IDs", "Responsibility Record ID"],
  risk: ["Risk IDs", "Record ID"],
};

const SOURCE_LINK_FIELDS: Record<string, Record<string, string[]>> = {
  rule: { wps: ["WPS ID", "WPS IDs"], evidence: ["Required Evidence"], acceptance: ["Acceptance Criteria ID"] },
  wps: { rule: ["Source Rule IDs"], evidence: ["WPS Acceptance Evidence", "Evidence IDs"], acceptance: ["WPS Acceptance Criteria ID"], activity: ["Activity IDs"] },
  activity: { wps: ["WPS ID", "WPS IDs"], rule: ["Source Rule IDs"], evidence: ["Evidence Required"], acceptance: ["Related Acceptance Criteria IDs"] },
  task: { wps: ["WPS ID", "WPS IDs"], activity: ["Activity ID", "Activity IDs"], rule: ["Source Rule IDs"], evidence: ["Completion Evidence"], acceptance: ["Acceptance Criteria ID"] },
  deliverable: { wps: ["WPS ID", "WPS IDs"], activity: ["Activity ID", "Activity IDs"], rule: ["Source Rule IDs"], evidence: ["Evidence Location"], acceptance: ["Acceptance Criteria ID"] },
  gap: { wps: ["Related WPS IDs", "WPS ID", "WPS IDs"], rule: ["Source Rule IDs"], evidence: ["Closure Evidence"], acceptance: ["Acceptance Criteria IDs"] },
  acceptance: { wps: ["WPS ID", "WPS IDs"], rule: ["Rule ID", "Rule IDs"], evidence: ["Evidence ID", "Evidence IDs"] },
  evidence: { wps: ["WPS IDs", "WPS ID"], rule: ["Rule IDs", "Rule ID"], acceptance: ["Acceptance Criteria IDs", "Acceptance Criteria ID"] },
  responsibility: { wps: ["WPS ID", "WPS IDs"], activity: ["Activity ID", "Activity IDs"], rule: ["Rule ID", "Rule IDs"] },
  risk: { wps: ["WPS ID", "WPS IDs"], rule: ["Rule IDs", "Rule ID"] },
};

function rawIds(item: Rec, fields: string[]): string[] {
  const data = (item.data ?? {}) as Record<string, unknown>;
  const out: string[] = [];
  for (const field of fields) {
    const value = data[field];
    if (Array.isArray(value)) out.push(...value.map(String));
    else if (typeof value === "string") out.push(...value.split(/[;,]/).map((v) => v.trim()).filter(Boolean));
  }
  return out;
}

function normalizedIds(item: Rec, relation: string): string[] {
  if (relation === "evidence") return Array.isArray(item.evidence_ids) ? item.evidence_ids : [];
  if (relation === "rule") return Array.isArray(item.rule_ids) ? item.rule_ids : [];
  if (relation === "acceptance") return Array.isArray(item.acceptance_ids) ? item.acceptance_ids : [];
  if (relation === "wps") return item.wps_id ? [item.wps_id] : [];
  if (relation === "gate") return item.gate_id ? [item.gate_id] : [];
  if (relation === "parent") return item.parent_id ? [item.parent_id] : [];
  return [];
}

/** Return all records of relationEntity linked to r, using normalized fields and raw workbook IDs. */
export function relatedRecordIds(r: Rec, relationEntity: string, all: Rec[]): string[] {
  const relationRows = all.filter((item) => item.entity === relationEntity);
  const existing = new Set(relationRows.map((item) => item.rid));
  const direct = normalizedIds(r, relationEntity).filter((id) => existing.has(id));
  const reverseFields = SOURCE_LINK_FIELDS[relationEntity]?.[r.entity] ?? [];
  const reverse = relationRows
    .filter((item) => {
      const ids = normalizedIds(item, r.entity);
      if (ids.includes(r.rid)) return true;
      return rawIds(item, reverseFields).includes(r.rid);
    })
    .map((item) => item.rid);
  return [...new Set([...direct, ...reverse])];
}

/** Evidence linked to any record, including multi-valued workbook reverse mappings. */
export function evidenceIdsForRecord(r: Rec, all: Rec[]): string[] {
  return relatedRecordIds(r, "evidence", all);
}

/** Counts for a WPS. WPS is the primary work-breakdown axis for execution/readiness reporting. */
export function wpsRelationshipCounts(wps: Rec, all: Rec[]) {
  const entities = ["rule", "evidence", "activity", "deliverable", "task", "gap", "acceptance", "responsibility", "risk"] as const;
  return Object.fromEntries(entities.map((entity) => [entity, relatedRecordIds(wps, entity, all).length])) as Record<(typeof entities)[number], number>;
}

/** Detailed linked records for a WPS, used by the WPS detail view and audit/debugging. */
export function wpsRelationships(wps: Rec, all: Rec[]) {
  const entities = ["rule", "evidence", "activity", "deliverable", "task", "gap", "acceptance", "responsibility", "risk"] as const;
  return Object.fromEntries(entities.map((entity) => [entity, relatedRecordIds(wps, entity, all)])) as Record<(typeof entities)[number], string[]>;
}

/** Evidence validity for an item: accepted and not expired. */
export function evidenceState(
  r: Rec,
  get: (e: string, rid: string) => Rec | undefined,
  all: Rec[] = [],
) {
  const ids = evidenceIdsForRecord(r, all);
  const items = ids.map((id) => ({ id, rec: get("evidence", id) }));
  const valid = items.filter((i) => i.rec && i.rec.status === "Accepted" && !isExpired(i.rec)).length;
  return { items, valid, total: items.length };
}

/** Client-side mirror of the database closure rule (DB is authoritative). */
export function blockers(r: Rec, get: (e: string, rid: string) => Rec | undefined, all: Rec[] = []): string[] {
  const b: string[] = [];
  if (hasPlaceholderOwner(r)) b.push("No named owner");
  if (!r.execution_note?.trim()) b.push("No recorded execution");
  if (r.review_status !== "Approved") b.push("Review not approved");
  const ev = evidenceState(r, get, all);
  if (!ev.total) b.push("No linked evidence");
  else if (ev.valid < ev.total) b.push(`${ev.total - ev.valid} evidence not accepted / expired`);
  if (!r.acceptance_ids.length) b.push("No acceptance criteria");
  else {
    const notMet = r.acceptance_ids.filter((a) => get("acceptance", a)?.status !== "Met").length;
    if (notMet) b.push(`${notMet} acceptance criteria not met`);
  }
  const gateId = r.gate_id ?? (r.wps_id ? get("wps", r.wps_id)?.gate_id : null);
  if (gateId && get("gate", gateId)?.no_go_active) b.push(`${gateId} No-Go active`);
  return b;
}

export function closureClass(r: Rec, get: (e: string, rid: string) => Rec | undefined, all: Rec[] = []): "completed" | "blocked" | "open" {
  if (isClosed(r)) return "completed";
  if (r.status === "Blocked" || r.status === "Reopened" || isOverdue(r)) return "blocked";
  const b = blockers(r, get, all);
  return b.some((x) => /No-Go|expired|not accepted/.test(x)) ? "blocked" : "open";
}
