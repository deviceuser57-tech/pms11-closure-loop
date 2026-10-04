// Setup Metadata: governed dropdown values imported from the workbook LISTS / MASTER_DATA sheets.
import lists from "@/lib/seed/setup-lists.json";

type Sheet = Record<string, string[]>;
const L = lists as Record<string, Sheet>;

const SHEET: Record<string, string> = {
  rule: "Rules", wps: "WPS", activity: "Activities", gap: "Gaps", evidence: "Evidence", risk: "Risks",
  task: "Tasks", deliverable: "Deliverables", acceptance: "Acceptance", gate: "Gates",
};
const pick = (s: Sheet | undefined, keys: string[]) => keys.flatMap((k) => s?.[k] ?? []);
const all = (keys: string[]) => [...new Set(Object.values(L).flatMap((s) => pick(s, keys)))].sort();

export function useSetupList(entity: string, field: "status" | "criticality" | "applicability"): string[] {
  const s = L[SHEET[entity] ?? ""];
  const keys = field === "status" ? ["Status", `${SHEET[entity] ?? ""} Status`, "WPS Status"]
    : field === "criticality" ? ["Criticality", "Risk Level"] : ["Applicability Status", "Applicability"];
  const own = [...new Set(pick(s, keys))];
  return own.length ? own : all(keys);
}
