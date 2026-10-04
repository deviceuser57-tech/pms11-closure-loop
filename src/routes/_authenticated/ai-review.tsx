import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { FileSearch, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/badges";
import { supabase } from "@/integrations/supabase/client";
import { useRecords, type Rec } from "@/lib/records";
import { runEvidenceAssessment } from "@/lib/ai-assess.functions";

export const Route = createFileRoute("/_authenticated/ai-review")({
  head: () => ({ meta: [{ title: "AI Evidence Review — PMS 11 Closure Loop" }] }),
  component: AIReview,
});

type FileRow = { id: string; record_id: string; path: string; filename: string; size: number | null; created_at: string };

function AIReview() {
  const { all, isLoading } = useRecords();
  const assess = useServerFn(runEvidenceAssessment);
  const [busy, setBusy] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, Record<string, unknown>>>({});
  const files = useQuery({
    queryKey: ["ai-review-files"],
    queryFn: async () => {
      const { data, error } = await supabase.from("evidence_files").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as FileRow[];
    },
  });

  const byId = new Map(all.map((r) => [r.id, r]));
  const rows = (files.data ?? []).map((f) => ({ file: f, record: byId.get(f.record_id) })).filter((x): x is { file: FileRow; record: Rec } => !!x.record);

  const run = async (file: FileRow, record: Rec) => {
    setBusy(file.id);
    try {
      const out = await assess({ data: { requirementId: record.id, filePath: file.path, notes: "Dedicated AI Evidence Review. Assess only what is actually visible in the evidence and compare it with linked acceptance criteria." } });
      if ("error" in out && out.error) return toast.error(out.error);
      setResults((p) => ({ ...p, [file.id]: (out as { result?: Record<string, unknown> }).result ?? {} }));
      toast.success("AI review completed — advisory only.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  if (isLoading || files.isLoading) return <p className="text-sm text-muted-foreground">Loading evidence review queue…</p>;

  return (
    <div className="space-y-5">
      <header className="flex items-end justify-between gap-4">
        <div><p className="label-caps">Reviewer workbench</p><h1 className="font-display text-3xl font-semibold">AI Evidence Review</h1><p className="text-sm text-muted-foreground">AI is advisory. It never replaces human review or the closure gate.</p></div>
        <FileSearch className="h-7 w-7 text-primary" />
      </header>
      {!rows.length ? <div className="maritime-card p-6 text-sm text-muted-foreground">No uploaded evidence files are available for AI review yet.</div> : (
        <div className="space-y-3">
          {rows.map(({ file, record }) => {
            const result = results[file.id];
            return <article key={file.id} className="maritime-card space-y-3 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rid">{record.rid}</span><span className="font-medium">{file.filename}</span><StatusBadge value={record.status} />
                <span className="ml-auto text-xs text-muted-foreground">{new Date(file.created_at).toLocaleString()}</span>
                <Button size="sm" onClick={() => run(file, record)} disabled={busy === file.id}>{busy === file.id ? <><RefreshCw className="mr-1 h-3.5 w-3.5 animate-spin" />Assessing</> : "Run AI review"}</Button>
              </div>
              <p className="text-xs text-muted-foreground">{record.title}</p>
              {result && <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-xs space-y-2">
                <p><b>Verdict:</b> {String(result.verdict ?? "—")} · <b>Confidence:</b> {String(result.confidence ?? "—")}%</p>
                <p>{String(result.summary ?? "")}</p>
                <div><b>Missing proof:</b> {Array.isArray(result.missing_proof) ? result.missing_proof.map(String).join(" · ") || "None" : "—"}</div>
                <div><b>Recommended actions:</b> {Array.isArray(result.recommended_actions) ? result.recommended_actions.map(String).join(" · ") || "None" : "—"}</div>
                <div><b>Criteria:</b> {Array.isArray(result.criteria) ? result.criteria.map((x: any) => `${x.criterion}: ${x.met} — ${x.reason}`).join(" | ") : "—"}</div>
              </div>}
            </article>;
          })}
        </div>
      )}
    </div>
  );
}
