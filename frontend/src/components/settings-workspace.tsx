"use client";

import { FormEvent, useEffect, useState } from "react";
import { Check, ChevronLeft, ChevronRight, ClipboardList, KeyRound, LoaderCircle, LogOut, Menu, Monitor, RefreshCw, Save, ShieldCheck, UserRound } from "lucide-react";
import { Brand } from "@/components/brand";
import { WorkspaceNav } from "@/components/workspace-nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Profile } from "@/lib/auth";

type AccountSession = { id: string; user_agent: string; created_at: string; expires_at: string; is_current: boolean };
type AuditEvent = { id: string; action: string; user_agent: string; created_at: string };
type AuditPage = { items: AuditEvent[]; total: number; page: number; page_size: number };
const actions: Record<string, string> = {
  "login.succeeded": "Signed in", "login.failed": "Failed sign-in", "logout.succeeded": "Signed out",
  "profile.updated": "Profile updated", "password.changed": "Password changed", "password.failed": "Failed password check",
  "session.revoked": "Session revoked", "sessions.others_revoked": "Other sessions revoked",
};
const dateTime = (value: string) => new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
const browserName = (agent: string) => /Edg\//.test(agent) ? "Microsoft Edge" : /Firefox\//.test(agent) ? "Firefox" : /Chrome\//.test(agent) ? "Chrome" : /Safari\//.test(agent) ? "Safari" : "Browser / API client";
const jsonRequest = (method: string, body: unknown): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

async function api<Result>(path: string, options?: RequestInit): Promise<Result> {
  const response = await fetch(`/api/settings/${path}`, { cache: "no-store", ...options });
  if (response.status === 401) { window.location.assign("/login"); throw new Error("Your session has ended."); }
  if (response.status === 204) return undefined as Result;
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : data.error ?? "Check your details and try again.");
  return data;
}

