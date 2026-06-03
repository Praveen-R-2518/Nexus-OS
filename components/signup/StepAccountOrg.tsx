"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Building2, Mail, Lock, User } from "lucide-react";
import FormInput from "@/components/signup/FormInput";
import type { SignupSnapshot } from "@/components/signup/types";
import { buildAuthCallbackUrl } from "@/lib/auth/redirect-url";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type StepAccountOrgProps = {
  snapshot: SignupSnapshot;
  onPatch: (patch: Partial<SignupSnapshot>) => void;
  onComplete: (
    patch: Partial<SignupSnapshot> & { workspaceId: string; subscriptionId: string },
  ) => void;
  onBack: () => void;
};

function validatePassword(pw: string): string | undefined {
  if (pw.length < 8) return "At least 8 characters";
  if (!/[A-Z]/.test(pw)) return "Include one uppercase letter";
  if (!/[0-9]/.test(pw)) return "Include one number";
  return undefined;
}

function normalizeSignupEmail(email: string): string {
  return email.trim().toLowerCase();
}

const DUPLICATE_EMAIL_MSG =
  "An account with this email already exists. Sign in to continue onboarding.";

const PENDING_VERIFICATION_MSG =
  "This email already has a pending signup. Check your inbox or resend the verification link below.";

const RESEND_COOLDOWN_SECONDS = 60;

type SupabaseAuthError = {
  message?: string;
  status?: number;
  name?: string;
  code?: string;
};

function logSupabaseAuthEmailError(source: "signup" | "resend", error: SupabaseAuthError) {
  console.warn(`[${source}] Supabase auth email error`, {
    status: error.status,
    code: error.code,
    name: error.name,
    message: error.message,
  });
}

