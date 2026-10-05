import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef } from "react";
import { ChevronRight, ChevronDown, FileText, Activity, Layers, ListChecks, ClipboardCheck, Scale } from "lucide-react";
import { Rec, relatedRecordIds, useRecords } from "@/lib/records";
import { StatusBadge } from "@/components/badges";
import { useRecordSheet } from "@/components/RecordSheet";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

export const Route = createFileRoute("/_authenticated/traceability")({
  head: () => ({ meta: [{ title: "Traceability Matrix — PMS 11" }] }),
  component: Traceability,
});

function entityIcon(entity: string) {
  switch (entity) {
    case "rule": return <Scale className="w-3 h-3" />;
    case "wps": return <Layers className="w-3 h-3" />;
    case "activity": return <Activity className="w-3 h-3" />;
    case "task": return <ListChecks className="w-3 h-3" />;
    case "gate": return <ClipboardCheck className="w-3 h-3" />;
    default: return <FileText className="w-3 h-3" />;
  }
}

function TreeNode({ rec, childrenEntities }: { rec: Rec; childrenEntities: string[] }) {
  const { all, get } = useRecords();
  const sheet = useRecordSheet();
  const [expanded, setExpanded] = useState(false);
  
  const nextEntity = childrenEntities[0];
  const remainingEntities = childrenEntities.slice(1);
  
  const childrenIds = nextEntity ? relatedRecordIds(rec, nextEntity, all) : [];
  const children = childrenIds.map(id => get(nextEntity, id)).filter(Boolean) as Rec[];

  return (
    <div className="ml-4 border-l border-border/50 pl-2 my-1">
      <div 
        className="flex items-center gap-2 group cursor-pointer hover:bg-accent/50 p-1.5 rounded-sm transition-colors"
        onClick={() => {
          if (children.length) setExpanded(!expanded);
        }}
      >
        <div className="w-4 h-4 flex items-center justify-center text-muted-foreground shrink-0">
          {children.length ? (expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />) : entityIcon(rec.entity)}
        </div>
        <button 
          onClick={(e) => { e.stopPropagation(); sheet.open(rec.id); }} 
          className="rid w-24 shrink-0 hover:underline text-left"
        >
          {rec.rid}
        </button>
        <span className="truncate text-xs flex-1">{rec.title}</span>
        <div className="flex gap-2 items-center">
          <span className="text-[10px] text-muted-foreground w-24 truncate text-right">{rec.owner || "Unassigned"}</span>
          <StatusBadge value={rec.status} />
        </div>
      </div>
      {expanded && children.length > 0 && (
        <div className="mt-1">
          {children.map(child => (
            <TreeNode key={child.id} rec={child} childrenEntities={remainingEntities} />
          ))}
        </div>
      )}
    </div>
  );
}

function Traceability() {
  const { of, isLoading } = useRecords();
  const container = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    gsap.from(".maritime-card", {
      y: 20,
      opacity: 0,
      duration: 0.6,
      ease: "power2.out"
    });
  }, { scope: container });
  
  if (isLoading) return <p className="text-sm text-muted-foreground p-6">Loading traceability matrix...</p>;
  
  const rules = of("rule");
  const hierarchy = ["wps", "activity", "task", "evidence", "acceptance", "gate"];

  return (
    <div className="space-y-6" ref={container}>
      <header>
        <p className="label-caps">Deep Dependencies</p>
        <h1 className="font-display text-4xl font-semibold">Traceability Matrix</h1>
        <p className="text-sm text-muted-foreground mt-2">End-to-end lineage from governing rules through to gate approval.</p>
      </header>

      <div className="maritime-card p-6">
        <div className="max-h-[70vh] overflow-y-auto pr-4">
          {!rules.length && <p className="text-sm text-muted-foreground">No rules found.</p>}
          {rules.map(rule => (
            <TreeNode key={rule.id} rec={rule} childrenEntities={hierarchy} />
          ))}
        </div>
      </div>
    </div>
  );
}
