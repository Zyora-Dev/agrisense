"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Eye, EyeOff, Leaf, LoaderCircle, LockKeyhole, Sprout } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Brand } from "@/components/brand";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const registering = mode === "register";
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const values = new FormData(event.currentTarget);
    const payload = {
      email: String(values.get("email")).trim(), password: String(values.get("password")),
      ...(registering ? { full_name: String(values.get("full_name")).trim() } : {}),
    };
    try {
      const response = await fetch(`/api/auth/${mode}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) { setError(result.error); return; }
      setSuccess(true);
      if (!registering) timer.current = setTimeout(() => { router.replace("/dashboard"); router.refresh(); }, 1100);
    } catch { setError("Unable to connect. Check your connection and try again."); }
    finally { setBusy(false); }
  }

  return (
    <main className="auth-shell">
      <section className="auth-main">
        <Link href="/" aria-label="AgriSense home" className="w-fit"><Brand /></Link>
        <div className="auth-content">
          {success ? (
            <div className="success-state text-center" role="status" aria-live="polite">
              <div className="success-icon"><Check className="size-9" strokeWidth={2.5} /></div>
              <p className="eyebrow mt-8">{registering ? "A fresh start" : "You're right where you belong"}</p>
              <h1 className="mt-3 text-[30px] font-semibold">{registering ? "You're all set." : "Welcome back."}</h1>
              <p className="mt-3 text-sm leading-6 text-zinc-600">{registering ? "Your AgriSense account is ready. Let's sign you in." : "Getting your workspace ready..."}</p>
              {registering ? <Button asChild className="mt-8 h-12 w-full"><Link href="/login">Continue to sign in<ArrowRight className="ml-2 size-4" /></Link></Button> : <div className="transition-track mt-8"><span /></div>}
            </div>
          ) : (
            <div className="animate-enter" key={mode}>
              <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-medium text-green-800"><Leaf className="size-3.5" /> Rooted in better farming</div>
              <h1 className="text-[32px] leading-tight font-semibold">{registering ? "Let's grow together." : "Good to see you again."}</h1>
              <p className="mt-3 text-sm leading-6 text-zinc-600">{registering ? "Create your account. A little closer to your farm." : "Sign in to your AgriSense workspace."}</p>
              <nav className="auth-tabs mt-8" aria-label="Authentication"><Link href="/login" aria-current={!registering ? "page" : undefined}>Sign in</Link><Link href="/register" aria-current={registering ? "page" : undefined}>Create account</Link></nav>
              <form method="post" onSubmit={submit} className="mt-7 space-y-5">
                {registering && <div className="space-y-2"><Label htmlFor="full_name">Full name</Label><Input id="full_name" name="full_name" autoComplete="name" placeholder="Your full name" maxLength={100} pattern=".*\S.*" required disabled={busy} className="h-12" /></div>}
                <div className="space-y-2"><Label htmlFor="email">Email address</Label><Input id="email" name="email" type="email" autoComplete="email" placeholder="you@example.com" maxLength={254} required disabled={busy} className="h-12" /></div>
                <div className="space-y-2"><Label htmlFor="password">Password</Label><div className="relative"><Input id="password" name="password" type={visible ? "text" : "password"} autoComplete={registering ? "new-password" : "current-password"} placeholder={registering ? "At least 12 characters" : "Enter your password"} minLength={registering ? 12 : 1} maxLength={128} required disabled={busy} aria-describedby={registering ? "password-hint" : undefined} className="h-12 pr-12" /><button type="button" onClick={() => setVisible(!visible)} className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-md text-zinc-600 hover:text-primary focus-visible:outline-2 focus-visible:outline-primary" aria-label={visible ? "Hide password" : "Show password"} title={visible ? "Hide password" : "Show password"}>{visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></div>{registering && <p id="password-hint" className="text-xs text-zinc-600">Use 12 or more characters for a strong password.</p>}</div>
                {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
                <Button type="submit" disabled={busy} className="h-12 w-full text-sm">{busy ? <LoaderCircle className="mr-2 size-4 animate-spin" /> : null}{busy ? "Please wait..." : registering ? "Create account" : "Sign in"}{!busy && <ArrowRight className="ml-2 size-4" />}</Button>
              </form>
              <p className="mt-7 text-center text-sm text-zinc-600">{registering ? "Already growing with us?" : "New to AgriSense?"} <Link className="font-semibold text-primary underline-offset-4 hover:underline" href={registering ? "/login" : "/register"}>{registering ? "Sign in" : "Create an account"}</Link></p>
            </div>
          )}
        </div>
        <footer className="flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-600"><span>AgriSense / Cultivating tomorrow</span><span className="inline-flex items-center gap-1.5"><LockKeyhole className="size-3.5" /> Secure sign in</span></footer>
      </section>
      <aside className="auth-landscape" aria-label="Green agricultural fields">
        <div className="auth-photo" />
        <div className="relative z-10 flex h-full flex-col justify-between p-12 text-white xl:p-16">
          <span className="flex items-center gap-2 text-sm font-medium"><span className="size-2 rounded-full bg-lime-300" /> A new perspective on farming</span>
          <div className="max-w-lg pb-8"><Sprout className="mb-7 size-10 text-lime-200" strokeWidth={1.25} /><h2 className="text-[44px] leading-[1.15] font-medium">Better insights.<br />Stronger roots.</h2><p className="mt-5 max-w-sm text-base leading-7 text-white">Closer to your crops. Connected to your land. Ready for what tomorrow brings.</p><div className="mt-10 flex items-center gap-3"><span className="h-1 w-9 rounded-full bg-lime-300" /><span className="h-1 w-2 rounded-full bg-white/60" /><span className="h-1 w-2 rounded-full bg-white/60" /></div></div>
          <div className="flex items-center justify-between border-t border-white/35 pt-5 text-xs"><span>Made for the field.</span><span>Built for a better tomorrow.</span></div>
        </div>
      </aside>
    </main>
  );
}