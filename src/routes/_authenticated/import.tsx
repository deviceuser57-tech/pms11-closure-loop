import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusBadge } from "@/components/badges";
import { getImportPreview, runImport } from "@/lib/import.functions";
import { useAuth } from "@/hooks/use-auth";
import { useInvalidateRecords } from "@/lib/records";
import { exportExcel } from "@/lib/export";

export const Route = createFileRoute("/_authenticated/import")({
  head: () => ({ meta: [{ title: "Workbook Import — PMS 11 Closure Loop" }] }),
  component: ImportPage,
});

function ImportPage() {
  const preview = useServerFn(getImportPreview);
  const run = useServerFn(runImport);
  const { isAdmin } = useAuth();
  const inval = useInvalidateRecords();
  const q = useQuery({ queryKey: ["import-preview"], queryFn: () => preview() });
  const [sel, setSel] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [showAll, setShowAll] = useState(false);
  const p = q.data;
  if (!p) return <p className="text-sm text-muted-foreground">{q.error ? String(q.error) : "Reading workbook…"}</p>;
  const chosen = sel ?? p.entities.map((e) => e.entity);
  const issues = showAll ? p.rowIssues : p.rowIssues.filter((r) => r.severity === "error").concat(p.rowIssues.filter((r) => r.severity !== "error").slice(0, 200));

  const go = async () => {
    setBusy(true);
    try { const r = await run({ data: { entities: chosen } }); setResult(r); toast.success(`Imported ${r.inserted} new items`); inval(); }
    catch (e) { toast.error((e as Error).message); }
    setBusy(false);
  };
  const download = (onlyRejected: boolean) =>
    exportExcel(onlyRejected ? "PMS11_rejected_rows.xlsx" : "PMS11_flagged_rows.xlsx", [{ name: onlyRejected ? "Rejected" : "Flagged", rows: p.rowIssues.filter((r) => !onlyRejected || r.severity === "error").map((r) => ({ Entity: r.entity, ID: r.rid, Title: r.title, Source: r.source, Severity: r.severity, Issues: r.issues.join(" | "), ...Object.fromEntries(Object.entries(r.data).map(([k, v]) => [k, String(v)])) })) }]);

  return (
    <div className="space-y-6">
      <header><p className="label-caps">Step-by-step</p><h1 className="font-display text-3xl font-semibold">Guided Workbook Import</h1><p className="text-sm text-muted-foreground">Source: {p.workbook}</p></header>

      <section className="maritime-card space-y-2 p-4"><p className="label-caps">1 · Model verification (from POWERPIVOT_VERIFICATION.json)</p>
        <div className="flex flex-wrap gap-2 text-xs">
          <StatusBadge value={`${p.verification.worksheet_tables} worksheet tables`} /><StatusBadge value={`${p.verification.planned_relationships} planned relationships`} /><StatusBadge value="0 schema errors" />
          <StatusBadge value="Embedded Power Pivot model: missing" /><StatusBadge value="VBA: not tested in Windows Excel" /><StatusBadge value="Model setup: NOT RUN" />
        </div>
        <p className="text-xs text-muted-foreground">Expected {p.config.expectedWps} WPS / {p.config.expectedRules} rules · found {p.found.wps} WPS / {p.found.rules} rules. The unrun model and untested macros are treated as unvalidated — only the table data is imported.</p>
      </section>

      <section className="maritime-card p-4"><p className="label-caps mb-2">2 · Map tables</p>
        <table className="w-full text-sm"><thead><tr className="border-b border-border"><th className="w-8" /><th className="label-caps py-1 text-left">Entity</th><th className="label-caps text-left">Source</th><th className="label-caps text-right">Workbook</th><th className="label-caps text-right">Derived</th><th className="label-caps text-left pl-4">Flags</th></tr></thead>
          <tbody>{p.entities.map((e) => (
            <tr key={e.entity} className="border-b border-border/50 align-top"><td className="py-1.5"><Checkbox checked={chosen.includes(e.entity)} onCheckedChange={(c) => setSel(c ? [...chosen, e.entity] : chosen.filter((x) => x !== e.entity))} /></td>
              <td className="font-medium">{e.entity}</td><td className="text-xs text-muted-foreground">{e.source}</td><td className="text-right font-mono">{e.imported}</td><td className="text-right font-mono">{e.derived}</td>
              <td className="pl-4"><div className="flex flex-wrap gap-1">{Object.entries(e.flags).map(([k, v]) => <StatusBadge key={k} value={`${k}: ${v}`} />)}</div></td></tr>))}</tbody></table>
        <p className="label-caps mt-4">Not imported</p>
        <ul className="text-xs text-muted-foreground">{p.notImported.map((n) => <li key={n.sheet}><b>{n.sheet}</b> — {n.reason}</li>)}</ul>
      </section>

      <section className="maritime-card space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2"><p className="label-caps">3 · Row-level validation</p><StatusBadge value={`${p.rejectedCount} rejected`} /><StatusBadge value={`${p.rowIssues.length - p.rejectedCount} warnings`} />
          <div className="ml-auto flex gap-2"><Button size="sm" variant="outline" onClick={() => download(true)}>Download rejected rows</Button><Button size="sm" variant="outline" onClick={() => download(false)}>Download all flagged rows</Button></div></div>
        <div className="max-h-80 overflow-auto"><table className="w-full text-xs"><tbody>{issues.map((r) => (
          <tr key={`${r.entity}:${r.rid}`} className="border-b border-border/40"><td className="py-1"><StatusBadge value={r.severity === "error" ? "Rejected" : "Warning"} /></td><td className="px-2 text-muted-foreground">{r.entity}</td><td className="rid">{r.rid}</td><td className="px-2">{r.issues.join(" · ")}</td></tr>))}</tbody></table></div>
        {!showAll && p.rowIssues.length > issues.length && <button className="text-xs text-primary underline" onClick={() => setShowAll(true)}>Show all {p.rowIssues.length}</button>}
      </section>

      <section className="maritime-card space-y-2 p-4"><p className="label-caps">4 · Import</p>
        <p className="text-xs text-muted-foreground">Rejected rows are skipped. Existing items are kept (your edits are never overwritten).</p>
        <Button disabled={!isAdmin || busy || !chosen.length} onClick={go}>{busy ? "Importing…" : "Import selected tables"}</Button>
        {!isAdmin && <p className="text-xs text-warning">Only Admins can run the import.</p>}
        {result && <pre className="rounded-sm bg-muted p-2 text-xs">{JSON.stringify(result, null, 2)}</pre>}
      </section>
    </div>
  );
}
