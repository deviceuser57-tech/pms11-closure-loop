import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { FileSearch, RefreshCw, Upload, Save, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/badges";
import { supabase } from "@/integrations/supabase/client";
import { useRecords, type Rec } from "@/lib/records";
import { runEvidenceAssessment } from "@/lib/ai-assess.functions";

export const Route = createFileRoute("/_authenticated/ai-review")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "AI Evidence Review — PMS 11 Closure Loop" },
      { name: "description", content: "Evidence verification workbench for PMS-11 requirements and acceptance criteria." },
    ],
  }),
  component: AIReview,
});

type FileRow = {
  id: string;
  record_id: string;
  path: string;
  filename: string;
  category?: string | null;
  size: number | null;
  created_at: string;
};

type Assessment = {
  verdict?: string;
  confidence?: number;
  summary?: string;
  criteria?: { criterion: string; met: string; reason: string }[];
  missing_proof?: string[];
  recommended_actions?: string[];
};

const REGISTERS = [
  ["rule", "Rules"],
  ["wps", "Work Packages"],
  ["gap", "Findings & CAPA"],
  ["task", "Tasks"],
  ["acceptance", "Acceptance Criteria"],
] as const;

const verdictClass: Record<string, string> = {
  Compliant: "border-success/40 bg-success/10 text-success",
  "Partially Compliant": "border-amber-500/40 bg-amber-500/10 text-amber-700",
  "Non-Compliant": "border-destructive/40 bg-destructive/10 text-destructive",
  "Insufficient Evidence": "border-border bg-muted text-muted-foreground",
};

