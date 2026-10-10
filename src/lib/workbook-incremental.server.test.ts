import { describe, expect, it } from "vitest";
import fs from "node:fs";
import * as xlsx from "xlsx";
import {
  parseDepartmentAssignments,
  parseDependencyLinks,
  parseRelationshipLinks,
} from "./workbook-incremental.server";
import { sheetDisposition } from "./workbook-contract";

function workbookBuffer(sheets: Record<string, unknown[][]>): ArrayBuffer {
  const wb = xlsx.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet(rows), name);
  }
  return xlsx.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

describe("PMS11 Rev.2 workbook contract", () => {
  it("assigns a deliberate disposition to every Rev.2 sheet", () => {
    const sheets = [
      "START_HERE","MASTER_DATA","MASTER_DATA_GUIDE","DASHBOARD","CONFIG","Rules","WPS","Activities",
      "Deliverables","Tasks","Gaps","Acceptance","Evidence","Gates","Execution","Functional","Dependencies",
      "Sources","Responsibilities","Risks","Changes","Relationships","Gap_WPS","LISTS","Department_Summary",
      "MIGRATION_ISSUES","REDTEAM_RESULTS","REDTEAM_HISTORY","DATA_DICTIONARY","POWERPIVOT_RELATIONS",
      "POWERPIVOT_STATUS","POWERPIVOT_GUIDE","DROPDOWN_MAP","MASTER_DATA_REVIEW","OPEN_FIRST","Crew_Roles",
      "Crew_Requirements","Crew_Register","Crew_Certificates","Manning_Plan","Accommodation_Checks",
      "Accommodation_Capacity","Helideck_Profile","Helideck_Checks","WORKSTREAM_CONTROL","CREW_HELI_ACCOM_DASH",
      "RULE_WPS_MAP","CREW_HELI_ACCOM_GUIDE","WORKSTREAM_REDTEAM","MASTER_DATA_AUDIT","ENTITY_REGISTER",
      "DEPARTMENT_ASSIGNMENTS","RELATIONSHIP_REGISTER_Rev1","VALIDATION_RULES","QA_REPORT","OPEN_DECISIONS",
    ];
    expect(sheets).toHaveLength(56);
    expect(sheets.filter((sheet) => sheetDisposition(sheet) === "unknown")).toEqual([]);
    expect(sheetDisposition("DEPARTMENT_ASSIGNMENTS")).toBe("relationship");
    expect(sheetDisposition("RELATIONSHIP_REGISTER_Rev1")).toBe("diagnostic");
    expect(sheetDisposition("ENTITY_REGISTER")).toBe("presentation");
  });

  it("keeps dependency direction, type, lag, and source provenance", () => {
    const buffer = workbookBuffer({
      Dependencies: [
        ["Link ID","Predecessor ID","Successor ID","Relationship","Lag Days","Rationale","Validation Status"],
        ["DEP-1","GATE-0","T-R-001-01","Finish-to-Start",2,"Gate before task","Validated"],
      ],
    });
    const links = parseDependencyLinks(buffer);
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      source_entity: "gate", source_rid: "GATE-0",
      target_entity: "task", target_rid: "T-R-001-01",
      link_type: "FINISH_TO_START", lag_days: 2, source_sheet: "Dependencies",
      source_field: "DEP-1", notes: "Gate before task", status: "Validated",
    });
  });

  it("imports typed Gap–WPS and Rule–WPS edges but does not re-import the Rev.1 mirror", () => {
    const buffer = workbookBuffer({
      Relationships: [
        ["Parent Entity","Parent ID","Child Entity","Child ID","Source Field"],
        ["Gaps","G-001","WPS","WPS-23","Related WPS IDs"],
      ],
      Gap_WPS: [
        ["Gap ID","WPS ID","Gap Open","Critical Open"],
        ["G-001","WPS-23","Yes","Critical"],
      ],
      RULE_WPS_MAP: [
        ["Mapping ID","Rule ID","WPS ID","Mapping Type","Approval Status","Comments"],
        ["MAP-1","R-001","WPS-23","Primary","Approved","Explicit mapping"],
      ],
      RELATIONSHIP_REGISTER_Rev1: [
        ["Relationship ID","Parent Entity","Parent ID","Child Entity","Child ID","Relationship Type"],
        ["REL-1","Gaps","G-001","WPS","WPS-23","RELATED_TO_WPS"],
      ],
    });
    const links = parseRelationshipLinks(buffer);
    expect(links.some(l => l.source_sheet === "Gap_WPS" && l.link_type === "RELATED_TO_WPS")).toBe(true);
    expect(links.some(l => l.source_sheet === "RULE_WPS_MAP" && l.link_type === "PRIMARY" && l.status === "Approved")).toBe(true);
    expect(links.some(l => l.source_sheet === "RELATIONSHIP_REGISTER_Rev1")).toBe(false);
  });

  it("parses department assignment rows with entity and provenance", () => {
    const buffer = workbookBuffer({
      DEPARTMENT_ASSIGNMENTS: [
        ["Entity","Record ID","Primary Department","Assignment Source Field","Assignment Source Value","Assignment Method","Status","Open Decision"],
        ["Activities","A-R-001","Marine Operations","Activity Owner","Marine Ops","Mapped","Confirmed",""],
        ["Rules","R-001","Technical","Owner","Engineer","Explicit","Confirmed",""],
      ],
    });
    expect(parseDepartmentAssignments(buffer)).toEqual([
      {
        entity:"activity", rid:"A-R-001", department:"Marine Operations",
        source_sheet:"DEPARTMENT_ASSIGNMENTS", source_field:"Activity Owner",
        source_value:"Marine Ops", assignment_method:"Mapped", status:"Confirmed", open_decision:"",
      },
      {
        entity:"rule", rid:"R-001", department:"Technical",
        source_sheet:"DEPARTMENT_ASSIGNMENTS", source_field:"Owner",
        source_value:"Engineer", assignment_method:"Explicit", status:"Confirmed", open_decision:"",
      },
    ]);
  });
});

describe("import safety regression guards", () => {
  it("keeps workbook preview free of database mutation calls", () => {
    const source = fs.readFileSync(new URL("./import-incremental.functions.ts", import.meta.url), "utf8");
    const previewStart = source.indexOf("export const previewWorkbookIncremental");
    const importStart = source.indexOf("export const runWorkbookIncremental");
    expect(previewStart).toBeGreaterThanOrEqual(0);
    expect(importStart).toBeGreaterThan(previewStart);
    const preview = source.slice(previewStart, importStart);
    expect(preview).not.toMatch(/\.from\([^)]*\)\.(insert|update|delete|upsert)\s*\(/);
    expect(preview).not.toMatch(/\.rpc\(["'][^"']*(import|write|delete|update)/i);
  });

  it("retains compensating rollback snapshots and checks audit-write errors", () => {
    const source = fs.readFileSync(new URL("./import-incremental.functions.ts", import.meta.url), "utf8");
    expect(source).toContain("updatedRecordSnapshots.push(old as Record<string, unknown>)");
    expect(source).toContain("updatedLinkSnapshots.push(previous)");
    expect(source).toContain("await rollback()");
    expect(source).toContain("import_runs audit write failed:");
  });
});
