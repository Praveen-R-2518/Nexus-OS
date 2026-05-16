"use client";

import { useEffect, useState, type ReactNode } from "react";
import { LogIn, LogOut, Mail } from "lucide-react";
import type { Session } from "@supabase/supabase-js";

import { Button } from "@/components/ui/button";
import { DashboardDataProvider } from "@/components/dashboard/dashboard-data-provider";
import { createSupabaseBrowserClient } from "@/lib/supabaseClient";

export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function signInWithPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setMessage(error.message);
    setBusy(false);
  }

  async function sendMagicLink() {
    setBusy(true);
    setMessage("");
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.origin + "/dashboard",
      },
    });
    setMessage(error ? error.message : "Magic link sent.");
    setBusy(false);
  }

  async function signOut() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-zinc-400">
        Loading secure workspace...
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <div className="w-full max-w-md rounded-lg border border-zinc-800 bg-zinc-950 p-6 shadow-2xl shadow-black/30">
          <div className="mb-6 space-y-2">
            <p className="text-xs font-medium uppercase tracking-[0.28em] text-cyan-400">
              Founder Access
            </p>
            <h1 className="text-2xl font-semibold text-zinc-50">
              Sign in to Nexus OS
            </h1>
            <p className="text-sm text-zinc-400">
              Live Gmail and fallback webhook data stay behind the founder dashboard.
            </p>
          </div>
          <form className="space-y-4" onSubmit={signInWithPassword}>
            <label className="block space-y-2 text-sm">
              <span className="text-zinc-300">Email</span>
              <input
                className="h-10 w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 text-zinc-50 outline-none transition focus:border-cyan-500"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
              />
            </label>
            <label className="block space-y-2 text-sm">
              <span className="text-zinc-300">Password</span>
              <input
                className="h-10 w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 text-zinc-50 outline-none transition focus:border-cyan-500"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
              />
            </label>
            {message ? <p className="text-sm text-amber-300">{message}</p> : null}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={busy}>
                <LogIn className="size-4" aria-hidden />
                Sign in
              </Button>
              <Button type="button" variant="secondary" disabled={busy || !email} onClick={sendMagicLink}>
                <Mail className="size-4" aria-hidden />
                Magic link
              </Button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between border-b border-zinc-900 pb-4">
        <p className="text-sm text-zinc-400">
          Signed in as <span className="text-zinc-200">{session.user.email}</span>
        </p>
        <Button type="button" variant="ghost" onClick={signOut}>
          <LogOut className="size-4" aria-hidden />
          Sign out
        </Button>
      </div>
      <DashboardDataProvider>{children}</DashboardDataProvider>
    </div>
  );
}
