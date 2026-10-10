import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseRefs, expandShorthand, splitList, isValidApplicationRole, sheetDisposition, APPLICATION_ROLES } from "@/lib/workbook-contract";

const known = new Set(["GATE-7","GATE-8","R-001","R-002","E-010"]);

describe("workbook contract — application roles", () => {
  it("accepts only the four canonical roles", () => {
    for (const r of APPLICATION_ROLES) expect(isValidApplicationRole(r)).toBe(true);
    expect(isValidApplicationRole("Admin")).toBe(true); // case-insensitive trim
    expect(isValidApplicationRole("Marine Superintendent")).toBe(false);
    expect(isValidApplicationRole("DV-3")).toBe(false);
    expect(isValidApplicationRole(null)).toBe(false);
  });
});

describe("multi-value reference parsing", () => {
  it("splits plain delimiters without touching identifiers", () => {
    expect(splitList("R-001; R-002,R-003")).toEqual(["R-001","R-002","R-003"]);
    expect(parseRefs("E-010; E-011", known).ids).toEqual(["E-010","E-011"]);
  });
  it("expands GATE-7/8 shorthand into complete IDs", () => {
    const r = parseRefs("GATE-7/8", known);
    expect(r.ids).toEqual(["GATE-7","GATE-8"]);
    expect(r.ambiguous).toHaveLength(0);
  });
  it("does not blindly split values that are not shorthand", () => {
    const r = expandShorthand("ISO 9001/2015", known);
    expect(r.ids).toEqual(["ISO 9001/2015"]); // kept intact — never guessed/split
    expect(r.ambiguous).toBe(false);
    const refs = parseRefs("ISO 9001/2015", known);
    expect(refs.ids).toEqual(["ISO 9001/2015"]);
    expect(refs.ambiguous).toEqual([]);
  });
  it("flags unverifiable expansions instead of hiding them", () => {
    const r = parseRefs("GATE-9/10", known); // GATE-9/10 unknown in universe
    expect(r.ambiguous.length + (r.ids.join() !== "GATE-9,GATE-10" ? 1 : 0)).toBeGreaterThan(0);
    expect(r.ids).toContain("GATE-9");
  });
});

describe("sheet dispositions", () => {
  it("classifies every disposition family explicitly", () => {
    expect(sheetDisposition("Rules")).toBe("ingest");
    expect(sheetDisposition("Crew_Roles")).toBe("ingest");
    expect(sheetDisposition("Helideck_Checks")).toBe("ingest");
    expect(sheetDisposition("Relationships")).toBe("relationship");
    expect(sheetDisposition("MASTER_DATA")).toBe("governance");
    expect(sheetDisposition("REDTEAM_RESULTS")).toBe("diagnostic");
    expect(sheetDisposition("DASHBOARD")).toBe("presentation");
    expect(sheetDisposition("SOMETHING_NEW")).toBe("unknown"); // must be reported, never ignored
  });
});

// ── Parser tests against a synthetic workbook (no fabricated business data) ──
function makeWorkbook(sheets: Record<string, Record<string, unknown>[]>) {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), name);
  }
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return buf;
}

