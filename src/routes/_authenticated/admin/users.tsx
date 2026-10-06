import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ShieldCheck, Plus, Pencil, Trash2, BookOpen, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type { Tables } from "@/integrations/supabase/types";
import { wpsRelationshipCounts, useRecords } from "@/lib/records";

const ROLES = ["admin", "reviewer", "contributor", "viewer"] as const;
type Role = typeof ROLES[number];

const ADMIN_REGISTERS = [
  ["rule", "Rules"], ["wps", "Work Packages"], ["activity", "Activities"],
  ["task", "Tasks"], ["gap", "Findings & CAPA"], ["deliverable", "Deliverables"],
  ["evidence", "Evidence"], ["acceptance", "Acceptance"], ["gate", "Gates"],
  ["responsibility", "Responsibilities"], ["risk", "Risks"], ["change", "Changes"],
  ["equipment", "Equipment"],
] as const;

const WPS_COUNT_COLUMNS = [
  ["rule", "Rules"], ["evidence", "Evidence"], ["activity", "Activities"],
  ["deliverable", "Deliverables"], ["task", "Tasks"], ["gap", "Gaps"], ["acceptance", "Acceptance"],
] as const;

/** Role permission matrix — authoritative reference for the "who can do what" panel. */
const PERMISSION_MATRIX = [
  {
    role: "admin" as Role, label: "Admin",
    canEdit: true, canReview: true, isAdmin: true, canDelete: true,
    description: "Full access: assign roles, import workbook, delete records, approve gates and manage gate quorum.",
  },
  {
    role: "reviewer" as Role, label: "Reviewer",
    canEdit: true, canReview: true, isAdmin: false, canDelete: false,
    description: "Review and approve evidence, findings and gate decisions. Cannot delete records or assign roles.",
  },
  {
    role: "contributor" as Role, label: "Contributor",
    canEdit: true, canReview: false, isAdmin: false, canDelete: false,
    description: "Create and edit records within their assigned department. Cannot approve, close gates or delete.",
  },
  {
    role: "viewer" as Role, label: "Viewer",
    canEdit: false, canReview: false, isAdmin: false, canDelete: false,
    description: "Read-only access to records in their assigned department.",
  },
];

const PERM_COLS = [
  { key: "canEdit",   label: "Edit / Create"    },
  { key: "canReview", label: "Review / Approve" },
  { key: "isAdmin",   label: "Role Management"  },
  { key: "canDelete", label: "Delete Records"   },
] as const;

export const Route = createFileRoute("/_authenticated/admin/users")({
  staticData: { sitemap: false },
  head: () => ({ meta: [{ title: "Admin Console — PMS 11 Closure Loop" }, { name: "description", content: "Manage user roles, departments, gate quorum settings and the permission matrix for the PMS 11 closure tracker." }] }),
  component: UsersAdmin,
});

