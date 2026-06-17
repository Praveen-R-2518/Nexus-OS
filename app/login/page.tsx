"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LogIn, Mail } from "lucide-react";
import Link from "next/link";
import { buildAuthCallbackUrl, safeNextPath } from "@/lib/auth/redirect-url";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

const inputClass =
  "h-11 w-full rounded-xl border border-border bg-white px-3 text-[15px] text-black outline-none transition placeholder:text-black/45 focus:border-nexus-approval focus:ring-1 focus:ring-nexus-approval dark:border-border dark:bg-surface-card dark:text-white dark:placeholder:text-white/45 dark:focus:border-nexus-approval dark:focus:ring-nexus-approval";

// Client-side throttle so users can't hammer Supabase Auth into a 429.
const PASSWORD_BACKOFF_SECONDS = [5, 15, 30, 60] as const;
const MAGIC_LINK_COOLDOWN_SECONDS = 60;

type AuthLikeError = { status?: number; message?: string } | null | undefined;
type SessionLike = { user?: { id?: string | null } } | null;

function isRateLimitError(error: AuthLikeError): boolean {
  if (!error) return false;
  if (error.status === 429) return true;
  return /rate limit|too many/i.test(error.message ?? "");
}

function backoffSeconds(attempt: number): number {
  const idx = Math.min(
    Math.max(attempt - 1, 0),
    PASSWORD_BACKOFF_SECONDS.length - 1,
  );
  return PASSWORD_BACKOFF_SECONDS[idx];
}

