// PMS-11 scope reconciliation. Everything here is DERIVED (not in the source workbook)
// and is tagged source_kind = 'derived' so it is never confused with imported data.
export type SeedRecord = {
  entity: string;
  rid: string;
  title: string;
  description?: string;
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
  source_kind: string;
  evidence_ids?: string[];
  acceptance_ids?: string[];
  rule_ids?: string[];
  links?: string[];
  doc_number?: string;
  revision?: string;
  issuer?: string;
  data: Record<string, unknown>;
};

const D = (r: Omit<SeedRecord, "source_kind">): SeedRecord => ({ ...r, source_kind: "derived" });

type NewWps = { id: string; name: string; gate: string; objective: string; scope: string; activities: { title: string; tasks: string[] }[] };

const NEW_WPS: NewWps[] = [
  {
    id: "WPS-25",
    name: "Platform Interface",
    gate: "GATE-3",
    objective: "Verify platform/topsides interface and riser installation readiness for the 18-km pipeline project.",
    scope: "Riser clamps; spool-piece fabrication; subsea tie-in metrology; topside deck modifications; heavy lift of replacement equipment.",
    activities: [
      { title: "Riser clamp and riser installation engineering", tasks: ["Confirm riser clamp design and certification", "Approve riser installation procedure", "Verify crane capacity (HMC 5500) for riser handling"] },
      { title: "Spool-piece fabrication and tie-in metrology", tasks: ["Perform subsea tie-in metrology survey", "Fabricate and inspect spool pieces", "Dimensional control and NDT records"] },
      { title: "Topside deck modifications and heavy lift", tasks: ["Approve topside deck modification drawings", "Heavy-lift plan for replacement equipment", "Platform owner interface and SIMOPS approval"] },
    ],
  },
  {
    id: "WPS-26",
    name: "Shore Approach",
    gate: "GATE-3",
    objective: "Verify shore approach and landfall readiness (15 km offshore + 3 km onshore).",
    scope: "Beach pull-in winch; pulling head; cofferdam/trenching interface; near-shore shallow-water anchor pattern.",
    activities: [
      { title: "Beach pull-in system", tasks: ["Certify beach pull-in winch and wire", "Approve pulling head design and load test", "Pull-in force calculation and procedure"] },
      { title: "Cofferdam and trenching interface", tasks: ["Confirm cofferdam/trench design with onshore contractor", "Interface and permit-to-work matrix"] },
      { title: "Near-shore anchor pattern", tasks: ["Shallow-water anchor pattern design", "Seabed and bathymetry survey review", "Anchor-handling tug plan for near-shore"] },
    ],
  },
  {
    id: "WPS-27",
    name: "Pre-Commissioning and Hydrotest",
    gate: "GATE-8",
    objective: "Verify pipeline pre-commissioning and commissioning through to handover.",
    scope: "Flooding, cleaning, gauging/caliper pigging, hydrotesting, dewatering, nitrogen drying and handover.",
    activities: [
      { title: "Flooding, cleaning and gauging", tasks: ["Approve flooding and cleaning procedure", "Gauging / caliper pig run and report"] },
      { title: "Hydrotest", tasks: ["Hydrotest procedure and calibrated instruments", "Hydrotest execution and witnessed record"] },
      { title: "Dewatering, drying and handover", tasks: ["Dewatering and nitrogen drying procedure", "Dryness acceptance record", "Handover dossier and client acceptance"] },
    ],
  },
];

