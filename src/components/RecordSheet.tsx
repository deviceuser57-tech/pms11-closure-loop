import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge, SourceBadge } from "@/components/badges";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  blockers,
  evidenceIdsForRecord,
  wpsRelationships,
  CLOSABLE,
  ENTITY_LABEL,
  isExpired,
  statusOptions,
  useInvalidateRecords,
  useRecords,
  type Rec,
} from "@/lib/records";
import { useSetupList } from "@/lib/setup-metadata";
import { runEvidenceAssessment } from "@/lib/ai-assess.functions";

type RecordSheetContext = {
  open: (id: string) => void;
  close: () => void;
};

const Ctx = createContext<RecordSheetContext>({
  open: () => {},
  close: () => {},
});

export const useRecordSheet = () => useContext(Ctx);

export function RecordSheetProvider({ children }: { children: ReactNode }) {
  const [id, setId] = useState<string | null>(null);

  return (
    <Ctx.Provider
      value={{
        open: setId,
        close: () => setId(null),
      }}
    >
      {children}
      <Sheet open={Boolean(id)} onOpenChange={(open) => !open && setId(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
          {id ? <Detail id={id} /> : null}
        </SheetContent>
      </Sheet>
    </Ctx.Provider>
  );
}

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground">
      {children}
    </Label>
  );
}

