"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Mail, Lock, User } from "lucide-react";
import FormInput from "@/components/signup/FormInput";
import type { SignupSnapshot } from "@/components/signup/types";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type StepAccountProps = {
  snapshot: SignupSnapshot;
  onPatch: (patch: Partial<SignupSnapshot>) => void;
  onNext: () => void;
};

function validatePassword(pw: string): string | undefined {
  if (pw.length < 8) return "At least 8 characters";
  if (!/[A-Z]/.test(pw)) return "Include one uppercase letter";
  if (!/[0-9]/.test(pw)) return "Include one number";
  return undefined;
}

/** Canonical email for API + Supabase (trim + lowercase). */
function normalizeSignupEmail(email: string): string {
  return email.trim().toLowerCase();
}

const DUPLICATE_EMAIL_MSG =
  "An account with this email already exists. Sign in to continue onboarding.";

const PENDING_VERIFICATION_MSG =
  "This email already has a pending signup. Check your inbox or resend the verification link below.";

function mapSignUpError(error: {
  message?: string;
  status?: number;
  name?: string;
  code?: string;
}): string {
  const msg = error.message?.toLowerCase() ?? "";
  const raw = error.message ?? "";
  const code = error.code?.toLowerCase() ?? "";

  if (
    code === "over_email_send_rate_limit" ||
    error.status === 429 ||
    msg.includes("429") ||
    msg.includes("rate limit")
  ) {
    if (msg.includes("20 seconds") || msg.includes("only request")) {
      return "Too many attempts. Please wait about 20 seconds before requesting another email.";
    }
    return "Too many requests. Please wait a minute and try again.";
  }

  if (
    msg.includes("already") ||
    msg.includes("registered") ||
    msg.includes("exists") ||
    msg.includes("user already")
  ) {
    return DUPLICATE_EMAIL_MSG;
  }

  if (msg.includes("password") && msg.includes("weak")) {
    return raw;
  }

  return raw || "Something went wrong. Please try again.";
}

