import fs from "node:fs";
import path from "node:path";
import xlsx from "xlsx";

const input = process.argv[2] || "PMS11_MASTER_DATA_Rev.2.xlsx";
const seed = process.argv[3] || "src/lib/seed/pms11-workbook.json";
const listsSeed = process.argv[4] || "src/lib/seed/setup-lists.json";
const wb = xlsx.readFile(path.resolve(input), { cellDates: true });
const expectedSheets = [
  "START_HERE","MASTER_DATA","MASTER_DATA_GUIDE","DASHBOARD","CONFIG","Rules","WPS","Activities",
  "Deliverables","Tasks","Gaps","Acceptance","Evidence","Gates","Execution","Functional","Dependencies",
  "Sources","Responsibilities","Risks","Changes","Relationships","Gap_WPS","LISTS","Department_Summary",
  "MIGRATION_ISSUES","REDTEAM_RESULTS","REDTEAM_HISTORY","DATA_DICTIONARY","POWERPIVOT_RELATIONS",
  "POWERPIVOT_STATUS","POWERPIVOT_GUIDE","DROPDOWN_MAP","MASTER_DATA_REVIEW","OPEN_FIRST","Crew_Roles",
  "Crew_Requirements","Crew_Register","Crew_Certificates","Manning_Plan","Accommodation_Checks",
  "Accommodation_Capacity","Helideck_Profile","Helideck_Checks","WORKSTREAM_CONTROL","CREW_HELI_ACCOM_DASH",
  "RULE_WPS_MAP","CREW_HELI_ACCOM_GUIDE","WORKSTREAM_REDTEAM","MASTER_DATA_AUDIT","ENTITY_REGISTER",
  "DEPARTMENT_ASSIGNMENTS","RELATIONSHIP_REGISTER_Rev1","VALIDATION_RULES","QA_REPORT","OPEN_DECISIONS"
];
const expectedCounts = {
  Rules:89, WPS:24, Activities:138, Deliverables:138, Tasks:343, Gaps:138,
  Acceptance:154, Evidence:145, Gates:9, Responsibilities:54, Risks:25, Changes:0,
  Execution:316, Functional:361, Sources:34, Crew_Roles:11, Crew_Requirements:22,
  Crew_Register:0, Crew_Certificates:0, Manning_Plan:11, Accommodation_Checks:9,
  Accommodation_Capacity:1, Helideck_Profile:1, Helideck_Checks:9
};
const entityName = {
  Rules:"rule", WPS:"wps", Activities:"activity", Deliverables:"deliverable", Tasks:"task",
  Gaps:"gap", Acceptance:"acceptance", Evidence:"evidence", Gates:"gate",
  Responsibilities:"responsibility", Risks:"risk", Changes:"change", Execution:"execution",
  Functional:"functional", Sources:"source", Crew_Roles:"crew_role", Crew_Requirements:"crew_requirement",
  Crew_Register:"crew_register", Crew_Certificates:"crew_certificate", Manning_Plan:"manning_plan",
  Accommodation_Checks:"accommodation_check", Accommodation_Capacity:"accommodation_capacity",
  Helideck_Profile:"helideck_profile", Helideck_Checks:"helideck_check"
};
const countRows = (sheet) => xlsx.utils.sheet_to_json(wb.Sheets[sheet], { defval:null, raw:true })
  .filter(row => Object.values(row).some(v => v !== null && v !== ""));
const actual = {};
const failures = [];

if (wb.SheetNames.length !== 56) failures.push("Rev.2 sheet count: found " + wb.SheetNames.length + ", expected 56");
for (const name of expectedSheets) if (!wb.Sheets[name]) failures.push("Required Rev.2 sheet missing: " + name);
for (const name of wb.SheetNames) if (!expectedSheets.includes(name)) failures.push("Unexpected/unclassified sheet: " + name);

for (const [sheet, expected] of Object.entries(expectedCounts)) {
  if (!wb.Sheets[sheet]) { actual[sheet] = null; continue; }
  actual[sheet] = countRows(sheet).length;
  if (actual[sheet] !== expected) failures.push(sheet + ": workbook=" + actual[sheet] + " expected=" + expected);
}

const requireHeaders = (sheet, required) => {
  if (!wb.Sheets[sheet]) return;
  const headers = xlsx.utils.sheet_to_json(wb.Sheets[sheet], { header:1, defval:null, raw:true })[0] || [];
  for (const header of required) if (!headers.includes(header)) failures.push(sheet + ": required header missing: " + header);
};
requireHeaders("Relationships", ["Parent Entity","Parent ID","Child Entity","Child ID","Source Field"]);
requireHeaders("Dependencies", ["Link ID","Predecessor ID","Successor ID","Relationship","Lag Days"]);
requireHeaders("Gap_WPS", ["Gap ID","WPS ID"]);
requireHeaders("RULE_WPS_MAP", ["Rule ID","WPS ID","Mapping Type","Approval Status"]);
requireHeaders("DEPARTMENT_ASSIGNMENTS", ["Entity","Record ID","Primary Department","Assignment Source Field","Assignment Method"]);
requireHeaders("RELATIONSHIP_REGISTER_Rev1", ["Relationship ID","Parent Entity","Parent ID","Child Entity","Child ID","Relationship Type"]);

