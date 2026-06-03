"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import BillingToggle from "@/components/pricing/BillingToggle";
import PricingCard from "@/components/signup/PricingCard";
import { PRICING_TIERS, priceForTier } from "@/lib/pricing/plans";
import type { BillingCycle, PlanTier, SignupSnapshot } from "@/components/signup/types";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type StepPlanProps = {
  snapshot: SignupSnapshot;
  onComplete: (
    patch: Partial<SignupSnapshot> & { planTier: PlanTier; billingCycle: BillingCycle; subscriptionId: string },
  ) => void;
};

export default function StepPlan({ snapshot, onComplete }: StepPlanProps) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [cycle, setCycle] = useState<BillingCycle>(snapshot.billingCycle || "monthly");
  const [selectedTier, setSelectedTier] = useState<PlanTier>(snapshot.planTier ?? "starter");
  const [busyTier, setBusyTier] = useState<PlanTier | null>(null);
  const [error, setError] = useState("");

  const solo = snapshot.workspaceType === "solo";

  function recommendedFor(tier: PlanTier): boolean {
    if (solo) return tier === "starter";
    return tier === "pro";
  }

  async function selectPlan(tier: PlanTier) {
    if (!snapshot.workspaceId) {
      setError("Missing workspace. Go back a step.");
      return;
    }

    setSelectedTier(tier);
    setBusyTier(tier);
    setError("");

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
          <h2 className="font-sans text-xl font-black uppercase tracking-tight text-foreground">
            Choose your plan
          </h2>
          <p className="mt-1 font-mono text-sm text-gray-500 dark:text-gray-400">
            Smart defaults based on your workspace. Change anytime before going live.
          </p>
        </div>
        <BillingToggle cycle={cycle} onChange={setCycle} />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {PRICING_TIERS.map((tier) => {
          const { display, compareAt } = priceForTier(tier, cycle);
          const priceLabel =
            tier.monthlyPrice === null
              ? "Custom"
              : compareAt
                ? `${display} (was ${compareAt})`
                : display;

          if (!tier.selectable) {
            return (
              <div
                key={tier.slug}
                className="relative flex h-full flex-col rounded-xl border border-selectable-edge bg-white p-4 sm:p-5 dark:bg-surface-card"
              >
                <div className="mb-3 text-center">
                  <p className="font-sans text-sm font-black uppercase tracking-tight text-black dark:text-white">
                    {tier.title}
                  </p>
                  <p className="mt-2 font-mono text-xl font-bold tabular-nums text-black dark:text-white">
                    Custom pricing
                  </p>
                </div>
                <ul className="mb-4 flex-1 space-y-1.5 border-t border-dashed border-border/40 pt-3 font-mono text-xs text-black/80 dark:border-border dark:text-white/75">
                  {tier.features.slice(0, 4).map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
                <Link
                  href={tier.ctaHref}
                  className="mt-auto inline-flex w-full cursor-pointer items-center justify-center border border-border bg-white px-3 py-2 font-mono text-xs font-medium uppercase tracking-widest text-black transition hover:bg-[#e3eef6] dark:border-border dark:bg-surface-card dark:text-white dark:hover:bg-surface-elevated"
                >
                  Contact Sales
                </Link>
              </div>
            );
          }

          const dbTier = tier.dbTier;
          const isSelected = selectedTier === dbTier;

          return (
            <PricingCard
              key={tier.slug}
              plan={dbTier}
              title={tier.title}
              priceLabel={priceLabel}
              users={tier.features[0] ?? ""}
              emails={tier.features[1] ?? ""}
              features={tier.features.slice(2)}
              recommended={recommendedFor(dbTier)}
              badge={tier.slug === "starter" ? "Free Trial" : tier.badge}
              highlighted={tier.highlighted}
              selected={isSelected}
              disabled={busyTier !== null}
              onSelect={selectPlan}
              ctaLabel={
                busyTier === dbTier ? "Saving…" : isSelected ? "Selected" : "Select"
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
