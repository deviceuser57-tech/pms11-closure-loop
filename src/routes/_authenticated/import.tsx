import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Upload, FileSpreadsheet, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/badges";
import { getImportPreview, runImport } from "@/lib/import.functions";
import { previewWorkbookIncremental, runWorkbookIncremental } from "@/lib/import-incremental.functions";
import { useAuth } from "@/hooks/use-auth";
import { useInvalidateRecords } from "@/lib/records";
import { exportExcel } from "@/lib/export";

export const Route = createFileRoute("/_authenticated/import")({
  staticData:{sitemap:false},
  head:()=>({meta:[{title:"Workbook Import — PMS 11 Closure Loop"},{name:"description",content:"Guided import mapping the PMS 11 Excel workbook into the tracker, with row-level validation and rejected-row download."}]}),
  component:ImportPage,
});

function fileToBase64(file:File):Promise<string>{
  return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(",")[1]??"");r.onerror=()=>reject(r.error);r.readAsDataURL(file);});
}

function ImportPage(){
  const legacy=useServerFn(getImportPreview), runLegacy=useServerFn(runImport);
  const previewIncremental=useServerFn(previewWorkbookIncremental), runIncremental=useServerFn(runWorkbookIncremental);
  const {isAdmin}=useAuth(); const inval=useInvalidateRecords(); const inputRef=useRef<HTMLInputElement>(null);
  const q=useQuery({queryKey:["import-preview"],queryFn:()=>legacy()});
  const [file,setFile]=useState<File|null>(null),[diff,setDiff]=useState<any>(null),[busy,setBusy]=useState(false),[result,setResult]=useState<any>(null);
  const p=q.data;
  const selectFile=async(f:File|null)=>{if(!f)return;if(!/\.xlsx?$|\.xlsm$/i.test(f.name))return toast.error("Select an Excel workbook (.xlsx or .xlsm).");setFile(f);setDiff(null);setResult(null);};
  const inspect=async()=>{if(!file)return;setBusy(true);try{const base64=await fileToBase64(file);const d=await previewIncremental({data:{base64}});setDiff(d);toast.success("Workbook compared with the current imported dataset.");}catch(e){toast.error(e instanceof Error?e.message:String(e));}finally{setBusy(false);}};
  const apply=async()=>{if(!file||!diff)return;setBusy(true);try{const base64=await fileToBase64(file);const r=await runIncremental({data:{base64}});setResult(r);setDiff(null);inval();toast.success("Incremental workbook update completed.");}catch(e){toast.error(e instanceof Error?e.message:String(e));}finally{setBusy(false);}};
  const legacyGo=async()=>{setBusy(true);try{const r=await runLegacy({data:{entities:p?.entities.map(e=>e.entity)??[]}});setResult(r);inval();toast.success("Legacy seed import completed.");}catch(e){toast.error(e instanceof Error?e.message:String(e));}finally{setBusy(false);}};
  if(!p)return <p className="text-sm text-muted-foreground">{q.error?String(q.error):"Reading workbook…"}</p>;
  return <div className="space-y-6">
    <header><p className="label-caps">Source control</p><h1 className="font-display text-3xl font-semibold">Workbook Import</h1><p className="text-sm text-muted-foreground">Admin-only source ingestion. Upload a new workbook to calculate a delta before anything is changed.</p></header>

    <section className="maritime-card border-primary/30 p-5 space-y-4">
      <div className="flex items-start gap-3"><FileSpreadsheet className="mt-1 h-6 w-6 text-primary"/><div><p className="label-caps">Incremental update</p><h2 className="font-display text-2xl">Upload New Excel Workbook</h2><p className="text-sm text-muted-foreground">New rows are inserted; changed workbook rows are updated; unchanged rows are untouched. Execution notes, reviews, closure state, department assignments and audit history are preserved.</p></div></div>
      <input ref={inputRef} type="file" accept=".xlsx,.xlsm,.xls" className="hidden" onChange={e=>selectFile(e.target.files?.[0]??null)}/>
      <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={()=>inputRef.current?.click()}><Upload className="mr-1 h-4 w-4"/>Choose Excel</Button>{file&&<span className="self-center text-sm font-medium">{file.name} · {(file.size/1024/1024).toFixed(2)} MB</span>}<Button onClick={inspect} disabled={!file||busy||!isAdmin}><RefreshCw className="mr-1 h-4 w-4"/>{busy?"Comparing…":"Compare with current data"}</Button></div>
      {diff&&<div className="rounded-md border border-border p-4 space-y-3"><div className="grid grid-cols-2 gap-2 md:grid-cols-4"><StatusBadge value={`New: ${diff.counts.added}`}/><StatusBadge value={`Changed: ${diff.counts.changed}`}/><StatusBadge value={`Unchanged: ${diff.counts.unchanged}`}/><StatusBadge value={`Conflicts: ${diff.counts.conflicts}`}/></div><p className="text-xs text-muted-foreground">{diff.note}</p><div className="max-h-72 overflow-auto text-xs">{[...(diff.added??[]).slice(0,100).map((x:any)=>({...x,kind:"NEW"})),...(diff.changed??[]).slice(0,100).map((x:any)=>({...x,kind:"CHANGED"}))].map((x:any,i)=><div key={i} className="border-b border-border/40 py-1"><span className="rid">{x.rid}</span> · {x.entity} · {x.title??""} {x.fields&&<span className="text-muted-foreground">· {x.fields.join(", ")}</span>}</div>)}</div><Button onClick={apply} disabled={busy||!isAdmin}>Apply incremental update</Button></div>}
      {result&&<pre className="max-h-72 overflow-auto rounded bg-muted p-3 text-xs">{JSON.stringify(result,null,2)}</pre>}
      {!isAdmin&&<p className="text-xs text-warning">Only Admins can upload or apply workbook changes.</p>}
    </section>

    <section className="maritime-card space-y-3 p-4"><p className="label-caps">Current source baseline</p><div className="flex flex-wrap gap-2"><StatusBadge value={`${p.found.wps} WPS`}/><StatusBadge value={`${p.found.rules} Rules`}/><StatusBadge value={`${p.verification.planned_relationships} planned relationships`}/><StatusBadge value="Embedded Power Pivot: false"/><StatusBadge value="VBA: not tested"/><StatusBadge value="Model setup: NOT RUN"/></div><p className="text-xs text-muted-foreground">The application uses workbook table data as the source baseline. Power Pivot/VBA validation is a separate Excel control and is not represented as completed by this application.</p></section>

    <section className="maritime-card p-4"><p className="label-caps mb-2">Historical guided seed import</p><p className="text-xs text-muted-foreground mb-3">Kept for controlled bootstrap/recovery only. Use the new upload/delta path for normal workbook updates.</p><Button variant="outline" disabled={!isAdmin||busy} onClick={legacyGo}>Run baseline import</Button></section>
  </div>;
}
