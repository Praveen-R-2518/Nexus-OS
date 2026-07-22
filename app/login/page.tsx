"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, LogIn, Mail } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { AuthSplitLayout } from "@/components/auth/AuthSplitLayout";
import { LOGIN_BRAND } from "@/lib/auth/brandCopy";
import { buildAuthCallbackUrl, safeNextPath } from "@/lib/auth/redirect-url";
import { DURATION, EASE } from "@/lib/landing/motion";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";

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

async function resolvePostLoginPath(
  safeNext: string,
  session: SessionLike,
): Promise<string> {
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
  const reduce = useReducedMotion();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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

    const finishLoading = () => {
      if (!cancelled) setLoading(false);
    };

    const timeout = window.setTimeout(finishLoading, 4000);

    supabase.auth
      .getSession()
      .then(async ({ data }) => {
        if (cancelled) return;
        if (data.session) {
          const destination = await resolvePostLoginPath(safeNext, data.session);
          if (!cancelled) router.replace(destination);
          return;
        }
        window.clearTimeout(timeout);
        finishLoading();
      })
      .catch(() => {
        window.clearTimeout(timeout);
        finishLoading();
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
      window.clearTimeout(timeout);
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
      startCooldown(MAGIC_LINK_COOLDOWN_SECONDS);
      setMessage("Magic link sent. Check your email.");
    }
    setBusy(false);
  }

  if (loading) {
    return (
      <AuthSplitLayout mode="signin" brand={LOGIN_BRAND}>
        <p className="text-[14px] text-[#86868b]">Loading secure workspace…</p>
      </AuthSplitLayout>
    );
  }

  const rise = reduce
    ? {}
    : {
        initial: { opacity: 0, y: 12 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: DURATION.entrance, ease: EASE },
      };

  return (
    <AuthSplitLayout mode="signin" brand={LOGIN_BRAND}>
      <motion.div {...rise}>
        <h2 className="text-[clamp(1.75rem,2.5vw,2.25rem)] font-semibold tracking-[-0.02em] text-[#1d1d1f]">
          Welcome back
        </h2>
        <p className="mt-2 text-[15px] leading-[1.55] text-[#6e6e73]">
          Enter your credentials to open the command center.
        </p>

        <form className="mt-8 space-y-5" onSubmit={signInWithPassword}>
          <label className="block space-y-2">
            <span className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-[#6e6e73]">
              Email address
            </span>
            <input
              className="landing-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </label>

          <label className="block space-y-2">
            <span className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-[#6e6e73]">
              Password
            </span>
            <div className="relative">
              <input
                className="landing-input pr-11"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer rounded-md p-1.5 text-[#86868b] transition hover:text-[#1d1d1f]"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </label>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex min-h-11 cursor-pointer items-center gap-3 text-[14px] text-[#6e6e73]">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="h-4 w-4 shrink-0 rounded border border-[color:var(--apple-hairline)] text-[color:var(--nexus-approval)] focus:ring-[color:var(--nexus-approval)]"
              />
              Remember me
            </label>
            <p className="text-[12px] text-[#86868b]">
              Session remembered securely by Supabase
            </p>
          </div>

          {message ? (
            <p
              className="rounded-xl border border-[color:var(--nexus-approval-border)] bg-[color:var(--nexus-approval-soft)] px-3 py-2 text-[14px] text-[#1d1d1f]"
              role="alert"
            >
              {message}
            </p>
          ) : null}

          <div className="flex flex-col gap-3 pt-1 sm:flex-row">
            <motion.button
              type="submit"
              disabled={busy || cooldownRemaining > 0}
              whileHover={reduce ? undefined : { y: -1 }}
              whileTap={reduce ? undefined : { scale: 0.98 }}
              className={cn(
                "inline-flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-full bg-[color:var(--nexus-approval)] px-6 text-[15px] font-medium text-white transition-colors hover:bg-[#2b82ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--nexus-approval)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
              )}
            >
              <LogIn className="h-4 w-4 shrink-0" aria-hidden />
              {cooldownRemaining > 0 ? `Wait ${cooldownRemaining}s` : "Sign in"}
            </motion.button>
            <motion.button
              type="button"
              disabled={busy || !email || cooldownRemaining > 0}
              onClick={sendMagicLink}
              whileHover={reduce ? undefined : { y: -1 }}
              whileTap={reduce ? undefined : { scale: 0.98 }}
              className="inline-flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-full border border-[color:var(--apple-hairline)] bg-white px-6 text-[15px] font-medium text-[#1d1d1f] transition-colors hover:bg-black/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--nexus-approval)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Mail className="h-4 w-4 shrink-0" aria-hidden />
              Magic link
            </motion.button>
          </div>
        </form>
      </motion.div>
    </AuthSplitLayout>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <AuthSplitLayout mode="signin" brand={LOGIN_BRAND}>
          <p className="text-[14px] text-[#86868b]">Loading…</p>
        </AuthSplitLayout>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
