"use client";

import { useRouter } from "next/navigation";
import { PartyPopper, Check } from "lucide-react";
import type { PlanTier, SignupSnapshot } from "@/components/signup/types";

function planLabel(tier: PlanTier | null): string {
  if (!tier) return "—";
  if (tier === "pro") return "Professional";
  if (tier === "enterprise") return "Enterprise";
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

type StepDoneProps = {
  snapshot: SignupSnapshot;
};

const accent = "text-[#0f2336] dark:text-muted";

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
        <h2 className="mt-3 font-sans text-2xl font-black uppercase tracking-tight text-foreground">
          Nexus OS is ready
        </h2>
        <p className="mt-2 font-mono text-sm text-gray-500 dark:text-gray-400">
          Your workspace is configured. Summary below.
        </p>
      </div>
      <div className="border border-border bg-white p-5 text-left font-mono text-sm dark:border-border dark:bg-surface-card">
        <p className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-[0.28em] text-black/70 dark:text-white/65">
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
      <div className="border border-border bg-[#eef6fb] p-5 text-left font-mono text-sm dark:border-border dark:bg-surface-elevated">
        <p className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-[0.28em] text-black/70 dark:text-white/65">
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
        onClick={() => router.push("/dashboard")}
        className="inline-flex w-full cursor-pointer items-center justify-center border border-border bg-[#0f2336] py-3 font-mono text-xs font-semibold uppercase tracking-widest text-white transition hover:bg-[#172f45] sm:w-auto sm:px-8 dark:border-border"
      >
        Go to dashboard →
      </button>
    </div>
  );
}
