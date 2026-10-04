import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus } from "lucide-react";
import { RecordTable, type Col } from "@/components/RecordTable";
import { StatusBadge } from "@/components/badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
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
  const { of, get, isLoading, refetch } = useRecords();
  const { canEdit } = useAuth();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", owner: "", due_date: "", criticality: "Medium" });
  const rows = of(entity);
  const ownerValues = [...new Set(of("responsibility").flatMap(x => {
    const d = (x.data ?? {}) as Record<string, unknown>;
    return [x.owner, d["Owner Department"], d["Responsible Department"], d["Department"]].filter((v): v is string => typeof v === "string" && v.trim().length > 0 && !/^(tbc|to be assigned|rule\/wps owner)$/i.test(v.trim()));
  }).concat(of("rule").map(x => x.owner).filter((v): v is string => !!v && !/^(tbc|to be assigned|rule\/wps owner)$/i.test(v.trim()))))].sort((a,b)=>a.localeCompare(b));
  const [title, sub] = TITLES[entity] ?? [ENTITY_LABEL[entity] ?? entity, ""];
  const ev: Col = { key: "ev", label: "Evidence", width: "w-24", render: (r) => { const s = evidenceState(r, get); return <span className="font-mono text-xs">{s.valid}/{s.total}</span>; } };
  const cols: Col[] | undefined =
    entity === "evidence" ? [{ key: "rid", label: "ID", width: "w-24" }, { key: "title", label: "Document" }, { key: "doc_number", label: "Doc no.", width: "w-24" }, { key: "issuer", label: "Issuer", width: "w-40" }, { key: "expiry_date", label: "Expiry", width: "w-24" }, { key: "status", label: "Status", width: "w-28" }]
    : entity === "gate" ? [{ key: "rid", label: "Gate", width: "w-24" }, { key: "title", label: "Name" }, { key: "nogo", label: "No-Go", width: "w-24", render: (r) => r.no_go_active ? <StatusBadge value="No-Go" /> : <span className="text-xs text-muted-foreground">—</span> }, { key: "status", label: "Decision", width: "w-28" }]
    : entity === "gap" ? [{ key: "rid", label: "ID", width: "w-24" }, { key: "title", label: "Finding" }, { key: "criticality", label: "Criticality", width: "w-24", render: (r) => <StatusBadge value={r.criticality} /> }, { key: "owner", label: "Owner", width: "w-36" }, { key: "due_date", label: "Due", width: "w-24" }, ev, { key: "status", label: "Status", width: "w-28" }]
    : ["rule", "wps", "task"].includes(entity) ? [{ key: "rid", label: "ID", width: "w-28" }, { key: "title", label: "Title" }, { key: entity === "wps" ? "gate_id" : "wps_id", label: entity === "wps" ? "Gate" : "WPS", width: "w-20" }, { key: "owner", label: "Owner", width: "w-36" }, ev, { key: "status", label: "Status", width: "w-28" }]
    : undefined;
  const createChange = async () => {
    if (!form.title.trim()) return toast.error("Change title is required.");
    const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
    const rid = `CHG-${stamp}`;
    const { error } = await supabase.from("records").insert({
      entity: "change", rid, title: form.title.trim(), description: form.description.trim() || null,
      owner: form.owner.trim() || null, due_date: form.due_date || null, criticality: form.criticality,
      status: "Raised", source_kind: "user", review_status: "Pending", data: { "Change Request": "Created in Changes Register" },
    } as never);
    if (error) return toast.error(error.message);
    toast.success(`${rid} created`); setForm({ title: "", description: "", owner: "", due_date: "", criticality: "Medium" }); setShowCreate(false); refetch();
  };
  return (
    <div className="space-y-4">
      <header className="flex items-end justify-between gap-4"><div><h1 className="font-display text-3xl font-semibold">{title}</h1><p className="text-sm text-muted-foreground">{sub}</p></div>{entity === "change" && canEdit && <Button onClick={() => setShowCreate((v) => !v)}><Plus className="mr-1 h-4 w-4" />New Change Request</Button>}</header>
      {entity === "change" && showCreate && canEdit && <div className="maritime-card grid gap-3 p-4 md:grid-cols-2"><div className="space-y-1 md:col-span-2"><label className="label-caps">Change title *</label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Describe the proposed change" /></div><div className="space-y-1 md:col-span-2"><label className="label-caps">Description / rationale</label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div><div className="space-y-1"><label className="label-caps">Owner / Department</label><Select value={form.owner} onValueChange={(v) => setForm({ ...form, owner: v })}><SelectTrigger><SelectValue placeholder="Select owner / department" /></SelectTrigger><SelectContent>{ownerValues.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1"><label className="label-caps">Due date</label><Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></div><div className="space-y-1"><label className="label-caps">Criticality</label><Input value={form.criticality} onChange={(e) => setForm({ ...form, criticality: e.target.value })} /></div><div className="flex items-end"><Button onClick={createChange}>Create Change Request</Button></div></div>}
      {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : !rows.length ? <p className="maritime-card p-6 text-sm text-muted-foreground">No data yet. An Admin can load the workbook from Workbook Import.</p> : <RecordTable title={title} rows={rows} cols={cols} filters={entity === "gap" ? ["vessel", "status", "owner", "wps", "due", "closure"] : undefined} />}
    </div>
  );
}
