"use client";

import { useRouter } from "next/navigation";
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
        <p className="text-4xl" aria-hidden>
          🎉
        </p>
        <h2 className="mt-3 text-2xl font-bold text-atmospheric-grey">NexusOS is ready!</h2>
        <p className="mt-2 text-sm text-atmospheric-grey/60">
          Your workspace is configured. Here&apos;s what we set up.
        </p>
      </div>
      <div className="glass-panel rounded-xl p-5 text-left text-sm">
        <p className="mb-3 font-semibold text-atmospheric-grey">Summary</p>
        <ul className="space-y-2 text-atmospheric-grey/80">
          <li>✓ Account created</li>
          <li>
            ✓ Workspace:{" "}
            <span className="text-trajectory-blue">
              {snapshot.companyName || "Your workspace"}
            </span>
          </li>
          <li>
            ✓ Plan:{" "}
            <span className="text-trajectory-blue">
              {planLabel(snapshot.planTier)} — 14-day free trial
            </span>
          </li>
          <li>
            ✓ Gmail: <span className="text-trajectory-blue">{gmailLabel}</span>
          </li>
        </ul>
      </div>
      <div className="glass-panel rounded-xl p-5 text-left text-sm">
        <p className="mb-3 font-semibold text-atmospheric-grey">Onboarding checklist</p>
        <ul className="space-y-2 text-atmospheric-grey/60">
          {snapshot.gmailConnected === true ? (
            <li className="text-trajectory-blue">✓ Connect Gmail</li>
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
        className="inline-flex w-full items-center justify-center rounded-lg bg-trajectory-blue py-3 text-sm font-semibold text-white transition hover:bg-blue-600 sm:w-auto sm:px-8"
      >
        Go to Dashboard →
      </button>
    </div>
  );
}
