import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ShieldCheck, Plus, Pencil, Trash2, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

const ROLES = ["admin", "reviewer", "contributor", "viewer"] as const;
type Role = typeof ROLES[number];

const ADMIN_REGISTERS = [
  ["rule","Rules"],["wps","Work Packages"],["activity","Activities"],["task","Tasks"],["gap","Findings & CAPA"],["deliverable","Deliverables"],["evidence","Evidence"],["acceptance","Acceptance"],["gate","Gates"],["responsibility","Responsibilities"],["risk","Risks"],["change","Changes"],["equipment","Equipment"],
] as const;

export const Route = createFileRoute("/_authenticated/admin/users")({
  head: () => ({ meta: [{ title: "User Roles — PMS 11 Closure Loop" }] }),
  component: UsersAdmin,
});

function UsersAdmin() {
  const { isAdmin, loading } = useAuth();
  const q = useQuery({
    queryKey: ["admin-users"],
    enabled: isAdmin,
    queryFn: async () => {
      const [{ data: profiles, error: pe }, { data: roles, error: re }] = await Promise.all([
        supabase.from("profiles").select("*").order("email"),
        supabase.from("user_roles").select("*"),
      ]);
      if (pe) throw pe; if (re) throw re;
      return (profiles ?? []).map((p) => ({ ...p, roles: (roles ?? []).filter((r) => r.user_id === p.id).map((r) => r.role as Role) }));
    },
  });
  const [saving, setSaving] = useState<string | null>(null);

  if (loading) return <p className="text-sm text-muted-foreground">Checking permissions…</p>;
  if (!isAdmin) return <div className="maritime-card p-6"><h1 className="font-display text-2xl">Admin only</h1><p className="mt-2 text-sm text-muted-foreground">User role administration requires the Admin role.</p></div>;

  const setRole = async (userId: string, role: Role) => {
    setSaving(userId);
    try {
      const { error } = await supabase.rpc("set_user_role" as never, { _user_id: userId, _role: role } as never);
      if (error) throw error;
      await q.refetch();
      toast.success("Role updated.");
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    finally { setSaving(null); }
  };

  return <div className="space-y-6">
    <header><p className="label-caps">Administration</p><h1 className="font-display text-3xl font-semibold">User Roles</h1><p className="text-sm text-muted-foreground">Manage one governed application role per user. Changes are protected by Supabase RLS.</p></header>
    <section className="maritime-card p-5 space-y-4"><div className="flex items-center justify-between"><div><p className="label-caps">Record Administration</p><h2 className="font-display text-2xl">Add · Edit · Delete</h2><p className="text-sm text-muted-foreground">All register actions use the governed record forms and MASTER_DATA dropdowns.</p></div><Link to="/user-guide"><Button variant="outline"><BookOpen className="mr-1 h-4 w-4"/>User Guide</Button></Link></div><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{ADMIN_REGISTERS.map(([key,label])=><Link key={key} to="/r/$entity" params={{entity:key}} className="flex items-center justify-between rounded-md border border-border p-3 hover:bg-accent"><span className="text-sm font-medium">{label}</span><span className="flex gap-1 text-muted-foreground"><Plus className="h-3.5 w-3.5"/><Pencil className="h-3.5 w-3.5"/><Trash2 className="h-3.5 w-3.5"/></span></Link>)}</div></section>
    <div className="maritime-card overflow-hidden">
      <table className="w-full text-sm"><thead><tr className="border-b border-border"><th className="label-caps px-4 py-3 text-left">User</th><th className="label-caps px-4 py-3 text-left">Current role</th><th className="label-caps px-4 py-3 text-left">Set role</th></tr></thead>
      <tbody>{(q.data ?? []).map((u) => <tr key={u.id} className="border-b border-border/50"><td className="px-4 py-3"><p>{u.display_name || "—"}</p><p className="text-xs text-muted-foreground">{u.email || u.id}</p></td><td className="px-4 py-3"><span className="rid">{u.roles.join(", ") || "none"}</span></td><td className="px-4 py-3"><div className="flex gap-2"><Select value={u.roles[0] ?? ""} onValueChange={(v) => setRole(u.id, v as Role)} disabled={saving === u.id}><SelectTrigger className="w-40"><SelectValue placeholder="Choose role" /></SelectTrigger><SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent></Select><Button size="sm" variant="outline" disabled={saving === u.id} onClick={() => setRole(u.id, (u.roles[0] ?? "viewer") as Role)}><ShieldCheck className="mr-1 h-3.5 w-3.5" />Save</Button></div></td></tr>)}</tbody></table>
      {!q.data?.length && <div className="p-6 text-sm text-muted-foreground">No profiles found.</div>}
    </div>
  </div>;
}
