"use client";

import { useRouter } from "next/navigation";
import { PartyPopper, Check } from "lucide-react";
import {
  clearSignupSnapshot,
  type PlanTier,
  type SignupSnapshot,
} from "@/components/signup/types";

function planLabel(tier: PlanTier | null): string {
  if (!tier) return "—";
  if (tier === "pro") return "Professional";
  if (tier === "enterprise") return "Enterprise";
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

type StepDoneProps = {
  snapshot: SignupSnapshot;
};

const accent = "text-nexus-growth dark:text-nexus-growth";

export default function StepDone({ snapshot }: StepDoneProps) {
  const router = useRouter();
  const gmailLabel =
    snapshot.gmailConnected === true ? "Connected" : "Pending setup";

  const team = snapshot.workspaceType === "team";

  return (
    <div className="mx-auto max-w-xl space-y-8 text-center">
      <div>
        <div className="flex justify-center text-4xl" aria-hidden>
          <PartyPopper className={`h-12 w-12 ${accent}`} />
        </div>
        <h2 className="mt-3 nexus-section-title text-foreground">
          Nexus OS is ready
        </h2>
        <p className="mt-2 text-base text-gray-500 dark:text-gray-400">
          Your workspace is configured. Summary below.
        </p>
      </div>
      <div className="rounded-xl border border-border bg-white p-5 text-left text-sm dark:border-border dark:bg-surface-card">
        <p className="mb-3 nexus-meta text-nexus-growth dark:text-nexus-growth">
          Summary
        </p>
        <ul className="space-y-2 text-black/85 dark:text-white/80">
          <li className="flex items-center">
            <Check className={`mr-1 inline h-4 w-4 shrink-0 ${accent}`} aria-hidden />
            Account created
          </li>
          <li className="flex items-center">
            <Check className={`mr-1 inline h-4 w-4 shrink-0 ${accent}`} aria-hidden />
            Workspace:{" "}
            <span className="ml-1 text-foreground">
              {snapshot.companyName || "Your workspace"}
            </span>
          </li>
          <li className="flex items-center">
            <Check className={`mr-1 inline h-4 w-4 shrink-0 ${accent}`} aria-hidden />
            Plan:{" "}
            <span className="ml-1 text-foreground">
              {planLabel(snapshot.planTier)} — 14-day free trial
            </span>
          </li>
          <li className="flex items-center">
            <Check className={`mr-1 inline h-4 w-4 shrink-0 ${accent}`} aria-hidden />
            Gmail: <span className="ml-1 text-foreground">{gmailLabel}</span>
          </li>
        </ul>
      </div>
      <div className="rounded-xl border border-nexus-discovery-border bg-nexus-discovery-soft p-5 text-left text-sm dark:border-nexus-discovery-border dark:bg-nexus-discovery-soft">
        <p className="mb-3 nexus-meta text-nexus-discovery dark:text-nexus-discovery">
          Onboarding checklist
        </p>
        <ul className="space-y-2 text-black/70 dark:text-white/65">
          {snapshot.gmailConnected === true ? (
            <li className={`flex items-center ${accent}`}>
              <Check className="mr-1 inline h-4 w-4 shrink-0" aria-hidden />
              Connect Gmail
            </li>
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
        onClick={() => {
          clearSignupSnapshot();
          router.push("/dashboard");
        }}
        className="inline-flex w-full cursor-pointer items-center justify-center rounded-full border border-nexus-approval bg-nexus-approval py-3 text-sm font-medium text-white transition hover:bg-[#2b82ff] sm:w-auto sm:px-8 dark:border-nexus-approval"
      >
        Go to dashboard →
      </button>
    </div>
  );
}