export function SettingsWorkspace({ profile }: { profile: Profile }) {
  const [name, setName] = useState(profile.full_name);
  const [savedName, setSavedName] = useState(profile.full_name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);
  const [sessions, setSessions] = useState<AccountSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [sessionError, setSessionError] = useState("");
  const [confirmation, setConfirmation] = useState<AccountSession | "others" | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true); setSessionError("");
      try { setSessions(await api<AccountSession[]>("sessions", { signal: controller.signal })); }
      catch (failure) { if (!controller.signal.aborted) setSessionError((failure as Error).message); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    return () => controller.abort();
  }, [revision]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      const updated = await api<Profile>("profile", jsonRequest("PUT", { full_name: name }));
      setSavedName(updated.full_name); setName(updated.full_name); setNotice("Profile saved."); setRevision((value) => value + 1);
    } catch (failure) { setError((failure as Error).message); }
    finally { setBusy(false); }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setNotice("");
    const form = event.currentTarget;
    const data = new FormData(form);
    if (data.get("new_password") !== data.get("confirm_password")) { setError("New passwords do not match."); return; }
    setBusy(true);
    try {
      await api("password", jsonRequest("POST", { current_password: data.get("current_password"), new_password: data.get("new_password") }));
      form.reset(); window.location.assign("/login");
    } catch (failure) { setError((failure as Error).message); }
    finally { setBusy(false); }
  }

  async function revoke() {
    if (!confirmation) return;
    setBusy(true); setError(""); setNotice("");
    try {
      if (confirmation === "others") await api("sessions/revoke-others", { method: "POST" });
      else await api(`sessions/${confirmation.id}`, { method: "DELETE" });
      if (confirmation !== "others" && confirmation.is_current) {
        await fetch("/api/auth/logout", { method: "POST" });
        window.location.assign("/login");
      } else { setNotice("Sessions signed out."); setRevision((value) => value + 1); }
      setConfirmation(null);
    } catch (failure) { setError((failure as Error).message); setConfirmation(null); }
    finally { setBusy(false); }
  }

  return <div className="dashboard-shell">
    <aside className="dashboard-sidebar hidden lg:flex"><Brand light /><WorkspaceNav /></aside>
    <main className="min-w-0 flex-1">
      <header className="dashboard-header">
        <div className="flex items-center gap-3 lg:hidden"><Sheet><SheetTrigger asChild><Button variant="outline" size="icon" aria-label="Open navigation"><Menu className="size-5" /></Button></SheetTrigger><SheetContent side="left" className="w-[290px] bg-[#123d2b] p-6 text-white"><SheetTitle className="sr-only">Navigation</SheetTitle><Brand light /><WorkspaceNav /></SheetContent></Sheet><Brand /></div>
        <h1 className="hidden text-xl font-semibold text-zinc-950 lg:block">Settings</h1><span className="ml-auto hidden max-w-48 truncate text-sm font-medium text-zinc-800 sm:block">{savedName}</span>
      </header>
      <div className="dashboard-content pb-24">
        <p className="eyebrow">Your account</p><h2 className="mt-2 text-2xl font-semibold text-zinc-950 sm:text-3xl">Settings</h2>
        <Tabs defaultValue="account" className="mt-7" onValueChange={() => { setError(""); setNotice(""); }}>
          <TabsList className="h-auto max-w-full flex-wrap justify-start"><TabsTrigger value="account"><UserRound className="size-4" />Account</TabsTrigger><TabsTrigger value="security"><ShieldCheck className="size-4" />Security</TabsTrigger><TabsTrigger value="audit"><ClipboardList className="size-4" />Audit log</TabsTrigger></TabsList>
          {error && <p role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>}
          {notice && <p role="status" className="mt-4 flex gap-2 rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-900"><Check className="size-4 shrink-0" />{notice}</p>}
          <TabsContent value="account" className="mt-7">
            <section className="grid gap-6 border-t py-7 lg:grid-cols-[260px_minmax(0,1fr)]"><div><h3 className="text-lg font-semibold text-zinc-950">Personal details</h3><p className="mt-2 text-sm text-zinc-700">Member since {new Date(profile.created_at).toLocaleDateString("en-IN", { dateStyle: "long" })}</p></div>
              <form className="max-w-xl space-y-5" onSubmit={saveProfile}>
                <div className="space-y-2"><Label htmlFor="settings-name">Full name</Label><Input id="settings-name" value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required maxLength={100} /></div>
                <div className="space-y-2"><Label htmlFor="settings-email">Email address</Label><Input id="settings-email" value={profile.email} readOnly type="email" className="bg-zinc-50" /></div>
                <div className="flex items-center gap-2 text-sm text-zinc-800"><ShieldCheck className="size-4 text-green-800" />Account active</div>
                <Button disabled={busy || !name.trim() || name.trim() === savedName} type="submit">{busy ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}Save changes</Button>
              </form>
            </section>
          </TabsContent>
          <TabsContent value="security" className="mt-7">
            <section className="grid gap-6 border-t py-7 lg:grid-cols-[260px_minmax(0,1fr)]"><div><h3 className="flex items-center gap-2 text-lg font-semibold text-zinc-950"><KeyRound className="size-5 text-green-800" />Password</h3><p className="mt-2 text-sm leading-6 text-zinc-700">12 to 128 characters. Changing your password signs out all sessions, including this one.</p></div>
              <form className="max-w-xl space-y-5" onSubmit={changePassword}>
                <div className="space-y-2"><Label htmlFor="current-password">Current password</Label><Input id="current-password" name="current_password" type="password" autoComplete="current-password" required maxLength={128} /></div>
                <div className="grid gap-5 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="new-password">New password</Label><Input id="new-password" name="new_password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} /></div><div className="space-y-2"><Label htmlFor="confirm-password">Confirm new password</Label><Input id="confirm-password" name="confirm_password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} /></div></div>
                <Button type="submit" disabled={busy}>{busy ? <LoaderCircle className="size-4 animate-spin" /> : <KeyRound className="size-4" />}Change password</Button>
              </form>
            </section>
            <section className="border-t py-7" aria-label="Active sessions"><div className="flex flex-wrap items-start justify-between gap-4"><div><h3 className="text-lg font-semibold text-zinc-950">Active sessions</h3><p className="mt-2 text-sm text-zinc-700">Browser identifiers are reported by the client.</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" size="icon" aria-label="Refresh sessions" title="Refresh sessions" disabled={loading || busy} onClick={() => setRevision((value) => value + 1)}><RefreshCw className="size-4" /></Button><Button variant="outline" disabled={busy || loading || !sessions.some((item) => !item.is_current)} onClick={() => setConfirmation("others")}><LogOut className="size-4" />Sign out others</Button></div></div>
              {sessionError && <p role="alert" className="mt-4 text-sm text-red-800">{sessionError}</p>}
              {loading ? <div role="status" className="mt-5 animate-pulse space-y-3"><span className="sr-only">Loading sessions</span><div className="h-20 rounded-md bg-zinc-200" /><div className="h-20 rounded-md bg-zinc-200" /></div> : <div className="mt-5 divide-y border-y">{sessions.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-4 py-5"><div className="flex min-w-0 flex-1 gap-3"><Monitor className="mt-1 size-5 shrink-0 text-green-800" /><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-medium text-zinc-950">{browserName(item.user_agent)}</p>{item.is_current && <Badge variant="secondary">This session</Badge>}</div><p className="mt-2 text-sm text-zinc-700">Signed in {dateTime(item.created_at)}</p><p className="mt-1 text-sm text-zinc-700">Expires {dateTime(item.expires_at)}</p><details className="mt-2 text-xs text-zinc-700"><summary className="cursor-pointer">Client details</summary><p className="mt-2 max-w-xl [overflow-wrap:anywhere]">{item.user_agent}</p></details></div></div><Button variant="outline" disabled={busy} onClick={() => setConfirmation(item)} aria-label={item.is_current ? "Sign out this session" : `Sign out session ${item.id}`}><LogOut className="size-4" />Sign out</Button></div>)}{!sessions.length && !sessionError && <p className="py-6 text-sm text-zinc-700">No active sessions.</p>}</div>}
            </section>
          </TabsContent>
          <TabsContent value="audit" className="mt-7"><AuditLog revision={revision} /></TabsContent>
        </Tabs>
      </div>
    </main>
    <Dialog open={confirmation !== null} onOpenChange={(open) => { if (!open && !busy) setConfirmation(null); }}><DialogContent><DialogHeader><DialogTitle>{confirmation === "others" ? "Sign out other sessions?" : "Sign out this session?"}</DialogTitle><DialogDescription>{confirmation === "others" ? "Other active sessions will lose access. This session will remain signed in." : confirmation?.is_current ? "You will return to sign-in. Unsaved work may be lost." : "This session will lose access and need to sign in again."}</DialogDescription></DialogHeader><div className="flex flex-wrap justify-end gap-3"><Button variant="outline" disabled={busy} onClick={() => setConfirmation(null)}>Cancel</Button><Button variant="destructive" disabled={busy} onClick={revoke}>{busy ? <LoaderCircle className="size-4 animate-spin" /> : <LogOut className="size-4" />}Confirm sign out</Button></div></DialogContent></Dialog>
  </div>;
}

