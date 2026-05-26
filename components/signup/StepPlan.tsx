"use client";

import { useMemo, useState } from "react";
import PricingCard from "@/components/signup/PricingCard";
import type { BillingCycle, PlanTier, SignupSnapshot } from "@/components/signup/types";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";

const PLANS: {
  tier: PlanTier;
  title: string;
  monthly: number;
  annual: number;
  users: string;
  emails: string;
  features: string[];
}[] = [
  {
    tier: "starter",
    title: "Starter",
    monthly: 29,
    annual: 290,
    users: "1 user",
    emails: "500 emails / mo",
    features: ["AI classification", "Approval queue", "Email intake"],
  },
  {
    tier: "pro",
    title: "Pro",
    monthly: 99,
    annual: 990,
    users: "5 users",
    emails: "5k emails / mo",
    features: ["Everything in Starter", "Revenue rescue drafts", "CRM sync"],
  },
  {
    tier: "team",
    title: "Team",
    monthly: 299,
    annual: 2990,
    users: "20 users",
    emails: "Unlimited emails",
    features: ["Everything in Pro", "Team workspaces", "Priority routing"],
  },
  {
    tier: "enterprise",
    title: "Enterprise",
    monthly: 0,
    annual: 0,
    users: "Unlimited users",
    emails: "Unlimited emails",
    features: ["Dedicated support", "Custom integrations", "SLA"],
  },
];

type StepPlanProps = {
  snapshot: SignupSnapshot;
  onComplete: (
    patch: Partial<SignupSnapshot> & { planTier: PlanTier; billingCycle: BillingCycle; subscriptionId: string },
  ) => void;
};

export default function StepPlan({ snapshot, onComplete }: StepPlanProps) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [cycle, setCycle] = useState<BillingCycle>(snapshot.billingCycle || "monthly");
  const [busyTier, setBusyTier] = useState<PlanTier | null>(null);
  const [error, setError] = useState("");

  const solo = snapshot.workspaceType === "solo";
  const teamLarge = snapshot.workspaceType === "team" && snapshot.teamSize > 5;

  function recommendedFor(tier: PlanTier): boolean {
    if (solo) return tier === "starter";
    if (teamLarge) return tier === "team";
    return tier === "pro";
  }

  function disabledFor(tier: PlanTier): boolean {
    if (solo) return tier === "team" || tier === "enterprise";
    if (teamLarge) return tier === "starter";
    return false;
  }

  async function selectPlan(tier: PlanTier) {
    if (!snapshot.workspaceId) {
      setError("Missing workspace. Go back a step.");
      return;
    }
    if (tier === "enterprise") {
      // UI-only: still record enterprise pending like other plans
    }
    if (snapshot.subscriptionId) {
      const { error: updErr } = await supabase
        .from("subscriptions")
        .update({ plan_tier: tier, billing_cycle: cycle })
        .eq("id", snapshot.subscriptionId);
      if (updErr) {
        setError(updErr.message);
        setBusyTier(null);
        return;
      }
      setBusyTier(null);
      onComplete({
        planTier: tier,
        billingCycle: cycle,
        subscriptionId: snapshot.subscriptionId,
      });
      return;
    }

    setBusyTier(tier);
    setError("");
    const { data, error: insErr } = await supabase
      .from("subscriptions")
      .insert({
        workspace_id: snapshot.workspaceId,
        plan_tier: tier,
        billing_cycle: cycle,
        status: "pending",
      })
      .select("id")
      .single();

    if (insErr || !data?.id) {
      setError(insErr?.message || "Could not save subscription.");
      setBusyTier(null);
      return;
    }

    setBusyTier(null);
    onComplete({
      planTier: tier,
      billingCycle: cycle,
      subscriptionId: data.id,
    });
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-sans text-xl font-black uppercase tracking-tight text-foreground">Choose your plan</h2>
          <p className="mt-1 font-mono text-sm text-gray-500 dark:text-gray-400">
            Smart defaults based on your workspace. Change anytime before going
            live.
          </p>
        </div>
        <div
          className="inline-flex border border-border bg-white p-0.5 dark:border-border dark:bg-surface-card"
          role="group"
          aria-label="Billing cycle"
        >
          <button
            type="button"
            onClick={() => setCycle("monthly")}
            className={cn(
              "cursor-pointer px-3 py-1.5 font-mono text-xs font-medium uppercase tracking-widest transition",
              cycle === "monthly"
                ? "bg-[#e3eef6] text-foreground dark:bg-surface-elevated dark:text-white"
                : "text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200",
            )}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setCycle("annual")}
            className={cn(
              "cursor-pointer px-3 py-1.5 font-mono text-xs font-medium uppercase tracking-widest transition",
              cycle === "annual"
                ? "bg-[#0f2336] text-white"
                : "text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200",
            )}
          >
            Annual — Save 17%
          </button>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {PLANS.map((p) => {
          const priceLabel =
            p.tier === "enterprise"
              ? "Custom"
              : cycle === "monthly"
                ? `$${p.monthly}/mo`
                : `$${p.annual}/yr`;
          return (
            <PricingCard
              key={p.tier}
              plan={p.tier}
              title={p.title}
              priceLabel={priceLabel}
              users={p.users}
              emails={p.emails}
              features={p.features}
              recommended={recommendedFor(p.tier)}
              disabled={disabledFor(p.tier) || busyTier !== null}
              selected={false}
              onSelect={selectPlan}
              ctaLabel={
                p.tier === "enterprise"
                  ? busyTier === p.tier
                    ? "Saving…"
                    : "Contact"
                  : busyTier === p.tier
                    ? "Saving…"
                    : "Select"
              }
            />
          );
        })}
      </div>
      {error ? (
        <p className="text-center font-mono text-xs text-[#8B1A1A]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
