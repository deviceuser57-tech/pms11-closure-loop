import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { closureClass, isExpired, isOverdue, useRecords } from "@/lib/records";
import { exportExcel, exportPdf } from "@/lib/export";

export const Route = createFileRoute("/_authenticated/audit")({
  staticData: { sitemap: false },
  head: () => ({ meta: [{ title: "Audit & Reports — PMS 11 Closure Loop" }, { name: "description", content: "Change history, rule-to-evidence traceability and Excel/PDF readiness reports for the PMS 11 closure loop." }] }),
  component: AuditPage,
});

function AuditPage() {
  const { all, of, get } = useRecords();
  const log = useQuery({ queryKey: ["audit"], queryFn: async () => (await supabase.from("audit_log").select("*").order("at", { ascending: false }).limit(500)).data ?? [] });
  const gaps = of("gap").filter((g) => g.status !== "Closed");
  const trace = of("rule").flatMap((r) => {
    const acts = of("activity").filter((a) => a.rule_ids.includes(r.rid));
    return (acts.length ? acts : [null]).map((a) => ({ Rule: r.rid, WPS: r.wps_id, Activity: a?.rid ?? "", Tasks: a ? of("task").filter((t) => t.parent_id === a.rid).map((t) => t.rid).join(", ") : "", Evidence: r.evidence_ids.join(", "), Acceptance: r.acceptance_ids.join(", "), Gate: r.wps_id ? get("wps", r.wps_id)?.gate_id ?? "" : "", Status: r.status }));
  });
  const rows = (xs: typeof all) => xs.map((r) => ({ ID: r.rid, Title: r.title, WPS: r.wps_id, Gate: r.gate_id, Owner: r.owner, Due: r.due_date, Status: r.status, Evidence: r.evidence_ids.join(", ") }));
  const sheets = [
    { name: "Executive", rows: [{ Items: all.length, Completed: all.filter((r) => closureClass(r, get) === "completed").length, OpenGaps: gaps.length, Overdue: all.filter(isOverdue).length, EvidenceRequired: of("evidence").filter((e) => e.status === "Required").length, EvidenceExpired: of("evidence").filter(isExpired).length, PowerPivotModel: "NOT RUN" }] },
    { name: "Open gaps", rows: rows(gaps) },
    { name: "Evidence required-expired", rows: rows(of("evidence").filter((e) => e.status === "Required" || isExpired(e))) },
    { name: "WPS status", rows: rows(of("wps")) },
    { name: "Gate status", rows: of("gate").map((g) => ({ Gate: g.rid, Name: g.title, Status: g.status, NoGo: g.no_go_active })) },
    { name: "Overdue CAPA", rows: rows(gaps.filter(isOverdue)) },
    { name: "Traceability", rows: trace },
  ];
  const pdf = () => exportPdf("PMS 11 Executive Readiness Report", sheets.slice(0, 6).map((s) => ({ heading: s.name, head: Object.keys(s.rows[0] ?? { Note: "" }), body: s.rows.slice(0, 80).map((r) => Object.values(r).map((v) => String(v ?? ""))) })));
  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between"><h1 className="font-display text-3xl font-semibold">Audit & Reports</h1>
        <div className="flex gap-2"><Button variant="outline" onClick={() => exportExcel("PMS11_reports.xlsx", sheets)}>Export Excel</Button><Button onClick={pdf}>Export PDF</Button></div></header>
      <section className="maritime-card p-4"><p className="label-caps mb-2">Change history (owners, due dates, statuses, evidence links)</p>
        <div className="max-h-[60vh] overflow-auto"><table className="w-full text-xs"><thead><tr className="border-b border-border"><th className="label-caps py-1 text-left">When</th><th className="label-caps text-left">Item</th><th className="label-caps text-left">Action</th><th className="label-caps text-left">Status</th><th className="label-caps text-left">Changes</th></tr></thead>
          <tbody>{(log.data ?? []).map((l) => (
            <tr key={l.id} className="border-b border-border/40 align-top"><td className="py-1 text-muted-foreground">{new Date(l.at).toLocaleString()}</td><td><span className="rid">{l.rid}</span> <span className="text-muted-foreground">{l.entity}</span></td><td>{l.action}</td><td>{l.old_status ?? ""}{l.new_status && l.old_status !== l.new_status ? ` → ${l.new_status}` : ""}</td><td className="font-mono text-[10px] text-muted-foreground">{l.detail ? JSON.stringify(l.detail) : ""}</td></tr>))}
            {!log.data?.length && <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">No changes recorded yet.</td></tr>}</tbody></table></div>
      </section>
    </div>
  );
}