function mapSignUpError(error: SupabaseAuthError): string {
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
    msg.includes("email address is not authorized") ||
    msg.includes("not authorized") ||
    msg.includes("team email")
  ) {
    return "Supabase is blocking email delivery to this address. Configure custom SMTP for production signups, then try again.";
  }

  if (
    msg.includes("redirect") ||
    msg.includes("not allowed") ||
    msg.includes("uri") ||
    msg.includes("url")
  ) {
    return "The verification redirect URL is not allowed by Supabase. Add this app's /auth/callback URL to the Supabase Auth redirect allowlist.";
  }

  if (
    msg.includes("send email hook") ||
    msg.includes("hook") ||
    msg.includes("webhook")
  ) {
    return "Supabase's Send Email Hook failed while sending the verification email. Disable the hook or make it return HTTP 200.";
  }

  if (
    msg.includes("535") ||
    msg.includes("authentication failed") ||
    msg.includes("invalid login") ||
    msg.includes("invalid credentials") ||
    msg.includes("username and password not accepted")
  ) {
    return "The SMTP provider rejected the configured username or password. Update the Supabase SMTP credential, then try again.";
  }

  if (
    msg.includes("sender") ||
    msg.includes("domain") ||
    msg.includes("dkim") ||
    msg.includes("spf") ||
    msg.includes("dmarc") ||
    msg.includes("554") ||
    msg.includes("rejected")
  ) {
    return "The SMTP provider rejected the sender. Verify the sender/domain authentication in your email provider, then try again.";
  }

  if (
    msg.includes("timeout") ||
    msg.includes("connection") ||
    msg.includes("tls") ||
    msg.includes("certificate") ||
    msg.includes("econnrefused")
  ) {
    return "Supabase could not connect to the SMTP provider. Check SMTP host, port, TLS settings, and provider firewall rules.";
  }

  if (
    msg.includes("error sending confirmation email") ||
    msg.includes("error sending magic link") ||
    msg.includes("smtp") ||
    msg.includes("mailer") ||
    msg.includes("email provider") ||
    msg.includes("sending email")
  ) {
    return "We could not send the verification email. Run npm run check:auth-email, then repair the Supabase Auth SMTP settings if it keeps happening.";
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

type LaunchWorkspaceResponse = {
  workspace_id?: unknown;
};

function parseWorkspaceId(data: unknown): string | undefined {
  if (typeof data === "string") return data;
  if (data && typeof data === "object") {
    const raw = (data as LaunchWorkspaceResponse).workspace_id;
    return typeof raw === "string" && raw.trim() ? raw : undefined;
  }
  return undefined;
}

export default function StepAccountOrg({
  snapshot,
  onPatch,
  onComplete,
  onBack,
}: StepAccountOrgProps) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [fullName, setFullName] = useState(() => snapshot.accountFullName || "");
  const [email, setEmail] = useState(() => normalizeSignupEmail(snapshot.accountEmail || ""));
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [organizationName, setOrganizationName] = useState(snapshot.companyName || "");
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [resendMessage, setResendMessage] = useState("");
  const [resendCooldownUntil, setResendCooldownUntil] = useState(0);
  const [resendRemaining, setResendRemaining] = useState(0);

  const verificationPending = snapshot.accountVerificationPending;
  const lockedEmail = normalizeSignupEmail(snapshot.accountEmail || "");

  const pwError = password ? validatePassword(password) : undefined;
  const confirmError =
    confirm && password !== confirm ? "Passwords do not match" : undefined;

  useEffect(() => {
    if (resendCooldownUntil <= Date.now()) {
      setResendRemaining(0);
      return;
    }
    const tick = () => {
      setResendRemaining(Math.max(0, Math.ceil((resendCooldownUntil - Date.now()) / 1000)));
    };
    tick();
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, [resendCooldownUntil]);

  async function provisionWorkspace(): Promise<{
    workspaceId: string;
    subscriptionId: string;
  } | null> {
    const orgName = organizationName.trim() || snapshot.companyName.trim();
    if (!orgName) {
      setFormError("Organization name is required.");
      return null;
    }

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    if (userErr || !user?.id) {
      setFormError("You must be signed in to create your organization.");
      return null;
    }

    if (snapshot.workspaceId && snapshot.subscriptionId) {
      return {
        workspaceId: snapshot.workspaceId,
        subscriptionId: snapshot.subscriptionId,
      };
    }

    const { data: rpcData, error: rpcError } = await supabase.rpc("launch_workspace", {
      company_name: orgName,
      invite_emails: [],
      workspace_type: "solo",
      industry: "Technology",
      company_size: "Just me",
    });

    if (rpcError) {
      setFormError(rpcError.message || "Could not create organization.");
      return null;
    }

    const workspaceId = parseWorkspaceId(rpcData);
    if (!workspaceId) {
      setFormError("Could not create organization.");
      return null;
    }

    const planTier = snapshot.planTier ?? "starter";
    const billingCycle = snapshot.billingCycle ?? "monthly";

    if (snapshot.subscriptionId) {
      const { error: updErr } = await supabase
        .from("subscriptions")
        .update({ plan_tier: planTier, billing_cycle: billingCycle })
        .eq("id", snapshot.subscriptionId);

      if (updErr) {
        setFormError(updErr.message);
        return null;
      }

      return { workspaceId, subscriptionId: snapshot.subscriptionId };
    }

    const { data: subData, error: subErr } = await supabase
      .from("subscriptions")
      .insert({
        workspace_id: workspaceId,
        plan_tier: planTier,
        billing_cycle: billingCycle,
        status: "pending",
      })
      .select("id")
      .single();

    if (subErr || !subData?.id) {
      setFormError(subErr?.message || "Could not save plan selection.");
      return null;
    }

    return { workspaceId, subscriptionId: subData.id };
  }

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
    if (!organizationName.trim()) {
      setFormError("Organization name is required.");
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
      setFormError("Could not verify if this email is available. Please try again in a moment.");
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

    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        emailRedirectTo: buildAuthCallbackUrl("/signup"),
        data: {
          full_name: fullName,
        },
      },
    });

    if (error) {
      logSupabaseAuthEmailError("signup", error);
      setFormError(mapSignUpError(error));
      setBusy(false);
      return;
    }

    const user = data.user;
    if (!user?.id) {
      setFormError("Could not complete signup. Try signing in if you already created an account.");
      setBusy(false);
      return;
    }

    const hasSession = Boolean(data.session);

    onPatch({
      accountEmail: normalizedEmail,
      accountFullName: fullName.trim(),
      companyName: organizationName.trim(),
      accountVerificationPending: !hasSession,
    });

    if (!hasSession) {
      setPassword("");
      setConfirm("");
      setBusy(false);
      return;
    }

    const { error: profileError } = await supabase.from("profiles").upsert(
      {
        id: user.id,
        full_name: fullName.trim(),
        phone: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );

    if (profileError) {
      console.error("[signup] profile update:", profileError.message);
    }

    const provisioned = await provisionWorkspace();
    setBusy(false);
    if (!provisioned) return;

    onComplete({
      accountEmail: normalizedEmail,
      accountFullName: fullName.trim(),
      companyName: organizationName.trim(),
      accountVerificationPending: false,
      workspaceId: provisioned.workspaceId,
      subscriptionId: provisioned.subscriptionId,
    });
  }

  async function continueWithSession() {
    setFormError("");
    setBusy(true);
    const provisioned = await provisionWorkspace();
    setBusy(false);
    if (!provisioned) return;

    onComplete({
      companyName: organizationName.trim() || snapshot.companyName,
      workspaceId: provisioned.workspaceId,
      subscriptionId: provisioned.subscriptionId,
      accountVerificationPending: false,
    });
  }

  async function resendVerification() {
    const target = lockedEmail;
    if (!target || resendRemaining > 0) return;
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

    const { error } = await supabase.auth.resend({
      type: "signup",
      email: target,
      options: {
        emailRedirectTo: buildAuthCallbackUrl("/signup"),
      },
    });
    setBusy(false);
    if (error) {
      logSupabaseAuthEmailError("resend", error);
      setFormError(mapSignUpError(error));
      return;
    }
    setResendCooldownUntil(Date.now() + RESEND_COOLDOWN_SECONDS * 1000);
    setResendMessage("Verification email sent. Check your inbox.");
  }

  if (verificationPending) {
    return (
      <div className="mx-auto max-w-lg space-y-5">
        <div>
          <h2 className="font-sans text-xl font-black uppercase tracking-tight text-foreground">
            Verify your email
          </h2>
          <p className="mt-1 font-mono text-sm text-gray-500 dark:text-gray-400">
            We sent a confirmation link to{" "}
            <span className="font-medium text-foreground">{lockedEmail}</span>. After you
            confirm, sign in to finish setup.
          </p>
        </div>
        <div className="border border-border bg-[#e3eef6] px-4 py-3 font-mono text-sm text-foreground dark:border-border dark:bg-surface-elevated">
          <p className="font-medium">Next steps</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-gray-600 dark:text-gray-300">
            <li>Open the email and click the confirmation link.</li>
            <li>Sign in — you&apos;ll return here to complete billing.</li>
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
          disabled={busy || resendRemaining > 0}
          onClick={resendVerification}
          className="inline-flex w-full cursor-pointer items-center justify-center border border-border bg-white py-2.5 font-mono text-xs font-semibold uppercase tracking-widest text-black transition hover:bg-[#eef6fb] disabled:opacity-50 dark:border-border dark:bg-surface-card dark:text-white dark:hover:bg-surface-elevated"
        >
          {busy
            ? "Sending…"
            : resendRemaining > 0
              ? `Resend in ${resendRemaining}s`
              : "Resend verification email"}
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
        <h2 className="font-sans text-xl font-black uppercase tracking-tight text-foreground">
          Account details
        </h2>
        <p className="mt-1 font-mono text-sm text-gray-500 dark:text-gray-400">
          Create your account and organization. We&apos;ll email a verification link if
          confirmation is required.
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
        label="Work email"
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
        id="organization"
        label="Organization name"
        icon={Building2}
        value={organizationName}
        onChange={(e) => setOrganizationName(e.target.value)}
        autoComplete="organization"
        required
        showValid
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

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex cursor-pointer items-center justify-center border border-border bg-white px-6 py-2.5 font-mono text-xs font-semibold uppercase tracking-widest text-black transition hover:bg-[#eef6fb] dark:border-border dark:bg-surface-card dark:text-white dark:hover:bg-surface-elevated"
        >
          ← Back
        </button>
        <button
          type="submit"
          disabled={busy}
          className="inline-flex flex-1 cursor-pointer items-center justify-center border border-border bg-[#0f2336] py-2.5 font-mono text-xs font-semibold uppercase tracking-widest text-white transition hover:bg-[#172f45] disabled:opacity-50 dark:border-border sm:flex-none sm:px-8"
        >
          {busy ? "Creating account…" : "Continue →"}
        </button>
      </div>

      {snapshot.workspaceId ? null : (
        <p className="text-center font-mono text-[10px] text-muted">
          Already verified?{" "}
          <button
            type="button"
            disabled={busy || !organizationName.trim()}
            onClick={() => void continueWithSession()}
            className="cursor-pointer underline underline-offset-2 disabled:opacity-50"
          >
            Continue with current session
          </button>
        </p>
      )}
    </form>
  );
}
