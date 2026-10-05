import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Anchor, Loader2 } from "lucide-react";
import { enterDemoMode } from "@/lib/demo-auth.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/auth")({
  staticData: { sitemap: true },
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
  const [demoStarting, setDemoStarting] = useState(false);

  useEffect(() => {
    let active = true;

    const checkExistingSession = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (!active) return;
        if (error) {
          console.warn("[Auth] Session check failed:", error);
          return;
        }
        if (data.session?.user) {
          await nav({ to: "/dashboard", replace: true });
        }
      } catch (error) {
        console.error("[Auth] Session check exception:", error);
      }
    };

    const startTemporaryDemo = async () => {
      if (import.meta.env.VITE_PMS11_DEMO_MODE === "false") return;
      setDemoStarting(true);
      try {
        const redirectTo = new URL("/dashboard", window.location.origin).toString();
        const { actionLink } = await enterDemoMode({ data: { redirectTo } });
        window.location.assign(actionLink);
      } catch (error) {
        console.error("[Auth] Demo mode failed:", error);
        if (active) {
          setDemoStarting(false);
          setMessage(error instanceof Error ? error.message : "Temporary demo mode could not start.");
        }
      }
    };

    void checkExistingSession().then(() => {
      if (active) void startTemporaryDemo();
    });

    return () => {
      active = false;
    };
  }, [nav]);

  const goToDashboard = async () => {
    const { data, error } = await supabase.auth.getSession();

    if (error) {
      throw error;
    }

    if (!data.session?.user) {
      throw new Error("Authentication succeeded, but no active session was created.");
    }

    await nav({ to: "/dashboard", replace: true });
  };

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

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
    } catch (error) {
      console.error("[Auth] Authentication failed:", error);

      const text =
        error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error
            : "Authentication failed. Please try again.";

      setMessage(text);
      toast.error(text);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="maritime-card w-full max-w-md space-y-6 p-7">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Anchor className="h-6 w-6" />
          </span>
          <div>
            <h1 className="font-display text-2xl font-semibold">PMS 11 Closure Loop</h1>
            <p className="label-caps">IMO 7511826 · Readiness & closure</p>
          </div>
        </div>

        {import.meta.env.VITE_PMS11_DEMO_MODE !== "false" ? (
          <div className="space-y-3">
            <div className="rounded-md border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
              <p className="font-semibold">Temporary Test Mode</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Login and signup are temporarily bypassed. Entering as Demo Admin uses a real Supabase session; database RLS remains enabled.
              </p>
            </div>
            <Button type="button" className="w-full" disabled={demoStarting} onClick={async () => {
              setDemoStarting(true);
              setMessage("");
              try {
                const redirectTo = new URL("/dashboard", window.location.origin).toString();
                const { actionLink } = await enterDemoMode({ data: { redirectTo } });
                window.location.assign(actionLink);
              } catch (error) {
                setDemoStarting(false);
                const text = error instanceof Error ? error.message : "Temporary demo mode could not start.";
                setMessage(text);
                toast.error(text);
              }
            }}>
              {demoStarting && <Loader2 className="h-4 w-4 animate-spin" />}
              {demoStarting ? "Entering Demo Admin…" : "Enter as Demo Admin"}
            </Button>
          </div>
        ) : null}

        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="auth-email" className="text-xs font-black uppercase tracking-widest text-muted-foreground">
              Email *
            </Label>
            <Input
              id="auth-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
            />
          </div>
          <p className="mt-2 text-muted-foreground">
            Sign-in and sign-up are temporarily disabled. Enter with a real Supabase authenticated
            demo session so the normal RLS, roles and application logic remain active.
          </p>
        </div>

          <div className="space-y-1">
            <Label htmlFor="auth-password" className="text-xs font-black uppercase tracking-widest text-muted-foreground">
              Password *
            </Label>
            <Input
              id="auth-password"
              type="password"
              autoComplete={mode === "in" ? "current-password" : "new-password"}
              required
              minLength={6}
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              disabled={busy}
            />
          </div>

          <Button type="submit" className="w-full" disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === "in" ? "Sign in" : "Create account"}
          </Button>
        </form>

        {message && (
          <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {message}
          </div>
        )}

        {import.meta.env.VITE_PMS11_DEMO_MODE === "false" && <button
          type="button"
          className="w-full text-center text-xs text-muted-foreground hover:text-foreground"
          onClick={() => {
            setMessage("");
            setMode((current) => (current === "in" ? "up" : "in"));
          }}
          disabled={busy}
        >
          {mode === "in" ? "No account? Create one" : "Have an account? Sign in"}
        </button>}
      </div>
    </div>
  );
}
