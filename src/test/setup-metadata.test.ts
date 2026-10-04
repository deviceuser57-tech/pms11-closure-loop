import { describe, expect, it } from "vitest";
import { useSetupList } from "@/lib/setup-metadata";

describe("PMS-11 governed master data", () => {
  it("uses the exact Rules vocabulary from workbook LISTS", () => {
    expect(useSetupList("rule", "criticality")).toEqual(["Critical", "Major"]);
    expect(useSetupList("rule", "status")).toContain("Verified");
  });
  it("does not invent a Task criticality/status dictionary when LISTS has none", () => {
    expect(useSetupList("task", "criticality")).toEqual([]);
    expect(useSetupList("task", "status")).toEqual([]);
  });
  it("keeps applicability entity-specific", () => {
    expect(useSetupList("rule", "applicability")).toContain("Conditional");
    expect(useSetupList("wps", "applicability")).toEqual(["Conditional / Information Gap"]);
  });
});
