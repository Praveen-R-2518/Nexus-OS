"use client";

import { useMemo, useState } from "react";
import { CreditCard, Check, AlertTriangle } from "lucide-react";
import { Spinner } from "@/components/ui/Spinner";
import { STARTER_TRIAL_INCLUDES, priceForTier, PRICING_TIERS } from "@/lib/pricing/plans";
import type { SignupSnapshot } from "@/components/signup/types";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";

type StepPaymentProps = {
  snapshot: SignupSnapshot;
  onNext: () => void;
};

const fieldClass =
  "h-11 w-full border border-border bg-white px-3 font-mono text-sm text-gray-900 outline-none transition focus:border-[#0f2336] focus:ring-1 focus:ring-[#0f2336] dark:border-border dark:bg-surface-card dark:text-gray-100 dark:focus:border-border-strong dark:focus:ring-border-strong";

function planTitle(tier: SignupSnapshot["planTier"]): string {
  if (tier === "pro") return "Professional";
  if (tier === "enterprise") return "Enterprise";
  return "Starter";
}

export default function StepPayment({ snapshot, onNext }: StepPaymentProps) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [card, setCard] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const isStarter = snapshot.planTier === "starter" || snapshot.planTier === null;
  const tierMeta = PRICING_TIERS.find((t) => t.dbTier === (snapshot.planTier ?? "starter"));
  const cycle = snapshot.billingCycle ?? "monthly";
  const pricing = tierMeta ? priceForTier(tierMeta, cycle) : null;

  async function activatePlan() {
    if (!snapshot.workspaceId) {
      setError("Workspace not found. Go back and complete workspace setup.");
      return;
    }
    setBusy(true);
    setError("");

    const trialEnds = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    const status = isStarter ? "trial" : "pending";

    const payload = {
      status,
      ...(isStarter ? { trial_ends_at: trialEnds } : {}),
    };

    let updateError: { message: string } | null = null;

    if (snapshot.subscriptionId) {
      const { error: updErr } = await supabase
        .from("subscriptions")
        .update(payload)
        .eq("id", snapshot.subscriptionId);
      updateError = updErr;
    } else {
      const { error: insErr } = await supabase.from("subscriptions").insert({
        workspace_id: snapshot.workspaceId,
        plan_tier: snapshot.planTier ?? "starter",
        billing_cycle: cycle,
        status,
        ...(isStarter ? { trial_ends_at: trialEnds } : {}),
      });
      updateError = insErr;
    }

    setBusy(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    onNext();
  }

  if (isStarter) {
    return (
      <div className="mx-auto max-w-lg space-y-6 text-center">
        <div>
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-border bg-[#eef6fb] dark:border-border dark:bg-surface-elevated">
            <Check className="h-7 w-7 text-[#0f2336] dark:text-muted" aria-hidden />
          </div>
          <h2 className="mt-4 font-sans text-2xl font-black uppercase tracking-tight text-foreground">
            You&apos;re all set
          </h2>
          <p className="mt-2 font-mono text-sm text-gray-500 dark:text-gray-400">
            No credit card required. Your Starter free trial is ready.
          </p>
        </div>

        <div className="border border-border bg-white p-5 text-left dark:border-border dark:bg-surface-card">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.28em] text-black/70 dark:text-white/65">
            What&apos;s included
          </p>
          <ul className="mt-4 space-y-2 font-mono text-sm text-black/85 dark:text-white/80">
            {STARTER_TRIAL_INCLUDES.map((item) => (
              <li key={item} className="flex items-start gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#0f2336] dark:text-muted" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
        </div>

        {error ? (
          <p className="font-mono text-xs text-[#8B1A1A]" role="alert">
            {error}
          </p>
        ) : null}

        <button
          type="button"
          disabled={busy}
          onClick={() => void activatePlan()}
          className="inline-flex w-full cursor-pointer items-center justify-center gap-2 border border-border bg-[#0f2336] py-3 font-mono text-xs font-semibold uppercase tracking-widest text-white transition hover:bg-[#172f45] disabled:opacity-60 dark:border-border"
        >
          {busy ? <Spinner className="h-5 w-5" label="Loading" /> : null}
          {busy ? "Continuing…" : "Continue →"}
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="border border-dashed border-amber-600/40 bg-amber-50 px-4 py-3 font-mono text-xs text-amber-950 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-100">
        <p className="flex items-center gap-2 font-semibold uppercase tracking-widest">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
          Billing integration coming soon — you will not be charged yet.
        </p>
      </div>

      <div>
        <h2 className="font-sans text-xl font-black uppercase tracking-tight text-foreground">
          Activate {planTitle(snapshot.planTier)}
        </h2>
        <p className="mt-1 font-mono text-sm text-gray-500 dark:text-gray-400">
          Enter payment details to activate your plan. Charges are disabled until billing goes live.
        </p>
      </div>

      {pricing ? (
        <div className="border border-border bg-white p-4 font-mono text-sm dark:border-border dark:bg-surface-card">
          <div className="flex justify-between gap-4 text-xs">
            <span className="text-black/70 dark:text-white/65">Plan</span>
            <span className="text-black dark:text-white">{planTitle(snapshot.planTier)}</span>
          </div>
          <div className="mt-2 flex justify-between gap-4 text-xs">
            <span className="text-black/70 dark:text-white/65">Billing</span>
            <span className="text-black dark:text-white">
              {cycle === "monthly" ? "Monthly" : "Annual (25% off)"}
            </span>
          </div>
          <div className="mt-2 flex justify-between gap-4 border-t border-dashed border-border pt-2 font-semibold text-black dark:border-border dark:text-white">
            <span>Due today</span>
            <span className="tabular-nums">$0.00</span>
          </div>
          {pricing.compareAt ? (
            <p className="mt-2 text-[10px] uppercase tracking-wider text-muted">
              Then {pricing.display} (normally {pricing.compareAt})
            </p>
          ) : (
            <p className="mt-2 text-[10px] uppercase tracking-wider text-muted">
              Then {pricing.display}
            </p>
          )}
        </div>
      ) : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void activatePlan();
        }}
        className="space-y-4 border border-border bg-white p-4 dark:border-border dark:bg-surface-card"
      >
        <div className="flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.28em] text-black/80 dark:text-white/75">
          <CreditCard className="h-4 w-4" aria-hidden />
          Payment details
        </div>
        <label className="block space-y-1.5">
          <span className="font-mono text-[10px] uppercase tracking-widest text-black/75 dark:text-white/70">
            Card number
          </span>
          <input
            className={fieldClass}
            inputMode="numeric"
            placeholder="4242 4242 4242 4242"
            value={card}
            onChange={(e) => setCard(e.target.value)}
            autoComplete="cc-number"
            required
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1.5">
            <span className="font-mono text-[10px] uppercase tracking-widest text-black/75 dark:text-white/70">
              Expiry
            </span>
            <input
              className={fieldClass}
              placeholder="MM/YY"
              value={expiry}
              onChange={(e) => setExpiry(e.target.value)}
              autoComplete="cc-exp"
              required
            />
          </label>
          <label className="block space-y-1.5">
            <span className="font-mono text-[10px] uppercase tracking-widest text-black/75 dark:text-white/70">
              CVC
            </span>
            <input
              className={fieldClass}
              type="password"
              inputMode="numeric"
              maxLength={4}
              placeholder="•••"
              value={cvv}
              onChange={(e) => setCvv(e.target.value.replace(/\D/g, ""))}
              autoComplete="cc-csc"
              required
            />
          </label>
        </div>

        {error ? (
          <p className={cn("font-mono text-xs text-[#8B1A1A]")} role="alert">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={busy}
          className="inline-flex w-full cursor-pointer items-center justify-center gap-2 border border-border bg-[#0f2336] py-2.5 font-mono text-xs font-semibold uppercase tracking-widest text-white transition hover:bg-[#172f45] disabled:opacity-60 dark:border-border"
        >
          {busy ? <Spinner className="h-5 w-5" label="Processing" /> : null}
          {busy ? "Activating…" : "Activate Plan →"}
        </button>
      </form>
    </div>
  );
}