async function resolvePostLoginPath(safeNext: string, session: SessionLike): Promise<string> {
  const userId = session?.user?.id;
  if (!userId || safeNext.startsWith("/signup")) return safeNext;

  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("team_id")
    .eq("id", userId)
    .maybeSingle();

  if (error) return safeNext;

  const rawTeamId = data && (data as { team_id?: unknown }).team_id;
  const teamId =
    typeof rawTeamId === "string" && rawTeamId.trim()
      ? rawTeamId.trim()
      : null;

  return teamId ? safeNext : "/signup?step=workspace";
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const rateLimitAttempts = useRef(0);

  const nextPath = searchParams.get("next");
  const safeNext = safeNextPath(nextPath, "/dashboard");

  const callbackError = searchParams.get("error");

  useEffect(() => {
    const savedEmail = localStorage.getItem("rememberedEmail");
    if (savedEmail) {
      setEmail(savedEmail);
      setRememberMe(true);
    }
  }, []);

  useEffect(() => {
    if (!callbackError) return;
    setMessage(callbackError);
    if (isRateLimitError({ message: callbackError })) {
      startCooldown(PASSWORD_BACKOFF_SECONDS[PASSWORD_BACKOFF_SECONDS.length - 1]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callbackError]);

  useEffect(() => {
    if (cooldownUntil <= Date.now()) {
      setCooldownRemaining(0);
      return;
    }
    const tick = () => {
      const remaining = Math.max(
        0,
        Math.ceil((cooldownUntil - Date.now()) / 1000),
      );
      setCooldownRemaining(remaining);
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [cooldownUntil]);

  const startCooldown = (seconds: number) => {
    setCooldownUntil(Date.now() + seconds * 1000);
    setCooldownRemaining(seconds);
  };

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let cancelled = false;

    supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled) return;
      if (data.session) {
        const destination = await resolvePostLoginPath(safeNext, data.session);
        if (!cancelled) router.replace(destination);
        return;
      }
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      if (session) {
        void resolvePostLoginPath(safeNext, session).then((destination) => {
          if (!cancelled) router.replace(destination);
        });
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [router, safeNext]);

  async function signInWithPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || cooldownRemaining > 0) return;
    setBusy(true);
    setMessage("");
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      if (isRateLimitError(error)) {
        rateLimitAttempts.current += 1;
        const wait = backoffSeconds(rateLimitAttempts.current);
        startCooldown(wait);
        setMessage(
          `Too many attempts. Please wait ${wait}s before trying again.`,
        );
      } else {
        setMessage(error.message);
      }
    } else {
      rateLimitAttempts.current = 0;
      if (rememberMe) {
        localStorage.setItem("rememberedEmail", email);
      } else {
        localStorage.removeItem("rememberedEmail");
      }
    }
    setBusy(false);
  }

  async function sendMagicLink() {
    if (busy || cooldownRemaining > 0 || !email) return;
    setBusy(true);
    setMessage("");
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: buildAuthCallbackUrl(safeNext),
      },
    });
    if (error) {
      if (isRateLimitError(error)) {
        startCooldown(MAGIC_LINK_COOLDOWN_SECONDS);
        setMessage(
          `Too many magic link requests. Please wait ${MAGIC_LINK_COOLDOWN_SECONDS}s before trying again.`,
        );
      } else {
        setMessage(error.message);
      }
    } else {
      // Lock the button for the per-email window to avoid tripping the limit.
      startCooldown(MAGIC_LINK_COOLDOWN_SECONDS);
      setMessage("Magic link sent. Check your email.");
    }
    setBusy(false);
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm font-medium text-black/70 dark:text-white/70">
        Loading secure workspace…
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-[2rem] border border-border bg-white p-8 text-black shadow-2xl md:p-10 dark:border-border dark:bg-white dark:text-black">
        <div className="mb-6 border-b border-dashed border-border pb-6 dark:border-border">
          <p className="nexus-meta text-nexus-approval dark:text-nexus-approval">
            Auth session
          </p>
          <h1 className="mt-4 nexus-section-title text-black dark:text-white">
            Sign in
          </h1>
          <p className="mt-3 text-base leading-relaxed text-black/70 dark:text-white/70">
            Gmail and webhook data stay protected behind the founder dashboard.
          </p>
        </div>
        <form className="space-y-5" onSubmit={signInWithPassword}>
          <label className="block space-y-2">
            <span className="text-sm font-medium text-black/80 dark:text-white/80">
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
            <span className="text-sm font-medium text-black/80 dark:text-white/80">
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
          <label className="flex cursor-pointer items-center gap-3 text-sm text-black/75 dark:text-white/75">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="h-4 w-4 shrink-0 border border-border bg-white text-nexus-approval focus:ring-1 focus:ring-nexus-approval dark:border-border dark:bg-surface-card dark:text-nexus-approval dark:focus:ring-nexus-approval"
            />
            Remember me
          </label>
          {message ? (
            <p
              className="rounded-xl border border-nexus-approval-border bg-nexus-approval-soft px-3 py-2 text-sm text-black dark:border-nexus-approval-border dark:bg-nexus-approval-soft dark:text-white"
              role="alert"
            >
              {message}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-3 pt-1">
            <button
              type="submit"
              disabled={busy || cooldownRemaining > 0}
              className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-nexus-approval bg-nexus-approval px-6 py-3 text-sm font-medium text-white transition hover:bg-[#2b82ff] disabled:cursor-not-allowed disabled:opacity-50 dark:border-nexus-approval"
            >
              <LogIn className="h-4 w-4 shrink-0" aria-hidden />
              {cooldownRemaining > 0 ? `Wait ${cooldownRemaining}s` : "Sign in"}
            </button>
            <button
              type="button"
              disabled={busy || !email || cooldownRemaining > 0}
              onClick={sendMagicLink}
              className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-border bg-white px-6 py-3 text-sm font-medium text-black transition hover:bg-nexus-discovery-soft disabled:cursor-not-allowed disabled:opacity-50 dark:border-border dark:bg-surface-card dark:text-white dark:hover:bg-white/5"
            >
              <Mail className="h-4 w-4 shrink-0" aria-hidden />
              Magic link
            </button>
          </div>
        </form>
        <p className="mt-8 hairline-t pt-6 text-center text-sm text-black/70 dark:text-white/70">
          Need an account?{" "}
          <Link
            href="/signup"
            className="cursor-pointer font-medium text-nexus-approval underline underline-offset-4 hover:text-black dark:text-nexus-approval dark:hover:text-white"
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
        <div className="flex min-h-screen items-center justify-center text-sm font-medium text-black/70 dark:text-white/70">
          Loading…
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
