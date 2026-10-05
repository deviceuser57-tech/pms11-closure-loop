import fs from "node:fs";
import path from "node:path";
import xlsx from "xlsx";

const input = process.argv[2] || "PMS11_POWERPIVOT_READY.xlsx";
const output = process.argv[3] || "src/lib/seed/pms11-workbook.json";
const listsOutput = process.argv[4] || "src/lib/seed/setup-lists.json";
const wb = xlsx.readFile(path.resolve(input), { cellDates: true, raw: true });

const ENTITY = {
  Rules: ["rule", "Rule ID", "Rule Title / Requirement"],
  WPS: ["wps", "WPS ID", "WPS Name"],
  Activities: ["activity", "Activity ID", "Activity Title"],
  Deliverables: ["deliverable", "Deliverable ID", "Deliverable Name"],
  Tasks: ["task", "Task ID", "Task Title"],
  Gaps: ["gap", "Gap ID", "Gap Title"],
  Acceptance: ["acceptance", "Acceptance Criteria ID", "Criteria Statement"],
  Evidence: ["evidence", "Evidence ID", "Document Title / Request"],
  Gates: ["gate", "Gate ID", "Gate Name"],
  Responsibilities: ["responsibility", "Responsibility Record ID", "Owner"],
  Risks: ["risk", "Record ID", "Description"],
  Changes: ["change", "Change ID", "Change Description"],
};

const splitIds = (v) => typeof v === "string" ? v.split(/[;,]/).map(x => x.trim()).filter(Boolean) : [];
const clean = (v) => {
  if (v == null || v === "") return undefined;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return v;
};
const rows = (sheet) => {
  const data = xlsx.utils.sheet_to_json(wb.Sheets[sheet], { defval: null, raw: true });
  return data.map(row => Object.fromEntries(Object.entries(row).map(([k,v]) => [String(k).trim(), clean(v)])));
};
const scalar = (raw, key) => raw[key] == null || raw[key] === "" ? undefined : raw[key];
const arr = (raw, key) => splitIds(raw[key]);

const records = [];
for (const [sheet, [entity, idKey, titleKey]] of Object.entries(ENTITY)) {
  if (!wb.Sheets[sheet]) throw new Error(`Missing required sheet: ${sheet}`);
  for (const raw of rows(sheet)) {
    const rid = scalar(raw, idKey);
    if (rid == null) continue;
    const rec = { entity, rid: String(rid), title: String(scalar(raw, titleKey) ?? rid), source_kind: "imported", data: raw };
    const put = (k, v) => { if (v !== undefined && v !== "") rec[k] = v; };
    if (entity === "rule") {
      put("status", scalar(raw,"Status")); put("criticality", scalar(raw,"Criticality")); put("applicability", scalar(raw,"Applicability Status"));
      put("wps_id", scalar(raw,"WPS ID")); put("gate_id", scalar(raw,"Readiness Gate")); put("owner", scalar(raw,"Evidence Owner"));
      put("doc_number", scalar(raw,"Document Number")); put("rule_ids", arr(raw,"Source Rule ID")); put("evidence_ids", arr(raw,"Required Evidence"));
      put("acceptance_ids", arr(raw,"Acceptance Criteria ID"));
    } else if (entity === "wps") {
      put("wps_id", String(rid)); put("status", scalar(raw,"WPS Status")); put("criticality", scalar(raw,"Criticality")); put("applicability", scalar(raw,"Applicability Status"));
      put("gate_id", scalar(raw,"Readiness Gate")); put("owner", scalar(raw,"Responsible Lead")); put("reviewer", scalar(raw,"Consulted Parties")); put("approver", scalar(raw,"Accountable Authority"));
      put("rule_ids", arr(raw,"Source Rule IDs")); put("acceptance_ids", arr(raw,"WPS Acceptance Criteria ID")); put("evidence_ids", arr(raw,"WPS Acceptance Evidence"));
    } else if (entity === "activity") {
      put("wps_id", scalar(raw,"WPS ID")); put("status", scalar(raw,"Status")); put("applicability", scalar(raw,"Applicability Status")); put("owner", scalar(raw,"Activity Owner"));
      put("gate_id", scalar(raw,"Readiness Gate")); put("rule_ids", arr(raw,"Source Rule IDs")); put("acceptance_ids", arr(raw,"Related Acceptance Criteria IDs")); put("evidence_ids", arr(raw,"Evidence Required"));
      put("due_date", scalar(raw,"Planned Finish"));
    } else if (entity === "deliverable") {
      put("wps_id", scalar(raw,"WPS ID")); put("parent_id", scalar(raw,"Activity ID")); put("status", scalar(raw,"Status")); put("owner", scalar(raw,"Prepared By"));
      put("reviewer", scalar(raw,"Reviewed By")); put("approver", scalar(raw,"Approved By")); put("rule_ids", arr(raw,"Source Rule IDs")); put("acceptance_ids", arr(raw,"Acceptance Criteria ID"));
      put("evidence_ids", arr(raw,"Evidence Location"));
    } else if (entity === "task") {
      put("wps_id", scalar(raw,"WPS ID")); put("parent_id", scalar(raw,"Activity ID")); put("status", scalar(raw,"Status")); put("owner", scalar(raw,"Task Owner"));
      put("rule_ids", arr(raw,"Source Rule IDs")); put("acceptance_ids", arr(raw,"Acceptance Criteria ID")); put("evidence_ids", arr(raw,"Completion Evidence"));
      put("due_date", scalar(raw,"Planned Finish")); put("links", [...arr(raw,"Predecessor Task IDs"), ...arr(raw,"Successor Task IDs")]);
    } else if (entity === "gap") {
      put("status", scalar(raw,"Status")); put("criticality", scalar(raw,"Criticality")); put("owner", scalar(raw,"Gap Owner")); put("reviewer", scalar(raw,"Closure Authority"));
      put("gate_id", scalar(raw,"Blocked Gate")); put("rule_ids", arr(raw,"Source Rule IDs")); put("evidence_ids", arr(raw,"Closure Evidence")); put("acceptance_ids", arr(raw,"Acceptance Criteria IDs"));
      put("due_date", scalar(raw,"Due Date"));
      const ws = arr(raw,"Related WPS IDs"); if (ws.length === 1) put("wps_id", ws[0]);
    } else if (entity === "acceptance") {
      put("parent_id", scalar(raw,"Applies To ID")); put("wps_id", scalar(raw,"WPS ID")); put("status", scalar(raw,"Status")); put("owner", scalar(raw,"Acceptance Authority"));
      put("reviewer", scalar(raw,"Reviewer")); put("rule_ids", arr(raw,"Rule ID")); put("evidence_ids", arr(raw,"Evidence ID"));
    } else if (entity === "evidence") {
      put("status", scalar(raw,"Status")); put("doc_number", scalar(raw,"Document Number")); put("revision", scalar(raw,"Revision")); put("expiry_date", scalar(raw,"Expiry Date"));
      put("issuer", scalar(raw,"Issuing Authority")); put("owner", scalar(raw,"Custodian")); put("rule_ids", arr(raw,"Rule IDs")); put("acceptance_ids", arr(raw,"Acceptance Criteria IDs"));
      const ws = arr(raw,"WPS IDs"); if (ws.length === 1) put("wps_id", ws[0]);
    } else if (entity === "gate") {
      put("status", scalar(raw,"Status")); put("approver", scalar(raw,"Approving Authority")); put("reviewer", scalar(raw,"Approving Authority")); put("acceptance_ids", arr(raw,"Acceptance Criteria IDs"));
    } else if (entity === "responsibility") {
      put("status", scalar(raw,"Status")); put("owner", scalar(raw,"Owner")); put("wps_id", scalar(raw,"WPS ID")); put("parent_id", scalar(raw,"Activity ID"));
    } else if (entity === "risk") {
      put("status", scalar(raw,"Status")); put("criticality", scalar(raw,"Risk Level")); put("owner", scalar(raw,"Owner")); put("reviewer", scalar(raw,"Decision Authority"));
    } else if (entity === "change") {
      put("status", scalar(raw,"Status")); put("owner", scalar(raw,"Raised By"));
    }
    records.push(rec);
  }
}

