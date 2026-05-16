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
        <h2 className="mt-3 text-2xl font-bold text-white">NexusOS is ready!</h2>
        <p className="mt-2 text-sm text-gray-400">
          Your workspace is configured. Here&apos;s what we set up.
        </p>
      </div>
      <div className="rounded-xl border border-gray-800 bg-gray-950/80 p-5 text-left text-sm">
        <p className="mb-3 font-semibold text-gray-200">Summary</p>
        <ul className="space-y-2 text-gray-300">
          <li>✓ Account created</li>
          <li>
            ✓ Workspace:{" "}
            <span className="text-white">
              {snapshot.companyName || "Your workspace"}
            </span>
          </li>
          <li>
            ✓ Plan:{" "}
            <span className="text-white">
              {planLabel(snapshot.planTier)} — 14-day free trial
            </span>
          </li>
          <li>
            ✓ Gmail: <span className="text-white">{gmailLabel}</span>
          </li>
        </ul>
      </div>
      <div className="rounded-xl border border-gray-800 bg-gray-950/60 p-5 text-left text-sm">
        <p className="mb-3 font-semibold text-gray-200">Onboarding checklist</p>
        <ul className="space-y-2 text-gray-400">
          {snapshot.gmailConnected === true ? (
            <li className="text-emerald-300/90">✓ Connect Gmail</li>
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
