// Governed dropdown metadata derived from the workbook LISTS / MASTER_DATA vocabulary.
// No cross-entity fallback is allowed: absence of an entity-specific dictionary remains absence.
import lists from "@/lib/seed/setup-lists.json";

type Sheet = Record<string, string[]>;
const L = lists as Record<string, Sheet>;
const SHEET: Record<string, string> = {
  rule: "Rules", wps: "WPS", activity: "Activities", gap: "Gaps", evidence: "Evidence", risk: "Risks",
  task: "Tasks", deliverable: "Deliverables", acceptance: "Acceptance", gate: "Gates",
};
const pick = (s: Sheet | undefined, keys: string[]) => keys.flatMap((k) => s?.[k] ?? []);

export function useSetupList(entity: string, field: "status" | "criticality" | "applicability"): string[] {
  const sheet = SHEET[entity];
  if (!sheet) return [];
  const s = L[sheet];
  const keys = field === "status"
    ? ["Status", `${sheet} Status`, "WPS Status"]
    : field === "criticality"
      ? ["Criticality", "Risk Level"]
      : ["Applicability Status", "Applicability"];
  return [...new Set(pick(s, keys))];
}