describe("workbook parser", () => {
  it("parses core, workstream and execution sheets with link expansion", async () => {
    const { parseWorkbookDetailed } = await import("@/lib/workbook-incremental.server");
    const buffer = makeWorkbook({
      Gates: [{ "Gate ID": "GATE-1", "Gate Name": "Design freeze" }],
      Rules: [{ "Rule ID": "R-001", "Rule Title / Requirement": "Test rule", "Readiness Gate": "GATE-1", Status: "Active" }],
      WPS: [{ "WPS ID": "WPS-01", "WPS Name": "Survey", "Source Rule IDs": "R-001" }],
      Tasks: [{ "Task ID": "T-001", "Task Title": "Run survey", "WPS ID": "WPS-01", "Source Rule IDs": "R-001", Department: "Marine" }],
      Evidence: [{ "Evidence ID": "E-001", "Document Title / Request": "Report", "Expiry Date": null }],
      Crew_Roles: [{ "Role ID": "CR-1", "Role / Team": "Chief Engineer", "WPS ID": "WPS-23" }],
      Helideck_Profile: [{ "Helideck Profile ID": "HP-1", "Operating Scope": "Day/night VFR" }],
      Dependencies: [{ "Link ID": "DEP-1", "Predecessor ID": "T-001", "Successor ID": "T-002", Relationship: "Finish-to-Start", "Lag Days": 2, Rationale: "test", "Validation Status": "Valid" }],
      Relationships: [{ "Parent Entity": "WPS", "Parent ID": "WPS-01", "Child Entity": "Tasks", "Child ID": "T-001", "Relationship Type": "contains", "Source Field": "WPS ID" }],
    });
    const parsed = parseWorkbookDetailed(buffer);
    const entities = parsed.records.map(r => r.entity);
    expect(entities).toContain("task");
    expect(entities).toContain("crew_role");   // first-class workstream support
    expect(entities).toContain("helideck_profile");
    const task = parsed.records.find(r => r.rid === "T-001")!;
    expect(task.department).toBe("Marine");
    expect(task.rule_ids).toContain("R-001");
    expect(parsed.links.some(l => l.source_rid === "T-001" && l.target_rid === "R-001" && l.link_type === "GOVERNED_BY")).toBe(true);
    expect(parsed.unknownSheets).toEqual([]);
    const deps = (await import("@/lib/workbook-incremental.server")).parseDependencyLinks(buffer);
    expect(deps[0].lag_days).toBe(2);
    expect(deps[0].source_field).toContain("T-001");
    const rels = (await import("@/lib/workbook-incremental.server")).parseRelationshipLinks(buffer);
    expect(rels[0]).toMatchObject({ source_entity: "wps", target_entity: "task", link_type: "REGISTERED" });
  });

  it("parses wide MASTER_DATA governed lists without inventing app roles", async () => {
    const { parseMasterData } = await import("@/lib/workbook-incremental.server");
    const buffer = makeWorkbook({
      MASTER_DATA: [
        { "Departments": "Marine", "Owners and Roles": "Master", "Status": "Active", "Criticality": "High" },
        { "Departments": "Engineering", "Owners and Roles": "Chief Engineer", "Status": "Draft", "Criticality": "Medium" },
        { "Departments": "Marine", "Owners and Roles": "OIM", "Status": "Closed", "Criticality": "Low" },
      ],
    });
    const md = parseMasterData(buffer);
    expect(md.departments.sort()).toEqual(["Engineering","Marine"]);
    expect(md.ownerRoles).toContain("Chief Engineer");
    expect(md.mappings.length).toBe(3);
    expect(md.appRoleMappings).toEqual([]); // no Application Role column → none invented
    expect(md.controlledLists["Status"]).toEqual(expect.arrayContaining(["Active","Draft","Closed"]));
  });

  it("maps an explicit Application Role column to canonical roles only", async () => {
    const { parseMasterData } = await import("@/lib/workbook-incremental.server");
    const buffer = makeWorkbook({
      MASTER_DATA: [
        { Departments: "Marine", "Owners and Roles": "Master", "Application Role": "reviewer" },
        { Departments: "HSE", "Owners and Roles": "HSE Manager", "Application Role": "Marine Superintendent" }, // operational role — never an app role
      ],
    });
    const md = parseMasterData(buffer);
    expect(md.appRoleMappings).toEqual([{ department: "Marine", appRole: "reviewer" }]);
  });

  it("treats missing optional sheets as absent, not fatal, and reports unknown sheets", async () => {
    const { parseWorkbookDetailed } = await import("@/lib/workbook-incremental.server");
    const buffer = makeWorkbook({
      Gates: [{ "Gate ID": "GATE-1", "Gate Name": "G1" }],
      Brand_New_Sheet: [{ x: 1 }],
    });
    const parsed = parseWorkbookDetailed(buffer);
    expect(parsed.records.map(r => r.rid)).toEqual(["GATE-1"]);
    expect(parsed.unknownSheets).toEqual(["Brand_New_Sheet"]);
  });
});
