"use client";

import { useRouter } from "next/navigation";
import { PartyPopper, Check } from "lucide-react";
import type { PlanTier, SignupSnapshot } from "@/components/signup/types";

function planLabel(tier: PlanTier | null): string {
  if (!tier) return "—";
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

type StepDoneProps = {
  snapshot: SignupSnapshot;
};

export default function StepDone({ snapshot }: StepDoneProps) {
  const router = useRouter();
  const gmailLabel =
    snapshot.gmailConnected === true ? "Connected" : "Pending setup";

  const team = snapshot.workspaceType === "team";

  return (
    <div className="mx-auto max-w-xl space-y-8 text-center">
      <div>
        <div className="flex justify-center text-4xl" aria-hidden>
          <PartyPopper className="w-12 h-12 text-[#1B6B3A]" />
        </div>
        <h2 className="mt-3 text-2xl font-bold text-foreground">NexusOS is ready!</h2>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          Your workspace is configured. Here&apos;s what we set up.
        </p>
      </div>
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950/80 p-5 text-left text-sm">
        <p className="mb-3 font-semibold text-gray-700 dark:text-gray-200">Summary</p>
        <ul className="space-y-2 text-gray-600 dark:text-gray-300">
          <li className="flex items-center"><Check className="inline w-4 h-4 mr-1 text-[#1B6B3A]" /> Account created</li>
          <li className="flex items-center">
            <Check className="inline w-4 h-4 mr-1 text-[#1B6B3A]" /> Workspace:{" "}
            <span className="text-foreground ml-1">
              {snapshot.companyName || "Your workspace"}
            </span>
          </li>
          <li className="flex items-center">
            <Check className="inline w-4 h-4 mr-1 text-[#1B6B3A]" /> Plan:{" "}
            <span className="text-foreground ml-1">
              {planLabel(snapshot.planTier)} — 14-day free trial
            </span>
          </li>
          <li className="flex items-center">
            <Check className="inline w-4 h-4 mr-1 text-[#1B6B3A]" /> Gmail: <span className="text-foreground ml-1">{gmailLabel}</span>
          </li>
        </ul>
      </div>
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950/60 p-5 text-left text-sm">
        <p className="mb-3 font-semibold text-gray-700 dark:text-gray-200">Onboarding checklist</p>
        <ul className="space-y-2 text-gray-500 dark:text-gray-400">
          {snapshot.gmailConnected === true ? (
            <li className="text-[#1B6B3A] flex items-center"><Check className="inline w-4 h-4 mr-1" /> Connect Gmail</li>
          ) : (
            <li>□ Connect Gmail</li>
          )}
          {team ? <li>□ Invite team members</li> : null}
          <li>□ Configure AI classification rules</li>
          <li>□ Run first email sync</li>
        </ul>
      </div>
      <button
        type="button"
        onClick={() => router.push("/dashboard")}
        className="inline-flex w-full items-center justify-center rounded-lg bg-emerald-600 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500 sm:w-auto sm:px-8"
      >
        Go to Dashboard →
      </button>
    </div>
  );
}
