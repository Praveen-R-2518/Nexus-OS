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

const fieldClass =
  "h-11 w-full border border-black bg-white px-3 font-mono text-sm text-gray-900 outline-none transition focus:border-[#0f2336] focus:ring-1 focus:ring-[#0f2336] dark:border-white dark:bg-[#0a1018] dark:text-gray-100 dark:focus:border-[#a8bdd4] dark:focus:ring-[#a8bdd4]";

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
      <div className="border border-dashed border-black bg-[#eef6fb] px-4 py-3 font-mono text-xs text-black dark:border-white dark:bg-[#0c141f] dark:text-white">
        <p className="flex items-center gap-2 font-semibold uppercase tracking-widest">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
          Sandbox — payment not processed
        </p>
        <p className="mt-2 text-[10px] uppercase tracking-wider text-black/70 dark:text-white/65">
          UI only. No charges will be made.
        </p>
      </div>
      <div>
        <h2 className="font-sans text-xl font-black uppercase tracking-tight text-foreground">Mock checkout</h2>
        <p className="mt-1 font-mono text-sm text-gray-500 dark:text-gray-400">
          Styled like a card form. Replace submit handler when payment API keys are ready.
        </p>
      </div>
      <div className="border border-black bg-white p-4 font-mono text-sm dark:border-white dark:bg-[#0a1018]">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.28em] text-black/70 dark:text-white/65">
          Order summary
        </p>
        <dl className="mt-3 space-y-2 text-xs text-black/80 dark:text-white/75">
          <div className="flex justify-between gap-4">
            <dt>Plan</dt>
            <dd className="text-right text-black dark:text-white">{planLabel(tier)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>Billing</dt>
            <dd className="text-right text-black dark:text-white">
              {cycle === "monthly" ? "Monthly" : "Annual"}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>Amount</dt>
            <dd className="text-right text-black dark:text-white">
              {tier === "enterprise" ? "Custom" : `$${amount}/${period}`}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>Trial</dt>
            <dd className="text-right text-black dark:text-white">
              14 days free, then {recurring}
            </dd>
          </div>
          <div className="flex justify-between gap-4 border-t border-dashed border-black pt-2 font-semibold text-black dark:border-white dark:text-white">
            <dt>Total due today</dt>
            <dd className="tabular-nums">$0.00</dd>
          </div>
        </dl>
      </div>
      <form
        onSubmit={onSubmit}
        className="space-y-4 border border-black bg-white p-4 dark:border-white dark:bg-[#0a1018]"
      >
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.28em] text-black/80 dark:text-white/75">
            Card details
          </span>
          <div className="flex h-7 items-center gap-2">
            {brand === "visa" ? (
              <span className="border border-black px-1.5 py-0.5 font-mono text-[10px] font-bold text-black dark:border-white dark:text-white">
                VISA
              </span>
            ) : null}
            {brand === "mastercard" ? (
              <span className="border border-black bg-[#0f2336] px-1.5 py-0.5 font-mono text-[10px] font-bold text-white dark:border-white">
                MC
              </span>
            ) : null}
            {!brand && digitsOnly.length > 0 ? (
              <CreditCard className="h-5 w-5 text-atmospheric-grey/40" aria-hidden />
            ) : null}
          </div>
        </div>
        <label className="block space-y-1.5">
          <span className="font-mono text-[10px] uppercase tracking-widest text-black/75 dark:text-white/70">
            Cardholder name
          </span>
          <input
            className={fieldClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="cc-name"
            required
          />
        </label>
        <label className="block space-y-1.5">
          <span className="font-mono text-[10px] uppercase tracking-widest text-black/75 dark:text-white/70">
            Card number
          </span>
          <input
            className={fieldClass}
            inputMode="numeric"
            placeholder="4242 4242 4242 4242"
            value={card}
            onChange={(e) => setCard(formatCardInput(e.target.value))}
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
              CVV
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
        {doneMsg ? (
          <p
            className={cn(
              "flex items-center gap-1 font-mono text-xs",
              doneMsg === "Trial started!" ? "text-[#0f2336] dark:text-[#a8bdd4]" : "text-[#8B1A1A]",
            )}
            role="status"
          >
            {doneMsg === "Trial started!" ? <Check className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
            {doneMsg}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={busy}
          className="inline-flex w-full cursor-pointer items-center justify-center gap-2 border border-black bg-[#0f2336] py-2.5 font-mono text-xs font-semibold uppercase tracking-widest text-white transition hover:bg-[#172f45] disabled:opacity-60 dark:border-white"
        >
          {busy ? <Spinner className="h-5 w-5" label="Processing" /> : null}
          {busy ? "Processing…" : "Start free trial"}
        </button>
      </form>
    </div>
  );
}
