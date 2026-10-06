import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const APP_ROLES = ["admin", "reviewer", "contributor", "viewer"] as const;
const emailSchema = z.string().trim().toLowerCase().email().refine(
  v => /@pms\.eg$/.test(v),
  "Corporate email must use @pms.eg."
);
const rosterRow = z.object({
  Company_ID: z.string().trim().min(1),
  Full_Name: z.string().trim().min(1),
  Email: emailSchema,
  Department: z.string().trim().min(1),
  Role: z.enum(APP_ROLES),
  Job_Title: z.string().trim().min(1),
});
const rosterInput = z.object({ rows: z.array(rosterRow).min(1) });

async function requireAdmin(context: { userId: string; supabase: any }) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw error;
  if (!data) throw new Error("Only Admins can perform this operation.");
}

async function loadRosterGovernance(supabaseAdmin: any) {
  const [{ data: departments, error: de }, { data: appRoles, error: ae }] = await Promise.all([
    supabaseAdmin.from("departments").select("id,name").eq("active", true),
    supabaseAdmin.from("department_app_roles").select("department_id,role"),
  ]);
  if (de) throw de;
  if (ae) throw ae;

  return {
    departments: departments ?? [],
    appRoles: appRoles ?? [],
    deptByName: new Map((departments ?? []).map((d: { id: string; name: string }) => [
      d.name.trim().toLowerCase(),
      d,
    ])),
  };
}

function validateRows(
  rows: z.infer<typeof rosterInput>["rows"],
  governance: Awaited<ReturnType<typeof loadRosterGovernance>>,
  existingProfiles: Array<{ id: string; company_id: string | null; email: string | null }>
) {
  const errors: string[] = [];
  const seenIds = new Set<string>();
  const seenEmails = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rowNo = i + 2;
    const id = r.Company_ID.trim();
    const email = r.Email.trim().toLowerCase();
    const department = r.Department.trim().toLowerCase();

    if (seenIds.has(id)) errors.push(`Row ${rowNo}: duplicate Company_ID ${id}`);
    if (seenEmails.has(email)) errors.push(`Row ${rowNo}: duplicate Email ${email}`);
    seenIds.add(id);
    seenEmails.add(email);

    const d = governance.deptByName.get(department);
    if (!d) {
      errors.push(`Row ${rowNo}: Department is not present in MASTER_DATA: ${r.Department}`);
      continue;
    }

    const allowed = governance.appRoles.some(
      (x: { department_id: string; role: string }) =>
        x.department_id === d.id && x.role === r.Role
    );
    if (!allowed) {
      errors.push(
        `Row ${rowNo}: Department ↔ Application Role is not allowed by MASTER_DATA: ${r.Department} ↔ ${r.Role}`
      );
    }

    const byCompanyId = existingProfiles.find(
      p => p.company_id?.trim().toLowerCase() === id.toLowerCase()
    );
    if (byCompanyId && byCompanyId.email?.toLowerCase() !== email) {
      errors.push(
        `Row ${rowNo}: Company_ID ${id} already belongs to another email identity (${byCompanyId.email ?? "unknown"}).`
      );
    }

    const byEmail = existingProfiles.find(
      p => p.email?.toLowerCase() === email
    );
    if (byEmail && byEmail.company_id && byEmail.company_id.trim().toLowerCase() !== id.toLowerCase()) {
      errors.push(
        `Row ${rowNo}: Email ${email} is already mapped to Company_ID ${byEmail.company_id}.`
      );
    }
  }

  return errors;
}

export const resetAllProjectRecords = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    async function collectFiles(path = ""): Promise<string[]> {
      const { data, error } = await supabaseAdmin.storage.from("evidence").list(path, { limit: 1000 });
      if (error) throw error;
      const files: string[] = [];
      for (const item of data ?? []) {
        const child = path ? path + "/" + item.name : item.name;
        if (item.id === null) files.push(...await collectFiles(child));
        else files.push(child);
      }
      return files;
    }

    const files = await collectFiles();
    for (let i = 0; i < files.length; i += 1000) {
      const { error } = await supabaseAdmin.storage.from("evidence").remove(files.slice(i, i + 1000));
      if (error) throw error;
    }

    const { data, error } = await context.supabase.rpc("reset_all_project_records");
    if (error) throw error;

    return { ...(data as Record<string, unknown>), storageDeleted: files.length };
  });

export const validateUserRoster = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(d => rosterInput.parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const governance = await loadRosterGovernance(supabaseAdmin);

    const { data: existingProfiles, error } = await supabaseAdmin
      .from("profiles")
      .select("id,company_id,email");
    if (error) throw error;

    const errors = validateRows(data.rows, governance, existingProfiles ?? []);
    return {
      valid: errors.length === 0,
      rows: data.rows.length,
      errors,
      governance: {
        departments: governance.departments.length,
        departmentApplicationRoleMappings: governance.appRoles.length,
      },
    };
  });

export const importUserRoster = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(d => rosterInput.parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const governance = await loadRosterGovernance(supabaseAdmin);

    const { data: existingProfiles, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id,company_id,email");
    if (profileError) throw profileError;

    const validationErrors = validateRows(data.rows, governance, existingProfiles ?? []);
    if (validationErrors.length) throw new Error(validationErrors.join("\n"));

    const { data: usersPage, error: usersError } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (usersError) throw usersError;

    const imported: string[] = [];

    for (const r of data.rows) {
      const email = r.Email.trim().toLowerCase();
      const found = (usersPage.users ?? []).find(
        u => u.email?.toLowerCase() === email
      );

      let userId = found?.id;

      if (userId) {
        const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
          email,
          email_confirm: true,
          user_metadata: { full_name: r.Full_Name },
        });
        if (error) throw error;
      } else {
        const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
          email,
          email_confirm: true,
          user_metadata: { full_name: r.Full_Name },
        });
        if (error || !created.user) {
          throw new Error(error?.message ?? `Unable to create ${email}`);
        }
        userId = created.user.id;
      }

      const { error: pe } = await supabaseAdmin.from("profiles").upsert({
        id: userId,
        email,
        display_name: r.Full_Name,
        company_id: r.Company_ID.trim(),
        department: r.Department.trim(),
        job_title: r.Job_Title.trim(),
        must_change_password: true,
      }, { onConflict: "id" });
      if (pe) throw pe;

      const { error: rd } = await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", userId);
      if (rd) throw rd;

      const { error: ri } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: userId, role: r.Role });
      if (ri) throw ri;

      imported.push(email);
    }

    return {
      imported: imported.length,
      emails: imported,
      firstLoginRequired: true,
    };
  });

export const beginFirstLogin = createServerFn({ method: "POST" })
  .inputValidator(d => z.object({ email: emailSchema }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .select("id,must_change_password,email")
      .eq("email", data.email)
      .maybeSingle();

    if (error) throw error;
    if (!profile) throw new Error("This corporate email is not provisioned in PMS-11.");
    if (!profile.must_change_password) return { firstLogin: false as const };

    const redirectTo = new URL(
      "/auth?first=1",
      process.env.SITE_URL ?? "http://localhost:3000"
    ).toString();

    const { data: link, error: linkError } =
      await supabaseAdmin.auth.admin.generateLink({
        type: "magiclink",
        email: data.email,
        options: { redirectTo },
      });

    if (linkError || !link?.properties?.action_link) {
      throw new Error(linkError?.message ?? "Unable to start first login.");
    }

    return {
      firstLogin: true as const,
      actionLink: link.properties.action_link,
    };
  });

export const activateFirstLogin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase.rpc("activate_first_login");
    if (error) throw error;
    return { success: true };
  });
