import { cn } from "@/lib/utils";

const tone = (s: string) => {
  if (/^(closed|accepted|met|go|approved|certified)$/i.test(s)) return "border-success/40 bg-success/10 text-success";
  if (/(no-go|rejected|expired|blocked|reopened|critical|missing)/i.test(s)) return "border-destructive/40 bg-destructive/10 text-destructive";
  if (/(review|submitted|progress|conditional|partial|high|mitigat)/i.test(s)) return "border-warning/40 bg-warning/10 text-warning";
  if (/(not applicable|project-conditional)/i.test(s)) return "border-info/40 bg-info/10 text-info";
  return "border-border bg-muted/50 text-muted-foreground";
};

export function StatusBadge({ value, className }: { value?: string | null; className?: string }) {
  if (!value) return <span className="text-xs text-muted-foreground">—</span>;
  return <span className={cn("inline-flex items-center whitespace-nowrap rounded-sm border px-1.5 py-0.5 text-[11px] font-medium", tone(value), className)}>{value}</span>;
}

const SRC: Record<string, string> = {
  imported: "border-info/40 text-info",
  derived: "border-primary/50 text-primary",
  sample: "border-warning/50 text-warning",
  user: "border-border text-muted-foreground",
};
const SRC_LABEL: Record<string, string> = { imported: "Workbook", derived: "Derived", sample: "Sample", user: "Entered" };

export function SourceBadge({ kind }: { kind: string }) {
  return <span className={cn("rounded-sm border px-1 py-px font-mono text-[10px] uppercase tracking-wider", SRC[kind] ?? SRC.user)} title={`Source: ${kind}`}>{SRC_LABEL[kind] ?? kind}</span>;
}