function AuditLog({ revision }: { revision: number }) {
  const [result, setResult] = useState<AuditPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [action, setAction] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true); setError("");
      try {
        if (start && end && start > end) throw new Error("Start date must not be after end date.");
        const query = new URLSearchParams({ page: String(page), page_size: "10" });
        if (start) query.set("start_date", start);
        if (end) query.set("end_date", end);
        if (action) query.set("action", action);
        setResult(await api<AuditPage>(`audit?${query}`, { signal: controller.signal }));
      } catch (failure) { if (!controller.signal.aborted) setError((failure as Error).message); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    return () => controller.abort();
  }, [page, start, end, action, revision, refresh]);

  return <section className="border-t py-7" aria-label="Security audit log">
    <div className="flex items-start justify-between gap-4"><div><h3 className="text-lg font-semibold text-zinc-950">Security audit log</h3><p className="mt-2 text-sm text-zinc-700">Account security events only. Date filters use UTC.</p></div><Button variant="outline" size="icon" aria-label="Refresh audit log" title="Refresh audit log" disabled={loading} onClick={() => setRefresh((value) => value + 1)}><RefreshCw className="size-4" /></Button></div>
    <div className="mt-6 grid gap-4 sm:grid-cols-3"><div className="min-w-0 space-y-2"><Label htmlFor="audit-start">From date</Label><Input id="audit-start" type="date" value={start} onChange={(event) => { setStart(event.target.value); setPage(1); }} /></div><div className="min-w-0 space-y-2"><Label htmlFor="audit-end">To date</Label><Input id="audit-end" type="date" value={end} onChange={(event) => { setEnd(event.target.value); setPage(1); }} /></div><div className="min-w-0 space-y-2"><Label htmlFor="audit-action">Event</Label><select id="audit-action" className="h-9 w-full min-w-0 rounded-md border border-input bg-white px-3 text-sm text-zinc-900" value={action} onChange={(event) => { setAction(event.target.value); setPage(1); }}><option value="">All events</option>{Object.entries(actions).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div></div>
    {error && <p role="alert" className="mt-5 text-sm text-red-800">{error}</p>}
    {loading ? <div role="status" className="mt-6 animate-pulse space-y-3"><span className="sr-only">Loading audit log</span>{[1, 2, 3].map((key) => <div key={key} className="h-16 rounded-md bg-zinc-200" />)}</div> : !error && <>
      <p className="my-5 text-sm text-zinc-700">{result?.total ?? 0} events</p>
      {!result?.items.length ? <div className="border-y py-12 text-center"><ClipboardList className="mx-auto size-8 text-green-800" /><p className="mt-3 font-medium text-zinc-950">No matching events</p>{(start || end || action) && <Button className="mt-4" variant="outline" onClick={() => { setStart(""); setEnd(""); setAction(""); setPage(1); }}>Clear filters</Button>}</div> : <div className="divide-y border-y">{result.items.map((item) => <article key={item.id} className="grid gap-3 py-5 sm:grid-cols-[minmax(0,1fr)_200px]"><div className="min-w-0"><p className={`flex items-center gap-2 text-sm font-semibold ${item.action.endsWith("failed") ? "text-red-800" : "text-zinc-950"}`}><span className={`size-2 shrink-0 rounded-full ${item.action.endsWith("failed") ? "bg-red-700" : "bg-green-700"}`} />{actions[item.action] ?? item.action}</p><details className="mt-2 text-sm text-zinc-700"><summary className="cursor-pointer">{browserName(item.user_agent)}</summary><p className="mt-2 text-xs [overflow-wrap:anywhere]">{item.user_agent}</p></details></div><time className="text-sm text-zinc-700 sm:text-right" dateTime={item.created_at}>{dateTime(item.created_at)}</time></article>)}</div>}
      {result && result.total > result.page_size && <div className="mt-6 flex items-center justify-center gap-4"><Button variant="outline" size="icon" aria-label="Previous audit page" title="Previous page" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft className="size-4" /></Button><span className="text-sm text-zinc-700">Page {page} of {Math.ceil(result.total / result.page_size)}</span><Button variant="outline" size="icon" aria-label="Next audit page" title="Next page" disabled={page * result.page_size >= result.total} onClick={() => setPage(page + 1)}><ChevronRight className="size-4" /></Button></div>}
    </>}
  </section>;
}