import { useState } from "react";
import { AlertTriangle, FileUp, ShieldCheck, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { importUserRoster, resetAllProjectRecords } from "@/lib/admin.functions";

type Roster = { Company_ID:string; Full_Name:string; Email:string; Department:string; Role:"admin"|"reviewer"|"contributor"|"viewer"; Job_Title:string };

function parseCsv(text:string): Roster[] {
  const lines=text.replace(/^\uFEFF/,"").split(/\r?\n/).filter(x=>x.trim());
  if(lines.length<2) throw new Error("CSV must contain a header row and at least one employee row.");
  const parseLine=(line:string)=>{const out:string[]=[];let cur="",quote=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(quote&&line[i+1]==='"'){cur+='"';i++;}else quote=!quote;}else if(c===','&&!quote){out.push(cur.trim());cur="";}else cur+=c;}out.push(cur.trim());return out;};
  const headers=parseLine(lines[0]).map(x=>x.trim());
  const required=["Company_ID","Full_Name","Email","Department","Role","Job_Title"];
  for(const h of required) if(!headers.includes(h)) throw new Error("Missing CSV column: "+h);
  return lines.slice(1).map(line=>{const v=parseLine(line);const row=Object.fromEntries(headers.map((h,i)=>[h,v[i]??""]));return row as Roster;});
}

export function Pms11AdminControls(){
  const [rows,setRows]=useState<Roster[]>([]);
  const [busy,setBusy]=useState(false);
  const [resetting,setResetting]=useState(false);
  const [fileName,setFileName]=useState("");
  const [resetConfirm,setResetConfirm]=useState("");
  const onCsv=async(file:File|null)=>{if(!file)return;try{setRows(parseCsv(await file.text()));setFileName(file.name);toast.success("Roster CSV loaded for validation.");}catch(e){toast.error(e instanceof Error?e.message:String(e));}};
  const doImport=async()=>{if(!rows.length)return;setBusy(true);try{const r=await importUserRoster({data:{rows}});toast.success("Imported "+r.imported+" company users.");}catch(e){toast.error(e instanceof Error?e.message:String(e));}finally{setBusy(false);}};
  const doReset=async()=>{if(resetConfirm!=="RESET")return toast.error("Type RESET to confirm.");setResetting(true);try{const r=await resetAllProjectRecords();toast.success("Project reset completed. Storage files deleted: "+String(r.storageDeleted??0));setResetConfirm("");}catch(e){toast.error(e instanceof Error?e.message:String(e));}finally{setResetting(false);}};
  return <div className="space-y-6">
    <section className="maritime-card overflow-hidden">
      <div className="border-b border-border p-5"><p className="label-caps">Identity & access</p><h2 className="font-display text-2xl">Import Users & Roster</h2><p className="mt-1 text-sm text-muted-foreground">Separate CSV source. Department and Role are validated against the governed Department → Owner Role master data before any account is created or updated.</p></div>
      <div className="space-y-4 p-5">
        <div className="flex flex-wrap items-center gap-3"><input id="pms11-roster-csv" type="file" accept=".csv,text/csv" className="hidden" onChange={e=>void onCsv(e.target.files?.[0]??null)}/><label htmlFor="pms11-roster-csv" className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent"><FileUp className="h-4 w-4"/>Choose CSV</label>{fileName&&<span className="text-sm">{fileName} · {rows.length} rows</span>}<Button onClick={()=>void doImport()} disabled={!rows.length||busy}>{busy?"Importing…":"Validate & Import Users"}</Button></div>
        <p className="text-xs text-muted-foreground">Required columns: Company_ID, Full_Name, Email, Department, Role, Job_Title. Email must end in @pms.eg. Company_ID is the unique employee identity.</p>
        {rows.length>0&&<div className="max-h-80 overflow-auto rounded-md border"><table className="w-full text-xs"><thead className="sticky top-0 bg-muted"><tr>{["Company ID","Name","Email","Department","Role","Job Title"].map(x=><th key={x} className="p-2 text-left">{x}</th>)}</tr></thead><tbody>{rows.map((r,i)=><tr key={i} className="border-t"><td className="p-2">{r.Company_ID}</td><td className="p-2">{r.Full_Name}</td><td className="p-2">{r.Email}</td><td className="p-2">{r.Department}</td><td className="p-2">{r.Role}</td><td className="p-2">{r.Job_Title}</td></tr>)}</tbody></table></div>}
      </div>
    </section>
    <section className="maritime-card overflow-hidden border-destructive/40">
      <div className="border-b border-destructive/20 p-5"><p className="label-caps text-destructive">Danger Zone</p><h2 className="font-display text-2xl">Reset All Project Records</h2><p className="mt-1 text-sm text-muted-foreground">Removes project/WPS operational data, reviews, evidence metadata, change records and historical audit entries. Authentication, profiles, user roles and system metadata are preserved. Evidence files are removed from Storage.</p></div>
      <div className="space-y-4 p-5"><div className="flex gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive"/><span>This is irreversible for the operational dataset. The reset is recorded as an administrative audit event.</span></div><div className="flex flex-wrap gap-2"><input value={resetConfirm} onChange={e=>setResetConfirm(e.target.value)} placeholder="Type RESET" className="h-10 rounded-md border bg-background px-3 text-sm"/><Button variant="destructive" disabled={resetConfirm!=="RESET"||resetting} onClick={()=>void doReset()}><RotateCcw className="mr-1 h-4 w-4"/>{resetting?"Resetting…":"Reset All Project Records"}</Button></div></div>
    </section>
    <section className="maritime-card p-5"><div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary"/><h2 className="font-display text-xl">Corporate Authentication</h2></div><p className="mt-2 text-sm text-muted-foreground">Roster-provisioned accounts use @pms.eg, are email-confirmed administratively, and start with must_change_password=true. First login activates a secure password chosen by the employee; no email verification step is used.</p></section>
  </div>;
}
