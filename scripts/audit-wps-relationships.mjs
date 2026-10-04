import fs from "node:fs";
import path from "node:path";

const input = process.argv[2] || "src/lib/seed/pms11-workbook.json";
const records = JSON.parse(fs.readFileSync(path.resolve(input), "utf8"));

const split = (v) =>
  Array.isArray(v)
    ? v.map(String).flatMap((x) => x.split(/[;,]/)).map((x) => x.trim()).filter(Boolean)
    : typeof v === "string"
      ? v.split(/[;,]/).map((x) => x.trim()).filter(Boolean)
      : [];

const rawIds = (record, fields) => {
  const data = record.data ?? {};
  return fields.flatMap((field) => split(data[field]));
};

const normalized = (record, relation) => {
  if (relation === "rule") return record.rule_ids ?? [];
  if (relation === "evidence") return record.evidence_ids ?? [];
  if (relation === "acceptance") return record.acceptance_ids ?? [];
  if (relation === "wps") return record.wps_id ? [record.wps_id] : [];
  return [];
};

const reverseFields = {
  rule: { wps: ["WPS ID", "WPS IDs"] },
  evidence: { wps: ["WPS IDs", "WPS ID"], rule: ["Rule IDs", "Rule ID"] },
  activity: { wps: ["WPS ID", "WPS IDs"] },
  deliverable: { wps: ["WPS ID", "WPS IDs"] },
  task: { wps: ["WPS ID", "WPS IDs"] },
  gap: { wps: ["Related WPS IDs", "WPS ID", "WPS IDs"] },
  acceptance: { wps: ["WPS ID", "WPS IDs"] },
  responsibility: { wps: ["WPS ID", "WPS IDs"] },
  risk: { wps: ["Related WPS IDs", "WPS ID", "WPS IDs"] },
};

function related(wps, entity) {
  const rows = records.filter((r) => r.entity === entity);
  const existing = new Set(rows.map((r) => r.rid));
  const direct = normalized(wps, entity).filter((id) => existing.has(id));
  const fields = reverseFields[entity]?.wps ?? [];
  const reverse = rows
    .filter((r) => normalized(r, "wps").includes(wps.rid) || rawIds(r, fields).includes(wps.rid))
    .map((r) => r.rid);
  return [...new Set([...direct, ...reverse])];
}

const wpsRows = records.filter((r) => r.entity === "wps");
const entities = ["rule", "evidence", "activity", "deliverable", "task", "gap", "acceptance", "responsibility", "risk"];

const report = wpsRows.map((wps) => ({
  wps: wps.rid,
  counts: Object.fromEntries(entities.map((entity) => [entity, related(wps, entity).length])),
  ids: Object.fromEntries(entities.map((entity) => [entity, related(wps, entity)])),
}));

const derived = ["WPS-25", "WPS-26", "WPS-27"].filter((id) => !wpsRows.some((r) => r.rid === id));

console.log(JSON.stringify({
  input,
  wps_count: wpsRows.length,
  derived_wps_not_in_workbook_seed: derived,
  relationship_basis: "source-driven normalized + raw workbook multi-value IDs; unresolved IDs excluded",
  report,
}, null, 2));
