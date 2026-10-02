import { createFileRoute, Link } from "@tanstack/react-router";
import { Anchor } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "PMS 11 Closure Loop — Readiness & Closure" }, { name: "description", content: "Readiness and closure tracking for pipe-laying vessel PMS 11: rules, WPS, gaps, evidence and gates." }, { property: "og:title", content: "PMS 11 Closure Loop" }, { property: "og:description", content: "Readiness and closure tracking for pipe-laying vessel PMS 11." }] }),
  component: Landing,
});

const P: [string, string][] = [["IMO", "7511826"], ["MMSI", "622121517"], ["Flag", "Egypt"], ["Class", "Germanischer Lloyd"], ["Built", "1976"], ["Port of registry", "Alexandria"], ["DWT / GRT", "4,752 / 7,205 mt"], ["LOA × Breadth", "101 m × 34 m"], ["Shipyard", "Nederlandse Scheepsbouw, Amsterdam"], ["Owner / Manager", "Petroleum Marine Services, Cairo"], ["Previous names", "PETROJET 11 (2005), PETROJET 12 (2004), CLEVER TURTLE (1982)"]];

function Landing() {
  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center gap-10 p-8">
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-primary"><Anchor className="h-5 w-5" /><span className="label-caps text-primary">Pipe-laying vessel</span></div>
        <h1 className="font-display text-6xl font-semibold tracking-tight">PMS 11 Closure Loop</h1>
        <p className="max-w-2xl text-muted-foreground">Rules → WPS → Activity → Task → Evidence → Acceptance → Gate. An item closes only with an owner, recorded execution, valid evidence, a completed review, met acceptance criteria and no No-Go on its gate.</p>
        <Link to="/auth" className="inline-flex rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">Sign in</Link>
      </div>
      <dl className="maritime-card grid grid-cols-2 gap-x-6 gap-y-3 p-6 md:grid-cols-3">
        {P.map(([k, v]) => <div key={k}><dt className="label-caps">{k}</dt><dd className="text-sm">{v}</dd></div>)}
      </dl>
    </div>
  );
}
