import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useRef } from "react";
import { FileText, Search } from "lucide-react";
import { useRecords } from "@/lib/records";
import { StatusBadge } from "@/components/badges";
import { useRecordSheet } from "@/components/RecordSheet";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";

export const Route = createFileRoute("/_authenticated/documents")({
  head: () => ({ meta: [{ title: "Document Control — PMS 11" }] }),
  component: DocumentControl,
});

function DocumentControl() {
  const { of, isLoading } = useRecords();
  const sheet = useRecordSheet();
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const container = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    gsap.from(".doc-row", {
      y: 10,
      opacity: 0,
      stagger: 0.02,
      duration: 0.4,
      ease: "power2.out"
    });
  }, { scope: container });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading documents...</p>;

  const docs = of("evidence");
  const statuses = ["ALL", ...new Set(docs.map(d => d.status).filter(Boolean))].sort();

  const filtered = docs.filter(d => {
    const matchQ = !q || `${d.rid} ${d.title} ${d.doc_number || ""} ${d.issuer || ""}`.toLowerCase().includes(q.toLowerCase());
    const matchStatus = statusFilter === "ALL" || d.status === statusFilter;
    return matchQ && matchStatus;
  });

  return (
    <div className="space-y-6" ref={container}>
      <header>
        <p className="label-caps">Controlled Documents</p>
        <h1 className="font-display text-4xl font-semibold">Document Control Register</h1>
        <p className="text-sm text-muted-foreground mt-2">Formal document lifecycle, revision tracking, and transmittal reference.</p>
      </header>

      <div className="maritime-card p-4 space-y-4">
        <div className="flex gap-4 items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search by ID, title, doc number or issuer..." value={q} onChange={e => setQ(e.target.value)} />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              {statuses.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Record ID</th>
                <th className="px-4 py-3 font-medium">Doc Number</th>
                <th className="px-4 py-3 font-medium">Title</th>
                <th className="px-4 py-3 font-medium">Rev</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Issuer</th>
                <th className="px-4 py-3 font-medium">Expiry</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {filtered.map(d => (
                <tr key={d.id} onClick={() => sheet.open(d.id)} className="doc-row group cursor-pointer hover:bg-accent/40 transition-colors">
                  <td className="px-4 py-3 rid text-primary group-hover:underline">{d.rid}</td>
                  <td className="px-4 py-3 font-mono text-xs">{d.doc_number || "—"}</td>
                  <td className="px-4 py-3 max-w-[300px] truncate">{d.title}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{d.revision || "—"}</td>
                  <td className="px-4 py-3"><StatusBadge value={d.status} /></td>
                  <td className="px-4 py-3 text-xs">{d.issuer || "—"}</td>
                  <td className="px-4 py-3 text-xs font-mono">{d.expiry_date || "—"}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No documents found matching the filters.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