for (const sheet of ["Relationships","Dependencies","Gap_WPS","RULE_WPS_MAP","DEPARTMENT_ASSIGNMENTS","RELATIONSHIP_REGISTER_Rev1"]) {
  if (wb.Sheets[sheet] && countRows(sheet).length === 0) failures.push(sheet + ": expected non-empty source register");
}

let seedCounts = null;
if (fs.existsSync(path.resolve(seed))) {
  const seedRows = JSON.parse(fs.readFileSync(path.resolve(seed), "utf8"));
  seedCounts = Object.fromEntries(Object.keys(entityName).map(s => [
    s, seedRows.filter(r => r.entity === entityName[s]).length
  ]));
  for (const [sheet, expected] of Object.entries(expectedCounts)) {
    if (!(sheet in entityName)) continue;
    if (seedCounts[sheet] !== expected) failures.push(sheet + ": seed=" + seedCounts[sheet] + " expected=" + expected + "; regenerate the seed from Rev.2");
  }

  const deliverables = seedRows.filter(r => r.entity === "deliverable");
  const sourceDeliverables = countRows("Deliverables");
  const sourceEvidenceLinks = sourceDeliverables.flatMap(r =>
    String(r["Evidence Location"] ?? "").split(/[;,]/).map(v => v.trim()).filter(Boolean)
  );
  const seededEvidenceLinks = deliverables.flatMap(r => Array.isArray(r.evidence_ids) ? r.evidence_ids : []);
  for (const id of sourceEvidenceLinks) if (!seededEvidenceLinks.includes(id)) failures.push("Deliverables: missing evidence_ids link " + id);
} else {
  failures.push("Seed file missing: " + seed + " (run npm run pms11:seed -- \"" + input + "\" first)");
}

if (wb.Sheets.LISTS && fs.existsSync(path.resolve(listsSeed))) {
  const listGrid = xlsx.utils.sheet_to_json(wb.Sheets.LISTS, { header:1, defval:null, raw:true });
  const listHeaders = listGrid[0] || [];
  const listRows = listGrid.slice(1);
  const sourceList = (header) => {
    const i = listHeaders.indexOf(header);
    return i < 0 ? [] : listRows.map(row => row[i]).filter(v => v != null && v !== "").map(String);
  };
  const listsSeedObj = JSON.parse(fs.readFileSync(path.resolve(listsSeed), "utf8"));
  const listMap = {
    "Rules.Applicability Status":["Rules","Applicability Status","Rules: Applicability Status"],
    "Rules.Criticality":["Rules","Criticality","Rules: Criticality"],
    "Rules.Status":["Rules","Status","Rules: Status"],
    "WPS.Applicability Status":["WPS","Applicability Status","WPS: Applicability Status"],
    "WPS.WPS Status":["WPS","WPS Status","WPS: WPS Status"],
    "Activities.Applicability Status":["Activities","Applicability Status","Activities: Applicability Status"],
    "Gaps.Criticality":["Gaps","Criticality","Gaps: Criticality"],
    "Gaps.Status":["Gaps","Status","Gaps: Status"],
    "Evidence.Status":["Evidence","Status","Evidence: Status"],
    "Execution.Relationship Type":["Execution","Relationship Type","Execution: Relationship Type"],
    "Execution.Currency":["Execution","Currency","Execution: Currency"],
    "Execution.Procurement Status":["Execution","Procurement Status","Execution: Procurement Status"],
    "Execution.Long Lead Item":["Execution","Long Lead Item","Execution: Long Lead Item"],
    "Execution.Risk Level":["Execution","Risk Level","Execution: Risk Level"],
    "Risks.Status":["Risks","Status","Risks: Status"]
  };
  for (const [key,[section,field,header]] of Object.entries(listMap)) {
    const expectedValues = sourceList(header);
    const actualValues = listsSeedObj?.[section]?.[field] ?? [];
    if (JSON.stringify(actualValues) !== JSON.stringify(expectedValues)) failures.push("LISTS mismatch: " + key);
  }
}

const report = {
  input, workbookSheets:wb.SheetNames.length, actual, seedCounts,
  relationshipRegisters:{
    relationships:wb.Sheets.Relationships ? countRows("Relationships").length : 0,
    relationshipRegisterRev1:wb.Sheets.RELATIONSHIP_REGISTER_Rev1 ? countRows("RELATIONSHIP_REGISTER_Rev1").length : 0,
    departmentAssignments:wb.Sheets.DEPARTMENT_ASSIGNMENTS ? countRows("DEPARTMENT_ASSIGNMENTS").length : 0
  },
  status:failures.length ? "FAIL" : "PASS", failures
};
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;
