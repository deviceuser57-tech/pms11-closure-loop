import { createFileRoute, Link, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Activity, Anchor, BookOpen, ClipboardCheck, FileText, Gauge, History, Layers, ListChecks, LogOut, Scale, ShieldAlert, Ship, Upload, Users, BarChart3, MessageSquare } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { RecordSheetProvider, useRecordSheet } from "@/components/RecordSheet";
import { useRecords } from "@/lib/records";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated")({
  staticData: { sitemap: "exclude-subtree" },
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: Shell,
});

const NAV = [
  { to: "/dashboard", label: "Command Center", icon: Gauge },
  { to: "/r/rule", label: "Rules Register", icon: Scale },
  { to: "/r/wps", label: "Work Packages", icon: Layers },
  { to: "/r/gap", label: "Findings & CAPA", icon: ShieldAlert },
  { to: "/r/task", label: "Tasks", icon: ListChecks },
  { to: "/r/evidence", label: "Evidence", icon: FileText },
  { to: "/r/gate", label: "Gates", icon: ClipboardCheck },
  { to: "/r/responsibility", label: "Responsibilities", icon: Users },
  { to: "/r/risk", label: "Risks", icon: ShieldAlert },
  { to: "/r/change", label: "Changes", icon: History },
  { to: "/r/equipment", label: "Vessel & Equipment", icon: Ship },
  { to: "/reporting", label: "Smart Reporting", icon: BarChart3 },
  { to: "/ai-review", label: "AI Evidence Review", icon: FileText },
  { to: "/ai-chat", label: "AI Command Chat", icon: MessageSquare },
  { to: "/user-guide", label: "User Guide", icon: BookOpen },
  { to: "/audit", label: "Audit & Reports", icon: History },
  { to: "/documents", label: "Document Control", icon: FileText },
  { to: "/traceability", label: "Traceability Matrix", icon: Layers },
  { to: "/simulator", label: "Gate Simulator", icon: Activity },
  { to: "/import", label: "Workbook Import", icon: Upload },
] as const;

function Shell() {
  return <RecordSheetProvider><ShellContent /></RecordSheetProvider>;
}

function ShellContent() {
  const { user, roles, isAdmin } = useAuth();
  const nav = useNavigate();
  const { all } = useRecords();
  const sheet = useRecordSheet();
  const [searchOpen, setSearchOpen] = useState(false);
  const [q, setQ] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const guideKey = (() => {
    const path = window.location.pathname;
    const match = path.match(/\/r\/([^/]+)/);
    if (match) return match[1];