const listRows = xlsx.utils.sheet_to_json(wb.Sheets.LISTS, { header: 1, defval: null, raw: true });
const listHeaders = listRows[0] || [];
const columnValues = (header) => {
  const i = listHeaders.indexOf(header);
  return i < 0 ? [] : listRows.slice(1).map(row => row[i]).filter(v => v != null && v !== "").map(v => String(v));
};
const setupLists = {
  Rules: {
    "Applicability Status": columnValues("Rules: Applicability Status"),
    "Criticality": columnValues("Rules: Criticality"),
    "Status": columnValues("Rules: Status"),
  },
  WPS: {
    "Applicability Status": columnValues("WPS: Applicability Status"),
    "WPS Status": columnValues("WPS: WPS Status"),
  },
  Activities: { "Applicability Status": columnValues("Activities: Applicability Status") },
  Gaps: {
    "Criticality": columnValues("Gaps: Criticality"),
    "Status": columnValues("Gaps: Status"),
  },
  Evidence: { "Status": columnValues("Evidence: Status") },
  Execution: {
    "Relationship Type": columnValues("Execution: Relationship Type"),
    "Currency": columnValues("Execution: Currency"),
    "Procurement Status": columnValues("Execution: Procurement Status"),
    "Long Lead Item": columnValues("Execution: Long Lead Item"),
    "Risk Level": columnValues("Execution: Risk Level"),
  },
  Risks: { "Status": columnValues("Risks: Status") },
};

fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
fs.mkdirSync(path.dirname(path.resolve(listsOutput)), { recursive: true });
fs.writeFileSync(path.resolve(output), JSON.stringify(records, null, 2) + "\n", "utf8");
fs.writeFileSync(path.resolve(listsOutput), JSON.stringify(setupLists, null, 2) + "\n", "utf8");

const counts = Object.fromEntries(Object.keys(ENTITY).map(sheet => [ENTITY[sheet][0], records.filter(r => r.entity === ENTITY[sheet][0]).length]));
console.log(JSON.stringify({ input, output, listsOutput, sheets: wb.SheetNames.length, counts, total: records.length }, null, 2));
