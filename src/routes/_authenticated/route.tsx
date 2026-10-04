import { createFileRoute, Link, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Anchor, BookOpen, ClipboardCheck, FileText, Gauge, History, Layers, ListChecks, LogOut, Scale, ShieldAlert, Ship, Upload, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { RecordSheetProvider, useRecordSheet } from "@/components/RecordSheet";
import { useRecords } from "@/lib/records";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: Shell,
});

const NAV = [
  { to: "/dashboard", label: "Command Center", icon: Gauge },
  { to: "/r/rule", label: "Rules Register", icon: Scale },
  { to: "/r/wps", label: "Work Packages", icon: Layers },
  { to: "/r/gap", label: "Findings & CAPA", icon: ShieldAlert },
  { to: "/r/task", label: "Tasks", icon: ListChecks },
  { to: "/r/evidence", label: "Evidence", icon: FileText },
  { to: "/r/gate", label: "Gates", icon: ClipboardCheck },
  { to: "/r/responsibility", label: "Responsibilities", icon: Users },
  { to: "/r/risk", label: "Risks", icon: ShieldAlert },
  { to: "/r/change", label: "Changes", icon: History },
  { to: "/r/equipment", label: "Vessel & Equipment", icon: Ship },
  { to: "/ai-review", label: "AI Evidence Review", icon: FileText },
  { to: "/user-guide", label: "User Guide", icon: BookOpen },
  { to: "/audit", label: "Audit & Reports", icon: History },
  { to: "/import", label: "Workbook Import", icon: Upload },
] as const;

function Shell() {
  const { user, roles, isAdmin } = useAuth();
  const nav = useNavigate();
  const { all } = useRecords();
  const sheet = useRecordSheet();
  const [searchOpen, setSearchOpen] = useState(false);
  const [q, setQ] = useState("");
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setSearchOpen(true); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const results = q.trim() ? all.filter((r) => `${r.rid} ${r.title} ${r.description ?? ""} ${r.owner ?? ""}`.toLowerCase().includes(q.toLowerCase())).slice(0, 20) : [];
  return (
    <RecordSheetProvider>
      <div className="flex min-h-screen">
        <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
          <div className="flex items-center gap-2 border-b border-sidebar-border px-4 py-4">
            <Anchor className="h-5 w-5 text-primary" />
            <div><p className="font-display text-lg font-semibold leading-none tracking-wide">PMS 11</p><p className="label-caps mt-1">Closure Loop</p></div>
          </div>
          <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
            <button onClick={() => setSearchOpen(true)} className="mb-2 flex w-full items-center justify-between rounded-sm border border-sidebar-border px-3 py-1.5 text-xs text-sidebar-foreground/70 hover:bg-sidebar-accent"><span>Global Search</span><kbd className="rounded border px-1">Ctrl K</kbd></button>
            {NAV.map((n) => (
              <Link key={n.to} to={n.to as "/dashboard"} className="flex items-center gap-2 rounded-sm px-3 py-1.5 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent" activeProps={{ className: "bg-sidebar-accent text-primary" }}>
                <n.icon className="h-4 w-4" />{n.label}
              </Link>
            ))}
            <Link to="/admin/users" className={`flex items-center gap-2 rounded-sm px-3 py-1.5 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent ${isAdmin ? "" : "hidden"}`}><Users className="h-4 w-4" />Admin Console</Link>
          </nav>
          <div className="border-t border-sidebar-border p-3 text-xs">
            <p className="truncate">{user?.email}</p>
            <p className="label-caps mt-0.5">{roles.join(", ") || "no role"}</p>
            <button onClick={async () => { await supabase.auth.signOut(); nav({ to: "/auth", replace: true }); }} className="mt-2 flex items-center gap-1 text-muted-foreground hover:text-foreground"><LogOut className="h-3 w-3" />Sign out</button>
          </div>
        </aside>
        <main className="min-w-0 flex-1 p-6"><Outlet /></main>
        {searchOpen && <div className="fixed inset-0 z-50 bg-black/50 p-6" onMouseDown={() => setSearchOpen(false)}>
          <div className="mx-auto mt-16 max-w-2xl rounded-lg border border-border bg-card shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
            <div className="border-b border-border p-3"><Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search ID, title, owner, description…" /></div>
            <div className="max-h-[60vh] overflow-auto p-2">{!q.trim() ? <p className="p-4 text-sm text-muted-foreground">Type to search all PMS-11 records. Press Esc or click outside to close.</p> : results.length ? results.map((r) => <button key={r.id} onClick={() => { setSearchOpen(false); setQ(""); sheet.open(r.id); }} className="flex w-full items-start gap-3 rounded-md p-3 text-left hover:bg-accent"><span className="rid w-28 shrink-0">{r.rid}</span><span className="min-w-0"><b className="block truncate">{r.title}</b><span className="text-xs text-muted-foreground">{r.entity} · {r.owner ?? "No owner"}</span></span></button>) : <p className="p-4 text-sm text-muted-foreground">No matching records.</p>}</div>
          </div>
        </div>}
      </div>
    </RecordSheetProvider>
  );
}
