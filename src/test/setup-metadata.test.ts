import { describe, expect, it } from "vitest";
import { governedApplicabilityOptions, governedCriticalityOptions, governedStatusOptions } from "@/lib/setup-metadata";

describe("PMS-11 governed master data", () => {
  it("exposes workbook-derived status values", () => {
    expect(governedStatusOptions("task")).toContain("Verified");
    expect(governedStatusOptions("task")).toContain("On Hold");
  });
  it("exposes workbook-derived criticality values", () => {
    expect(governedCriticalityOptions()).toEqual(["Critical","Major","High","Medium","Low"]);
  });
  it("keeps applicability entity-aware", () => {
    expect(governedApplicabilityOptions("rule")).toContain("Conditional");
    expect(governedApplicabilityOptions("wps")).toEqual(["Conditional / Information Gap"]);
  });
});
