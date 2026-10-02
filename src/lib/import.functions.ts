import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getImportPreview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { buildPreview } = await import("./import.server");
    return buildPreview();
  });

export const runImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ entities: z.array(z.string()).min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Only Admins can import workbook data");
    const { buildAll, buildPreview } = await import("./import.server");
    const rows = buildAll().filter((r) => data.entities.includes(r.entity));
    let inserted = 0;
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200);
      const { data: res, error } = await context.supabase
        .from("records")
        .upsert(chunk as never, { onConflict: "entity,rid", ignoreDuplicates: true })
        .select("id");
      if (error) throw new Error(`Import failed at row ${i}: ${error.message}`);
      inserted += res?.length ?? 0;
    }
    const preview = buildPreview();
    const summary = { entities: data.entities, candidates: rows.length, inserted, skippedExisting: rows.length - inserted, verification: preview.verification };
    await context.supabase.from("import_runs").insert({ summary } as never);
    return summary;
  });
