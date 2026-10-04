import { describe, expect, it } from "vitest";
import { useSetupList } from "@/lib/setup-metadata";

describe("PMS-11 governed master data", () => {
  it("uses the corrected workbook status vocabularies", () => {
    expect(useSetupList("task", "status")).toContain("Verified");
    expect(useSetupList("task", "status")).toContain("On Hold");
  });
  it("uses all workbook criticality values", () => {
    expect(useSetupList("rule", "criticality")).toEqual(["Critical","High","Low","Major","Medium"]);
  });
  it("keeps applicability entity-specific", () => {
    expect(useSetupList("rule", "applicability")).toContain("Conditional");
    expect(useSetupList("wps", "applicability")).toEqual(["Conditional / Information Gap"]);
  });
});
