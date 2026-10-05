import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const runEvidenceAssessment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ requirementId: z.string().uuid(), filePath: z.string().min(1).optional(), evidenceText: z.string().max(60000).optional(), notes: z.string().max(4000).optional() }).refine((v) => !!v.filePath || !!v.evidenceText, { message: "Provide a filePath or evidenceText." }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const [{ data: isRev }, { data: isAdm }] = await Promise.all([
      sb.rpc("has_role", { _user_id: context.userId, _role: "reviewer" }),
      sb.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
    ]);
    if (!isRev && !isAdm) return { error: "Only Reviewers and Admins can run AI assessments." };

    const { data: req } = await sb.from("records").select("*").eq("id", data.requirementId).single();
    if (!req) return { error: "Requirement not found." };
    const accIds = req.acceptance_ids ?? [];
    const { data: acc } = accIds.length ? await sb.from("records").select("rid,title,description,data").eq("entity", "acceptance").in("rid", accIds) : { data: [] };

    const { data: blob, error: dlErr } = await sb.storage.from("evidence").download(data.filePath);
    if (dlErr || !blob) return { error: "Could not read the uploaded file." };
    const name = data.filePath.split("/").pop() ?? "evidence";
    const type = blob.type || (name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (bytes.length > 20 * 1024 * 1024) return { error: "File is larger than 20 MB." };

    const criteriaText = (acc ?? []).map((a) => `- ${a.rid}: ${a.title}${a.description ? ` — ${a.description}` : ""}`).join("\n") || "(No acceptance criteria linked — infer from the requirement text and flag this gap.)";
    const intro = `REQUIREMENT ${req.rid} (${req.entity}): ${req.title}\n${req.description ?? ""}\nWPS: ${req.wps_id ?? "-"} Gate: ${req.gate_id ?? "-"}\n\nACCEPTANCE CRITERIA:\n${criteriaText}\n\nREVIEWER NOTES: ${data.notes ?? "none"}\n\nEVIDENCE FILE: ${name}`;
    const content: unknown[] = [{ type: "text", text: intro }];
    if (type.startsWith("image/")) content.push({ type: "image", image: bytes, mediaType: type });
    else if (type === "application/pdf") content.push({ type: "file", data: bytes, mediaType: "application/pdf", filename: name });
    else if (type.startsWith("text/") || /\.(txt|csv|md|json)$/i.test(name)) content.push({ type: "text", text: new TextDecoder().decode(bytes).slice(0, 60000) });
    else return { error: "Supported file types: PDF, images, or text files." };

    const system = `You are a marine assurance reviewer for pipe-lay vessel PMS 11 (IMO 7511826). Assess whether the evidence proves each acceptance criterion. Be strict: certificates need issuer, number, validity dates, vessel identification (incl. previous names PETROJET 11/12, CLEVER TURTLE) and signatures/stamps. Never assume content not visible. Reply ONLY with JSON: {"verdict":"Compliant|Partially Compliant|Non-Compliant|Insufficient Evidence","confidence":0-100,"summary":"max 3 sentences","criteria":[{"criterion":"","met":"Met|Partially Met|Not Met|Cannot Verify","reason":""}],"missing_proof":["..."],"recommended_actions":["..."]}. At most 8 items per list.`;

    const key = process.env["LOVABLE_API_KEY"];
    if (!key) return { error: "AI is not configured." };
    try {
      const { assessEvidence } = await import("./ai-assess.server");
      const result = await assessEvidence(key, system, content as never);
      await sb.from("reviews").insert({ record_id: req.id, kind: "ai", decision: `AI: ${result.verdict}`, comment: `${result.summary}\nMissing: ${result.missing_proof.join("; ") || "none"}`, reviewer_name: "Lovable AI (advisory)" } as never);
      return { result, requirement: req.rid };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("AI assessment failed", msg);
      if (/402|credit/i.test(msg)) return { error: "AI credits are exhausted. Add credits in workspace billing to continue." };
      if (/429/.test(msg)) return { error: "AI is busy — please wait a moment and try again." };
      return { error: "AI assessment failed. Please try again later." };
    }
  });
