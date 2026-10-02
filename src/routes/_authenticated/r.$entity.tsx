import { createFileRoute } from "@tanstack/react-router";
import { RecordTable, type Col } from "@/components/RecordTable";
import { StatusBadge } from "@/components/badges";
import { ENTITY_LABEL, evidenceState, useRecords } from "@/lib/records";

export const Route = createFileRoute("/_authenticated/r/$entity")({
  head: ({ params }) => ({ meta: [{ title: `${ENTITY_LABEL[params.entity] ?? "Register"} — PMS 11 Closure Loop` }] }),
  component: Register,
});

const TITLES: Record<string, [string, string]> = {
  rule: ["Rules Register", "89 rules from the workbook, linked to WPS, evidence, acceptance and gates."],
  wps: ["Work Packages", "24 workbook WPS plus derived WPS-25 to WPS-27 for the 18-km pipeline project."],
  gap: ["Findings & Corrective Actions", "Closure tracker — owners, due dates, status and supporting evidence. Closure is blocked until all conditions are met."],
  task: ["Tasks", "Execution layer linked to activities and WPS."],
  evidence: ["Evidence & Documents", "Required, submitted, in review, accepted, rejected and expired evidence. Upload files on each item."],
  gate: ["Gates GATE-0 to GATE-8", "Requirements, No-Go conditions and Go/No-Go decision history."],
  responsibility: ["Responsibilities", "RACI by WPS, activity and rule."],
  risk: ["Risks & Assumptions", "Workbook risk and assumption register."],
  change: ["Changes", "Change register (empty in workbook)."],
  equipment: ["Vessel & Equipment", "Equipment from vessel particulars — derived, certification evidence to be linked."],
};

function Register() {
  const { entity } = Route.useParams();
  const { of, get, isLoading } = useRecords();
  const rows = of(entity);
  const [title, sub] = TITLES[entity] ?? [ENTITY_LABEL[entity] ?? entity, ""];
  const ev: Col = { key: "ev", label: "Evidence", width: "w-24", render: (r) => { const s = evidenceState(r, get); return <span className="font-mono text-xs">{s.valid}/{s.total}</span>; } };
  const cols: Col[] | undefined =
    entity === "evidence" ? [{ key: "rid", label: "ID", width: "w-24" }, { key: "title", label: "Document" }, { key: "doc_number", label: "Doc no.", width: "w-24" }, { key: "issuer", label: "Issuer", width: "w-40" }, { key: "expiry_date", label: "Expiry", width: "w-24" }, { key: "status", label: "Status", width: "w-28" }]
    : entity === "gate" ? [{ key: "rid", label: "Gate", width: "w-24" }, { key: "title", label: "Name" }, { key: "nogo", label: "No-Go", width: "w-24", render: (r) => r.no_go_active ? <StatusBadge value="No-Go" /> : <span className="text-xs text-muted-foreground">—</span> }, { key: "status", label: "Decision", width: "w-28" }]
    : entity === "gap" ? [{ key: "rid", label: "ID", width: "w-24" }, { key: "title", label: "Finding" }, { key: "criticality", label: "Criticality", width: "w-24", render: (r) => <StatusBadge value={r.criticality} /> }, { key: "owner", label: "Owner", width: "w-36" }, { key: "due_date", label: "Due", width: "w-24" }, ev, { key: "status", label: "Status", width: "w-28" }]
    : ["rule", "wps", "task"].includes(entity) ? [{ key: "rid", label: "ID", width: "w-28" }, { key: "title", label: "Title" }, { key: entity === "wps" ? "gate_id" : "wps_id", label: entity === "wps" ? "Gate" : "WPS", width: "w-20" }, { key: "owner", label: "Owner", width: "w-36" }, ev, { key: "status", label: "Status", width: "w-28" }]
    : undefined;
  return (
    <div className="space-y-4">
      <header><h1 className="font-display text-3xl font-semibold">{title}</h1><p className="text-sm text-muted-foreground">{sub}</p></header>
      {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : !rows.length ? <p className="maritime-card p-6 text-sm text-muted-foreground">No data yet. An Admin can load the workbook from Workbook Import.</p> : <RecordTable title={title} rows={rows} cols={cols} filters={entity === "gap" ? ["vessel", "status", "owner", "wps", "due", "closure"] : undefined} />}
    </div>
  );
}
