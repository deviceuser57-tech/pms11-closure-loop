import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useRef } from "react";
import { Activity, LayoutDashboard } from "lucide-react";
import { useRecords, blockers, CLOSABLE } from "@/lib/records";
import { StatusBadge } from "@/components/badges";
import { useRecordSheet } from "@/components/RecordSheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";

export const Route = createFileRoute("/_authenticated/simulator")({
  head: () => ({ meta: [{ title: "Gate Simulator — PMS 11" }] }),
  component: GateSimulator,
});

function GateSimulator() {
  const { all, get, of, isLoading } = useRecords();
  const sheet = useRecordSheet();
  const [selectedGate, setSelectedGate] = useState<string>("");
  const [simulateClosed, setSimulateClosed] = useState<Record<string, boolean>>({});
  const container = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    gsap.from(".maritime-card", {
      y: 15,
      opacity: 0,
      stagger: 0.1,
      duration: 0.5,
      ease: "power2.out"
    });
  }, { scope: container });

  const gates = of("gate").sort((a, b) => a.rid.localeCompare(b.rid));
  const gate = gates.find(g => g.rid === selectedGate) || gates[0];

  const simulationBlockers = useMemo(() => {
    if (!gate) return [];
    
    // Custom get function that pretends simulated items are closed
    const simGet = (entity: string, rid: string) => {
      const actual = get(entity, rid);
      if (actual && simulateClosed[actual.id] && CLOSABLE.includes(entity)) {
        return { ...actual, status: "Closed" };
      }
      return actual;
    };
    
    return blockers(gate, simGet, all); // Assume blockers function can return detailed objects if we pass a flag? 
    // Wait, blockers returns string[]. We'll map it differently if needed.
  }, [gate, simulateClosed, all, get]);

  const actualBlockers = useMemo(() => {
    if (!gate) return [];
    return blockers(gate, get, all);
  }, [gate, get, all]);

  // Find underlying gaps/tasks linked to this gate that are open
  const dependencies = useMemo(() => {
    if (!gate) return [];
    return all.filter(r => (r.gate_id === gate.rid || r.wps_id === gate.wps_id) && CLOSABLE.includes(r.entity) && r.status !== "Closed");
  }, [gate, all]);

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading simulator...</p>;

  return (
    <div className="space-y-6" ref={container}>
      <header>
        <p className="label-caps">What-If Analysis</p>
        <h1 className="font-display text-4xl font-semibold">Gate Readiness Simulator</h1>
        <p className="text-sm text-muted-foreground mt-2">See exactly what needs to close to reach "Go" status, and simulate closing items.</p>
      </header>

      <div className="maritime-card p-6 space-y-6">
        <div className="flex gap-4 items-center">
          <Label className="font-semibold text-muted-foreground">Target Gate:</Label>
          <Select value={gate?.rid || ""} onValueChange={setSelectedGate}>
            <SelectTrigger className="w-64"><SelectValue placeholder="Select Gate" /></SelectTrigger>
            <SelectContent>
              {gates.map(g => <SelectItem key={g.rid} value={g.rid}>{g.rid} — {g.title}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {gate && (
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-lg flex items-center gap-2">Actual Status <StatusBadge value={actualBlockers.length ? "No-Go" : "Go"} /></h3>
                <p className="text-xs text-muted-foreground mt-1">Current state without simulation.</p>
              </div>
              <ul className="space-y-2 text-sm">
                {actualBlockers.length ? actualBlockers.map((b, i) => (
                  <li key={i} className="p-2 border border-destructive/20 bg-destructive/5 rounded text-destructive text-xs">{b}</li>
                )) : <li className="text-success p-2">Gate is ready! No active blockers.</li>}
              </ul>
            </div>

            <div className="space-y-4 border-l border-border/50 pl-6">
              <div>
                <h3 className="font-semibold text-lg flex items-center gap-2">Simulated Status <StatusBadge value={simulationBlockers.length ? "No-Go" : "Go"} /></h3>
                <p className="text-xs text-muted-foreground mt-1">Status if all toggled items below were closed.</p>
              </div>
              <ul className="space-y-2 text-sm">
                {simulationBlockers.length ? simulationBlockers.map((b, i) => (
                  <li key={i} className="p-2 border border-warning/30 bg-warning/5 rounded text-warning-foreground text-xs">{b}</li>
                )) : <li className="text-success p-2 border border-success/30 bg-success/10 rounded font-semibold">Gate is ready in simulation!</li>}
              </ul>
            </div>
          </div>
        )}
      </div>

      {gate && dependencies.length > 0 && (
        <div className="maritime-card p-6 space-y-4">
          <h3 className="font-semibold">Simulate Item Closures</h3>
          <p className="text-xs text-muted-foreground mb-4">Toggle items to pretend they have been approved and closed. See how it affects the simulated gate status above.</p>
          
          <div className="grid gap-2">
            {dependencies.map(d => (
              <div key={d.id} className={`flex items-center justify-between p-3 rounded border transition-colors ${simulateClosed[d.id] ? 'bg-success/5 border-success/30' : 'bg-card border-border'}`}>
                <div className="flex items-center gap-3">
                  <Switch 
                    checked={!!simulateClosed[d.id]} 
                    onCheckedChange={(c) => setSimulateClosed(prev => ({ ...prev, [d.id]: c }))}
                  />
                  <button onClick={() => sheet.open(d.id)} className="rid hover:underline text-left w-24 shrink-0">{d.rid}</button>
                  <span className="text-sm max-w-[400px] truncate">{d.title}</span>
                  <StatusBadge value={d.status} />
                </div>
                {simulateClosed[d.id] && <span className="text-[10px] font-bold text-success uppercase tracking-widest">Simulated Closed</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
