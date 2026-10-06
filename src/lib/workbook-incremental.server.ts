import * as xlsx from "xlsx";

export type WorkbookRecord = {
  entity: string;
  rid: string;
  title: string;
  source_kind: "imported";
  wps_id?: string;
  gate_id?: string;
  parent_id?: string;
  status?: string;
  owner?: string;
  reviewer?: string;
  approver?: string;
  due_date?: string;
  expiry_date?: string;
  criticality?: string;
  applicability?: string;
  evidence_ids?: string[];
  acceptance_ids?: string[];
  rule_ids?: string[];
  links?: string[];
  doc_number?: string;
  revision?: string;
  issuer?: string;
  department?: string;
  data: Record<string, unknown>;
};

const ENTITY: Record<string, [string,string,string]> = {
  Rules: ["rule","Rule ID","Rule Title / Requirement"],
  WPS: ["wps","WPS ID","WPS Name"],
  Activities: ["activity","Activity ID","Activity Title"],
  Deliverables: ["deliverable","Deliverable ID","Deliverable Name"],
  Tasks: ["task","Task ID","Task Title"],
  Gaps: ["gap","Gap ID","Gap Title"],
  Acceptance: ["acceptance","Acceptance Criteria ID","Criteria Statement"],
  Evidence: ["evidence","Evidence ID","Document Title / Request"],
  Gates: ["gate","Gate ID","Gate Name"],
  Responsibilities: ["responsibility","Responsibility Record ID","Owner"],
  Risks: ["risk","Record ID","Description"],
  Changes: ["change","Change ID","Change Description"],
};

const splitIds = (v: unknown) =>
  typeof v === "string" ? v.split(/[;,]/).map((x) => x.trim()).filter(Boolean) : [];

const clean = (v: unknown): unknown => {
  if (v == null || v === "") return undefined;
  if (v instanceof Date) return v.toISOString().slice(0,10);
  return v;
};

const scalar = (r: Record<string,unknown>, k: string) => {
  const v = clean(r[k]);
  return v === undefined ? undefined : v;
};

const arr = (r: Record<string,unknown>, k: string) => splitIds(r[k]);

