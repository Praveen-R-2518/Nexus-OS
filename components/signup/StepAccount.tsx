"use client";

import { useMemo, useState } from "react";
import { Mail, Lock, User } from "lucide-react";
import FormInput from "@/components/signup/FormInput";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type StepAccountProps = {
  onNext: () => void;
};

function validatePassword(pw: string): string | undefined {
  if (pw.length < 8) return "At least 8 characters";
  if (!/[A-Z]/.test(pw)) return "Include one uppercase letter";
  if (!/[0-9]/.test(pw)) return "Include one number";
  return undefined;
}

export default function StepAccount({ onNext }: StepAccountProps) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [phone, setPhone] = useState("");
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");

  const pwError = password ? validatePassword(password) : undefined;
  const confirmError =
    confirm && password !== confirm ? "Passwords do not match" : undefined;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
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
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
      },
    });

    if (error) {
      const msg = error.message?.toLowerCase() ?? "";
      if (
        msg.includes("already") ||
        msg.includes("registered") ||
        msg.includes("exists")
      ) {
        setFormError("An account with this email already exists");
      } else {
        setFormError("Something went wrong, try again");
      }
      setBusy(false);
      return;
    }

    const user = data.user;
    if (!user?.id) {
      setFormError("Something went wrong, try again");
      setBusy(false);
      return;
    }

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
      // Continue — trigger may have created profile; demo path still advances
    }

    setBusy(false);
    onNext();
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-lg space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-atmospheric-grey">Create your account</h2>
        <p className="mt-1 text-sm text-atmospheric-grey/60">
          Supabase will email you a verification link in the background. You can
          continue onboarding now.
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
      <label className="flex cursor-pointer items-start gap-3 text-sm text-atmospheric-grey/80">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 rounded border-white/10 bg-white/5 text-trajectory-blue focus:ring-trajectory-blue"
          checked={terms}
          onChange={(e) => setTerms(e.target.checked)}
          required
        />
        <span>
          I agree to the{" "}
          <span className="text-trajectory-blue">Terms of Service</span> and{" "}
          <span className="text-trajectory-blue">Privacy Policy</span>
        </span>
      </label>
      {formError ? (
        <p className="text-sm text-red-400" role="alert">
          {formError}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={busy}
        className="inline-flex w-full items-center justify-center rounded-lg bg-trajectory-blue py-2.5 text-sm font-semibold text-white transition hover:bg-blue-600 disabled:opacity-50"
      >
        {busy ? "Creating account…" : "Continue"}
      </button>
    </form>
  );
}
