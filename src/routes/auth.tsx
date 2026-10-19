import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Anchor, Loader2 } from "lucide-react";
import { beginFirstLogin, activateFirstLogin } from "@/lib/admin.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  staticData: { sitemap: true },
  head: () => ({ meta: [{ title: "PMS 11 Closure Loop — Corporate Login" }, { name: "description", content: "Corporate authentication for PMS 11 Closure Loop." }] }),
  component: AuthPage,
});

function AuthPage() {
  const nav = useNavigate();
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [confirm,setConfirm]=useState("");
  const [firstLogin,setFirstLogin]=useState(false);
  const [activationPending,setActivationPending]=useState(false);

  useEffect(()=>{
    let active=true;
    const boot=async()=>{
      const params=new URLSearchParams(window.location.search);
      const requestedFirst=params.get("first")==="1";
      const {data}=await supabase.auth.getSession();
      if(!active)return;
      if(data.session?.user){
        const {data:profile}=await supabase.from("profiles").select("email,must_change_password").eq("id",data.session.user.id).maybeSingle();
        if(profile?.must_change_password || requestedFirst){ setEmail(profile?.email ?? data.session.user.email ?? ""); setFirstLogin(true); return; }
        await nav({to:"/dashboard",replace:true});
      }
    };
    void boot();
    return()=>{active=false};
  },[nav]);

  const showError=(e:unknown)=>{const text=e instanceof Error?e.message:String(e);setMessage(text);toast.error(text);};

  const submitEmail=async(e:FormEvent)=>{
    e.preventDefault(); if(busy)return;
    const normalized=email.trim().toLowerCase();
    if(!normalized.endsWith("@pms.eg")) return showError(new Error("Use your corporate @pms.eg email."));
    setBusy(true);setMessage("");
    try{
      const r=await beginFirstLogin({data:{email:normalized}});
      if(r.firstLogin && r.actionLink){ setActivationPending(true); window.location.assign(r.actionLink); return; }
      setActivationPending(false);
    }catch(err){showError(err)}finally{setBusy(false)}
  };

  const signIn=async(e:FormEvent)=>{
    e.preventDefault();if(busy)return;setBusy(true);setMessage("");
    try{
      const {error}=await supabase.auth.signInWithPassword({email:email.trim().toLowerCase(),password});
      if(error)throw error;
      const {data}=await supabase.auth.getUser();
      const {data:profile}=await supabase.from("profiles").select("must_change_password").eq("id",data.user?.id ?? "").maybeSingle();
      if(profile?.must_change_password){setFirstLogin(true);return;}
      await nav({to:"/dashboard",replace:true});
    }catch(err){showError(err)}finally{setBusy(false)}
  };

  const setNewPassword=async(e:FormEvent)=>{
    e.preventDefault();if(busy)return;
    if(password.length<8)return showError(new Error("Password must be at least 8 characters."));
    if(password!==confirm)return showError(new Error("Passwords do not match."));
    setBusy(true);setMessage("");
    try{
      const {error}=await supabase.auth.updateUser({password});
      if(error)throw error;
      await activateFirstLogin();
      await nav({to:"/dashboard",replace:true});
    }catch(err){showError(err)}finally{setBusy(false)}
  };

  return <div className="flex min-h-screen items-center justify-center p-4">
    <div className="maritime-card w-full max-w-md space-y-6 p-7">
      <div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Anchor className="h-6 w-6"/></span><div><h1 className="font-display text-2xl font-semibold">PMS 11 Closure Loop</h1><p className="label-caps">Corporate Access · @pms.eg</p></div></div>
      {!firstLogin && !activationPending && <form onSubmit={submitEmail} className="space-y-4"><div className="space-y-1"><Label htmlFor="email">Business Email</Label><Input id="email" type="email" required autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} disabled={busy}/></div><Button className="w-full" disabled={busy}>{busy?<Loader2 className="h-4 w-4 animate-spin"/>:null}Continue</Button><p className="text-xs text-muted-foreground">Accounts are provisioned by PMS administration. New accounts do not use email verification.</p></form>}
      {!firstLogin && !activationPending && password.length>0 && null}
      {!firstLogin && !activationPending && <form onSubmit={signIn} className="space-y-3 border-t pt-4"><div className="space-y-1"><Label htmlFor="signin-password">Password</Label><Input id="signin-password" type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} disabled={busy}/></div><Button type="submit" variant="outline" className="w-full" disabled={busy}>Sign in with existing password</Button></form>}
      {firstLogin && <form onSubmit={setNewPassword} className="space-y-4"><div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm"><b>First login</b><p className="mt-1 text-xs text-muted-foreground">Welcome to PMS 11 Closure Loop. Create your secure password now. No email verification is required.</p></div><div className="space-y-1"><Label htmlFor="new-password">New Password</Label><Input id="new-password" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={e=>setPassword(e.target.value)} disabled={busy}/></div><div className="space-y-1"><Label htmlFor="confirm-password">Confirm Password</Label><Input id="confirm-password" type="password" autoComplete="new-password" minLength={8} required value={confirm} onChange={e=>setConfirm(e.target.value)} disabled={busy}/></div><Button className="w-full" disabled={busy}>{busy?<Loader2 className="h-4 w-4 animate-spin"/>:null}Set Password & Enter Command Center</Button></form>}
      {activationPending&&<p className="text-sm text-muted-foreground">Activating your first-login session…</p>}
      {message&&<div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">{message}</div>}
    </div>
  </div>;
}