function AIReview() {
  const { all, isLoading } = useRecords();
  const assess = useServerFn(runEvidenceAssessment);
  const [register, setRegister] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [evidenceText, setEvidenceText] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [assessmentSource, setAssessmentSource] = useState("");
  const [selectedFileId, setSelectedFileId] = useState("");

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all
      .filter((r) => register === "all" || r.entity === register)
      .filter((r) => !q || `${r.rid} ${r.title} ${r.description ?? ""} ${r.wps_id ?? ""}`.toLowerCase().includes(q))
      .sort((a, b) => a.rid.localeCompare(b.rid))
      .slice(0, 250);
  }, [all, register, query]);

  const selected = all.find((r) => r.id === selectedId) ?? null;

  const files = useQuery({
    queryKey: ["ai-review-files", selectedId],
    enabled: Boolean(selectedId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("evidence_files")
        .select("id,record_id,path,filename,category,size,created_at")
        .eq("record_id", selectedId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as FileRow[];
    },
  });

  const criteria = useMemo(
    () => (selected?.acceptance_ids ?? []).map((rid) => all.find((r) => r.entity === "acceptance" && r.rid === rid)).filter(Boolean) as Rec[],
    [all, selected],
  );

  const selectRequirement = (id: string) => {
    setSelectedId(id);
    setAssessment(null);
    setAssessmentSource("");
    setSelectedFileId("");
    setEvidenceText("");
  };

  const upload = async (file: File) => {
    if (!selected) return;
    if (!["application/pdf", "image/png", "image/jpeg", "text/plain"].includes(file.type) && !/\.(pdf|png|jpe?g|txt|md|csv|json)$/i.test(file.name)) {
      toast.error("Only PDF, PNG/JPG, or text evidence is accepted.");
      return;
    }
    setUploading(true);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${selected.entity}/${selected.rid}/${Date.now()}-${safeName}`;
      const { error } = await supabase.storage.from("evidence").upload(path, file, { upsert: false, contentType: file.type || undefined });
      if (error) throw error;
      const { error: rowError } = await supabase.from("evidence_files").insert({
        record_id: selected.id,
        path,
        filename: file.name,
        category: "AI Review Evidence",
        size: file.size,
      } as never);
      if (rowError) throw rowError;
      await files.refetch();
      setEvidenceText("");
      toast.success("Evidence uploaded and indexed.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  };

  const run = async () => {
    if (!selected) return;
    const file = (files.data ?? []).find((x) => x.id === selectedFileId);
    if (!file && !evidenceText.trim()) {
      toast.error("Select an existing evidence file, upload one, or paste evidence text.");
      return;
    }
    setBusy(true);
    try {
      const out = await assess({
        data: {
          requirementId: selected.id,
          filePath: file?.path,
          evidenceText: file ? undefined : evidenceText.trim(),
          notes: "Dedicated AI Evidence Review. Assess only what is actually visible in the supplied evidence. Do not infer missing certification, validity, identity, signatures, stamps, test results, or acceptance.",
        },
      });
      if ("error" in out && out.error) {
        toast.error(out.error);
        return;
      }
      const result = (out as { result?: Assessment }).result ?? {};
      setAssessment(result);
      setAssessmentSource(file?.filename ?? "Pasted document text");
      toast.success("AI review completed — advisory only.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const saveReview = async () => {
    if (!selected || !assessment) return;
    setSaving(true);
    try {
      const comment = [
        "AI advisory assessment.",
        `Source: ${assessmentSource}`,
        `Confidence: ${assessment.confidence ?? 0}%`,
        assessment.summary ?? "",
        assessment.criteria?.length ? "Criteria: " + assessment.criteria.map((c) => `${c.criterion}: ${c.met} — ${c.reason}`).join(" | ") : "",
        assessment.missing_proof?.length ? "Missing proof: " + assessment.missing_proof.join("; ") : "Missing proof: none identified.",
        assessment.recommended_actions?.length ? "Recommended actions: " + assessment.recommended_actions.join("; ") : "",
      ].filter(Boolean).join("\n");
      const { error } = await supabase.from("reviews").insert({
        record_id: selected.id,
        kind: "ai",
        decision: `AI: ${assessment.verdict ?? "Insufficient Evidence"}`,
        comment,
        reviewer_name: "Lovable AI (advisory)",
      } as never);
      if (error) throw error;
      toast.success("AI advisory review saved to official review history.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading PMS-11 requirement registers…</p>;

  return (
    <div className="space-y-5">
      <header className="flex items-end justify-between gap-4">
        <div>
          <p className="label-caps">Reviewer workbench</p>
          <h1 className="font-display text-3xl font-semibold">AI Evidence Review</h1>
          <p className="text-sm text-muted-foreground">Structured, evidence-bound verification. AI is advisory and never replaces human review or the closure gate.</p>
        </div>
        <FileSearch className="h-7 w-7 text-primary" />
      </header>

      <section className="maritime-card space-y-4 p-4">
        <h2 className="text-xs font-black uppercase tracking-widest text-muted-foreground">1. Select Requirement</h2>
        <div className="grid gap-3 md:grid-cols-[180px_1fr]">
          <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" value={register} onChange={(e) => { setRegister(e.target.value); setSelectedId(""); setAssessment(null); }}>
            <option value="all">All registers</option>
            {REGISTERS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search RID, title, WPS, scope…" />
          </div>
        </div>
        <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={selectedId} onChange={(e) => selectRequirement(e.target.value)}>
          <option value="">Select a requirement…</option>
          {candidates.map((r) => <option key={r.id} value={r.id}>[{r.rid}] {r.title} — {r.entity}</option>)}
        </select>

        {selected && (
          <div className="rounded-md border border-primary/20 bg-primary/5 p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rid">{selected.rid}</span>
              <StatusBadge value={selected.status} />
              {selected.wps_id ? <span className="rid">{selected.wps_id}</span> : null}
              {selected.gate_id ? <span className="rid">{selected.gate_id}</span> : null}
            </div>
            <p className="mt-2 font-medium">{selected.title}</p>
            {selected.description ? <p className="mt-1 text-xs text-muted-foreground">{selected.description}</p> : null}
            <div className="mt-3">
              <h3 className="mb-1 text-xs font-black uppercase tracking-widest text-muted-foreground">Linked Acceptance Criteria</h3>
              {criteria.length ? <ul className="space-y-1 text-xs">{criteria.map((c) => <li key={c.id}><span className="rid mr-2">{c.rid}</span>{c.title} <StatusBadge value={c.status} /></li>)}</ul> : <p className="text-xs text-destructive">No linked acceptance_ids found on this requirement.</p>}
            </div>
          </div>
        )}
      </section>

      {selected && (
        <>
          <section className="maritime-card space-y-4 p-4">
            <h2 className="text-xs font-black uppercase tracking-widest text-muted-foreground">2. Ingest Evidence</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">Upload New Evidence</h3>
                <input type="file" accept=".pdf,.png,.jpg,.jpeg,.txt,.md,.csv,.json,image/png,image/jpeg,application/pdf,text/plain" disabled={uploading} onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.currentTarget.value = ""; }} />
                <p className="text-[11px] text-muted-foreground">Stored in the private <b>evidence</b> bucket and indexed in <b>evidence_files</b>.</p>
              </div>
              <div className="space-y-2">
                <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">Existing Evidence</h3>
                <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={selectedFileId} onChange={(e) => { setSelectedFileId(e.target.value); setEvidenceText(""); }}>
                  <option value="">Select attached evidence…</option>
                  {(files.data ?? []).map((f) => <option key={f.id} value={f.id}>{f.filename}</option>)}
                </select>
                {files.isLoading ? <p className="text-xs text-muted-foreground">Loading attached evidence…</p> : null}
              </div>
            </div>
            <div className="space-y-2">
              <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">Document Excerpt / Transmittal Text</h3>
              <Textarea disabled={Boolean(selectedFileId)} value={evidenceText} onChange={(e) => setEvidenceText(e.target.value)} placeholder="Paste certificate text, calibration values, NDT findings, survey notes, transmittal text, or other evidence excerpt…" rows={8} />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={uploading}><Upload className="mr-1 h-4 w-4" />{uploading ? "Uploading…" : "Upload above"}</Button>
              <Button onClick={() => void run()} disabled={busy || (!selectedFileId && !evidenceText.trim())}>
                {busy ? <><RefreshCw className="mr-1 h-4 w-4 animate-spin" />Assessing</> : "Run AI Evidence Check"}
              </Button>
            </div>
          </section>

          {assessment && (
            <section className="space-y-4">
              <div className={`rounded-md border p-4 ${verdictClass[assessment.verdict ?? ""] ?? verdictClass["Insufficient Evidence"]}`}>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-lg font-black">{assessment.verdict ?? "Insufficient Evidence"}</span>
                  <span className="text-sm font-bold">Confidence: {assessment.confidence ?? 0}%</span>
                  <span className="ml-auto text-xs">Source: {assessmentSource}</span>
                </div>
                <p className="mt-2 text-sm">{assessment.summary ?? "No executive summary returned."}</p>
              </div>

              <div className="maritime-card space-y-3 p-4">
                <h2 className="text-xs font-black uppercase tracking-widest text-muted-foreground">Criteria Matrix</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead><tr className="border-b"><th className="p-2">Criterion</th><th className="p-2">Status</th><th className="p-2">Evidence / Justification</th></tr></thead>
                    <tbody>{(assessment.criteria ?? []).map((c, i) => <tr key={i} className="border-b last:border-0"><td className="p-2 font-medium">{c.criterion}</td><td className="p-2 whitespace-nowrap">{c.met}</td><td className="p-2">{c.reason}</td></tr>)}</tbody>
                  </table>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="maritime-card p-4"><h2 className="mb-2 text-xs font-black uppercase tracking-widest text-muted-foreground">Identified Missing Proof</h2><ul className="list-disc space-y-1 pl-5 text-sm">{(assessment.missing_proof?.length ? assessment.missing_proof : ["None identified by the model."]).map((x, i) => <li key={i}>{x}</li>)}</ul></div>
                <div className="maritime-card p-4"><h2 className="mb-2 text-xs font-black uppercase tracking-widest text-muted-foreground">Recommended Corrective Actions</h2><ol className="list-decimal space-y-1 pl-5 text-sm">{(assessment.recommended_actions?.length ? assessment.recommended_actions : ["No corrective action returned."]).map((x, i) => <li key={i}>{x}</li>)}</ol></div>
              </div>

              <div className="flex justify-end">
                <Button variant="outline" onClick={() => void saveReview()} disabled={saving}><Save className="mr-1 h-4 w-4" />{saving ? "Saving…" : "Save Advisory Review to History"}</Button>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
