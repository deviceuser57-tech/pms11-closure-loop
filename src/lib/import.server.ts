import workbook from "./seed/pms11-workbook.json";
import { buildDerived, RECONCILIATION, type SeedRecord } from "./seed/derived";

const EVIDENCE_STATUS: Record<string, string> = { "Missing / To Verify": "Required", Missing: "Required" };
const PLACEHOLDER = /to be assigned|^tbc|^rule\/wps owner$/i;
const ARRAY_FIELDS = ["evidence_ids", "acceptance_ids", "rule_ids", "links"] as const;
const OPTIONAL_TEXT_FIELDS = ["description", "wps_id", "gate_id", "parent_id", "owner", "reviewer", "approver", "criticality", "applicability", "doc_number", "revision", "issuer"] as const;
const DATE_FIELDS = ["due_date", "expiry_date"] as const;

/** Normalize source/workbook records at the database boundary without inventing business data. */
export function normalizeRecord(input: SeedRecord): SeedRecord {
  const rec = { ...input } as SeedRecord & Record<string, unknown>;
  for (const key of ARRAY_FIELDS) {
    const value = rec[key];
    rec[key] = Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && v.trim().length > 0) : [];
  }
  for (const key of OPTIONAL_TEXT_FIELDS) {
    const value = rec[key];
    if (value == null || (typeof value === "string" && value.trim() === "")) delete rec[key];
  }
  for (const key of DATE_FIELDS) {
    const value = rec[key];
    if (value == null || (typeof value === "string" && value.trim() === "")) delete rec[key];
  }
  if (rec.data == null || typeof rec.data !== "object" || Array.isArray(rec.data)) rec.data = {};
  if (rec.status == null || (typeof rec.status === "string" && rec.status.trim() === "")) delete rec.status;
  if (typeof rec.title === "string") rec.title = rec.title.trim();
  if (typeof rec.entity === "string") rec.entity = rec.entity.trim();
  if (typeof rec.rid === "string") rec.rid = rec.rid.trim();
  if (rec.source_kind == null || (typeof rec.source_kind === "string" && rec.source_kind.trim() === "")) rec.source_kind = "imported";
  return rec;
}

/** Explicit DB insert shape: omit undefined nullable fields and always send required arrays/data. */
export function toDatabaseRecord(r: SeedRecord): Record<string, unknown> {
  const n = normalizeRecord(r);
  return {
    entity: n.entity, rid: n.rid, title: n.title, description: n.description,
    wps_id: n.wps_id, gate_id: n.gate_id, parent_id: n.parent_id, status: n.status,
    owner: n.owner, reviewer: n.reviewer, approver: n.approver, due_date: n.due_date,
    expiry_date: n.expiry_date, criticality: n.criticality, source_kind: n.source_kind,
    applicability: n.applicability, evidence_ids: n.evidence_ids ?? [],
    acceptance_ids: n.acceptance_ids ?? [], rule_ids: n.rule_ids ?? [], links: n.links ?? [],
    doc_number: n.doc_number, revision: n.revision, issuer: n.issuer, data: n.data ?? {},
  };
}

export function buildAll(): SeedRecord[] {
  const imported = (workbook as SeedRecord[]).map((r) => {
    const rec: SeedRecord = normalizeRecord({ ...r, data: { ...(r.data ?? {}) } });
    if (rec.entity === "evidence" && rec.status && EVIDENCE_STATUS[rec.status]) {
      rec.data["Workbook Status"] = rec.status;
      rec.status = EVIDENCE_STATUS[rec.status];
    }
    if (rec.entity === "gate" && rec.data["Gate Name"] !== rec.title) rec.data["Workbook Gate Name"] = rec.data["Gate Name"];
    const p = RECONCILIATION[`${rec.entity}:${rec.rid}`];
    if (p) {
      rec.data["PMS-11 Scope Reconciliation"] = p.note;
      if (p.applicability) rec.applicability = p.applicability;
      if (p.status) rec.status = p.status;
    }
    if (!rec.applicability && typeof rec.data["Applicability Status"] === "string") rec.applicability = rec.data["Applicability Status"] as string;
    return rec;
  });
  return [...imported, ...buildDerived().map(normalizeRecord)];
}

export const ENTITY_SOURCES: Record<string, string> = {
  rule: "Rules / tblRules", wps: "WPS / tblWPS", activity: "Activities / tblActivities", deliverable: "Deliverables / tblDeliverables",
  task: "Tasks / tblTasks", gap: "Gaps / tblGaps", acceptance: "Acceptance / tblAcceptance", evidence: "Evidence / tblEvidence",
  gate: "Gates / tblGates", responsibility: "Responsibilities / tblResponsibilities", risk: "Risks / tblRisks", change: "Changes / tblChanges",
  equipment: "Vessel particulars (derived)",
};

export const NOT_IMPORTED = [
  { sheet: "Execution (tblExecution)", reason: "Schedule/cost layer duplicating Tasks — kept as source reference only" },
  { sheet: "Functional (tblFunctional)", reason: "Functional breakdown — reference only" },
  { sheet: "Dependencies (tblDependencies)", reason: "612 logical links — not modelled in this version" },
  { sheet: "Sources (tblSources)", reason: "Source register — reference only" },
  { sheet: "Relationships (tblRelationships)", reason: "8,486 generic links — replaced by direct ID links on each record" },
  { sheet: "Gap_WPS, Department_Summary, LISTS, DASHBOARD", reason: "Derived / administrative tables" },
];

