"use client";

import { useMemo, useState } from "react";
import { Check, AlertTriangle } from "lucide-react";
import { Spinner } from "@/components/ui/Spinner";
import type { PlanTier, SignupSnapshot } from "@/components/signup/types";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";

function planPrice(tier: PlanTier, cycle: "monthly" | "annual"): number {
  const map: Record<PlanTier, { m: number; a: number }> = {
    starter: { m: 29, a: 290 },
    pro: { m: 99, a: 990 },
    team: { m: 299, a: 2990 },
    enterprise: { m: 0, a: 0 },
  };
  return cycle === "monthly" ? map[tier].m : map[tier].a;
}

function planLabel(tier: PlanTier): string {
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

type StepPaymentProps = {
  snapshot: SignupSnapshot;
  onNext: () => void;
};

export default function StepPayment({ snapshot, onNext }: StepPaymentProps) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [busy, setBusy] = useState(false);
  const [doneMsg, setDoneMsg] = useState("");

  const tier = snapshot.planTier ?? "starter";
  const cycle = snapshot.billingCycle ?? "monthly";
  const amount = planPrice(tier, cycle);
  const period = cycle === "monthly" ? "mo" : "yr";
  const recurring =
    tier === "enterprise" ? "Custom" : `$${amount}/${period}`;

  async function startTrial() {
    if (!snapshot.workspaceId) return;
    setBusy(true);
    setDoneMsg("");

    const trialEnds = new Date(
      Date.now() + 14 * 24 * 60 * 60 * 1000,
    ).toISOString();

    const { error } = await supabase
      .from("subscriptions")
      .update({
        status: "trial",
        trial_ends_at: trialEnds,
      })
      .eq("workspace_id", snapshot.workspaceId);

    setBusy(false);
    if (error) {
      setDoneMsg(`Could not start trial: ${error.message}`);
      return;
    }
    setDoneMsg("Trial started!");
    setTimeout(() => onNext(), 600);
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Start your trial</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          No payment is collected today. You get full access for 14 days; add a payment method when you connect billing (Dodo) later.
        </p>
      </div>
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-surface-card dark:bg-gray-950/80 p-4 text-sm">
        <p className="font-medium text-gray-700 dark:text-gray-200">Order summary</p>
        <dl className="mt-3 space-y-2 text-gray-500 dark:text-gray-400">
          <div className="flex justify-between gap-4">
            <dt>Plan</dt>
            <dd className="text-right text-gray-900 dark:text-gray-100">{planLabel(tier)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>Billing</dt>
            <dd className="text-right text-gray-900 dark:text-gray-100">
              {cycle === "monthly" ? "Monthly" : "Annual"}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>After trial</dt>
            <dd className="text-right text-gray-900 dark:text-gray-100">
              {tier === "enterprise" ? "Custom" : `${recurring}`}
            </dd>
          </div>
          <div className="flex justify-between gap-4 border-t border-gray-200 dark:border-gray-800 pt-2 font-semibold text-foreground">
            <dt>Due today</dt>
            <dd>$0.00</dd>
          </div>
        </dl>
      </div>
      {doneMsg ? (
        <p
          className={cn(
            "text-sm flex items-center gap-1 rounded-lg border px-3 py-2",
            doneMsg === "Trial started!"
              ? "border-emerald-500/40 bg-emerald-50 text-[#1B6B3A] dark:bg-emerald-500/10 dark:text-emerald-300"
              : "border-amber-500/40 bg-amber-50 text-[#8B1A1A] dark:bg-amber-500/10 dark:text-amber-200",
          )}
          role="status"
        >
          {doneMsg === "Trial started!" ? <Check className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          {doneMsg}
        </p>
      ) : null}
      <button
        type="button"
        onClick={() => void startTrial()}
        disabled={busy || !snapshot.workspaceId}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-trajectory-blue py-2.5 text-sm font-semibold text-white transition hover:bg-blue-600 disabled:opacity-60"
      >
        {busy ? <Spinner className="h-5 w-5" label="Starting trial" /> : null}
        {busy ? "Starting…" : "Start free trial"}
      </button>
    </div>
  );
}
