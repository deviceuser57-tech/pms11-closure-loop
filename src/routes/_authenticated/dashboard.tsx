import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { StatusBadge } from "@/components/badges";
import { useRecordSheet } from "@/components/RecordSheet";
import { blockers, CLOSABLE, closureClass, isExpired, isOverdue, useRecords } from "@/lib/records";

export const Route = createFileRoute("/_authenticated/dashboard")({
  staticData: { sitemap: false },
  head: () => ({ meta: [{ title: "Command Center — PMS 11 Closure Loop" }, { name: "description", content: "Live readiness KPIs, gate status, and open, blocked and completed closure items for vessel PMS 11." }] }),
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
  
  // Health Score Calculation
  const overdueCount = groups.blocked.filter(isOverdue).length + groups.open.filter(isOverdue).length;
  const expiredCount = ev.filter(isExpired).length;
  
  const penalties = [
    { reason: "Critical open findings", points: crit * 5 },
    { reason: "Overdue items", points: overdueCount * 2 },
    { reason: "Expired evidence", points: expiredCount * 3 },
  ].filter(p => p.points > 0);
  
  const totalPenalty = penalties.reduce((sum, p) => sum + p.points, 0);
  const healthScore = Math.max(0, pct - totalPenalty);

  const required = ev.filter((e) => e.status === "Required").length;
  const expired = ev.filter(isExpired).length;
  const today = new Date();
  const in7 = new Date(Date.now() + 7 * 864e5);
  const in30 = new Date(Date.now() + 30 * 864e5);
  const in60 = new Date(Date.now() + 60 * 864e5);
  
  const expiring7 = ev.filter((e) => e.expiry_date && e.status !== "Expired" && new Date(e.expiry_date) >= today && new Date(e.expiry_date) <= in7);
  const expiring30 = ev.filter((e) => e.expiry_date && e.status !== "Expired" && new Date(e.expiry_date) > in7 && new Date(e.expiry_date) <= in30);
  const expiring60 = ev.filter((e) => e.expiry_date && e.status !== "Expired" && new Date(e.expiry_date) > in30 && new Date(e.expiry_date) <= in60);
  const overdue = closable.filter(isOverdue);
  const gates = of("gate");
  const ready = gates.length > 0 && gates.every((g) => g.status === "Go");
  
  const container = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    gsap.from(".maritime-card", {
      y: 30,
      opacity: 0,
      stagger: 0.05,
      duration: 0.8,
      ease: "power3.out",
    });
    gsap.from("header > div", {
      y: -20,
      opacity: 0,
      stagger: 0.1,
      duration: 1,
      ease: "power2.out",
    });
  }, { scope: container });
  
  return (
    <div className="space-y-6" ref={container}>
      <header className="flex items-end justify-between">
        <div><p className="label-caps">PMS 11 · IMO 7511826</p><h1 className="font-display text-4xl font-semibold">Command Center</h1></div>
        <div className="text-right"><p className="label-caps">Final readiness</p><StatusBadge value={ready ? "Go" : "Not ready — No-Go"} className="text-sm" /></div>
      </header>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Link to="/r/$entity" params={{ entity: "wps" }}><Kpi label="WPS" value={of("wps").length} sub="Work Packages" tone="text-primary" /></Link>
        <Link to="/r/$entity" params={{ entity: "rule" }}><Kpi label="Rules" value={of("rule").length} sub="Governing requirements" /></Link>
        <Link to="/r/$entity" params={{ entity: "activity" }}><Kpi label="Activities" value={of("activity").length} sub="Execution / verification activities" /></Link>
        <Link to="/r/$entity" params={{ entity: "task" }}><Kpi label="Tasks" value={of("task").length} sub="Execution tasks" /></Link>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="maritime-card col-span-2 p-4 md:col-span-2 space-y-3">
          <div className="flex justify-between items-end">
            <p className="label-caps">Readiness Score</p>
            <p className="text-sm font-semibold text-primary">{healthScore} / 100</p>
          </div>
          <div className="h-3 rounded-full bg-muted overflow-hidden">
            <div className={`h-full transition-all duration-700 ${healthScore > 80 ? 'bg-success' : healthScore > 50 ? 'bg-warning' : 'bg-destructive'}`} style={{ width: `${healthScore}%` }} />
          </div>
          <div className="flex items-start justify-between text-xs text-muted-foreground mt-2 border-t border-border/50 pt-2">
            <span>Base: {pct}% closed ({groups.completed.length}/{closable.length})</span>
            {penalties.length > 0 && (
              <div className="text-right">
                <span className="text-destructive font-medium">Penalties (-{totalPenalty}):</span>
                {penalties.map(p => <span key={p.reason} className="block text-[10px]">{p.reason} (-{p.points})</span>)}
              </div>
            )}
          </div>
        </div>
        <Kpi label="Open gaps" value={gaps.length} sub={`${crit} critical`} tone={crit ? "text-destructive" : ""} />
        <Kpi label="Gates Go" value={`${gates.filter((g) => g.status === "Go").length}/${gates.length}`} />
      </div>
      <section className="maritime-card p-4">
        <p className="label-caps mb-3">Gate status</p>
        <div className="grid grid-cols-3 gap-2 md:grid-cols-9">
          {gates.map((g) => {
            const openCrit = gaps.filter((x) => x.gate_id === g.rid && x.criticality === "Critical").length;
            return (
              <button key={g.id} onClick={() => sheet.open(g.id)} className="rounded-sm border border-border p-2 text-left hover:bg-accent">
                <p className="rid">{g.rid}</p>
                <p className="line-clamp-2 text-xs">{g.title}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  <StatusBadge value={g.no_go_active ? "No-Go" : g.status} />
                  {openCrit > 0 && <StatusBadge value={`${openCrit} critical`} />}
                </div>
              </button>
            );
          })}
        </div>
      </section>
      
      <section className="grid gap-4 md:grid-cols-3">
        <div className="maritime-card p-4">
          <div className="flex items-center justify-between"><p className="label-caps">Evidence expiry alerts · 7 days</p><StatusBadge value={expiring7.length ? "Critical" : "Clear"} /></div>
          <ul className="mt-3 max-h-52 space-y-1 overflow-auto">
            {expiring7.slice(0, 30).map((r) => <li key={r.id}><button onClick={() => sheet.open(r.id)} className="flex w-full items-center gap-2 rounded-sm px-1 py-1 text-left text-xs hover:bg-accent"><span className="rid w-24">{r.rid}</span><span className="truncate">{r.title}</span><span className="ml-auto text-destructive font-semibold">{r.expiry_date}</span></button></li>)}
            {!expiring7.length && <li className="text-xs text-muted-foreground">No evidence expires in the next 7 days.</li>}
          </ul>
        </div>
        <div className="maritime-card p-4">
          <div className="flex items-center justify-between"><p className="label-caps">Evidence expiry alerts · 30 days</p><StatusBadge value={expiring30.length ? "Action required" : "Clear"} /></div>
          <ul className="mt-3 max-h-52 space-y-1 overflow-auto">
            {expiring30.slice(0, 30).map((r) => <li key={r.id}><button onClick={() => sheet.open(r.id)} className="flex w-full items-center gap-2 rounded-sm px-1 py-1 text-left text-xs hover:bg-accent"><span className="rid w-24">{r.rid}</span><span className="truncate">{r.title}</span><span className="ml-auto text-warning">{r.expiry_date}</span></button></li>)}
            {!expiring30.length && <li className="text-xs text-muted-foreground">No evidence expires in days 8-30.</li>}
          </ul>
        </div>
        <div className="maritime-card p-4">
          <div className="flex items-center justify-between"><p className="label-caps">Evidence expiry alerts · 31–60 days</p><StatusBadge value={expiring60.length ? "Monitor" : "Clear"} /></div>
          <ul className="mt-3 max-h-52 space-y-1 overflow-auto">
            {expiring60.slice(0, 30).map((r) => <li key={r.id}><button onClick={() => sheet.open(r.id)} className="flex w-full items-center gap-2 rounded-sm px-1 py-1 text-left text-xs hover:bg-accent"><span className="rid w-24">{r.rid}</span><span className="truncate">{r.title}</span><span className="ml-auto text-muted-foreground">{r.expiry_date}</span></button></li>)}
            {!expiring60.length && <li className="text-xs text-muted-foreground">No evidence expires in days 31–60.</li>}
          </ul>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {(["blocked", "open", "completed"] as const).map((k) => (
          <div key={k} className="maritime-card p-4">
            <p className="label-caps mb-2">{k === "blocked" ? "Blocked / overdue" : k === "open" ? "Open" : "Completed"} · {groups[k].length}</p>
            <ul className="max-h-80 space-y-1 overflow-auto">
              {groups[k].slice(0, 60).map((r) => {
                const b = k === "blocked" ? blockers(r, get, all) : [];
                return (
                  <li key={r.id}>
                    <button onClick={() => sheet.open(r.id)} className="flex w-full flex-col gap-1 rounded-sm px-1 py-1.5 text-left text-xs hover:bg-accent">
                      <div className="flex w-full items-center gap-2">
                        <span className="rid w-24 shrink-0">{r.rid}</span>
                        <span className="truncate font-medium">{r.title}</span>
                        <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">ev {r.evidence_ids.length}</span>
                      </div>
                      {b.length > 0 && (
                        <div className="flex items-start text-[10px] text-destructive">
                          <span className="mr-1 mt-[1px]">↳</span>
                          <span className="truncate">{b[0]}</span>
                        </div>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}
