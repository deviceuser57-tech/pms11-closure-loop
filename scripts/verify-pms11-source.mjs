import fs from "node:fs";
import path from "node:path";
import xlsx from "xlsx";

const input = process.argv[2] || "PMS11_POWERPIVOT_READY.xlsx";
const seed = process.argv[3] || "src/lib/seed/pms11-workbook.json";
const listsSeed = process.argv[4] || "src/lib/seed/setup-lists.json";
const wb = xlsx.readFile(path.resolve(input), { cellDates: true });
const expected = { Rules: 89, WPS: 24, Activities: 127, Deliverables: 127, Tasks: 343, Gaps: 127, Acceptance: 143, Evidence: 134, Gates: 9, Responsibilities: 54, Risks: 25 };
const entityName = { Rules:"rule", WPS:"wps", Activities:"activity", Deliverables:"deliverable", Tasks:"task", Gaps:"gap", Acceptance:"acceptance", Evidence:"evidence", Gates:"gate", Responsibilities:"responsibility", Risks:"risk" };
const actual = {};
for (const [sheet, count] of Object.entries(expected)) actual[sheet] = xlsx.utils.sheet_to_json(wb.Sheets[sheet], { defval: null }).filter(r => Object.values(r).some(v => v !== null && v !== "")).length;
const seedRows = JSON.parse(fs.readFileSync(path.resolve(seed), "utf8"));
const seedCounts = Object.fromEntries(Object.keys(expected).map(s => [s, seedRows.filter(r => r.entity === entityName[s]).length]));
const failures = Object.entries(expected).flatMap(([s,n]) => actual[s] !== n ? [`${s}: workbook=${actual[s]} expected=${n}`] : []);
for (const [s,n] of Object.entries(expected)) if (seedCounts[s] !== n) failures.push(`${s}: seed=${seedCounts[s]} expected=${n}`);

const deliverables = seedRows.filter(r => r.entity === "deliverable");
const sourceDeliverables = xlsx.utils.sheet_to_json(wb.Sheets.Deliverables, { defval: null });
const sourceEvidenceLinks = sourceDeliverables.map(r => r["Evidence Location"]).filter(v => v != null && v !== "").map(String);
const seededEvidenceLinks = deliverables.flatMap(r => Array.isArray(r.evidence_ids) ? r.evidence_ids : []);
for (const id of sourceEvidenceLinks) if (!seededEvidenceLinks.includes(id)) failures.push(`Deliverables: missing evidence_ids link ${id}`);

const listHeaders = xlsx.utils.sheet_to_json(wb.Sheets.LISTS, { header: 1, defval: null, raw: true })[0] || [];
const listRows = xlsx.utils.sheet_to_json(wb.Sheets.LISTS, { header: 1, defval: null, raw: true }).slice(1);
const sourceList = (header) => {
  const i = listHeaders.indexOf(header);
  return i < 0 ? [] : listRows.map(row => row[i]).filter(v => v != null && v !== "").map(String);
};
const listsSeedObj = JSON.parse(fs.readFileSync(path.resolve(listsSeed), "utf8"));
const listMap = {
  "Rules.Applicability Status": ["Rules","Applicability Status","Rules: Applicability Status"],
  "Rules.Criticality": ["Rules","Criticality","Rules: Criticality"],
  "Rules.Status": ["Rules","Status","Rules: Status"],
  "WPS.Applicability Status": ["WPS","Applicability Status","WPS: Applicability Status"],
  "WPS.WPS Status": ["WPS","WPS Status","WPS: WPS Status"],
  "Activities.Applicability Status": ["Activities","Applicability Status","Activities: Applicability Status"],
  "Gaps.Criticality": ["Gaps","Criticality","Gaps: Criticality"],
  "Gaps.Status": ["Gaps","Status","Gaps: Status"],
  "Evidence.Status": ["Evidence","Status","Evidence: Status"],
  "Execution.Relationship Type": ["Execution","Relationship Type","Execution: Relationship Type"],
  "Execution.Currency": ["Execution","Currency","Execution: Currency"],
  "Execution.Procurement Status": ["Execution","Procurement Status","Execution: Procurement Status"],
  "Execution.Long Lead Item": ["Execution","Long Lead Item","Execution: Long Lead Item"],
  "Execution.Risk Level": ["Execution","Risk Level","Execution: Risk Level"],
  "Risks.Status": ["Risks","Status","Risks: Status"],
};
for (const [key,[section,field,header]] of Object.entries(listMap)) {
  const expectedValues = sourceList(header);
  const actualValues = listsSeedObj?.[section]?.[field] ?? [];
  if (JSON.stringify(actualValues) !== JSON.stringify(expectedValues)) failures.push(`LISTS mismatch: ${key}`);
}
if (!wb.Sheets.LISTS) failures.push("LISTS sheet missing");
if (!wb.Sheets.RELATIONSHIPS && !wb.Sheets.Relationships) failures.push("Relationships sheet missing");
const report = { input, workbookSheets: wb.SheetNames.length, actual, seedCounts, status: failures.length ? "FAIL" : "PASS", failures };
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;
