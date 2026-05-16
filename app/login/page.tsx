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
      <div className="flex min-h-screen items-center justify-center text-sm text-gray-400">
        Loading secure workspace…
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-xl border border-gray-800 bg-gray-950 p-6 shadow-2xl shadow-black/40">
        <div className="mb-6 space-y-2">
          <p className="text-xs font-medium uppercase tracking-[0.28em] text-emerald-400">
            Founder Access
          </p>
          <h1 className="text-2xl font-semibold text-gray-50">
            Sign in to Nexus OS
          </h1>
          <p className="text-sm text-gray-400">
            Live Gmail and fallback webhook data stay behind the founder
            dashboard.
          </p>
        </div>
        <form className="space-y-4" onSubmit={signInWithPassword}>
          <label className="block space-y-2 text-sm">
            <span className="text-gray-300">Email</span>
            <input
              className="h-10 w-full rounded-lg border border-gray-800 bg-gray-900 px-3 text-gray-50 outline-none transition focus:border-emerald-500"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </label>
          <label className="block space-y-2 text-sm">
            <span className="text-gray-300">Password</span>
            <input
              className="h-10 w-full rounded-lg border border-gray-800 bg-gray-900 px-3 text-gray-50 outline-none transition focus:border-emerald-500"
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
              className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50"
            >
              <LogIn className="h-4 w-4 shrink-0" aria-hidden />
              Sign in
            </button>
            <button
              type="button"
              disabled={busy || !email}
              onClick={sendMagicLink}
              className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-gray-700 bg-gray-900 px-4 py-2 text-sm font-medium text-gray-200 transition hover:border-gray-600 hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Mail className="h-4 w-4 shrink-0" aria-hidden />
              Magic link
            </button>
          </div>
        </form>
        <p className="mt-6 text-center text-xs text-gray-500">
          Need an account?{" "}
          <a
            href="/signup"
            className="text-emerald-400 underline decoration-emerald-500/40 underline-offset-2 hover:text-emerald-300"
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
        <div className="flex min-h-screen items-center justify-center text-sm text-gray-400">
          Loading…
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
