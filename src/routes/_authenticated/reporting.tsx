import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useRecords, wpsRelationshipCounts } from "@/lib/records";
import { exportExcel, exportPdf } from "@/lib/export";

export const Route = createFileRoute("/_authenticated/reporting")({
  head: () => ({ meta:[{title:"Smart Reporting — PMS 11 Closure Loop"}] }),
  component: SmartReporting,
});

const ALL="__ALL__";
function SmartReporting(){
  const {all,isLoading}=useRecords();
  const [entity,setEntity]=useState(ALL),[wps,setWps]=useState(ALL),[status,setStatus]=useState(ALL),[criticality,setCriticality]=useState(ALL),[department,setDepartment]=useState(ALL),[owner,setOwner]=useState(ALL),[q,setQ]=useState("");
  const opts=(key:string)=>[...new Set(all.map(r=>String((r as any)[key] ?? "")).filter(Boolean))].sort();
  const wpsRows=all.filter(r=>r.entity==="wps");
  const filtered=useMemo(()=>all.filter(r=>{
    const hay=(r.rid+" "+r.title+" "+(r.description??"")).toLowerCase();
    return (entity===ALL||r.entity===entity)&&(wps===ALL||r.wps_id===wps)&&(status===ALL||r.status===status)&&(criticality===ALL||r.criticality===criticality)&&(department===ALL||r.department===department)&&(owner===ALL||r.owner===owner)&&(!q||hay.includes(q.toLowerCase()));
  }),[all,entity,wps,status,criticality,department,owner,q]);
  const rows=filtered.map(r=>({ID:r.rid,Entity:r.entity,Title:r.title,WPS:r.wps_id??"",Gate:r.gate_id??"",Department:r.department??"Unassigned",Owner:r.owner??"Unassigned",Status:r.status,Criticality:r.criticality??"",Due:r.due_date??"",Evidence:r.evidence_ids.length,Acceptance:r.acceptance_ids.length}));
  const clear=()=>{setEntity(ALL);setWps(ALL);setStatus(ALL);setCriticality(ALL);setDepartment(ALL);setOwner(ALL);setQ("");};
  return <div className="space-y-5">
    <header className="flex items-end justify-between gap-4"><div><p className="label-caps">Decision support</p><h1 className="font-display text-3xl font-semibold">Smart Reporting</h1><p className="text-sm text-muted-foreground">All report dimensions are live filters over the governed PMS-11 record set. WPS remains the primary axis for readiness reporting.</p></div><div className="flex gap-2"><Button variant="outline" onClick={()=>exportExcel("PMS11_smart_report.xlsx",[{name:"Filtered",rows}])}>Export Excel</Button><Button variant="outline" onClick={()=>exportPdf("PMS 11 Smart Report",[{heading:"Filtered records",head:Object.keys(rows[0]??{Note:""}),body:rows.slice(0,100).map(r=>Object.values(r).map(String))}])}>Export PDF</Button></div></header>
    <section className="maritime-card p-4 space-y-3">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Select value={wps} onValueChange={setWps}><SelectTrigger><SelectValue placeholder="WPS"/></SelectTrigger><SelectContent><SelectItem value={ALL}>All WPS</SelectItem>{wpsRows.map(r=><SelectItem key={r.rid} value={r.rid}>{r.rid} — {r.title}</SelectItem>)}</SelectContent></Select>
        <Select value={entity} onValueChange={setEntity}><SelectTrigger><SelectValue placeholder="Entity"/></SelectTrigger><SelectContent><SelectItem value={ALL}>All entities</SelectItem>{opts("entity").map(v=><SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select>
        <Select value={status} onValueChange={setStatus}><SelectTrigger><SelectValue placeholder="Status"/></SelectTrigger><SelectContent><SelectItem value={ALL}>All statuses</SelectItem>{opts("status").map(v=><SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select>
        <Select value={criticality} onValueChange={setCriticality}><SelectTrigger><SelectValue placeholder="Criticality"/></SelectTrigger><SelectContent><SelectItem value={ALL}>All criticality</SelectItem>{opts("criticality").map(v=><SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select>
        <Select value={department} onValueChange={setDepartment}><SelectTrigger><SelectValue placeholder="Department"/></SelectTrigger><SelectContent><SelectItem value={ALL}>All departments</SelectItem>{opts("department").map(v=><SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select>
        <Select value={owner} onValueChange={setOwner}><SelectTrigger><SelectValue placeholder="Owner"/></SelectTrigger><SelectContent><SelectItem value={ALL}>All owners</SelectItem>{opts("owner").map(v=><SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select>
        <Input className="lg:col-span-2" value={q} onChange={e=>setQ(e.target.value)} placeholder="Search ID, title, description…"/>
      </div>
      <div className="flex items-center justify-between"><p className="text-xs text-muted-foreground">{filtered.length} records match the current report.</p><Button size="sm" variant="ghost" onClick={clear}>Reset filters</Button></div>
    </section>
    <section className="grid grid-cols-2 gap-3 md:grid-cols-6">
      {[["Records",filtered.length],["WPS",new Set(filtered.map(r=>r.wps_id).filter(Boolean)).size],["Open",filtered.filter(r=>!["Closed","Not Applicable"].includes(r.status)).length],["Critical",filtered.filter(r=>r.criticality==="Critical").length],["Evidence links",filtered.reduce((n,r)=>n+r.evidence_ids.length,0)],["Acceptance",filtered.reduce((n,r)=>n+r.acceptance_ids.length,0)]].map(([l,v])=><div key={String(l)} className="maritime-card p-3"><p className="label-caps">{l}</p><p className="font-display text-2xl font-semibold">{v}</p></div>)}
    </section>
    {wps!==ALL&&<section className="maritime-card p-4"><p className="label-caps">Selected WPS relationship snapshot</p><div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-7">{(()=>{const r=wpsRows.find(x=>x.rid===wps);if(!r)return null;const c=wpsRelationshipCounts(r,all);return Object.entries(c).slice(0,7).map(([k,v])=><div key={k} className="rounded border border-border p-2"><p className="text-[10px] uppercase text-muted-foreground">{k}</p><p className="font-mono text-lg">{v}</p></div>);})()}</div></section>}
    <section className="maritime-card overflow-hidden"><div className="overflow-x-auto"><table className="w-full min-w-[1100px] text-xs"><thead><tr className="border-b border-border">{Object.keys(rows[0]??{ID:""}).map(h=><th key={h} className="label-caps px-3 py-2 text-left">{h}</th>)}</tr></thead><tbody>{rows.slice(0,500).map(r=><tr key={r.ID+"-"+r.Entity} className="border-b border-border/40 hover:bg-accent/30">{Object.entries(r).map(([k,v])=><td key={k} className={k==="ID"?"rid px-3 py-2":"px-3 py-2"}>{k==="ID"?<Link to="/r/$entity" params={{entity:r.Entity}} className="hover:underline">{String(v)}</Link>:String(v)}</td>)}</tr>)}</tbody></table></div>{rows.length>500&&<p className="p-3 text-xs text-muted-foreground">Showing first 500 rows; export contains the full filtered set.</p>}</section>
  </div>;
}
