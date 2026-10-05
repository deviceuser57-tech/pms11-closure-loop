import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const DEMO_EMAIL = "pms11-demo-admin@temporary.invalid";

export const enterDemoMode = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ redirectTo: z.string().url() }).parse(input))
  .handler(async ({ data }) => {
    if (process.env.PMS11_DEMO_MODE === "false") {
      throw new Error("Temporary demo mode is disabled.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: DEMO_EMAIL,
      options: { redirectTo: data.redirectTo },
    });

    if (linkError || !linkData?.properties?.action_link || !linkData.user?.id) {
      throw new Error(linkError?.message ?? "Unable to create the temporary Demo Admin session.");
    }

    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: linkData.user.id, role: "admin" }, { onConflict: "user_id,role" });

    if (roleError) {
      throw new Error(`Unable to grant the temporary Demo Admin role: ${roleError.message}`);
    }

    return {
      actionLink: linkData.properties.action_link,
      userId: linkData.user.id,
      mode: "temporary-demo-admin",
    };
  });