export function buildPreview() {
  const all = buildAll();
  const ids = new Set(all.map((r) => `${r.entity}:${r.rid}`));
  const by: Record<string, { imported: number; derived: number; flags: Record<string, number> }> = {};
  let missingEvidenceRefs = 0;
  let missingAcceptanceRefs = 0;
  for (const r of all) {
    const e = (by[r.entity] ??= { imported: 0, derived: 0, flags: {} });
    if (r.source_kind === "derived") e.derived++; else e.imported++;
    const f = (k: string) => (e.flags[k] = (e.flags[k] ?? 0) + 1);
    if (["rule", "wps", "activity", "task", "gap", "deliverable"].includes(r.entity)) {
      if (!r.owner || PLACEHOLDER.test(r.owner)) f("No named owner");
      if (!r.due_date && ["task", "gap", "activity"].includes(r.entity)) f("No due date");
      if (!r.evidence_ids?.length) f("No evidence linked");
      if (!r.acceptance_ids?.length) f("No acceptance criteria");
    }
    if (r.entity === "evidence") {
      if (!r.doc_number || r.doc_number === "TBC") f("Document number TBC");
      if (r.status === "Required") f("Not yet submitted");
    }
    if (r.entity === "rule" && (r.data["Document Number"] === "TBC" || !r.data["Document Number"])) f("Source document number TBC");
    for (const ev of r.evidence_ids ?? []) if (!ids.has(`evidence:${ev}`)) { missingEvidenceRefs++; f("Broken evidence reference"); }
    for (const ac of r.acceptance_ids ?? []) if (!ids.has(`acceptance:${ac}`)) { missingAcceptanceRefs++; f("Broken acceptance reference"); }
  }
  const rowIssues = validateRows(all);
  return {
    rowIssues,
    rejectedCount: rowIssues.filter((r) => r.severity === "error").length,
    workbook: "PMS11_ENTERPRISE_MASTER_DROPDOWNS.xlsx",
    config: { expectedWps: 24, expectedRules: 89 },
    found: { wps: all.filter((r) => r.entity === "wps" && r.source_kind === "imported").length, rules: all.filter((r) => r.entity === "rule").length },
    verification: { worksheet_tables: 22, derived_objects_query: 1, planned_relationships: 22, relationship_schema_errors: 0, embedded_powerpivot_model: false, vba_tested_in_windows_excel: false, model_setup_status: "NOT RUN", relationship_exceptions_file_rows: 93 },
    entities: Object.entries(by).map(([entity, v]) => ({ entity, source: ENTITY_SOURCES[entity] ?? entity, ...v })),
    missingEvidenceRefs, missingAcceptanceRefs,
    notImported: NOT_IMPORTED,
  };
}

export type RowIssue = { entity: string; rid: string; title: string; source: string; severity: "error" | "warning"; issues: string[]; data: Record<string, string | number | boolean | null> };

export function validateRows(all: SeedRecord[]): RowIssue[] {
  const ids = new Set(all.map((r) => `${r.entity}:${r.rid}`));
  const seen = new Map<string, number>();
  for (const r of all) seen.set(`${r.entity}:${r.rid}`, (seen.get(`${r.entity}:${r.rid}`) ?? 0) + 1);
  const out: RowIssue[] = [];
  for (const r of all) {
    const errors: string[] = [];
    const warns: string[] = [];
    if (!r.rid || !/^[A-Z]/.test(r.rid)) errors.push("Missing or invalid ID");
    if ((seen.get(`${r.entity}:${r.rid}`) ?? 0) > 1) errors.push("Duplicate ID");
    if (!r.title || r.title === r.rid) errors.push("Missing title");
    if (!r.entity) errors.push("Missing entity");
    if (!r.source_kind) errors.push("Missing source_kind");
    if (r.data == null || typeof r.data !== "object" || Array.isArray(r.data)) errors.push("Invalid data object");
    for (const k of DATE_FIELDS) if (r[k] && Number.isNaN(Date.parse(r[k]!))) errors.push(`Invalid ${k}`);
    for (const k of ARRAY_FIELDS) if (!Array.isArray(r[k])) errors.push(`Invalid ${k}: expected array`);
    for (const k of ["due_date", "expiry_date"] as const) if (r[k] && Number.isNaN(Date.parse(r[k]!))) errors.push(`Invalid ${k}`);
    if (["rule", "wps", "activity", "task", "gap", "deliverable"].includes(r.entity)) {
      if (!r.owner || PLACEHOLDER.test(r.owner)) warns.push("No named owner");
      if (!r.evidence_ids?.length) warns.push("No evidence linked");
      if (!r.acceptance_ids?.length) warns.push("No acceptance criteria");
    }
    if (r.entity === "evidence" && (!r.doc_number || r.doc_number === "TBC")) warns.push("Document number TBC");
    const brokenE = (r.evidence_ids ?? []).filter((e) => !ids.has(`evidence:${e}`));
    if (brokenE.length) warns.push(`Unmatched evidence: ${brokenE.join(", ")}`);
    const brokenA = (r.acceptance_ids ?? []).filter((a) => !ids.has(`acceptance:${a}`));
    if (brokenA.length) warns.push(`Unmatched acceptance: ${brokenA.join(", ")}`);
    if (errors.length || warns.length)
      out.push({ entity: r.entity, rid: r.rid, title: r.title, source: r.source_kind, severity: errors.length ? "error" : "warning", issues: [...errors, ...warns], data: r.data as RowIssue["data"] });
  }
  return out;
}

export function rejectedKeys(all: SeedRecord[]) {
  return new Set(validateRows(all).filter((r) => r.severity === "error").map((r) => `${r.entity}:${r.rid}`));
}
