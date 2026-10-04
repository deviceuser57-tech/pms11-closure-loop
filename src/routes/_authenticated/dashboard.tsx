import { createFileRoute, Link } from "@tanstack/react-router";
import { StatusBadge } from "@/components/badges";
import { useRecordSheet } from "@/components/RecordSheet";
import { CLOSABLE, closureClass, isExpired, isOverdue, useRecords } from "@/lib/records";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Command Center — PMS 11 Closure Loop" }] }),
  component: Dashboard,
});

function Kpi({ label, value, sub, tone }: { label: string; value: string | number; sub?: string; tone?: string }) {
  return <div className="maritime-card p-4"><p className="label-caps">{label}</p><p className={`font-display text-4xl font-semibold ${tone ?? ""}`}>{value}</p>{sub && <p className="text-xs text-muted-foreground">{sub}</p>}</div>;
}

function Dashboard() {
  const { all, of, get, isLoading } = useRecords();
  const sheet = useRecordSheet();
  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!all.length) return <div className="maritime-card space-y-2 p-8"><h1 className="font-display text-3xl">No data loaded yet</h1><p className="text-sm text-muted-foreground">An Admin needs to run the guided workbook import.</p><Link to="/import" className="text-primary underline">Open Workbook Import →</Link></div>;
  const closable = all.filter((r) => CLOSABLE.includes(r.entity));
  const groups = { open: [] as typeof all, blocked: [] as typeof all, completed: [] as typeof all };
  closable.forEach((r) => groups[closureClass(r, get)].push(r));
  const pct = Math.round((groups.completed.length / Math.max(1, closable.length)) * 100);
  const gaps = of("gap").filter((g) => g.status !== "Closed" && g.status !== "Not Applicable");
  const crit = gaps.filter((g) => g.criticality === "Critical").length;
  const ev = of("evidence");
  const required = ev.filter((e) => e.status === "Required").length;
  const expired = ev.filter(isExpired).length;
  const today = new Date();
  const in30 = new Date(Date.now() + 30 * 864e5);
  const in60 = new Date(Date.now() + 60 * 864e5);
  const expiring30 = ev.filter((e) => e.expiry_date && e.status !== "Expired" && new Date(e.expiry_date) >= today && new Date(e.expiry_date) <= in30);
  const expiring60 = ev.filter((e) => e.expiry_date && e.status !== "Expired" && new Date(e.expiry_date) > in30 && new Date(e.expiry_date) <= in60);
  const overdue = closable.filter(isOverdue);
  const gates = of("gate");
  const ready = gates.length > 0 && gates.every((g) => g.status === "Go");
  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between"><div><p className="label-caps">PMS 11 · IMO 7511826</p><h1 className="font-display text-4xl font-semibold">Command Center</h1></div>
        <div className="text-right"><p className="label-caps">Final readiness</p><StatusBadge value={ready ? "Go" : "Not ready — No-Go"} className="text-sm" /></div></header>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        <Kpi label="Overall closure" value={`${pct}%`} sub={`${groups.completed.length}/${closable.length} items`} tone="text-primary" />
        <Kpi label="Open gaps" value={gaps.length} sub={`${crit} critical`} tone={crit ? "text-destructive" : ""} />
        <Kpi label="Overdue" value={overdue} tone={overdue ? "text-destructive" : ""} />
        <Kpi label="Evidence required" value={required} sub={`of ${ev.length}`} tone="text-warning" />
        <Kpi label="Evidence expired" value={expired} tone={expired ? "text-destructive" : ""} />
        <Kpi label="Gates Go" value={`${gates.filter((g) => g.status === "Go").length}/${gates.length}`} />
      </div>
      <section className="maritime-card p-4"><p className="label-caps mb-3">Gate status</p>
        <div className="grid grid-cols-3 gap-2 md:grid-cols-9">{gates.map((g) => { const openCrit = gaps.filter((x) => x.gate_id === g.rid && x.criticality === "Critical").length; return (
          <button key={g.id} onClick={() => sheet.open(g.id)} className="rounded-sm border border-border p-2 text-left hover:bg-accent"><p className="rid">{g.rid}</p><p className="line-clamp-2 text-xs">{g.title}</p><div className="mt-1 flex flex-wrap gap-1"><StatusBadge value={g.no_go_active ? "No-Go" : g.status} />{openCrit > 0 && <StatusBadge value={`${openCrit} critical`} />}</div></button>); })}</div>
      </section>
      <section className="grid gap-4 md:grid-cols-2">
        <div className="maritime-card p-4"><div className="flex items-center justify-between"><p className="label-caps">Evidence expiry alerts · 30 days</p><StatusBadge value={expiring30.length ? "Action required" : "Clear"} /></div>
          <ul className="mt-3 max-h-52 space-y-1 overflow-auto">{expiring30.slice(0, 30).map((r) => <li key={r.id}><button onClick={() => sheet.open(r.id)} className="flex w-full items-center gap-2 rounded-sm px-1 py-1 text-left text-xs hover:bg-accent"><span className="rid w-24">{r.rid}</span><span className="truncate">{r.title}</span><span className="ml-auto text-destructive">{r.expiry_date}</span></button></li>)}{!expiring30.length && <li className="text-xs text-muted-foreground">No evidence expires in the next 30 days.</li>}</ul>
        </div>
        <div className="maritime-card p-4"><div className="flex items-center justify-between"><p className="label-caps">Evidence expiry alerts · 31–60 days</p><StatusBadge value={expiring60.length ? "Monitor" : "Clear"} /></div>
          <ul className="mt-3 max-h-52 space-y-1 overflow-auto">{expiring60.slice(0, 30).map((r) => <li key={r.id}><button onClick={() => sheet.open(r.id)} className="flex w-full items-center gap-2 rounded-sm px-1 py-1 text-left text-xs hover:bg-accent"><span className="rid w-24">{r.rid}</span><span className="truncate">{r.title}</span><span className="ml-auto text-warning">{r.expiry_date}</span></button></li>)}{!expiring60.length && <li className="text-xs text-muted-foreground">No evidence expires in days 31–60.</li>}</ul>
        </div>
      </section>
      <section className="grid gap-4 md:grid-cols-3">
        {(["blocked", "open", "completed"] as const).map((k) => (
          <div key={k} className="maritime-card p-4"><p className="label-caps mb-2">{k === "blocked" ? "Blocked / overdue" : k === "open" ? "Open" : "Completed"} · {groups[k].length}</p>
            <ul className="max-h-80 space-y-1 overflow-auto">{groups[k].slice(0, 60).map((r) => (
              <li key={r.id}><button onClick={() => sheet.open(r.id)} className="flex w-full items-center gap-2 rounded-sm px-1 py-0.5 text-left text-xs hover:bg-accent"><span className="rid w-24 shrink-0">{r.rid}</span><span className="truncate">{r.title}</span><span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">ev {r.evidence_ids.length}</span></button></li>))}</ul>
          </div>))}
      </section>
      <p className="text-xs text-muted-foreground">Power Pivot model: <b>NOT RUN</b> — embedded model false, VBA not tested in Windows Excel. Figures here come from imported workbook rows (Workbook), PMS-11 reconciliation (Derived) and app entries.</p>
    </div>
  );
}
