import { createFileRoute, Link, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { Anchor, ClipboardCheck, FileText, Gauge, History, Layers, ListChecks, LogOut, Scale, ShieldAlert, Ship, Upload, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { RecordSheetProvider } from "@/components/RecordSheet";

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
  { to: "/audit", label: "Audit & Reports", icon: History },
  { to: "/import", label: "Workbook Import", icon: Upload },
] as const;

function Shell() {
  const { user, roles } = useAuth();
  const nav = useNavigate();
  return (
    <RecordSheetProvider>
      <div className="flex min-h-screen">
        <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
          <div className="flex items-center gap-2 border-b border-sidebar-border px-4 py-4">
            <Anchor className="h-5 w-5 text-primary" />
            <div><p className="font-display text-lg font-semibold leading-none tracking-wide">PMS 11</p><p className="label-caps mt-1">Closure Loop</p></div>
          </div>
          <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
            {NAV.map((n) => (
              <Link key={n.to} to={n.to as "/dashboard"} className="flex items-center gap-2 rounded-sm px-3 py-1.5 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent" activeProps={{ className: "bg-sidebar-accent text-primary" }}>
                <n.icon className="h-4 w-4" />{n.label}
              </Link>
            ))}
          </nav>
          <div className="border-t border-sidebar-border p-3 text-xs">
            <p className="truncate">{user?.email}</p>
            <p className="label-caps mt-0.5">{roles.join(", ") || "no role"}</p>
            <button onClick={async () => { await supabase.auth.signOut(); nav({ to: "/auth", replace: true }); }} className="mt-2 flex items-center gap-1 text-muted-foreground hover:text-foreground"><LogOut className="h-3 w-3" />Sign out</button>
          </div>
        </aside>
        <main className="min-w-0 flex-1 p-6"><Outlet /></main>
      </div>
    </RecordSheetProvider>
  );
}
