"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LogIn, Mail } from "lucide-react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

const inputClass =
  "h-11 w-full border border-border bg-white px-3 font-mono text-sm text-black outline-none transition placeholder:text-black/40 focus:border-[#0f2336] focus:ring-1 focus:ring-[#0f2336] dark:border-border dark:bg-surface-card dark:text-white dark:placeholder:text-white/40 dark:focus:border-border-strong dark:focus:ring-border-strong";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const nextPath = searchParams.get("next");
  const safeNext =
    nextPath && nextPath.startsWith("/") && !nextPath.startsWith("//")
      ? nextPath
      : "/dashboard";

  useEffect(() => {
    const savedEmail = localStorage.getItem("rememberedEmail");
    if (savedEmail) {
      setEmail(savedEmail);
      setRememberMe(true);
    }
  }, []);

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
    if (error) {
      setMessage(error.message);
    } else {
      if (rememberMe) {
        localStorage.setItem("rememberedEmail", email);
      } else {
        localStorage.removeItem("rememberedEmail");
      }
    }
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
      <div className="flex min-h-screen items-center justify-center font-mono text-xs uppercase tracking-widest text-black/60 dark:text-white/55">
        Loading secure workspace…
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md border border-border bg-white p-6 dark:border-border dark:bg-surface-card">
        <div className="mb-6 border-b border-dashed border-border pb-6 dark:border-border">
          <p className="font-mono text-[10px] uppercase tracking-[0.35em] text-black/55 dark:text-white/50">
            [ AUTH / SESSION ]
          </p>
          <h1 className="mt-4 font-sans text-2xl font-black uppercase tracking-tight text-black dark:text-white">
            Sign in
          </h1>
          <p className="mt-3 font-mono text-xs leading-relaxed text-black/75 dark:text-white/70">
            Gmail and webhook data stay behind the founder dashboard. Monospace fields, navy actions.
          </p>
        </div>
        <form className="space-y-5" onSubmit={signInWithPassword}>
          <label className="block space-y-2">
            <span className="font-mono text-xs uppercase tracking-widest text-black/80 dark:text-white/75">
              Email
            </span>
            <input
              className={inputClass}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </label>
          <label className="block space-y-2">
            <span className="font-mono text-xs uppercase tracking-widest text-black/80 dark:text-white/75">
              Password
            </span>
            <input
              className={inputClass}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </label>
          <label className="flex cursor-pointer items-center gap-3 font-mono text-xs text-black dark:text-white">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="h-4 w-4 shrink-0 border border-border bg-white text-[#0f2336] focus:ring-1 focus:ring-[#0f2336] dark:border-border dark:bg-surface-card dark:text-muted dark:focus:ring-border-strong"
            />
            Remember me
          </label>
          {message ? (
            <p
              className="border border-dashed border-border bg-[#e3eef6] px-3 py-2 font-mono text-xs text-black dark:border-border dark:bg-surface-elevated dark:text-white"
              role="alert"
            >
              {message}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-3 pt-1">
            <button
              type="submit"
              disabled={busy}
              className="inline-flex cursor-pointer items-center gap-2 border border-border bg-[#0f2336] px-4 py-2.5 font-mono text-xs font-medium uppercase tracking-widest text-white transition hover:bg-[#172f45] disabled:opacity-50 dark:border-border"
            >
              <LogIn className="h-4 w-4 shrink-0" aria-hidden />
              Sign in
            </button>
            <button
              type="button"
              disabled={busy || !email}
              onClick={sendMagicLink}
              className="inline-flex cursor-pointer items-center gap-2 border border-border bg-white px-4 py-2.5 font-mono text-xs uppercase tracking-widest text-black transition hover:bg-[#e3eef6] disabled:cursor-not-allowed disabled:opacity-50 dark:border-border dark:bg-surface-card dark:text-white dark:hover:bg-white/5"
            >
              <Mail className="h-4 w-4 shrink-0" aria-hidden />
              Magic link
            </button>
          </div>
        </form>
        <p className="mt-8 hairline-t pt-6 text-center font-mono text-[10px] uppercase tracking-widest text-black/60 dark:text-white/55">
          Need an account?{" "}
          <Link
            href="/signup"
            className="cursor-pointer text-[#0f2336] underline underline-offset-4 hover:text-black dark:text-muted dark:hover:text-white"
          >
            Start signup
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center font-mono text-xs uppercase tracking-widest text-black/60 dark:text-white/55">
          Loading…
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
