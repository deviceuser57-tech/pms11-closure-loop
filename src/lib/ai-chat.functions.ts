import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Tables } from "@/integrations/supabase/types";
import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";

const RUN = "X-Lovable-AIG-Run-ID";

function runIdFetch() {
  let runId: string | undefined;
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    if (runId && !headers.has(RUN)) headers.set(RUN, runId);
    const res = await fetch(input, { ...init, headers });
    runId ??= res.headers.get(RUN)?.trim() || undefined;
    return res;
  };
}

const input = z.object({
  question: z.string().min(2).max(6000),
  wps: z.string().optional(),
  entity: z.string().optional(),
});

export const askPms11AI = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => input.parse(d))
  .handler(async ({ data, context }) => {
    // `department` exists in the database but not yet in the generated table types.
    type AiRec = Tables<"records"> & { department?: string | null };
    const { data: rawRows, error } = await context.supabase
      .from("records")
      .select("id,entity,rid,title,description,wps_id,gate_id,parent_id,status,owner,department,due_date,criticality,review_status,evidence_ids,acceptance_ids,execution_note")
      .limit(5000);
    const rows = (rawRows ?? []) as unknown as AiRec[];

    if (error) {
      console.error("[PMS-11 AI] records query failed:", error);
      throw new Error("Unable to read PMS-11 records for AI analysis.");
    }

    const visibleRows = data.wps
      ? (rows ?? []).filter((r) => r.rid === data.wps || r.wps_id === data.wps || r.parent_id === data.wps)
      : (rows ?? []);

    const compact = visibleRows.slice(0, 2000).map((r) => ({
      id: r.rid,
      entity: r.entity,
      title: r.title,
      wps: r.wps_id,
      gate: r.gate_id,
      status: r.status,
      owner: r.owner,
      department: r.department,
      due: r.due_date,
      criticality: r.criticality,
      review: r.review_status,
      evidence: r.evidence_ids,
      acceptance: r.acceptance_ids,
      parent: r.parent_id,
      execution: r.execution_note,
    }));

    const key = process.env["LOVABLE_API_KEY"];
    if (!key) return { error: "AI is not configured: LOVABLE_API_KEY is missing." };

    const provider = createOpenAI({
      baseURL: "https://ai.gateway.lovable.dev/v1",
      apiKey: key,
      headers: { "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
      fetch: runIdFetch(),
    });

    const system = `You are PMS-11 Closure Loop Command AI for a marine pipe-lay vessel readiness program.
You are connected only to the records supplied in this request and must not invent project facts.
Use the data to identify the current state and the next operational closure step.
The next step must be actionable and grounded in an existing record whenever possible.
If evidence is insufficient, say so explicitly.
Return ONLY JSON:
{
 "answer":"direct answer, max 5 sentences",
 "current_state":"...",
 "blockers":["..."],
 "next_action":"...",
 "next_record_ids":["existing RID values only"],
 "responsible_department":"department value from data or Unassigned",
 "required_evidence":["existing evidence IDs or clearly described missing proof"],
 "gate_impact":"...",
 "confidence":0-100
}
Never claim an item is closed unless the supplied status proves it.`;

    const contextText = JSON.stringify({
      scope: { wps: data.wps ?? null, entity: data.entity ?? null },
      records: compact,
    });

    try {
      const result = streamText({
        model: provider.responses("openai/gpt-6-astra"),
        system,
        messages: [{ role: "user", content: data.question + "\n\nCURRENT PMS-11 DATA:\n" + contextText }],
        providerOptions: {
          openai: {
            forceReasoning: true,
            reasoningEffort: "medium",
            reasoningSummary: "auto",
            store: false,
            include: ["reasoning.encrypted_content"],
          },
        },
      });

      const text = await result.text;
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) return { error: "AI returned no structured response." };

      const parsed = JSON.parse(match[0]);
      return { result: parsed };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[PMS-11 AI] gateway error:", msg);
      if (/401|403|api.?key|unauthor/i.test(msg)) return { error: "AI gateway authorization failed. Check the Lovable AI configuration." };
      if (/402|credit/i.test(msg)) return { error: "AI credits are exhausted. Add credits in Lovable billing to continue." };
      if (/429/.test(msg)) return { error: "AI is busy. Please retry shortly." };
      return { error: `AI command analysis failed: ${msg.slice(0, 220)}` };
    }
  });