function Detail({ id }: { id: string }) {
  const { all, get } = useRecords();
  const { canEdit, canReview, user } = useAuth();
  const invalidate = useInvalidateRecords();
  const sheet = useRecordSheet();
  const assess = useServerFn(runEvidenceAssessment);

  const record = all.find((item) => item.id === id);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Partial<Rec>>({});
  const [comment, setComment] = useState("");
  const [evidenceText, setEvidenceText] = useState("");
  const [assessment, setAssessment] = useState<Record<string, unknown> | null>(null);
  const [assessing, setAssessing] = useState(false);

  useEffect(() => {
    if (!record) return;

    setEditing(false);
    setForm({
      owner: record.owner,
      due_date: record.due_date,
      status: record.status,
      execution_note: record.execution_note,
      expiry_date: record.expiry_date,
      doc_number: record.doc_number,
      revision: record.revision,
      issuer: record.issuer,
      no_go_active: record.no_go_active,
      criticality: record.criticality,
      applicability: record.applicability,
    });
  }, [record?.id, record?.updated_at]);

  const reviews = useQuery({
    queryKey: ["reviews", id],
    queryFn: async () =>
      (await supabase
        .from("reviews")
        .select("*")
        .eq("record_id", id)
        .order("created_at", { ascending: false })).data ?? [],
  });

  const files = useQuery({
    queryKey: ["files", id],
    queryFn: async () =>
      (await supabase
        .from("evidence_files")
        .select("*")
        .eq("record_id", id)
        .order("created_at", { ascending: false })).data ?? [],
  });

  if (!record) return null;

  const sourceData = (record.data ?? {}) as Record<string, unknown>;
  const wpsLinks = record.entity === "wps" ? wpsRelationships(record, all) : null;
  const closureBlockers = CLOSABLE.includes(record.entity)
    ? blockers(record, get, all)
    : [];

  const governedStatus = useSetupList(record.entity, "status");
  const governedCriticality = useSetupList(record.entity, "criticality");
  const governedApplicability = useSetupList(record.entity, "applicability");

  const statusValues = [
    ...new Set(
      [record.status, ...governedStatus, ...statusOptions(record.entity)].filter(Boolean) as string[],
    ),
  ];

  const criticalityValues = [
    ...new Set([record.criticality, ...governedCriticality].filter(Boolean) as string[]),
  ];

  const applicabilityValues = [
    ...new Set([record.applicability, ...governedApplicability].filter(Boolean) as string[]),
  ];

  const ownerValues = [
    ...new Set(
      all.flatMap((item) => {
        const data = (item.data ?? {}) as Record<string, unknown>;
        return [
          item.owner,
          data["Owner Department"],
          data["Responsible Department"],
          data["Department"],
        ].filter(
          (value): value is string =>
            typeof value === "string" &&
            value.trim().length > 0 &&
            !/^(tbc|to be assigned|rule\/wps owner)$/i.test(value.trim()),
        );
      }),
    ),
  ].sort((a, b) => a.localeCompare(b));

  const save = async (patch: Partial<Rec>) => {
    const { error } = await supabase
      .from("records")
      .update(patch as never)
      .eq("id", record.id);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Saved");
    setEditing(false);
    invalidate();
  };

  const remove = async () => {
    if (!canEdit) return;
    if (!window.confirm("Delete this record? This cannot be undone.")) return;

    const { error } = await supabase.from("records").delete().eq("id", record.id);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Record deleted");
    sheet.close();
    invalidate();
  };

  const submitReview = async (decision: string) => {
    const kind = record.entity === "gate" ? "gate" : "review";

    const { error } = await supabase.from("reviews").insert({
      record_id: record.id,
      decision,
      comment,
      kind,
      reviewer_name: user?.email,
    } as never);

    if (error) {
      toast.error(error.message);
      return;
    }

    const patch: Partial<Rec> =
      record.entity === "gate"
        ? { status: decision, no_go_active: decision === "No-Go" }
        : record.entity === "evidence"
          ? {
              status: decision === "Approved" ? "Accepted" : "Rejected",
              review_status: decision,
            }
          : { review_status: decision };

    await save(patch);
    setComment("");
    await reviews.refetch();
  };

  const upload = async (file: File) => {
    const path = `${record.entity}/${record.rid}/${Date.now()}-${file.name}`;

    const { error } = await supabase.storage.from("evidence").upload(path, file);

    if (error) {
      toast.error(error.message);
      return;
    }

    await supabase.from("evidence_files").insert({
      record_id: record.id,
      path,
      filename: file.name,
      size: file.size,
    } as never);

    if (record.entity === "evidence" && record.status === "Required") {
      await save({ status: "Submitted" });
    }

    await files.refetch();
    toast.success("Uploaded");
  };

  const openFile = async (path: string) => {
    const { data } = await supabase.storage.from("evidence").createSignedUrl(path, 300);
    if (data) window.open(data.signedUrl, "_blank");
  };

  const runAssessment = async () => {
    const latest = files.data?.[0];

    if (!latest) {
      toast.error("Upload an evidence file first.");
      return;
    }

    setAssessing(true);

    try {
      const result = await assess({
        data: {
          requirementId: record.id,
          filePath: latest.path,
          notes: "Assess against the linked acceptance criteria and PMS-11 requirement.",
        },
      });

      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
      }

      setAssessment(
        (result as { result?: Record<string, unknown> }).result ?? null,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setAssessing(false);
    }
  };

  const linked = (ids: string[], entity: string) => (
    <div className="flex flex-wrap gap-1.5">
      {ids.length === 0 ? (
        <span className="text-xs text-muted-foreground">None linked</span>
      ) : (
        ids.map((rid) => {
          const target = get(entity, rid);

          return (
            <button
              key={rid}
              type="button"
              disabled={!target}
              onClick={() => target && sheet.open(target.id)}
              className="flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 text-xs hover:bg-accent disabled:opacity-50"
            >
              <span className="rid">{rid}</span>
              {target ? (
                <StatusBadge value={isExpired(target) ? "Expired" : target.status} />
              ) : (
                <span className="text-destructive">unmatched</span>
              )}
            </button>
          );
        })
      )}
    </div>
  );

  return (
    <div className="space-y-5 pb-10">
      <SheetHeader>
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="rid">{record.rid}</span>
              <span className="label-caps">{ENTITY_LABEL[record.entity]}</span>
              <SourceBadge kind={record.source_kind} />
            </div>

            {canEdit ? (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEditing((value) => !value)}
                >
                  {editing ? "Cancel" : "Edit"}
                </Button>
                <Button size="sm" variant="destructive" onClick={remove}>
                  Delete
                </Button>
              </div>
            ) : null}
          </div>

          <SheetTitle className="font-display text-2xl leading-tight">
            {record.title}
          </SheetTitle>

          {record.description ? (
            <p className="text-sm text-muted-foreground">{record.description}</p>
          ) : null}

          <div className="flex flex-wrap gap-2 text-xs">
            <StatusBadge value={record.status} />
            {record.applicability ? <StatusBadge value={record.applicability} /> : null}
            <StatusBadge value={`Review: ${record.review_status}`} />
            {record.wps_id ? <span className="rid">{record.wps_id}</span> : null}
            {record.gate_id ? <span className="rid">{record.gate_id}</span> : null}
          </div>
        </div>
      </SheetHeader>

      {typeof sourceData["PMS-11 Scope Reconciliation"] === "string" ? (
        <div className="rounded-md border border-primary/40 bg-primary/5 p-3 text-sm">
          <p className="label-caps mb-1 text-primary">PMS-11 scope reconciliation (derived)</p>
          {sourceData["PMS-11 Scope Reconciliation"] as string}
        </div>
      ) : null}

      {CLOSABLE.includes(record.entity) && record.status !== "Closed" ? (
        <div
          className={
            closureBlockers.length
              ? "rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm"
              : "rounded-md border border-success/40 bg-success/5 p-3 text-sm"
          }
        >
          <p className="label-caps mb-1">Closure check</p>

          {closureBlockers.length ? (
            <ul className="list-disc pl-5 text-xs">
              {closureBlockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-success">
              All closure conditions met — item can be closed.
            </p>
          )}
        </div>
      ) : null}

      <section className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <FieldLabel>Owner *</FieldLabel>
          <Select
            disabled={!canEdit || !editing}
            value={form.owner ?? ""}
            onValueChange={(value) => setForm({ ...form, owner: value })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select owner / department" />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {form.owner && !ownerValues.includes(form.owner) ? (
                <SelectItem value={form.owner}>{form.owner} (current)</SelectItem>
              ) : null}

              {ownerValues.map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[10px] text-muted-foreground">
            Controlled from imported MASTER_DATA/record owner values; no new vocabulary is invented.
          </p>
        </div>

        <div className="space-y-1">
          <FieldLabel>Due date</FieldLabel>
          <Input
            type="date"
            disabled={!canEdit || !editing}
            value={form.due_date ?? ""}
            onChange={(event) =>
              setForm({ ...form, due_date: event.target.value || null })
            }
          />
        </div>

        <div className="space-y-1">
          <FieldLabel>Status</FieldLabel>
          <Select
            disabled={!canEdit || !editing}
            value={form.status ?? ""}
            onValueChange={(value) => setForm({ ...form, status: value })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statusValues.map((status) => (
                <SelectItem key={status} value={status}>
                  {status}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <FieldLabel>Criticality</FieldLabel>
          <Select
            disabled={!canEdit || !editing}
            value={form.criticality ?? ""}
            onValueChange={(value) => setForm({ ...form, criticality: value })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Governed value" />
            </SelectTrigger>
            <SelectContent>
              {criticalityValues.map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {applicabilityValues.length > 0 ? (
          <div className="space-y-1">
            <FieldLabel>Applicability</FieldLabel>
            <Select
              disabled={!canEdit || !editing}
              value={form.applicability ?? ""}
              onValueChange={(value) => setForm({ ...form, applicability: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Governed value" />
              </SelectTrigger>
              <SelectContent>
                {applicabilityValues.map((value) => (
                  <SelectItem key={value} value={value}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        {record.entity === "evidence" ? (
          <>
            <div className="space-y-1">
              <FieldLabel>Expiry</FieldLabel>
              <Input
                type="date"
                disabled={!canEdit || !editing}
                value={form.expiry_date ?? ""}
                onChange={(event) =>
                  setForm({ ...form, expiry_date: event.target.value || null })
                }
              />
            </div>

            <div className="space-y-1">
              <FieldLabel>Document no.</FieldLabel>
              <Input
                disabled={!canEdit || !editing}
                value={form.doc_number ?? ""}
                onChange={(event) => setForm({ ...form, doc_number: event.target.value })}
              />
            </div>

            <div className="space-y-1">
              <FieldLabel>Revision</FieldLabel>
              <Input
                disabled={!canEdit || !editing}
                value={form.revision ?? ""}
                onChange={(event) => setForm({ ...form, revision: event.target.value })}
              />
            </div>

            <div className="col-span-2 space-y-1">
              <FieldLabel>Issuer</FieldLabel>
              <Input
                disabled={!canEdit || !editing}
                value={form.issuer ?? ""}
                onChange={(event) => setForm({ ...form, issuer: event.target.value })}
              />
            </div>
          </>
        ) : null}

        {CLOSABLE.includes(record.entity) ? (
          <div className="col-span-2 space-y-1">
            <FieldLabel>Recorded execution *</FieldLabel>
            <Textarea
              disabled={!canEdit || !editing}
              value={form.execution_note ?? ""}
              onChange={(event) =>
                setForm({ ...form, execution_note: event.target.value })
              }
              placeholder="What was done, when, by whom"
            />
          </div>
        ) : null}
      </section>

      {canEdit && editing ? (
        <Button onClick={() => save(form)}>Save changes</Button>
      ) : null}

      <section className="space-y-2">
        <FieldLabel>Linked evidence</FieldLabel>
        {linked(evidenceIdsForRecord(record, all), "evidence")}

        {canEdit ? (
          <div className="flex gap-2">
            <Input
              placeholder="Add evidence ID e.g. E-001"
              value={evidenceText}
              onChange={(event) => setEvidenceText(event.target.value)}
              className="h-8 text-xs"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const value = evidenceText.trim();
                if (!value) return;

                void save({
                  evidence_ids: [...new Set([...record.evidence_ids, value])],
                });
                setEvidenceText("");
              }}
            >
              Link
            </Button>
          </div>
        ) : null}
      </section>

      <section className="space-y-2">
        <FieldLabel>Acceptance criteria</FieldLabel>
        {linked(record.entity === "wps" ? (wpsLinks?.acceptance ?? []) : record.acceptance_ids, "acceptance")}
      </section>

      {wpsLinks ? (
        <section className="space-y-3 rounded-md border border-primary/20 p-3">
          <div className="flex items-center justify-between">
            <FieldLabel>WPS relationship control</FieldLabel>
            <span className="text-[10px] font-mono text-muted-foreground">SOURCE-DRIVEN</span>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {([
              ["Rules", wpsLinks.rule],
              ["Evidence", wpsLinks.evidence],
              ["Activities", wpsLinks.activity],
              ["Deliverables", wpsLinks.deliverable],
              ["Tasks", wpsLinks.task],
              ["Gaps", wpsLinks.gap],
              ["Acceptance", wpsLinks.acceptance],
              ["RACI", wpsLinks.responsibility],
              ["Risks", wpsLinks.risk],
            ] as const).map(([label, ids]) => (
              <div key={label} className="rounded border border-border/70 p-2">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
                <div className="mt-1 font-mono text-lg font-semibold">{ids.length}</div>
              </div>
            ))}
          </div>
          <div className="space-y-2">
            {([
              ["Rules", wpsLinks.rule],
              ["Evidence", wpsLinks.evidence],
              ["Activities", wpsLinks.activity],
              ["Deliverables", wpsLinks.deliverable],
              ["Tasks", wpsLinks.task],
              ["Gaps", wpsLinks.gap],
              ["Acceptance", wpsLinks.acceptance],
              ["RACI", wpsLinks.responsibility],
              ["Risks", wpsLinks.risk],
            ] as const).filter(([, ids]) => ids.length > 0).map(([label, ids]) => (
              <div key={label} className="text-xs">
                <span className="font-semibold">{label}:</span> <span className="font-mono text-muted-foreground">{ids.join(", ")}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {record.links.length > 0 ? (
        <section className="space-y-2">
          <FieldLabel>Related items</FieldLabel>
          <p className="font-mono text-xs text-muted-foreground">
            {record.links.join(", ")}
          </p>
        </section>
      ) : null}

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <FieldLabel>Files</FieldLabel>

          {canReview && files.data?.length ? (
            <Button
              size="sm"
              variant="outline"
              onClick={runAssessment}
              disabled={assessing}
            >
              {assessing ? "Assessing…" : "AI Evidence Assessment"}
            </Button>
          ) : null}
        </div>

        {(files.data ?? []).map((file) => (
          <button
            key={file.id}
            type="button"
            onClick={() => void openFile(file.path)}
            className="block text-left text-xs text-primary underline"
          >
            {file.filename}
          </button>
        ))}

        {canEdit ? (
          <Input
            type="file"
            className="h-9 text-xs"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
            }}
          />
        ) : null}

        {assessment ? (
          <div className="space-y-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-xs">
            <div>
              <b>Verdict:</b> {String(assessment.verdict ?? "—")} ·{" "}
              <b>Confidence:</b> {String(assessment.confidence ?? "—")}%
            </div>
            <p>{String(assessment.summary ?? "")}</p>
            <div>
              <b>Missing proof:</b>{" "}
              {Array.isArray(assessment.missing_proof)
                ? assessment.missing_proof.join(" · ")
                : "None"}
            </div>
            <div>
              <b>Recommended actions:</b>{" "}
              {Array.isArray(assessment.recommended_actions)
                ? assessment.recommended_actions.join(" · ")
                : "None"}
            </div>
          </div>
        ) : null}
      </section>

      <section className="space-y-2">
        <FieldLabel>
          {record.entity === "gate" ? "Go / No-Go decisions" : "Review history"}
        </FieldLabel>

        {canReview ? (
          <div className="space-y-2">
            <Textarea
              placeholder="Comment"
              value={comment}
              onChange={(event) => setComment(event.target.value)}
            />

            <div className="flex gap-2">
              {(record.entity === "gate"
                ? ["Go", "Conditional", "No-Go"]
                : ["Approved", "Rejected"]
              ).map((decision) => (
                <Button
                  key={decision}
                  size="sm"
                  variant={/No-Go|Rejected/.test(decision) ? "destructive" : "default"}
                  onClick={() => void submitReview(decision)}
                >
                  {decision}
                </Button>
              ))}
            </div>
          </div>
        ) : null}

        {(reviews.data ?? []).map((review) => (
          <div
            key={review.id}
            className="rounded-sm border border-border p-2 text-xs"
          >
            <StatusBadge value={review.decision} />
            <span className="text-muted-foreground">
              {" "}
              {review.reviewer_name} · {new Date(review.created_at).toLocaleString()}
            </span>
            {review.comment ? <p className="mt-1">{review.comment}</p> : null}
          </div>
        ))}
      </section>

      <details className="text-xs">
        <summary className="label-caps cursor-pointer">Source workbook fields</summary>
        <dl className="mt-2 grid grid-cols-3 gap-x-3 gap-y-1">
          {Object.entries(sourceData).map(([key, value]) => (
            <div key={key} className="contents">
              <dt className="text-muted-foreground">{key}</dt>
              <dd className="col-span-2 break-words">{String(value)}</dd>
            </div>
          ))}
        </dl>
      </details>
    </div>
  );
}