export function parseWorkbook(buffer: ArrayBuffer): WorkbookRecord[] {
  const wb = xlsx.read(new Uint8Array(buffer), { cellDates: true, raw: true });
  const records: WorkbookRecord[] = [];

  for (const [sheet, [entity,idKey,titleKey]] of Object.entries(ENTITY)) {
    if (!wb.Sheets[sheet]) throw new Error(`Missing required sheet: ${sheet}`);
    const rows = xlsx.utils.sheet_to_json<Record<string,unknown>>(wb.Sheets[sheet], { defval: null, raw: true });

    for (const original of rows) {
      const raw = Object.fromEntries(Object.entries(original).map(([k,v]) => [String(k).trim(), clean(v)]));
      const rid = scalar(raw,idKey);
      if (rid == null) continue;
      const rec: WorkbookRecord = {
        entity, rid: String(rid), title: String(scalar(raw,titleKey) ?? rid),
        source_kind: "imported", data: raw,
      };
      const put = (k: keyof WorkbookRecord, v: unknown) => {
        if (v !== undefined && v !== "") (rec as Record<string,unknown>)[k] = v;
      };

      put("department", scalar(raw,"Department"));
      if (entity === "rule") {
        put("status",scalar(raw,"Status")); put("criticality",scalar(raw,"Criticality")); put("applicability",scalar(raw,"Applicability Status"));
        put("wps_id",scalar(raw,"WPS ID")); put("gate_id",scalar(raw,"Readiness Gate")); put("owner",scalar(raw,"Evidence Owner"));
        put("doc_number",scalar(raw,"Document Number")); put("rule_ids",arr(raw,"Source Rule ID")); put("evidence_ids",arr(raw,"Required Evidence")); put("acceptance_ids",arr(raw,"Acceptance Criteria ID"));
      } else if (entity === "wps") {
        put("wps_id",String(rid)); put("status",scalar(raw,"WPS Status")); put("criticality",scalar(raw,"Criticality")); put("applicability",scalar(raw,"Applicability Status"));
        put("gate_id",scalar(raw,"Readiness Gate")); put("owner",scalar(raw,"Responsible Lead")); put("reviewer",scalar(raw,"Consulted Parties")); put("approver",scalar(raw,"Accountable Authority"));
        put("rule_ids",arr(raw,"Source Rule IDs")); put("acceptance_ids",arr(raw,"WPS Acceptance Criteria ID")); put("evidence_ids",arr(raw,"WPS Acceptance Evidence"));
      } else if (entity === "activity") {
        put("wps_id",scalar(raw,"WPS ID")); put("status",scalar(raw,"Status")); put("applicability",scalar(raw,"Applicability Status")); put("owner",scalar(raw,"Activity Owner"));
        put("gate_id",scalar(raw,"Readiness Gate")); put("rule_ids",arr(raw,"Source Rule IDs")); put("acceptance_ids",arr(raw,"Related Acceptance Criteria IDs")); put("evidence_ids",arr(raw,"Evidence Required")); put("due_date",scalar(raw,"Planned Finish"));
      } else if (entity === "deliverable") {
        put("wps_id",scalar(raw,"WPS ID")); put("parent_id",scalar(raw,"Activity ID")); put("status",scalar(raw,"Status")); put("owner",scalar(raw,"Prepared By"));
        put("reviewer",scalar(raw,"Reviewed By")); put("approver",scalar(raw,"Approved By")); put("rule_ids",arr(raw,"Source Rule IDs")); put("acceptance_ids",arr(raw,"Acceptance Criteria ID")); put("evidence_ids",arr(raw,"Evidence Location"));
      } else if (entity === "task") {
        put("wps_id",scalar(raw,"WPS ID")); put("parent_id",scalar(raw,"Activity ID")); put("status",scalar(raw,"Status")); put("owner",scalar(raw,"Task Owner"));
        put("rule_ids",arr(raw,"Source Rule IDs")); put("acceptance_ids",arr(raw,"Acceptance Criteria ID")); put("evidence_ids",arr(raw,"Completion Evidence")); put("due_date",scalar(raw,"Planned Finish"));
        put("links",[...arr(raw,"Predecessor Task IDs"),...arr(raw,"Successor Task IDs")]);
      } else if (entity === "gap") {
        put("status",scalar(raw,"Status")); put("criticality",scalar(raw,"Criticality")); put("owner",scalar(raw,"Gap Owner")); put("reviewer",scalar(raw,"Closure Authority"));
        put("gate_id",scalar(raw,"Blocked Gate")); put("rule_ids",arr(raw,"Source Rule IDs")); put("evidence_ids",arr(raw,"Closure Evidence")); put("acceptance_ids",arr(raw,"Acceptance Criteria IDs")); put("due_date",scalar(raw,"Due Date"));
        const ws=arr(raw,"Related WPS IDs"); if(ws.length===1) put("wps_id",ws[0]);
      } else if (entity === "acceptance") {
        put("parent_id",scalar(raw,"Applies To ID")); put("wps_id",scalar(raw,"WPS ID")); put("status",scalar(raw,"Status")); put("owner",scalar(raw,"Acceptance Authority")); put("reviewer",scalar(raw,"Reviewer")); put("rule_ids",arr(raw,"Rule ID")); put("evidence_ids",arr(raw,"Evidence ID"));
      } else if (entity === "evidence") {
        put("status",scalar(raw,"Status")); put("doc_number",scalar(raw,"Document Number")); put("revision",scalar(raw,"Revision")); put("expiry_date",scalar(raw,"Expiry Date")); put("issuer",scalar(raw,"Issuing Authority")); put("owner",scalar(raw,"Custodian")); put("rule_ids",arr(raw,"Rule IDs")); put("acceptance_ids",arr(raw,"Acceptance Criteria IDs"));
        const ws=arr(raw,"WPS IDs"); if(ws.length===1) put("wps_id",ws[0]);
      } else if (entity === "gate") {
        put("status",scalar(raw,"Status")); put("approver",scalar(raw,"Approving Authority")); put("reviewer",scalar(raw,"Approving Authority")); put("acceptance_ids",arr(raw,"Acceptance Criteria IDs"));
      } else if (entity === "responsibility") {
        put("status",scalar(raw,"Status")); put("owner",scalar(raw,"Owner")); put("wps_id",scalar(raw,"WPS ID")); put("parent_id",scalar(raw,"Activity ID"));
      } else if (entity === "risk") {
        put("status",scalar(raw,"Status")); put("criticality",scalar(raw,"Risk Level")); put("owner",scalar(raw,"Owner")); put("reviewer",scalar(raw,"Decision Authority"));
      } else if (entity === "change") {
        put("status",scalar(raw,"Status")); put("owner",scalar(raw,"Raised By"));
      }
      records.push(rec);
    }
  }
  return records;
}

