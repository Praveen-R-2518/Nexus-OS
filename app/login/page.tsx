"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LogIn, Mail } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const nextPath = searchParams.get("next");
  const safeNext =
    nextPath && nextPath.startsWith("/") && !nextPath.startsWith("//")
      ? nextPath
      : "/dashboard";

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let cancelled = false;

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session) {
        router.replace(safeNext);
        return;
      }
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      if (session) {
        router.replace(safeNext);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [router, safeNext]);

  async function signInWithPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) setMessage(error.message);
    setBusy(false);
  }

  async function sendMagicLink() {
    setBusy(true);
    setMessage("");
    const supabase = createSupabaseBrowserClient();
    const origin =
      typeof window !== "undefined" ? window.location.origin : "";
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${origin}${safeNext}`,
      },
    });
    setMessage(error ? error.message : "Magic link sent. Check your email.");
    setBusy(false);
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-atmospheric-grey/60">
        Loading secure workspace…
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-xl border border-white/10 glass-panel p-6 shadow-2xl">
        <div className="mb-6 space-y-2">
          <p className="text-xs font-medium uppercase tracking-[0.28em] text-trajectory-blue">
            Founder Access
          </p>
          <h1 className="text-2xl font-semibold text-atmospheric-grey">
            Sign in to Nexus OS
          </h1>
          <p className="text-sm text-atmospheric-grey/60">
            Live Gmail and fallback webhook data stay behind the founder
            dashboard.
          </p>
        </div>
        <form className="space-y-4" onSubmit={signInWithPassword}>
          <label className="block space-y-2 text-sm">
            <span className="text-atmospheric-grey/80">Email</span>
            <input
              className="glass-input h-10 w-full rounded-lg px-3"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </label>
          <label className="block space-y-2 text-sm">
            <span className="text-atmospheric-grey/80">Password</span>
            <input
              className="glass-input h-10 w-full rounded-lg px-3"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </label>
          {message ? (
            <p className="text-sm text-amber-300" role="alert">
              {message}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={busy}
              className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-trajectory-blue px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-600 disabled:opacity-50"
            >
              <LogIn className="h-4 w-4 shrink-0" aria-hidden />
              Sign in
            </button>
            <button
              type="button"
              disabled={busy || !email}
              onClick={sendMagicLink}
              className="glass-button inline-flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-atmospheric-grey/80 hover:text-atmospheric-grey disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Mail className="h-4 w-4 shrink-0" aria-hidden />
              Magic link
            </button>
          </div>
        </form>
        <p className="mt-6 text-center text-xs text-atmospheric-grey/60">
          Need an account?{" "}
          <a
            href="/signup"
            className="text-trajectory-blue underline decoration-trajectory-blue/40 underline-offset-2 hover:text-blue-400"
          >
            Start signup
          </a>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-sm text-atmospheric-grey/60">
          Loading…
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
