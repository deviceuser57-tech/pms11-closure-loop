import fs from "node:fs";
import path from "node:path";
import xlsx from "xlsx";

const input = process.argv[2] || "PMS11_POWERPIVOT_READY.xlsx";
const seed = process.argv[3] || "src/lib/seed/pms11-workbook.json";
const wb = xlsx.readFile(path.resolve(input), { cellDates: true });
const expected = { Rules: 89, WPS: 24, Activities: 127, Deliverables: 127, Tasks: 343, Gaps: 127, Acceptance: 143, Evidence: 134, Gates: 9, Responsibilities: 54, Risks: 25 };
const actual = {};
for (const [sheet, count] of Object.entries(expected)) actual[sheet] = xlsx.utils.sheet_to_json(wb.Sheets[sheet], { defval: null }).filter(r => Object.values(r).some(v => v !== null && v !== "")).length;
const seedRows = JSON.parse(fs.readFileSync(path.resolve(seed), "utf8"));
const seedCounts = Object.fromEntries(Object.keys(expected).map(s => {
  const entity = s === "Rules" ? "rule" : s === "WPS" ? "wps" : s === "Activities" ? "activity" : s === "Deliverables" ? "deliverable" : s === "Tasks" ? "task" : s === "Gaps" ? "gap" : s === "Acceptance" ? "acceptance" : s === "Evidence" ? "evidence" : s === "Gates" ? "gate" : s === "Responsibilities" ? "responsibility" : "risk";
  return [s, seedRows.filter(r => r.entity === entity).length];
}));
const failures = Object.entries(expected).flatMap(([s,n]) => actual[s] !== n ? [`${s}: workbook=${actual[s]} expected=${n}`] : []);
for (const [s,n] of Object.entries(expected)) if (seedCounts[s] !== n) failures.push(`${s}: seed=${seedCounts[s]} expected=${n}`);
if (!wb.Sheets.LISTS) failures.push("LISTS sheet missing");
if (!wb.Sheets.RELATIONSHIPS && !wb.Sheets.Relationships) failures.push("Relationships sheet missing");
const report = { input, workbookSheets: wb.SheetNames.length, actual, seedCounts, status: failures.length ? "FAIL" : "PASS", failures };
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;
