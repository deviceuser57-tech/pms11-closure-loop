import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRecords } from "@/lib/records";
import { askPms11AI } from "@/lib/ai-chat.functions";

export const Route = createFileRoute("/_authenticated/ai-chat")({
  head: () => ({ meta: [{ title: "PMS-11 AI Command Chat — Closure Loop" }] }),
  component: AIChat,
});

type Message = { q: string; r?: any; error?: string };

function AIChat() {
  const { all } = useRecords();
  const ask = useServerFn(askPms11AI);
  const [question, setQuestion] = useState("What should happen next?");
  const [wps, setWps] = useState("__ALL__");
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const wpsRows = all.filter(r => r.entity === "wps");

  const send = async () => {
    if (!question.trim() || busy) return;
    const q = question.trim();
    setBusy(true);
    try {
      const out = await ask({ data: { question: q, wps: wps === "__ALL__" ? "" : wps } });
      const response = out as any;
      setMessages(m => [...m, { q, r: response?.result, error: response?.error }]);
    } catch (e) {
      setMessages(m => [...m, { q, error: e instanceof Error ? e.message : String(e) }]);
    } finally {
      setBusy(false);
    }
  };

  return <div className="mx-auto max-w-5xl space-y-5">
    <header><p className="label-caps">Operational intelligence</p><h1 className="font-display text-3xl font-semibold">PMS-11 AI Command Chat</h1><p className="text-sm text-muted-foreground">هذا ليس Chat عام؛ يقرأ بيانات PMS-11 الظاهرة لحسابك ويقترح خطوة الإغلاق التالية فقط من السجلات المتاحة.</p></header>
    <section className="maritime-card p-4"><div className="flex flex-wrap gap-2"><Select value={wps} onValueChange={setWps}><SelectTrigger className="w-64"><SelectValue placeholder="WPS context"/></SelectTrigger><SelectContent><SelectItem value="__ALL__">All visible WPS</SelectItem>{wpsRows.map(r => <SelectItem key={r.rid} value={r.rid}>{r.rid} — {r.title}</SelectItem>)}</SelectContent></Select><textarea className="min-h-24 flex-1 rounded-md border border-input bg-background p-3 text-sm" value={question} onChange={e => setQuestion(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder="Ask what needs to happen next…"/><Button onClick={send} disabled={busy || !question.trim()}><Send className="mr-1 h-4 w-4"/>{busy ? "Thinking…" : "Ask AI"}</Button></div></section>
    {!messages.length && <div className="maritime-card p-6"><Sparkles className="mb-2 h-5 w-5 text-primary"/><p className="font-medium">Try questions such as:</p><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground"><li>What is blocking WPS-17?</li><li>What evidence is missing before the next gate decision?</li><li>Which task should the responsible department execute next?</li><li>Show me the shortest closure path for WPS-01.</li></ul></div>}
    {messages.map((m, i) => <article key={i} className="maritime-card space-y-3 p-4"><p className="text-sm font-medium">You: {m.q}</p>{m.error ? <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"><b>AI Command Chat error:</b> {m.error}</div> : m.r ? <div className="space-y-3 text-sm"><p>{m.r.answer}</p><div className="grid gap-3 md:grid-cols-2"><div><p className="label-caps">Current state</p><p>{m.r.current_state}</p></div><div><p className="label-caps">Next action</p><p className="font-medium">{m.r.next_action}</p></div><div><p className="label-caps">Responsible department</p><p>{m.r.responsible_department}</p></div><div><p className="label-caps">Gate impact</p><p>{m.r.gate_impact}</p></div></div><div><p className="label-caps">Blockers</p><ul className="list-disc pl-5">{(m.r.blockers ?? []).map((x: string) => <li key={x}>{x}</li>)}</ul></div><div><p className="label-caps">Next records</p><p className="rid">{(m.r.next_record_ids ?? []).join(", ") || "None identified"}</p></div><div><p className="label-caps">Required evidence</p><ul className="list-disc pl-5">{(m.r.required_evidence ?? []).map((x: string) => <li key={x}>{x}</li>)}</ul></div><p className="text-xs text-muted-foreground">Confidence: {m.r.confidence ?? 0}%</p></div> : null}</article>)}
  </div>;
}
