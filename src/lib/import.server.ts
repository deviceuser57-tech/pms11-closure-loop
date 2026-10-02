import workbook from "./seed/pms11-workbook.json";
import { buildDerived, RECONCILIATION, type SeedRecord } from "./seed/derived";

const EVIDENCE_STATUS: Record<string, string> = { "Missing / To Verify": "Required", Missing: "Required" };
const PLACEHOLDER = /to be assigned|^tbc|^rule\/wps owner$/i;

export function buildAll(): SeedRecord[] {
  const imported = (workbook as SeedRecord[]).map((r) => {
    const rec: SeedRecord = { ...r, data: { ...r.data } };
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
  return [...imported, ...buildDerived()];
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
  return {
    workbook: "PMS11_POWERPIVOT_READY.xlsm",
    config: { expectedWps: 24, expectedRules: 89 },
    found: { wps: all.filter((r) => r.entity === "wps" && r.source_kind === "imported").length, rules: all.filter((r) => r.entity === "rule").length },
    verification: { worksheet_tables: 22, derived_objects_query: 1, planned_relationships: 22, relationship_schema_errors: 0, embedded_powerpivot_model: false, vba_tested_in_windows_excel: false, model_setup_status: "NOT RUN", relationship_exceptions_file_rows: 93 },
    entities: Object.entries(by).map(([entity, v]) => ({ entity, source: ENTITY_SOURCES[entity] ?? entity, ...v })),
    missingEvidenceRefs, missingAcceptanceRefs,
    notImported: NOT_IMPORTED,
  };
}