export function buildDerived(): SeedRecord[] {
  const out: SeedRecord[] = [];
  for (const w of NEW_WPS) {
    const n = w.id.slice(4);
    const ac = `AC-${w.id}`;
    out.push(D({ entity: "wps", rid: w.id, title: w.name, description: w.objective, wps_id: w.id, gate_id: w.gate, status: "Open", criticality: "High", acceptance_ids: [ac], data: { "Objective": w.objective, "Scope Included": w.scope, "Scope Note": "Added for the 18-km pipeline and platform project — not in source workbook." } }));
    out.push(D({ entity: "acceptance", rid: ac, title: `${w.name} verified complete and accepted by client / authority`, wps_id: w.id, parent_id: w.id, status: "Not Met", data: {} }));
    w.activities.forEach((a, i) => {
      const aid = `A-W${n}-${String(i + 1).padStart(2, "0")}`;
      out.push(D({ entity: "activity", rid: aid, title: a.title, wps_id: w.id, gate_id: w.gate, status: "Open", acceptance_ids: [ac], data: {} }));
      a.tasks.forEach((t, j) => {
        out.push(D({ entity: "task", rid: `T-W${n}-${String(i + 1).padStart(2, "0")}-${String(j + 1).padStart(2, "0")}`, title: t, wps_id: w.id, parent_id: aid, status: "Open", acceptance_ids: [ac], data: {} }));
      });
    });
  }

  const equipment: [string, string, string, string][] = [
    ["EQ-01", "HMC 5500 main crane", "280 MT @ 30 m radius, 55 m boom", "WPS-07"],
    ["EQ-02", "Link-Belt LS 718 crawler crane", "250 MT SWL, 160 ft (48.77 m) boom, 32 mm / 570 m wire", "WPS-07"],
    ["EQ-03", "CRC hydraulic pipe-lay spread", "Up to 30 in OD", "WPS-09"],
    ["EQ-04", "Holland CHT 50L 26 tensioner", "50 MT", "WPS-09"],
    ["EQ-05", "Welding stations (x4)", "Four welding stations on firing line", "WPS-09"],
    ["EQ-06", "Coating station", "One field-joint coating station", "WPS-09"],
    ["EQ-07", "X-ray station and X-ray crawler", "One X-ray station plus crawler", "WPS-09"],
    ["EQ-08", "Port-side air tugger winches (x4)", "25 MT each", "WPS-08"],
    ["EQ-09", "Survey / navigation suite", "Eiva NaviPac 3.10.5, 2 x Meridian gyrocompass, 2 x DGPS, BMS/TMS", "WPS-10"],
    ["EQ-10", "IMCA-compliant Air Diving Spread", "Permanent onboard air diving system (IMCA D014 / D023)", "WPS-12"],
    ["EQ-11", "Flipper Delta anchors (x8)", "8 x 7-ton, with rigging", "WPS-08"],
    ["EQ-12", "Gravity anchors (x8)", "8 x 55-ton, with rigging", "WPS-08"],
    ["EQ-13", "Lathe", "Machine shop", "WPS-13"],
    ["EQ-14", "Shaping machine", "Machine shop", "WPS-13"],
    ["EQ-15", "Gear trolley machine", "Machine shop", "WPS-13"],
    ["EQ-16", "DC power supply", "Machine shop / welding", "WPS-13"],
    ["EQ-17", "Bench vice", "Machine shop", "WPS-13"],
    ["EQ-18", "5-ton air tugger", "Machine shop / maintenance", "WPS-13"],
  ];
  for (const [rid, title, spec, wps] of equipment) {
    out.push(D({ entity: "equipment", rid, title, description: spec, wps_id: wps, status: "Certification to verify", data: { Specification: spec, Note: "From vessel particulars supplied by owner — certification evidence not yet linked." } }));
  }

  const scopeGaps: [string, string, string, string, string][] = [
    ["G-PMS-01", "Confirm helideck / winching area applicability", "Verify whether PMS-11 has an approved permanent helideck or winching area. If not, personnel transfer is by crew boat/tug and WPS-19 should be de-scoped by formal change.", "WPS-19", "GATE-7"],
    ["G-PMS-02", "Saturation diving R-046 applicability", "PMS-11's permanent spread is Air Diving only. R-046 is Project-Conditional — applies only if a modular saturation spread is mobilized.", "WPS-12", "GATE-7"],
    ["G-PMS-03", "Historical survey records under previous names", "Retrieve hull thickness and modification records under PETROJET 11 (2005), PETROJET 12 (2004), CLEVER TURTLE (1982).", "WPS-01", "GATE-1"],
    ["G-PMS-04", "Anchor load certification — Flipper Delta and gravity anchors", "Certify 8 x 7-ton Flipper Delta and 8 x 55-ton gravity anchors, rigging, and AHT deployment procedures.", "WPS-08", "GATE-3"],
    ["G-PMS-05", "Machine-shop equipment certification and guarding", "Certify lathe, shaping machine, gear trolley machine, DC power supply, bench vice, 5-ton air tugger; guarding, hot-work isolations and calibration.", "WPS-13", "GATE-7"],
  ];
  for (const [rid, title, desc, wps, gate] of scopeGaps) {
    out.push(D({ entity: "gap", rid, title, description: desc, wps_id: wps, gate_id: gate, status: "Open", criticality: rid === "G-PMS-02" ? "Medium" : "High", data: { "Gap Category": "PMS-11 scope reconciliation" } }));
  }
  return out;
}

// Patches applied on top of imported workbook rows (kept source_kind = imported, annotated).
export const RECONCILIATION: Record<string, { note: string; applicability?: string; status?: string }> = {
  "wps:WPS-01": { note: "Include historical survey records under previous names (PETROJET 11, PETROJET 12, CLEVER TURTLE) for hull thickness and modification tracking." },
  "wps:WPS-02": { note: "Identity basis includes previous names: PETROJET 11 (2005), PETROJET 12 (2004), CLEVER TURTLE (1982)." },
  "wps:WPS-08": { note: "Covers 8 x 7-ton Flipper Delta anchors AND 8 x 55-ton gravity anchors, rigging, load certification and deployment via anchor-handling tugs." },
  "wps:WPS-12": { note: "Scoped to Air Diving only (IMCA D014 / D023). Saturation diving is Project-Conditional." },
  "wps:WPS-13": { note: "Includes machine-shop equipment certification, machine-tool guarding, hot-work/welding isolations and calibration (lathe, shaping machine, gear trolley machine, DC power supply, bench vice, 5-ton air tugger)." },
  "wps:WPS-19": { note: "Scope confirmation required: verify approved permanent helideck/winching area. If none, personnel transfer is by crew boat/tug — de-scope by change.", applicability: "Scope Confirmation Required" },
  "rule:R-046": { note: "Saturation diving — Project-Conditional. Applies only if a modular saturation spread is mobilized; does not create an uncloseable gap.", applicability: "Project-Conditional", status: "Not Applicable" },
};
