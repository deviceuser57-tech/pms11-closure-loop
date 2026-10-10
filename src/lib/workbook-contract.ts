// PMS11 workbook ↔ application data contract.
// Single source of truth for: sheet dispositions, canonical entity keys,
// governed application roles, and safe multi-value reference parsing.
// Consumed by the parser (workbook-incremental.server.ts), the import functions,
// and the preview/reporting layer so Excel, DB and UI never drift apart.

export const APPLICATION_ROLES = ["admin", "reviewer", "contributor", "viewer"] as const;
export type ApplicationRole = (typeof APPLICATION_ROLES)[number];

export const isValidApplicationRole = (v: unknown): v is ApplicationRole =>
  typeof v === "string" && (APPLICATION_ROLES as readonly string[]).includes(v.trim().toLowerCase());

/** Canonical entity key per workbook sheet (core operational families). */
export const SHEET_ENTITY: Record<string, string> = {
  Rules: "rule", WPS: "wps", Activities: "activity", Deliverables: "deliverable",
  Tasks: "task", Gaps: "gap", Acceptance: "acceptance", Evidence: "evidence",
  Gates: "gate", Responsibilities: "responsibility", Risks: "risk", Changes: "change",
};

/** Relationship-register sheets: stored in record_links, NOT duplicated into records. */
export const RELATIONSHIP_SHEETS = [
  "Relationships", "Gap_WPS", "RULE_WPS_MAP", "Dependencies", "DEPARTMENT_ASSIGNMENTS",
] as const;

/** Governance/reference sheets consumed into governed tables or reference storage. */
export const GOVERNANCE_SHEETS = ["MASTER_DATA", "Department_Summary"] as const;

/** First-class workstream sheets (Crew / Accommodation / Helideck) — imported as records. */
export const WORKSTREAM_SHEETS: Record<string, string> = {
  Crew_Roles: "crew_role", Crew_Requirements: "crew_requirement", Crew_Register: "crew_register",
  Crew_Certificates: "crew_certificate", Manning_Plan: "manning_plan",
  Accommodation_Checks: "accommodation_check", Accommodation_Capacity: "accommodation_capacity",
  Helideck_Profile: "helideck_profile", Helideck_Checks: "helideck_check",
};

/** Execution/Functional/Sources are operational entities with dedicated column mapping. */
export const OPERATIONAL_EXTRA_SHEETS: Record<string, string> = {
  Execution: "execution", Functional: "functional", Sources: "source",
};

/** Sheets preserved as historical diagnostics only — never treated as current findings. */
export const DIAGNOSTIC_SHEETS = [
  "MIGRATION_ISSUES", "REDTEAM_RESULTS", "REDTEAM_HISTORY", "WORKSTREAM_REDTEAM", "RELATIONSHIP_REGISTER_Rev1",
  "MASTER_DATA_REVIEW", "MASTER_DATA_AUDIT", "QA_REPORT", "OPEN_FIRST",
] as const;

/** Derived/presentation or documentation sheets — no database destination. */
export const PRESENTATION_SHEETS = [
  "START_HERE", "MASTER_DATA_GUIDE", "DASHBOARD", "CONFIG", "DATA_DICTIONARY", "ENTITY_REGISTER",
  "POWERPIVOT_RELATIONS", "POWERPIVOT_STATUS", "POWERPIVOT_GUIDE", "DROPDOWN_MAP",
  "CREW_HELI_ACCOM_DASH", "CREW_HELI_ACCOM_GUIDE", "WORKSTREAM_CONTROL",
  "LISTS", "OPEN_DECISIONS", "VALIDATION_RULES",
] as const;

/** Explicit disposition for every known sheet. Unknown sheets must be reported, never ignored. */
export type Disposition = "ingest" | "relationship" | "governance" | "diagnostic" | "presentation" | "excel-only";
export function sheetDisposition(name: string): Disposition | "unknown" {
  if (SHEET_ENTITY[name] || WORKSTREAM_SHEETS[name] || OPERATIONAL_EXTRA_SHEETS[name]) return "ingest";
  if ((RELATIONSHIP_SHEETS as readonly string[]).includes(name)) return "relationship";
  if ((GOVERNANCE_SHEETS as readonly string[]).includes(name)) return "governance";
  if ((DIAGNOSTIC_SHEETS as readonly string[]).includes(name)) return "diagnostic";
  if ((PRESENTATION_SHEETS as readonly string[]).includes(name)) return "presentation";
  return "unknown";
}

// ── Multi-value reference parsing (safe, identifier-aware) ───────────────────
// Splits a cell like "GATE-7/8", "GATE-4 & GATE-7", "E-001; E-002" into complete
// identifiers ("GATE-7","GATE-8") WITHOUT blind punctuation splitting: a segment
// is only split on / & + when both sides resolve to plausible full IDs against a
// known-ID universe. Otherwise the original value is kept and flagged ambiguous.

const ID_TOKEN = /^[A-Z][A-Z0-9]*(?:[-_/][A-Za-z0-9]+)*$/i;

/** Split plain delimiters first (; , ، and newlines). */
export const splitList = (v: unknown): string[] =>
  typeof v === "string"
    ? v.split(/[;,\u060C\n]/).map((x) => x.trim()).filter(Boolean)
    : Array.isArray(v) ? v.map(String).map((x) => x.trim()).filter(Boolean) : [];

/** Expand shorthand like GATE-7/8 → GATE-7, GATE-8 using a prefix pattern. */
export function expandShorthand(token: string, knownIds: Set<string>): { ids: string[]; ambiguous: boolean } {
  // Pattern: PREFIX-a/b/c where PREFIX-a and PREFIX-b... exist or plausibly exist.
  const m = token.match(/^([A-Za-z]+-\d+)(?:\s*(?:\/|&|\+)\s*(?:(?:[A-Za-z]+-)?(\d+|\d+-\d+))+)+$/);
  if (!m) return { ids: [token], ambiguous: false };
  const prefixMatch = token.match(/^([A-Za-z]+-)/);
  const prefix = prefixMatch ? prefixMatch[1] : "";
  const parts = token.split(/\s*(?:\/|&|\+)\s*/);
  const out: string[] = [];
  let ambiguous = false;
  for (let i = 0; i < parts.length; i++) {
    let p = parts[i].trim();
    if (i > 0 && !p.includes("-")) {
      if (!prefix) { ambiguous = true; break; }
      p = prefix + p; // "8" after "GATE-" → "GATE-8"
    }
    if (!ID_TOKEN.test(p)) { ambiguous = true; break; }
    out.push(p.toUpperCase());
  }
  if (ambiguous || out.length < 2) return { ids: [token], ambiguous: true };
  // Validate against known universe when provided; keep unexpanded if any part unknown.
  if (knownIds.size > 0 && !out.every((id) => knownIds.has(id))) {
    return { ids: out, ambiguous: true }; // expanded but unverifiable → report
  }
  return { ids: out, ambiguous: false };
}

/** Parse a multi-value reference cell into canonical IDs + ambiguity flags. */
export function parseRefs(cell: unknown, knownIds: Set<string> = new Set()): { ids: string[]; ambiguous: string[] } {
  const raw = splitList(cell);
  const ids: string[] = [];
  const ambiguous: string[] = [];
  for (const token of raw) {
    const r = expandShorthand(token.toUpperCase(), knownIds);
    ids.push(...r.ids);
    if (r.ambiguous) ambiguous.push(token);
  }
  return { ids: [...new Set(ids)], ambiguous };
}
