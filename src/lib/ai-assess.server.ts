import { createOpenAI } from "@ai-sdk/openai";
import { streamText, type ModelMessage } from "ai";

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

export type Assessment = {
  verdict: "Compliant" | "Partially Compliant" | "Non-Compliant" | "Insufficient Evidence";
  confidence: number;
  summary: string;
  criteria: { criterion: string; met: "Met" | "Partially Met" | "Not Met" | "Cannot Verify"; reason: string }[];
  missing_proof: string[];
  recommended_actions: string[];
};

export async function assessEvidence(apiKey: string, system: string, content: ModelMessage["content"]): Promise<Assessment> {
  const provider = createOpenAI({
    baseURL: "https://ai.gateway.lovable.dev/v1",
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: runIdFetch(),
  });
  const result = streamText({
    model: provider.responses("openai/gpt-6-astra"),
    system,
    messages: [{ role: "user", content } as ModelMessage],
    providerOptions: { openai: { forceReasoning: true, reasoningEffort: "medium", reasoningSummary: "auto", store: false, include: ["reasoning.encrypted_content"] } },
  });
  const text = await result.text;
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("The AI returned no assessment.");
  const p = JSON.parse(m[0]) as Partial<Assessment>;
  return {
    verdict: (p.verdict ?? "Insufficient Evidence") as Assessment["verdict"],
    confidence: Math.max(0, Math.min(100, Number(p.confidence ?? 0))),
    summary: String(p.summary ?? ""),
    criteria: Array.isArray(p.criteria) ? p.criteria : [],
    missing_proof: Array.isArray(p.missing_proof) ? p.missing_proof.map(String) : [],
    recommended_actions: Array.isArray(p.recommended_actions) ? p.recommended_actions.map(String) : [],
  };
}