export function toDbRecord(r: WorkbookRecord) {
  return {
    entity:r.entity, rid:r.rid, title:r.title, description:typeof r.data["Description"]==="string" ? r.data["Description"] : null,
    wps_id:r.wps_id ?? null, gate_id:r.gate_id ?? null, parent_id:r.parent_id ?? null, status:r.status ?? "Open",
    owner:r.owner ?? null, reviewer:r.reviewer ?? null, approver:r.approver ?? null, due_date:r.due_date ?? null,
    expiry_date:r.expiry_date ?? null, criticality:r.criticality ?? null, source_kind:"imported",
    applicability:r.applicability ?? null, evidence_ids:r.evidence_ids ?? [], acceptance_ids:r.acceptance_ids ?? [],
    rule_ids:r.rule_ids ?? [], links:r.links ?? [], doc_number:r.doc_number ?? null, revision:r.revision ?? null,
    issuer:r.issuer ?? null, department:r.department ?? null, data:r.data ?? {},
  };
}

export type MasterData = { departments:string[]; ownerRoles:string[]; mappings:Array<{department:string;ownerRole:string}>; appRoleMappings:Array<{department:string;appRole:"admin"|"reviewer"|"contributor"|"viewer"}> };
export function parseMasterData(buffer: ArrayBuffer): MasterData {
  const wb = xlsx.read(new Uint8Array(buffer), { cellDates:true, raw:true });
  const sheet = wb.Sheets["MASTER_DATA"];
  if (!sheet) return { departments:[], ownerRoles:[], mappings:[], appRoleMappings:[] };

  const rows = xlsx.utils.sheet_to_json<Record<string,unknown>>(sheet,{defval:null,raw:true});
  const keys = Object.keys(rows[0] ?? {});
  const findKey = (labels:string[], fallbackIndex?:number) =>
    keys.find(k => labels.some(label => k.trim().toLowerCase() === label.toLowerCase()))
    ?? (fallbackIndex === undefined ? undefined : keys[fallbackIndex]);

  const ownerKey=findKey(["Owners and Roles","Owner Role"],17);
  const deptKey=findKey(["Departments","Department"],18);
  const appRoleKey=findKey(["Application Role","App Role","User Role","System Role"]);

  const departments=[...new Set(rows.map(r=>String(deptKey ? r[deptKey] ?? "" : "").trim()).filter(Boolean))];
  const ownerRoles=[...new Set(rows.map(r=>String(ownerKey ? r[ownerKey] ?? "" : "").trim()).filter(Boolean))];

  const mappings=[...new Map(rows.map(r=>{
    const d=String(deptKey ? r[deptKey] ?? "" : "").trim();
    const o=String(ownerKey ? r[ownerKey] ?? "" : "").trim();
    return [d+"\u0000"+o,{department:d,ownerRole:o}] as const;
  }).filter(([,v])=>v.department&&v.ownerRole))].map(([,v])=>v);

  const validRoles = new Set(["admin","reviewer","contributor","viewer"]);
  const appRoleMappings=[...new Map(rows.map(r=>{
    const d=String(deptKey ? r[deptKey] ?? "" : "").trim();
    const role=String(appRoleKey ? r[appRoleKey] ?? "" : "").trim().toLowerCase();
    return [d+"\u0000"+role,{department:d,appRole:role as "admin"|"reviewer"|"contributor"|"viewer"}] as const;
  }).filter(([,v])=>v.department&&validRoles.has(v.appRole)))].map(([,v])=>v);

  return {departments,ownerRoles,mappings,appRoleMappings};
}
export function fingerprint(r: unknown): string {
  return JSON.stringify(r, Object.keys((r as Record<string,unknown>) ?? {}).sort());
}