function DepartmentOwnerRoleMatrix() {
  const { isAdmin } = useAuth();
  const q = useQuery({
    queryKey: ["department-owner-role-matrix"],
    enabled: isAdmin,
    queryFn: async () => {
      const [{ data: departments, error: de }, { data: roles, error: re }, { data: links, error: le }] = await Promise.all([
        supabase.from("departments").select("id,name,active").eq("active", true).order("name"),
        supabase.from("owner_roles").select("id,name,active").eq("active", true).order("name"),
        supabase.from("department_owner_roles").select("department_id,owner_role_id"),
      ]);
      if (de) throw de; if (re) throw re; if (le) throw le;
      return { departments: departments ?? [], roles: roles ?? [], links: links ?? [] };
    },
  });
  const [selected, setSelected] = useState("");
  const [saving, setSaving] = useState(false);
  if (!isAdmin) return null;
  const data = q.data;
  const currentDepartment = data?.departments.find((d: any) => d.id === selected);
  const linked = new Set((data?.links ?? []).filter((x: any) => x.department_id === selected).map((x: any) => x.owner_role_id));
  const toggle = async (roleId: string, checked: boolean) => {
    if (!selected) return;
    setSaving(true);
    try {
      const result = checked
        ? await supabase.from("department_owner_roles").insert({ department_id: selected, owner_role_id: roleId } as never)
        : await supabase.from("department_owner_roles").delete().eq("department_id", selected).eq("owner_role_id", roleId);
      if (result.error) throw result.error;
      await q.refetch();
      toast.success(checked ? "Owner role linked to department." : "Owner role unlinked.");
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    finally { setSaving(false); }
  };
  return <section className="maritime-card overflow-hidden">
    <div className="border-b border-border p-5"><p className="label-caps">Master data</p><h2 className="font-display text-2xl">Department → Owner Roles</h2><p className="mt-1 text-sm text-muted-foreground">Owner means a job/position, not a person. Select a Department and assign only the Owner Roles valid for that department. These mappings drive cascading Department → Owner dropdowns.</p></div>
    <div className="grid gap-5 p-5 md:grid-cols-[280px_1fr]">
      <div className="space-y-2"><label className="label-caps">Department</label><Select value={selected} onValueChange={setSelected}><SelectTrigger><SelectValue placeholder="Select Department" /></SelectTrigger><SelectContent>{(data?.departments ?? []).map((d: any)=><SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent></Select>{currentDepartment && <p className="text-xs text-muted-foreground">Mapped Owner Roles: {linked.size}</p>}</div>
      <div><p className="label-caps mb-2">Owner Roles for selected Department</p>{!selected ? <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">Select a Department first.</p> : <div className="grid gap-2 sm:grid-cols-2">{(data?.roles ?? []).map((role: any)=><label key={role.id} className="flex items-center gap-2 rounded-md border border-border p-2 text-sm hover:bg-accent"><input type="checkbox" checked={linked.has(role.id)} disabled={saving} onChange={e=>toggle(role.id,e.target.checked)} />{role.name}</label>)}</div>}</div>
    </div>
  </section>;
}

function Tick({ yes }: { yes: boolean }) {
  return yes
    ? <span className="text-success font-bold text-base">✓</span>
    : <span className="text-muted-foreground">—</span>;
}

function UsersAdmin() {
  const { isAdmin, loading } = useAuth();
  const records = useRecords();

  const q = useQuery({
    queryKey: ["admin-users"],
    enabled: isAdmin,
    queryFn: async () => {
      const [{ data: profiles, error: pe }, { data: roles, error: re }] = await Promise.all([
        supabase.from("profiles").select("*").order("email"),
        supabase.from("user_roles").select("*"),
      ]);
      if (pe) throw pe;
      if (re) throw re;
      // `department` exists in the database but not yet in the generated table types.
      type AdminProfile = Tables<"profiles"> & { department?: string | null };
      return ((profiles ?? []) as unknown as AdminProfile[]).map(p => ({
        ...p,
        roles: (roles ?? []).filter(r => r.user_id === p.id).map(r => r.role as Role),
      }));
    },
  });

  const [saving, setSaving] = useState<string | null>(null);
  const [quorumDraft, setQuorumDraft] = useState<Record<string, string>>({});

  if (loading) return <p className="text-sm text-muted-foreground">Checking permissions…</p>;
  if (!isAdmin) return (
    <div className="maritime-card p-6">
      <h1 className="font-display text-2xl">Admin only</h1>
      <p className="mt-2 text-sm text-muted-foreground">User role and department administration requires the Admin role.</p>
    </div>
  );

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

  const setDepartment = async (userId: string, department: string) => {
    setSaving(userId);
    try {
      const { error } = await supabase.rpc("set_user_department" as never, { _user_id: userId, _department: department } as never);
      if (error) throw error;
      await q.refetch();
      toast.success("Department scope updated.");
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    finally { setSaving(null); }
  };

  const saveQuorum = async (gateRid: string, quorum: number) => {
    if (quorum < 1 || quorum > 10) { toast.error("Quorum must be between 1 and 10."); return; }
    setSaving("quorum:" + gateRid);
    try {
      const gate = records.of("gate").find(g => g.rid === gateRid);
      if (!gate) throw new Error("Gate not found");
      const { error } = await supabase.from("records").update({ quorum_required: quorum } as never).eq("id", gate.id);
      if (error) throw error;
      await records.refetch();
      toast.success(`${gateRid} quorum set to ${quorum}.`);
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    finally { setSaving(null); }
  };

  const gates = records.of("gate").sort((a, b) => a.rid.localeCompare(b.rid));
  const departments = [...new Set([
    ...records.all.map(r => r.department),
    ...(q.data ?? []).map(u => u.department),
  ].filter(Boolean) as string[])].sort();

  return (
    <div className="space-y-8">
      <header>
        <p className="label-caps">Administration</p>
        <h1 className="font-display text-3xl font-semibold">Admin Console</h1>
        <p className="text-sm text-muted-foreground">Admin sees the full PMS-11 dataset. Department users are restricted at database/RLS level to records explicitly assigned to their department.</p>
      </header>

      {/* ── Permission Matrix ──────────────────────────────────────────────── */}
      <section className="maritime-card overflow-hidden">
        <div className="border-b border-border p-5">
          <p className="label-caps">Access control</p>
          <h2 className="font-display text-2xl">Role Permission Matrix</h2>
          <p className="mt-1 text-sm text-muted-foreground">Defines what each role can do. Enforced at the database (RLS) level — this panel is informational and visible to all authenticated users via the User Guide.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="label-caps px-4 py-3 text-left">Role</th>
                {PERM_COLS.map(c => <th key={c.key} className="label-caps px-4 py-3 text-center">{c.label}</th>)}
                <th className="label-caps px-4 py-3 text-left">Scope</th>
              </tr>
            </thead>
            <tbody>
              {PERMISSION_MATRIX.map(row => (
                <tr key={row.role} className="border-b border-border/50 last:border-0 hover:bg-accent/20">
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-semibold capitalize">{row.label}</span>
                  </td>
                  {PERM_COLS.map(c => (
                    <td key={c.key} className="px-4 py-3 text-center">
                      <Tick yes={Boolean(row[c.key as keyof typeof row])} />
                    </td>
                  ))}
                  <td className="px-4 py-3 text-xs text-muted-foreground">{row.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Gate Quorum ────────────────────────────────────────────────────── */}
      <section className="maritime-card overflow-hidden">
        <div className="border-b border-border p-5">
          <p className="label-caps">Gate governance</p>
          <h2 className="font-display text-2xl">Gate Approval Quorum</h2>
          <p className="mt-1 text-sm text-muted-foreground">Set how many distinct Reviewer/Admin approvals are required before a gate can transition to "Go". Default is 1. For IMO/class compliance, critical gates should require ≥ 2.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="label-caps px-4 py-3 text-left">Gate</th>
                <th className="label-caps px-4 py-3 text-left">Name</th>
                <th className="label-caps px-4 py-3 text-center">Status</th>
                <th className="label-caps px-4 py-3 text-center">Quorum Required</th>
                <th className="label-caps px-4 py-3 text-left">Save</th>
              </tr>
            </thead>
            <tbody>
              {gates.map(g => {
                const current = ((g as Record<string, unknown>)["quorum_required"] as number) ?? 1;
                const draft = quorumDraft[g.rid] ?? String(current);
                return (
                  <tr key={g.rid} className="border-b border-border/50 last:border-0 hover:bg-accent/20">
                    <td className="px-4 py-3 font-mono text-xs font-medium text-primary">{g.rid}</td>
                    <td className="px-4 py-3 text-sm">{g.title}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${g.no_go_active ? "bg-destructive/10 text-destructive" : g.status === "Go" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>
                        {g.no_go_active ? "No-Go" : g.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Input
                        id={`quorum-${g.rid}`}
                        type="number" min={1} max={10}
                        value={draft}
                        className="h-8 w-20 text-center mx-auto"
                        onChange={e => setQuorumDraft(prev => ({ ...prev, [g.rid]: e.target.value }))}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <Button
                        size="sm" variant="outline"
                        disabled={saving === "quorum:" + g.rid || draft === String(current)}
                        onClick={() => saveQuorum(g.rid, parseInt(draft, 10))}
                      >
                        Set
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {!gates.length && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-sm text-muted-foreground">No gates loaded yet. Run the workbook import first.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Department → Owner Role master relationship ───────────────────── */}
      <DepartmentOwnerRoleMatrix />

      {/* ── Record Administration ──────────────────────────────────────────── */}
      <section className="maritime-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="label-caps">Record Administration</p>
            <h2 className="font-display text-2xl">Add · Edit · Delete</h2>
          </div>
          <Link to="/user-guide"><Button variant="outline"><BookOpen className="mr-1 h-4 w-4" />User Guide</Button></Link>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {ADMIN_REGISTERS.map(([key, label]) => (
            <Link key={key} to="/r/$entity" params={{ entity: key }} className="flex items-center justify-between rounded-md border border-border p-3 hover:bg-accent">
              <span className="text-sm font-medium">{label}</span>
              <span className="flex gap-1 text-muted-foreground"><Plus className="h-3.5 w-3.5" /><Pencil className="h-3.5 w-3.5" /><Trash2 className="h-3.5 w-3.5" /></span>
            </Link>
          ))}
        </div>
      </section>

      {/* ── User Role & Department ─────────────────────────────────────────── */}
      <section className="maritime-card overflow-hidden">
        <div className="border-b border-border p-5">
          <p className="label-caps">Identity & access</p>
          <h2 className="font-display text-2xl">User Role + Department Scope</h2>
          <p className="text-xs text-muted-foreground">Department names are not invented — enter the organisation's actual department name. Records remain Unassigned until an Admin assigns them.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1050px] text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="label-caps px-4 py-3 text-left">User</th>
                <th className="label-caps px-4 py-3 text-left">Role</th>
                <th className="label-caps px-4 py-3 text-left">Department</th>
                <th className="label-caps px-4 py-3 text-left">Save</th>
              </tr>
            </thead>
            <tbody>
              {(q.data ?? []).map(u => (
                <tr key={u.id} className="border-b border-border/50">
                  <td className="px-4 py-3"><p>{u.display_name || "—"}</p><p className="text-xs text-muted-foreground">{u.email || u.id}</p></td>
                  <td className="px-4 py-3">
                    <Select value={u.roles[0] ?? ""} onValueChange={v => setRole(u.id, v as Role)} disabled={saving === u.id}>
                      <SelectTrigger className="w-36"><SelectValue placeholder="Role" /></SelectTrigger>
                      <SelectContent>{ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                    </Select>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <Select value={u.department ?? "__NONE__"} onValueChange={v => setDepartment(u.id, v === "__NONE__" ? "" : v)} disabled={saving === u.id}>
                        <SelectTrigger className="w-56"><SelectValue placeholder="Department" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__NONE__">Unassigned</SelectItem>
                          {departments.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Input className="w-48" defaultValue={u.department ?? ""} placeholder="Or type department" onBlur={e => { if (e.target.value !== (u.department ?? "")) setDepartment(u.id, e.target.value); }} />
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Button size="sm" variant="outline" disabled={saving === u.id} onClick={() => setRole(u.id, (u.roles[0] ?? "viewer") as Role)}>
                      <ShieldCheck className="mr-1 h-3.5 w-3.5" />Save role
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
