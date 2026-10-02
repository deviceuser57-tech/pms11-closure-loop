import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type Role = "admin" | "reviewer" | "contributor" | "viewer";
type Ctx = { user: User | null; roles: Role[]; loading: boolean; canEdit: boolean; canReview: boolean; isAdmin: boolean };

const AuthCtx = createContext<Ctx>({ user: null, roles: [], loading: true, canEdit: false, canReview: false, isAdmin: false });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async (u: User | null) => {
      setUser(u);
      if (u) {
        const { data } = await supabase.from("user_roles").select("role").eq("user_id", u.id);
        setRoles((data ?? []).map((r) => r.role as Role));
      } else setRoles([]);
      setLoading(false);
    };
    supabase.auth.getUser().then(({ data }) => load(data.user));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setTimeout(() => load(s?.user ?? null), 0);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const isAdmin = roles.includes("admin");
  const canReview = isAdmin || roles.includes("reviewer");
  const canEdit = canReview || roles.includes("contributor");
  return <AuthCtx.Provider value={{ user, roles, loading, canEdit, canReview, isAdmin }}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
