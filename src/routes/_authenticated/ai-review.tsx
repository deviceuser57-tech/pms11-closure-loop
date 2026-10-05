import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { FileCheck2, FileSearch, Loader2, Upload, ClipboardCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/badges";
import { supabase } from "@/integrations/supabase/client";
import { useRecords, type Rec } from "@/lib/records";
import { runEvidenceAssessment } from "@/lib/ai-assess.functions";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/ai-review")({
  staticData: { sitemap: false },
  head: () => ({ meta: [{ title: "AI Evidence Review — PMS 11 Closure Loop" }] }),
  component: AIReview,
});

type FileRow = { id: string; record_id: string; path: string; filename: string; size: number | null; created_at: string };

const REQUIREMENT_ENTITIES = ["rule", "wps", "gap", "task", "activity", "deliverable", "acceptance"] as const;

function AIReview() {
  const { all, isLoading } = useRecords();
  const { canEdit, canReview } = useAuth();
  const assess = useServerFn(runEvidenceAssessment);
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [entityFilter, setEntityFilter] = useState("all");
  const [selectedId, setSelectedId] = useState("");
  const [evidenceId, setEvidenceId] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [selectedFileId, setSelectedFileId] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  const requirements = useMemo(() => all
    .filter((r) => REQUIREMENT_ENTITIES.includes(r.entity as never))
    .filter((r) => entityFilter === "all" || r.entity === entityFilter)
    .filter((r) => `${r.rid} ${r.title} ${r.description ?? ""}`.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 250), [all, entityFilter, query]);

  const selected = all.find((r) => r.id === selectedId);
  const linkedAcceptance = selected?.acceptance_ids?.map((rid) => all.find((r) => r.entity === "acceptance" && r.rid === rid)).filter(Boolean) as Rec[] | undefined;
  const files = useQuery({
    queryKey: ["ai-review-files", selectedId],
    enabled: !!selectedId,
    queryFn: async () => {
      const { data, error } = await supabase.from("evidence_files").select("*").eq("record_id", selectedId).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as FileRow[];
    },
  });

  const currentFile = files.data?.find((f) => f.id === selectedFileId);

  const upload = async (file: File) => {
    if (!selected || !canEdit) return;
    setUploading(true);
    try {
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${selected.entity}/${selected.rid}/${Date.now()}-${safe}`;
      const { error } = await supabase.storage.from("evidence").upload(path, file);
      if (error) throw error;
      const { error: rowError } = await supabase.from("evidence_files").insert({ record_id: selected.id, path, filename: file.name, size: file.size } as never);
      if (rowError) throw rowError;
      await qc.invalidateQueries({ queryKey: ["ai-review-files", selected.id] });
      setPasteText("");
      toast.success("Evidence uploaded and indexed.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally { setUploading(false); }
  };

  const run = async () => {
    if (!selected || !canReview) return;
    if (!currentFile && !pasteText.trim()) return toast.error("Select existing evidence, upload a file, or paste document text.");
    setBusy(true);
    try {
      const out = await assess({ data: {
        requirementId: selected.id,
        filePath: currentFile?.path,
        evidenceText: pasteText.trim() || undefined,
        notes: "Dedicated AI Evidence Review. Assess only what is actually visible in the supplied evidence and compare it with every linked acceptance criterion. Advisory only; do not infer missing proof.",
      }});
      if ("error" in out && out.error) return toast.error(out.error);
      setResult((out as { result?: Record<string, unknown> }).result ?? null);
      toast.success("AI assessment completed — advisory only.");
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const saveReview = async () => {
    if (!selected || !result || !canReview) return;
    const verdict = String(result.verdict ?? "Insufficient Evidence");
    const summary = String(result.summary ?? "");
    const missing = Array.isArray(result.missing_proof) ? result.missing_proof.map(String).join("; ") : "none";
    const { error } = await supabase.from("reviews").insert({
      record_id: selected.id,
      kind: "ai",
      decision: `AI: ${verdict}`,
      comment: `${summary}\nMissing proof: ${missing}`,
      reviewer_name: "Lovable AI (advisory)",
    } as never);
    if (error) return toast.error(error.message);
    toast.success("AI advisory review saved to review history.");
    setResult(null);
  };

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading requirements…</p>;

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          <p className="label-caps">Reviewer workbench</p>
          <h1 className="font-display text-3xl font-semibold">AI Evidence Review</h1>
          <p className="text-sm text-muted-foreground">Structured evidence verification. AI is advisory and never replaces human gate approval.</p>
        </div>
        <FileSearch className="h-8 w-8 text-primary" />
      </header>

      <section className="maritime-card space-y-4 p-4">
        <h2 className="text-xs font-black uppercase tracking-widest text-muted-foreground">1. Select Requirement</h2>
        <div className="grid gap-3 md:grid-cols-[180px_1fr]">
          <Select value={entityFilter} onValueChange={setEntityFilter}>
            <SelectTrigger><SelectValue placeholder="Register" /></SelectTrigger>
            <SelectContent><SelectItem value="all">All Registers</SelectItem>{REQUIREMENT_ENTITIES.map(e => <SelectItem key={e} value={e}>{e.toUpperCase()}</SelectItem>)}</SelectContent>
          </Select>
          <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search RID, title, description…" />
        </div>
        <Select value={selectedId} onValueChange={(v) => { setSelectedId(v); setEvidenceId(""); setSelectedFileId(""); setResult(null); }}>
          <SelectTrigger><SelectValue placeholder="Choose a requirement" /></SelectTrigger>
          <SelectContent className="max-h-80">
            {requirements.map(r => <SelectItem key={r.id} value={r.id}>{r.rid} — {r.title}</SelectItem>)}
          </SelectContent>
        </Select>
        {selected && <div className="rounded-md border border-border bg-muted/30 p-3 text-sm space-y-2">
          <div className="flex flex-wrap gap-2"><span className="rid">{selected.rid}</span><StatusBadge value={selected.status} /><span className="text-muted-foreground">{selected.entity}</span></div>
          <p className="font-medium">{selected.title}</p>
          {selected.wps_id && <p className="text-xs text-muted-foreground">WPS package: {selected.wps_id}</p>}
          <div><span className="text-xs font-semibold uppercase tracking-wide">Linked acceptance criteria:</span>{linkedAcceptance?.length ? <ul className="mt-1 list-disc pl-5 text-xs">{linkedAcceptance.map(a => <li key={a.id}><span className="rid">{a.rid}</span> — {a.title}</li>)}</ul> : <p className="text-xs text-muted-foreground">None linked.</p>}</div>
        </div>}
      </section>

      {selected && <section className="maritime-card space-y-4 p-4">
        <h2 className="text-xs font-black uppercase tracking-widest text-muted-foreground">2. Ingest Evidence</h2>
        {canEdit && <div className="rounded-md border border-dashed border-border p-3">
          <Label htmlFor="ai-evidence-upload" className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-widest"><Upload className="h-4 w-4" />Upload New Evidence</Label>
          <input id="ai-evidence-upload" type="file" accept=".pdf,.png,.jpg,.jpeg,.txt,text/plain,application/pdf,image/png,image/jpeg" disabled={uploading} onChange={e => { const f=e.target.files?.[0]; if(f) void upload(f); e.currentTarget.value=""; }} className="w-full text-sm" />
          <p className="mt-1 text-[11px] text-muted-foreground">Stored in the private evidence bucket and indexed against {selected.rid}.</p>
        </div>}
        <div>
          <Label htmlFor="existing-evidence" className="text-xs font-bold uppercase tracking-widest">Select Existing Evidence</Label>
          <Select value={selectedFileId} onValueChange={setSelectedFileId}>
            <SelectTrigger id="existing-evidence" className="mt-1"><SelectValue placeholder="Choose an uploaded document" /></SelectTrigger>
            <SelectContent>{(files.data ?? []).map(f => <SelectItem key={f.id} value={f.id}>{f.filename}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="evidence-text" className="text-xs font-bold uppercase tracking-widest">Paste Document Text / Transmittal / Survey Notes</Label>
          <Textarea id="evidence-text" value={pasteText} onChange={e => setPasteText(e.target.value)} className="mt-1 min-h-32" placeholder="Paste certificate text, calibration values, NDT report excerpts, survey notes…" />
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={run} disabled={busy || (!currentFile && !pasteText.trim())}><Loader2 className={`mr-2 h-4 w-4 ${busy ? "animate-spin" : ""}`} />{busy ? "Assessing…" : "Run AI Evidence Check"}</Button>
          {currentFile && <span className="text-xs text-muted-foreground">Source: {currentFile.filename}</span>}
        </div>
      </section>}

      {result && <section className="maritime-card space-y-5 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1"><h2 className="text-xs font-black uppercase tracking-widest text-muted-foreground">3. Verification Result</h2><p className="mt-2 text-2xl font-display font-semibold">{String(result.verdict ?? "Insufficient Evidence")}</p></div>
          <div className="rounded-full border px-4 py-2 text-sm font-bold">{String(result.confidence ?? 0)}% confidence</div>
        </div>
        <div className="rounded-md border border-border bg-muted/20 p-3"><h3 className="text-xs font-black uppercase tracking-widest">Executive Assessment Summary</h3><p className="mt-2 text-sm">{String(result.summary ?? "—")}</p></div>
        <div><h3 className="mb-2 text-xs font-black uppercase tracking-widest">Criteria Matrix</h3><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-2">Criterion</th><th className="p-2">Status</th><th className="p-2">Proof / Justification</th></tr></thead><tbody>{Array.isArray(result.criteria) && result.criteria.map((c: any, i) => <tr key={i} className="border-b align-top"><td className="p-2 font-medium">{c.criterion}</td><td className="p-2"><StatusBadge value={String(c.met)} /></td><td className="p-2 text-muted-foreground">{c.reason}</td></tr>)}</tbody></table></div></div>
        <div><h3 className="mb-2 text-xs font-black uppercase tracking-widest">Identified Missing Proof</h3>{Array.isArray(result.missing_proof) && result.missing_proof.length ? <ul className="list-disc space-y-1 pl-5 text-sm">{result.missing_proof.map((x: unknown,i)=><li key={i}>{String(x)}</li>)}</ul> : <p className="text-sm text-muted-foreground">No missing proof identified by the advisory assessment.</p>}</div>
        <div><h3 className="mb-2 text-xs font-black uppercase tracking-widest">Recommended Corrective Actions</h3>{Array.isArray(result.recommended_actions) && result.recommended_actions.length ? <ol className="list-decimal space-y-1 pl-5 text-sm">{result.recommended_actions.map((x: unknown,i)=><li key={i}>{String(x)}</li>)}</ol> : <p className="text-sm text-muted-foreground">No corrective actions returned.</p>}</div>
        <div className="flex justify-end border-t pt-4"><Button onClick={saveReview} disabled={!canReview}><ClipboardCheck className="mr-2 h-4 w-4" />Save to Official Review History</Button></div>
      </section>}
    </div>
  );
}
