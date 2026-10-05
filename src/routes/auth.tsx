import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Anchor, Loader2, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Test Access — PMS 11 Closure Loop" },
      { name: "description", content: "Temporary demo access for PMS 11 readiness and closure testing." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const enterDemo = async () => {
    if (busy) return;
    setBusy(true);
    setMessage("");

    try {
      const { data: existing, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;

      if (existing.session?.user) {
        await nav({ to: "/dashboard", replace: true });
        return;
      }

      const { data, error } = await supabase.auth.signInAnonymously({
        options: {
          data: {
            display_name: "PMS-11 Test Admin",
            access_mode: "temporary_demo",
          },
        },
      });

      if (error) throw error;
      if (!data.session?.user) {
        throw new Error("Demo authentication succeeded without an active session.");
      }

      toast.success("Temporary test access granted.");
      await nav({ to: "/dashboard", replace: true });
    } catch (error) {
      console.error("[Demo Auth] Failed:", error);
      const text =
        error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error
            : "Temporary test access failed.";

      setMessage(
        text.toLowerCase().includes("anonymous")
          ? "Supabase Anonymous Sign-Ins are not enabled yet. Enable Anonymous Sign-Ins in Supabase Auth settings, then retry."
          : text,
      );
      toast.error(text);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    let active = true;

    const checkExistingSession = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (!active || error) return;
      if (data.session?.user) {
        await nav({ to: "/dashboard", replace: true });
      }
    };

    void checkExistingSession();
    return () => {
      active = false;
    };
  }, [nav]);

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="maritime-card w-full max-w-md space-y-6 p-7">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Anchor className="h-6 w-6" />
          </span>
          <div>
            <p className="font-display text-2xl font-semibold">PMS 11 Closure Loop</p>
            <p className="label-caps">Temporary test access</p>
          </div>
        </div>

        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
          <div className="flex items-center gap-2 font-semibold">
            <ShieldCheck className="h-4 w-4" />
            Test Mode
          </div>
          <p className="mt-2 text-muted-foreground">
            Sign-in and sign-up are temporarily disabled. Enter with a real Supabase authenticated
            demo session so the normal RLS, roles and application logic remain active.
          </p>
        </div>

        <Button type="button" className="w-full" onClick={enterDemo} disabled={busy}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Enter as Demo Admin
        </Button>

        {message && (
          <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {message}
          </div>
        )}

        <p className="text-center text-xs text-muted-foreground">
          Temporary testing only. Production user/department authentication will be restored later.
        </p>
      </div>
    </div>
  );
}
