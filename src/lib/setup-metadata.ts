// Governed dropdown metadata derived from the workbook LISTS / MASTER_DATA vocabulary.
// The source vocabulary is preserved exactly; this module never invents missing values.
import lists from "@/lib/seed/setup-lists.json";

type Sheet = Record<string, string[]>;
const L = lists as Record<string, Sheet>;

const SHEET: Record<string, string> = {
  rule: "Rules", wps: "WPS", activity: "Activities", gap: "Gaps", evidence: "Evidence", risk: "Risks",
  task: "Tasks", deliverable: "Deliverables", acceptance: "Acceptance", gate: "Gates",
};

const pick = (s: Sheet | undefined, keys: string[]) => keys.flatMap((k) => s?.[k] ?? []);
const unique = (values: string[]) => [...new Set(values.map((v) => v.trim()).filter(Boolean))];

export function setupList(sheet: string, keys: string[]): string[] {
  return unique(pick(L[sheet], keys));
}

export function useSetupList(entity: string, field: "status" | "criticality" | "applicability"): string[] {
  const sheet = SHEET[entity];
  if (!sheet) return [];
  const keys = field === "status"
    ? ["Status", `${sheet} Status`, "WPS Status"]
    : field === "criticality"
      ? ["Criticality", "Risk Level"]
      : ["Applicability Status", "Applicability"];
  return setupList(sheet, keys);
}

/** Non-reactive governed status resolver for shared record utilities. */
export function governedStatusOptions(entity: string): string[] {
  return useSetupList(entity, "status");
}

/** All governed criticality values actually present in MASTER_DATA/LISTS. */
export function useGovernedCriticality(): string[] {
  return unique(Object.values(L).flatMap((s) => pick(s, ["Criticality", "Risk Level"])));
}

/** All governed applicability values actually present in MASTER_DATA/LISTS. */
export function useGovernedApplicability(): string[] {
  return unique(Object.values(L).flatMap((s) => pick(s, ["Applicability Status", "Applicability"])));
}

/** All governed status values actually present in MASTER_DATA/LISTS. */
export function useGovernedStatus(): string[] {
  return unique(Object.values(L).flatMap((s) => pick(s, ["Status", "WPS Status", "Gate Status"])));
}
