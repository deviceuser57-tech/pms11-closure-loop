import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { governedStatusOptions } from "@/lib/setup-metadata";

export type Rec = Tables<"records">;
export const VESSEL = "PMS 11";
export const ENTITY_LABEL: Record<string,string> = { rule:"Rule",wps:"Work Package",activity:"Activity",task:"Task",deliverable:"Deliverable",gap:"Gap / Finding",acceptance:"Acceptance Criterion",evidence:"Evidence",gate:"Gate",responsibility:"Responsibility",risk:"Risk",change:"Change",equipment:"Equipment" };
export const CLOSABLE = ["rule","wps","activity","task","gap","deliverable"];
export const STATUS_OPTIONS: Record<string,string[]> = {
  default:["Not Opened","Open","In Progress","Blocked","Reopened","Closed","Not Applicable"],
  evidence:["Required","Submitted","In Review","Accepted","Rejected","Expired"],
  acceptance:["Not Met","Partially Met","Met","Not Applicable"],
  gate:["Not Started","In Review","Conditional","Go","No-Go"],
  risk:["Open","Mitigating","Accepted","Closed"],
  change:["Raised","In Review","Approved","Rejected","Implemented"],
  equipment:["Certification to verify","Certified","Expired","Out of service"],
};
export const statusOptions=(entity:string)=>[...new Set([...governedStatusOptions(entity),...(STATUS_OPTIONS[entity]??STATUS_OPTIONS.default)])];

const today=()=>new Date().toISOString().slice(0,10);
export const isOverdue=(r:Rec)=>!!r.due_date&&r.due_date<today()&&!["Closed","Not Applicable"].includes(r.status);
export const isExpired=(r:Rec)=>r.entity==="evidence"&&(r.status==="Expired"||!!r.expiry_date&&r.expiry_date<today());
export const isClosed=(r:Rec)=>["Closed","Not Applicable","Met","Accepted","Go"].includes(r.status);
export const hasPlaceholderOwner=(r:Rec)=>!r.owner||/to be assigned|^tbc|^rule\/wps owner$/i.test(r.owner);

async function fetchAll():Promise<Rec[]>{
 const out:Rec[]=[]; for(let from=0;;from+=1000){const {data,error}=await supabase.from("records").select("*").order("rid").range(from,from+999);if(error)throw error;out.push(...(data??[]));if(!data||data.length<1000)break;} return out;
}
export const recordsQuery=queryOptions({queryKey:["records"],queryFn:fetchAll,staleTime:30_000});
export function useRecords(){const q=useQuery(recordsQuery);const all=q.data??[];const byKey=new Map(all.map(r=>[`${r.entity}:${r.rid}`,r]));return {...q,all,of:(e:string)=>all.filter(r=>r.entity===e),get:(e:string,rid:string)=>byKey.get(`${e}:${rid}`)};}
export function useInvalidateRecords(){const qc=useQueryClient();return()=>qc.invalidateQueries({queryKey:["records"]});}
export function evidenceState(r:Rec,get:(e:string,rid:string)=>Rec|undefined){const items=r.evidence_ids.map(id=>({id,rec:get("evidence",id)}));const valid=items.filter(i=>i.rec&&i.rec.status==="Accepted"&&!isExpired(i.rec)).length;return{items,valid,total:items.length};}
export function blockers(r:Rec,get:(e:string,rid:string)=>Rec|undefined):string[]{const b:string[]=[];if(hasPlaceholderOwner(r))b.push("No named owner");if(!r.execution_note?.trim())b.push("No recorded execution");if(r.review_status!=="Approved")b.push("Review not approved");const ev=evidenceState(r,get);if(!ev.total)b.push("No linked evidence");else if(ev.valid<ev.total)b.push(`${ev.total-ev.valid} evidence not accepted / expired`);if(!r.acceptance_ids.length)b.push("No acceptance criteria");else{const notMet=r.acceptance_ids.filter(a=>get("acceptance",a)?.status!=="Met").length;if(notMet)b.push(`${notMet} acceptance criteria not met`);}const gateId=r.gate_id??(r.wps_id?get("wps",r.wps_id)?.gate_id:null);if(gateId&&get("gate",gateId)?.no_go_active)b.push(`${gateId} No-Go active`);return b;}
export function closureClass(r:Rec,get:(e:string,rid:string)=>Rec|undefined):"completed"|"blocked"|"open"{if(isClosed(r))return"completed";if(r.status==="Blocked"||r.status==="Reopened"||isOverdue(r))return"blocked";const b=blockers(r,get);return b.some(x=>/No-Go|expired|not accepted/.test(x))?"blocked":"open";}
