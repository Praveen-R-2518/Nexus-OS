"use client";

import { useMemo, useState } from "react";
import { CreditCard, Check, AlertTriangle } from "lucide-react";
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
  const [name, setName] = useState("");
  const [card, setCard] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");
  const [busy, setBusy] = useState(false);
  const [doneMsg, setDoneMsg] = useState("");

  const tier = snapshot.planTier ?? "starter";
  const cycle = snapshot.billingCycle ?? "monthly";
  const amount = planPrice(tier, cycle);
  const period = cycle === "monthly" ? "mo" : "yr";
  const recurring =
    tier === "enterprise" ? "Custom" : `$${amount}/${period}`;

  function formatCardInput(raw: string) {
    const digits = raw.replace(/\D/g, "").slice(0, 16);
    const parts = digits.match(/.{1,4}/g) ?? [];
    return parts.join(" ");
  }

  function cardBrand(digits: string): "visa" | "mastercard" | null {
    if (digits.startsWith("4")) return "visa";
    if (digits.startsWith("5")) return "mastercard";
    return null;
  }

  const digitsOnly = card.replace(/\D/g, "");
  const brand = cardBrand(digitsOnly);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!snapshot.workspaceId) return;
    setBusy(true);
    setDoneMsg("");
    await new Promise((r) => setTimeout(r, 1500));

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
      <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-[#7A4200]">
        <p className="font-semibold flex items-center gap-1"><AlertTriangle className="w-4 h-4" /> Sandbox Mode — Payment not processed</p>
        <p className="mt-1 text-xs text-[#7A4200]">
          Payment UI only. No charges will be made.
        </p>
      </div>
      <div>
        <h2 className="text-xl font-semibold text-foreground">Mock checkout</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Styled like a card form. Replace submit handler when Dodo API keys are
          ready.
        </p>
      </div>
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950/80 p-4 text-sm">
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
            <dt>Amount</dt>
            <dd className="text-right text-gray-900 dark:text-gray-100">
              {tier === "enterprise" ? "Custom" : `$${amount}/${period}`}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>Trial</dt>
            <dd className="text-right text-gray-900 dark:text-gray-100">
              14 days free, then {recurring}
            </dd>
          </div>
          <div className="flex justify-between gap-4 border-t border-gray-200 dark:border-gray-800 pt-2 font-semibold text-foreground">
            <dt>Total due today</dt>
            <dd>$0.00</dd>
          </div>
        </dl>
      </div>
      <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950/60 p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Card details</span>
          <div className="flex h-7 items-center gap-2">
            {brand === "visa" ? (
              <span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-bold text-blue-900">
                VISA
              </span>
            ) : null}
            {brand === "mastercard" ? (
              <span className="rounded bg-orange-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                MC
              </span>
            ) : null}
            {!brand && digitsOnly.length > 0 ? (
              <CreditCard className="h-5 w-5 text-gray-500" aria-hidden />
            ) : null}
          </div>
        </div>
        <label className="block space-y-1.5 text-sm">
          <span className="text-gray-600 dark:text-gray-300">Cardholder name</span>
          <input
            className="h-11 w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 px-3 text-gray-900 dark:text-gray-100 outline-none focus:border-emerald-500"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="cc-name"
            required
          />
        </label>
        <label className="block space-y-1.5 text-sm">
          <span className="text-gray-600 dark:text-gray-300">Card number</span>
          <input
            className="h-11 w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 px-3 font-mono text-gray-900 dark:text-gray-100 outline-none focus:border-emerald-500"
            inputMode="numeric"
            placeholder="4242 4242 4242 4242"
            value={card}
            onChange={(e) => setCard(formatCardInput(e.target.value))}
            autoComplete="cc-number"
            required
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1.5 text-sm">
            <span className="text-gray-600 dark:text-gray-300">Expiry</span>
            <input
              className="h-11 w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 px-3 font-mono text-gray-900 dark:text-gray-100 outline-none focus:border-emerald-500"
              placeholder="MM/YY"
              value={expiry}
              onChange={(e) => setExpiry(e.target.value)}
              autoComplete="cc-exp"
              required
            />
          </label>
          <label className="block space-y-1.5 text-sm">
            <span className="text-gray-600 dark:text-gray-300">CVV</span>
            <input
              className="h-11 w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 px-3 font-mono text-gray-900 dark:text-gray-100 outline-none focus:border-emerald-500"
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
        {doneMsg ? (
          <p
            className={cn(
              "text-sm flex items-center gap-1",
              doneMsg === "Trial started!" ? "text-[#1B6B3A]" : "text-[#8B1A1A]",
            )}
            role="status"
          >
            {doneMsg === "Trial started!" ? <Check className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            {doneMsg}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={busy}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-60"
        >
          {busy ? <Spinner className="h-5 w-5" label="Processing" /> : null}
          {busy ? "Processing…" : "Start Free Trial"}
        </button>
      </form>
    </div>
  );
}
