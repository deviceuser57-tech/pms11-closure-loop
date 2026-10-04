import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Anchor } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign in — PMS 11 Closure Loop" }, { name: "description", content: "Sign in to the PMS 11 readiness and closure tracker." }, { property: "og:title", content: "Sign in — PMS 11 Closure Loop" }, { property: "og:description", content: "Sign in to the PMS 11 readiness and closure tracker." }] }),
  component: AuthPage,
});

function AuthPage() {
  const nav = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { supabase.auth.getUser().then(({ data }) => data.user && nav({ to: "/dashboard" })); }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    if (mode === "in") {
      const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
      if (error) toast.error(error.message); else nav({ to: "/dashboard" });
    } else {
      const { error } = await supabase.auth.signUp({ email, password: pw, options: { emailRedirectTo: window.location.origin } });
      if (error) toast.error(error.message); else toast.success("Check your email to confirm your account.");
    }
    setBusy(false);
  };
  const google = async () => {
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (r.error) return toast.error(String(r.error));
    if (!r.redirected) nav({ to: "/dashboard" });
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="maritime-card w-full max-w-sm space-y-5 p-6">
        <div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Anchor className="h-6 w-6" /></span><div><p className="font-display text-2xl font-semibold">PMS 11 Closure Loop</p><p className="label-caps">IMO 7511826 · Readiness & closure</p></div></div>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1"><Label className="text-xs font-black uppercase tracking-widest text-muted-foreground">Email *</Label><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div className="space-y-1"><Label className="text-xs font-black uppercase tracking-widest text-muted-foreground">Password *</Label><Input type="password" required minLength={6} value={pw} onChange={(e) => setPw(e.target.value)} /></div>
          <Button className="w-full" disabled={busy}>{mode === "in" ? "Sign in" : "Create account"}</Button>
        </form>
        <Button variant="outline" className="w-full" onClick={google}>Continue with Google</Button>
        <button className="w-full text-center text-xs text-muted-foreground hover:text-foreground" onClick={() => setMode(mode === "in" ? "up" : "in")}>{mode === "in" ? "No account? Create one" : "Have an account? Sign in"}</button>
      </div>
    </div>
  );
}
