import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Anchor, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — PMS 11 Closure Loop" },
      { name: "description", content: "Sign in to the PMS 11 readiness and closure tracker." },
      { property: "og:title", content: "Sign in — PMS 11 Closure Loop" },
      { property: "og:description", content: "Sign in to the PMS 11 readiness and closure tracker." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const nav = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

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

    void checkExistingSession();

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
      if (!email.trim() || !pw) {
        throw new Error("Enter your email and password.");
      }

      if (mode === "in") {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: pw,
        });

        if (error) throw error;

        if (!data.session?.user) {
          await goToDashboard();
          return;
        }

        await nav({ to: "/dashboard", replace: true });
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password: pw,
          options: {
            emailRedirectTo: window.location.origin,
          },
        });

        if (error) throw error;

        if (data.session?.user) {
          toast.success("Account created successfully.");
          await nav({ to: "/dashboard", replace: true });
        } else {
          const text = "Account created. Check your email to confirm the account, then sign in.";
          setMessage(text);
          toast.success(text);
        }
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
      <div className="maritime-card w-full max-w-sm space-y-5 p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Anchor className="h-6 w-6" />
          </span>
          <div>
            <p className="font-display text-2xl font-semibold">PMS 11 Closure Loop</p>
            <p className="label-caps">IMO 7511826 · Readiness & closure</p>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground">
              Email *
            </Label>
            <Input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground">
              Password *
            </Label>
            <Input
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
          <div
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
          >
            {message}
          </div>
        )}

        <button
          type="button"
          className="w-full text-center text-xs text-muted-foreground hover:text-foreground"
          onClick={() => {
            setMessage("");
            setMode((current) => (current === "in" ? "up" : "in"));
          }}
          disabled={busy}
        >
          {mode === "in" ? "No account? Create one" : "Have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}