export default function StepAccount({ snapshot, onPatch, onNext }: StepAccountProps) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [fullName, setFullName] = useState(
    () => snapshot.accountFullName || "",
  );
  const [email, setEmail] = useState(() =>
    normalizeSignupEmail(snapshot.accountEmail || ""),
  );
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [phone, setPhone] = useState(() => snapshot.accountPhone || "");
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [resendMessage, setResendMessage] = useState("");

  const verificationPending = snapshot.accountVerificationPending;
  const lockedEmail = normalizeSignupEmail(snapshot.accountEmail || "");

  const pwError = password ? validatePassword(password) : undefined;
  const confirmError =
    confirm && password !== confirm ? "Passwords do not match" : undefined;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    setResendMessage("");
    if (!terms) {
      setFormError("You must accept the Terms of Service and Privacy Policy.");
      return;
    }
    const pErr = validatePassword(password);
    if (pErr) {
      setFormError(pErr);
      return;
    }
    if (password !== confirm) {
      setFormError("Passwords do not match");
      return;
    }
    setBusy(true);
    const normalizedEmail = normalizeSignupEmail(email);

    const checkRes = await fetch("/api/auth/check-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: normalizedEmail }),
    });
    if (!checkRes.ok) {
      setFormError(
        "Could not verify if this email is available. Please try again in a moment.",
      );
      setBusy(false);
      return;
    }
    const checkJson = (await checkRes.json()) as {
      registered?: boolean;
      status?: string;
    };
    if (checkJson.status === "confirmed" || checkJson.registered) {
      setFormError(DUPLICATE_EMAIL_MSG);
      setBusy(false);
      return;
    }
    if (checkJson.status === "pending_verification") {
      setFormError(PENDING_VERIFICATION_MSG);
      setBusy(false);
      return;
    }

    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const verifyNext = encodeURIComponent("/onboarding");
    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        emailRedirectTo: `${origin}/auth/callback?next=${verifyNext}`,
        data: {
          full_name: fullName,
          ...(phone.trim() ? { phone: phone.trim() } : {}),
        },
      },
    });

    if (error) {
      setFormError(mapSignUpError(error));
      setBusy(false);
      return;
    }

    const user = data.user;
    if (!user?.id) {
      setFormError(
        "Could not complete signup. Try signing in if you already created an account.",
      );
      setBusy(false);
      return;
    }

    const hasSession = Boolean(data.session);

    if (hasSession) {
      const { error: profileError } = await supabase.from("profiles").upsert(
        {
          id: user.id,
          full_name: fullName,
          ...(phone.trim() ? { phone: phone.trim() } : { phone: null }),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      );

      if (profileError) {
        console.error("[signup] profile update:", profileError.message);
      }

      onPatch({
        accountEmail: normalizedEmail,
        accountFullName: fullName.trim(),
        accountPhone: phone.trim(),
        accountVerificationPending: false,
      });
      setBusy(false);
      onNext();
      return;
    }

    // Email confirmation required — no session; profile is created by DB trigger from user metadata
    onPatch({
      accountEmail: normalizedEmail,
      accountFullName: fullName.trim(),
      accountPhone: phone.trim(),
      accountVerificationPending: true,
    });
    setPassword("");
    setConfirm("");
    setBusy(false);
  }

  async function resendVerification() {
    const target = lockedEmail;
    if (!target) return;
    setResendMessage("");
    setFormError("");
    setBusy(true);

    const checkRes = await fetch("/api/auth/check-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: target }),
    });
    if (checkRes.ok) {
      const checkJson = (await checkRes.json()) as {
        registered?: boolean;
        status?: string;
      };
      if (checkJson.status === "confirmed" || checkJson.registered) {
        onPatch({ accountVerificationPending: false });
        setFormError(DUPLICATE_EMAIL_MSG);
        setBusy(false);
        return;
      }
    }

    const origin =
      typeof window !== "undefined" ? window.location.origin : "";
    const verifyNext = encodeURIComponent("/onboarding");
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: target,
      options: {
        emailRedirectTo: `${origin}/auth/callback?next=${verifyNext}`,
      },
    });
    setBusy(false);
    if (error) {
      setFormError(mapSignUpError(error));
      return;
    }
    setResendMessage("Verification email sent. Check your inbox.");
  }

  if (verificationPending) {
    return (
      <div className="mx-auto max-w-lg space-y-5">
        <div>
          <h2 className="font-sans text-xl font-black uppercase tracking-tight text-foreground">Verify your email</h2>
          <p className="mt-1 font-mono text-sm text-gray-500 dark:text-gray-400">
            We sent a confirmation link to{" "}
            <span className="font-medium text-foreground">{lockedEmail}</span>. After you
            confirm, sign in to continue workspace setup.
          </p>
        </div>
        <div className="border border-border bg-[#e3eef6] px-4 py-3 font-mono text-sm text-foreground dark:border-border dark:bg-surface-elevated">
          <p className="font-medium">Next steps</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-gray-600 dark:text-gray-300">
            <li>Open the email and click the confirmation link.</li>
            <li>
              Sign in on the login page — you&apos;ll return here to finish onboarding.
            </li>
          </ol>
        </div>
        <Link
          href="/login?next=%2Fsignup"
          className="inline-flex w-full cursor-pointer items-center justify-center border border-border bg-[#0f2336] py-2.5 font-mono text-xs font-semibold uppercase tracking-widest text-white transition hover:bg-[#172f45] dark:border-border"
        >
          Go to sign in
        </Link>
        <button
          type="button"
          disabled={busy}
          onClick={resendVerification}
          className="inline-flex w-full cursor-pointer items-center justify-center border border-border bg-white py-2.5 font-mono text-xs font-semibold uppercase tracking-widest text-black transition hover:bg-[#eef6fb] disabled:opacity-50 dark:border-border dark:bg-surface-card dark:text-white dark:hover:bg-surface-elevated"
        >
          {busy ? "Sending…" : "Resend verification email"}
        </button>
        {formError ? (
          <p className="text-sm text-[#8B1A1A]" role="alert">
            {formError}
          </p>
        ) : null}
        {resendMessage ? (
          <p className="font-mono text-sm text-[#0f2336] dark:text-muted" role="status">
            {resendMessage}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-lg space-y-5">
      <div>
        <h2 className="font-sans text-xl font-black uppercase tracking-tight text-foreground">Create your account</h2>
        <p className="mt-1 font-mono text-sm text-gray-500 dark:text-gray-400">
          After you create your account, we&apos;ll email you a verification link. Once
          your email is confirmed, sign in to continue with workspace setup.
        </p>
      </div>
      <FormInput
        id="fullName"
        label="Full name"
        icon={User}
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
        autoComplete="name"
        required
        showValid
      />
      <FormInput
        id="email"
        label="Email"
        type="email"
        icon={Mail}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="email"
        required
        showValid
      />
      <FormInput
        id="password"
        label="Password"
        type="password"
        icon={Lock}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="new-password"
        required
        error={pwError}
        hint="Min 8 characters, one uppercase letter, one number"
      />
      <FormInput
        id="confirm"
        label="Confirm password"
        type="password"
        icon={Lock}
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        autoComplete="new-password"
        required
        error={confirmError}
      />
      <FormInput
        id="phone"
        label="Phone"
        type="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        autoComplete="tel"
      />
      <label className="flex cursor-pointer items-start gap-3 text-sm text-gray-600 dark:text-gray-300">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 border border-border bg-white text-[#0f2336] focus:ring-1 focus:ring-[#0f2336] dark:border-border dark:bg-surface-card dark:text-muted dark:focus:ring-border-strong"
          checked={terms}
          onChange={(e) => setTerms(e.target.checked)}
          required
        />
        <span>
          I agree to the{" "}
          <span className="font-mono text-[#0f2336] dark:text-muted">Terms of Service</span> and{" "}
          <span className="font-mono text-[#0f2336] dark:text-muted">Privacy Policy</span>
        </span>
      </label>
      {formError ? (
        <p className="text-sm text-[#8B1A1A]" role="alert">
          {formError}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={busy}
        className="inline-flex w-full cursor-pointer items-center justify-center border border-border bg-[#0f2336] py-2.5 font-mono text-xs font-semibold uppercase tracking-widest text-white transition hover:bg-[#172f45] disabled:opacity-50 dark:border-border"
      >
        {busy ? "Creating account…" : "Continue"}
      </button>
    </form>
  );
}
