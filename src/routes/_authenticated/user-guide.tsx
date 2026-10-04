import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen, CheckCircle2, ShieldCheck, Workflow } from "lucide-react";

export const Route = createFileRoute("/_authenticated/user-guide")({
  head: () => ({ meta: [{ title: "User Guide — PMS 11 Closure Loop" }] }),
  component: UserGuide,
});

function UserGuide() {
  return <div className="mx-auto max-w-5xl space-y-6">
    <header><p className="label-caps">PMS 11 · User Guide</p><h1 className="font-display text-4xl font-semibold">How to operate the Closure Loop</h1><p className="mt-2 text-sm text-muted-foreground">Use governed values, close the evidence loop, and keep every change auditable.</p></header>
    <div className="grid gap-4 md:grid-cols-3">
      <div className="maritime-card p-5"><BookOpen className="mb-3 h-5 w-5 text-primary"/><h2 className="font-semibold">Add</h2><p className="mt-2 text-sm text-muted-foreground">Open a register and use <b>Add Record</b>. Owner, Status, Criticality and Applicability use governed MASTER_DATA values.</p></div>
      <div className="maritime-card p-5"><Workflow className="mb-3 h-5 w-5 text-primary"/><h2 className="font-semibold">Edit / Delete</h2><p className="mt-2 text-sm text-muted-foreground">Use the row actions. Edit opens the record sheet; Delete requires confirmation. Avoid deleting source records unless the record is genuinely obsolete.</p></div>
      <div className="maritime-card p-5"><CheckCircle2 className="mb-3 h-5 w-5 text-primary"/><h2 className="font-semibold">Close</h2><p className="mt-2 text-sm text-muted-foreground">Closure requires an owner, recorded execution, approved review, valid evidence, met acceptance criteria and no active No-Go gate.</p></div>
    </div>
    <section className="maritime-card p-6 space-y-4"><h2 className="font-display text-2xl">Standard workflow</h2><ol className="list-decimal space-y-2 pl-5 text-sm"><li>Open the relevant register: WPS, Rules, Tasks, Gaps, Evidence, Gates, Responsibilities, Risks or Equipment.</li><li>Create or open the record and assign a real owner/department from the governed list.</li><li>Set only governed Status, Criticality and Applicability values.</li><li>Record execution and attach/link evidence.</li><li>Review the evidence and acceptance criteria.</li><li>Use the closure check before marking the item Closed.</li></ol></section>
    <section className="maritime-card p-6 space-y-3"><h2 className="font-display text-2xl">Administration</h2><p className="text-sm text-muted-foreground">Admins manage users and can access the register-level Add/Edit/Delete controls. User role changes are restricted to Admin.</p><Link to="/admin/users" className="inline-flex items-center gap-2 text-primary underline"><ShieldCheck className="h-4 w-4"/>Open Admin Console</Link></section>
  </div>;
}
