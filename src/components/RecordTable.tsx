import { useMemo, useState } from "react";
import { Download, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge, SourceBadge } from "@/components/badges";
import { useRecordSheet } from "@/components/RecordSheet";
import { closureClass, isOverdue, useRecords, VESSEL, type Rec } from "@/lib/records";
import { exportExcel } from "@/lib/export";

export type Col = { key: string; label: string; render?: (r: Rec) => React.ReactNode; width?: string };

const DEFAULT_COLS: Col[] = [
  { key: "rid", label: "ID", width: "w-28" },
  { key: "title", label: "Title" },
  { key: "wps_id", label: "WPS", width: "w-20" },
  { key: "owner", label: "Owner", width: "w-40" },
  { key: "due_date", label: "Due", width: "w-24" },
  { key: "status", label: "Status", width: "w-32" },
];

const ALL = "__all";

export function RecordTable({ rows, cols = DEFAULT_COLS, title, filters = ["status", "owner", "wps", "due", "closure"] }: { rows: Rec[]; cols?: Col[]; title: string; filters?: string[] }) {
  const { get } = useRecords();
  const sheet = useRecordSheet();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState(ALL);
  const [owner, setOwner] = useState(ALL);
  const [wps, setWps] = useState(ALL);
  const [due, setDue] = useState(ALL);
  const [closure, setClosure] = useState(ALL);
  const [vessel, setVessel] = useState(VESSEL);

  const uniq = (k: keyof Rec) => [...new Set(rows.map((r) => r[k] as string).filter(Boolean))].sort();
  const statuses = useMemo(() => uniq("status"), [rows]);
  const owners = useMemo(() => uniq("owner"), [rows]);
  const wpsList = useMemo(() => uniq("wps_id"), [rows]);

  const today = new Date().toISOString().slice(0, 10);
  const in30 = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  const filtered = rows.filter((r) => {
    if (vessel !== VESSEL) return false;
    if (status !== ALL && r.status !== status) return false;
    if (owner !== ALL && r.owner !== owner) return false;
    if (wps !== ALL && r.wps_id !== wps) return false;
    if (due === "overdue" && !isOverdue(r)) return false;
    if (due === "30d" && !(r.due_date && r.due_date >= today && r.due_date <= in30)) return false;
    if (due === "none" && r.due_date) return false;
    if (closure !== ALL && closureClass(r, get) !== closure) return false;
    if (q) {
      const s = q.toLowerCase();
      if (!`${r.rid} ${r.title} ${r.description ?? ""} ${r.owner ?? ""}`.toLowerCase().includes(s)) return false;
    }
    return true;
  });

  const F = ({ value, set, items, placeholder, labels }: { value: string; set: (v: string) => void; items: string[]; placeholder: string; labels?: Record<string, string> }) => (
    <Select value={value} onValueChange={set}>
      <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>All {placeholder.toLowerCase()}</SelectItem>
        {items.map((i) => <SelectItem key={i} value={i}>{labels?.[i] ?? i}</SelectItem>)}
      </SelectContent>
    </Select>
  );

  const doExport = () =>
    exportExcel(`PMS11_${title.replace(/\W+/g, "_")}.xlsx`, [{
      name: title,
      rows: filtered.map((r) => ({ ID: r.rid, Title: r.title, Entity: r.entity, WPS: r.wps_id, Gate: r.gate_id, Owner: r.owner, Due: r.due_date, Status: r.status, Review: r.review_status, Evidence: r.evidence_ids.join(", "), Acceptance: r.acceptance_ids.join(", "), Source: r.source_kind })),
    }]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search ID, title, owner…" className="h-8 w-64 pl-8 text-xs" />
        </div>
        {filters.includes("vessel") && (
          <Select value={vessel} onValueChange={setVessel}>
            <SelectTrigger className="h-8 w-[120px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value={VESSEL}>{VESSEL}</SelectItem></SelectContent>
          </Select>
        )}
        {filters.includes("status") && <F value={status} set={setStatus} items={statuses} placeholder="Statuses" />}
        {filters.includes("owner") && <F value={owner} set={setOwner} items={owners} placeholder="Owners" />}
        {filters.includes("wps") && <F value={wps} set={setWps} items={wpsList} placeholder="WPS" />}
        {filters.includes("due") && <F value={due} set={setDue} items={["overdue", "30d", "none"]} placeholder="Due dates" labels={{ overdue: "Overdue", "30d": "Due in 30 days", none: "No due date" }} />}
        {filters.includes("closure") && <F value={closure} set={setClosure} items={["open", "blocked", "completed"]} placeholder="Closure" labels={{ open: "Open", blocked: "Blocked / overdue", completed: "Completed" }} />}
        <span className="ml-auto text-xs text-muted-foreground">{filtered.length} of {rows.length}</span>
        <Button size="sm" variant="outline" className="h-8" onClick={doExport}><Download className="mr-1 h-3.5 w-3.5" />Excel</Button>
      </div>
      <div className="maritime-card overflow-hidden">
        <div className="max-h-[68vh] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="border-b border-border">
                {cols.map((c) => <th key={c.key} className={`label-caps px-3 py-2 text-left ${c.width ?? ""}`}>{c.label}</th>)}
                <th className="label-caps w-20 px-3 py-2 text-left">Source</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 500).map((r) => (
                <tr key={r.id} onClick={() => sheet.open(r.id)} className="group/row cursor-pointer border-b border-border/50 transition-all hover:bg-accent/60">
                  {cols.map((c) => (
                    <td key={c.key} className="px-3 py-2 align-top">
                      {c.render ? c.render(r) : c.key === "rid" ? <span className="rid">{r.rid}</span> : c.key === "status" ? (
                        <span className="flex flex-wrap gap-1"><StatusBadge value={r.status} />{isOverdue(r) && <StatusBadge value="Overdue" className="border-destructive/40 text-destructive" />}</span>
                      ) : c.key === "title" ? <span className="line-clamp-2">{r.title}</span> : <span className="text-xs text-muted-foreground">{String(r[c.key as keyof Rec] ?? "—")}</span>}
                    </td>
                  ))}
                  <td className="px-3 py-2 align-top"><SourceBadge kind={r.source_kind} /></td>
                </tr>
              ))}
              {!filtered.length && <tr><td colSpan={cols.length + 1} className="px-3 py-10 text-center text-sm text-muted-foreground">No matching items.</td></tr>}
            </tbody>
          </table>
          {filtered.length > 500 && <p className="p-2 text-center text-xs text-muted-foreground">Showing first 500 — refine filters or export to Excel.</p>}
        </div>
      </div>
    </div>
  );
}
