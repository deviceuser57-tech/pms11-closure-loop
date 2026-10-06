import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const emailSchema = z.string().trim().toLowerCase().email().refine(v => v.endsWith("@pms.eg"), "Corporate email must use @pms.eg.");
const rosterRow = z.object({
  Company_ID: z.string().trim().min(1),
  Full_Name: z.string().trim().min(1),
  Email: emailSchema,
  Department: z.string().trim().min(1),
  Role: z.enum(["admin","reviewer","contributor","viewer"]),
  Job_Title: z.string().trim().min(1),
});
const rosterInput = z.object({ rows: z.array(rosterRow).min(1) });

export const resetAllProjectRecords = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: admin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!admin) throw new Error("Only Admins can reset project records.");
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

export const importUserRoster = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(d => rosterInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: admin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!admin) throw new Error("Only Admins can import the company roster.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: departments, error: de }, { data: links, error: le }] = await Promise.all([
      supabaseAdmin.from("departments").select("id,name").eq("active",true),
      supabaseAdmin.from("department_app_roles").select("department_id,role"),
    ]);
    if (de) throw de; if (le) throw le;
    const deptByName = new Map((departments ?? []).map(x => [x.name.trim().toLowerCase(), x]));
    const errors: string[] = [];
    const seenIds = new Set<string>(), seenEmails = new Set<string>();
    for (let i=0;i<data.rows.length;i++) {
      const r=data.rows[i], id=r.Company_ID.trim(), email=r.Email.trim().toLowerCase();
      if (seenIds.has(id)) errors.push("Row "+(i+1)+": duplicate Company_ID "+id);
      if (seenEmails.has(email)) errors.push("Row "+(i+1)+": duplicate Email "+email);
      seenIds.add(id); seenEmails.add(email);
      const d=deptByName.get(r.Department.trim().toLowerCase());
      if (!d) errors.push("Row "+(i+1)+": Department is not present in MASTER_DATA: "+r.Department);
      if (d && r.Role !== "admin") {
        const allowed = (links ?? []).some(x => x.department_id===d.id && x.role===r.Role.toLowerCase());
        if (!allowed) errors.push("Row "+(i+1)+": Department ↔ Role is not allowed by MASTER_DATA: "+r.Department+" ↔ "+r.Role);
      }
    }
    if (errors.length) throw new Error(errors.join("\n"));
    const imported: string[] = [];
    const { data: usersPage } = await supabaseAdmin.auth.admin.listUsers({ page:1, perPage:1000 });
    for (const r of data.rows) {
      const email=r.Email.trim().toLowerCase();
      const found=(usersPage?.users ?? []).find(u => u.email?.toLowerCase()===email);
      let userId=found?.id;
      if (userId) {
        const { error } = await supabaseAdmin.auth.admin.updateUserById(userId,{email_confirm:true,user_metadata:{full_name:r.Full_Name}});
        if (error) throw error;
      } else {
        const { data: created, error } = await supabaseAdmin.auth.admin.createUser({email,email_confirm:true,user_metadata:{full_name:r.Full_Name}});
        if (error || !created.user) throw new Error(error?.message ?? ("Unable to create "+email));
        userId=created.user.id;
      }
      const { error: pe } = await supabaseAdmin.from("profiles").upsert({
        id:userId,email,display_name:r.Full_Name,company_id:r.Company_ID.trim(),
        department:r.Department.trim(),job_title:r.Job_Title.trim(),must_change_password:true
      } as never,{onConflict:"id"});
      if (pe) throw pe;
      const { error: rd } = await supabaseAdmin.from("user_roles").delete().eq("user_id",userId);
      if (rd) throw rd;
      const { error: ri } = await supabaseAdmin.from("user_roles").insert({user_id:userId,role:r.Role as never});
      if (ri) throw ri;
      imported.push(email);
    }
    return { imported: imported.length, emails: imported };
  });

export const beginFirstLogin = createServerFn({ method: "POST" })
  .inputValidator(d => z.object({ email: emailSchema }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile } = await supabaseAdmin.from("profiles").select("id,must_change_password,email").eq("email",data.email).maybeSingle();
    if (!profile) throw new Error("This corporate email is not provisioned in PMS-11.");
    if (!profile.must_change_password) return { firstLogin:false };
    const redirectTo = new URL("/auth?first=1", process.env.SITE_URL ?? "http://localhost:3000").toString();
    const { data: link, error } = await supabaseAdmin.auth.admin.generateLink({type:"magiclink",email:data.email,options:{redirectTo}});
    if (error || !link?.properties?.action_link) throw new Error(error?.message ?? "Unable to start first login.");
    return { firstLogin:true, actionLink:link.properties.action_link };
  });

export const activateFirstLogin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase.rpc("activate_first_login");
    if (error) throw error;
    return { success:true };
  });
