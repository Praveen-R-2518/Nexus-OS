"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import ProgressBar from "@/components/signup/ProgressBar";
import StepAccountOrg from "@/components/signup/StepAccountOrg";
import StepBillingConfirm from "@/components/signup/StepBillingConfirm";
import StepPlanSelection from "@/components/signup/StepPlanSelection";
import {
  defaultSignupSnapshot,
  loadSignupSnapshot,
  saveSignupSnapshot,
  type SignupSnapshot,
} from "@/components/signup/types";
import { parsePlanFromUrl } from "@/lib/pricing/plans";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

const STEP_LABELS = ["Plan", "Account", "Billing"] as const;

export default function SignupPage() {
  const searchParams = useSearchParams();
  const [snapshot, setSnapshot] = useState<SignupSnapshot>(() => defaultSignupSnapshot());
  const [hydrated, setHydrated] = useState(false);

  const patchSnapshot = useCallback((patch: Partial<SignupSnapshot>) => {
    setSnapshot((s) => ({ ...s, ...patch }));
  }, []);

  useEffect(() => {
    const loaded = loadSignupSnapshot();
    const planParam = searchParams.get("plan");
    const planFromUrl = parsePlanFromUrl(planParam);
    setSnapshot({
      ...loaded,
      planTier: planParam ? planFromUrl : loaded.planTier ?? "starter",
      billingCycle: loaded.billingCycle ?? "monthly",
    });
    setHydrated(true);
  }, [searchParams]);

  useEffect(() => {
    if (!hydrated) return;
    saveSignupSnapshot(snapshot);
  }, [snapshot, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    const supabase = createSupabaseBrowserClient();
    let cancelled = false;

    const reconcile = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;

      if (session) {
        setSnapshot((s) => {
          if (s.accountVerificationPending) {
            return { ...s, accountVerificationPending: false };
          }
          if (s.workspaceId && s.currentStep < 3) {
            return { ...s, currentStep: 3 };
          }
          if (s.currentStep === 2 && s.workspaceId) {
            return { ...s, currentStep: 3 };
          }
          return s;
        });
        return;
      }

      setSnapshot((s) => {
        if (s.accountVerificationPending) {
          if (s.currentStep !== 2) {
            return { ...s, currentStep: 2 };
          }
          return s;
        }
        if (s.currentStep > 2 && !s.workspaceId) {
          return {
            ...defaultSignupSnapshot(),
            planTier: s.planTier ?? "starter",
            billingCycle: s.billingCycle ?? "monthly",
            accountEmail: s.accountEmail,
            accountFullName: s.accountFullName,
            companyName: s.companyName,
            accountVerificationPending: false,
            currentStep: 2,
          };
        }
        return s;
      });
    };

    void reconcile();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void reconcile();
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [hydrated]);

  const goToStep = useCallback((step: number, patch?: Partial<SignupSnapshot>) => {
    setSnapshot((s) => ({
      ...s,
      ...(patch ?? {}),
      currentStep: Math.min(3, Math.max(1, step)),
    }));
  }, []);

  return (
    <div className="min-h-screen px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8 hairline-b pb-8 text-center sm:mb-10">
          <p className="font-mono text-[10px] uppercase tracking-[0.35em] text-black/75 dark:text-white/75">
            [ ONBOARD / WORKSPACE ]
          </p>
          <h1 className="mt-4 font-sans text-2xl font-black uppercase tracking-tight text-black sm:text-3xl dark:text-white">
            Revenue command center
          </h1>
          <p className="mx-auto mt-3 max-w-lg font-mono text-xs leading-relaxed text-black/90 dark:text-white/90">
            Choose a plan, create your account, and launch your console.
          </p>
          <p className="mt-4 font-mono text-[10px] uppercase tracking-widest text-black/70 dark:text-white/70">
            Already registered?{" "}
            <Link href="/login" className="cursor-pointer text-[#0f2336] underline underline-offset-4 dark:text-muted">
              Sign in
            </Link>
          </p>
        </header>
        <div className="border border-border bg-white p-4 sm:p-8 dark:border-border dark:bg-surface-card">
          <ProgressBar currentStep={snapshot.currentStep} steps={STEP_LABELS} />
          <div className="mt-8 border-t border-dashed border-border pt-8 sm:mt-10 dark:border-border">
            {snapshot.currentStep === 1 ? (
              <StepPlanSelection
                snapshot={snapshot}
                onComplete={(patch) => goToStep(2, patch)}
              />
            ) : null}
            {snapshot.currentStep === 2 ? (
              <StepAccountOrg
                snapshot={snapshot}
                onPatch={patchSnapshot}
                onComplete={(patch) => goToStep(3, patch)}
                onBack={() => goToStep(1)}
              />
            ) : null}
            {snapshot.currentStep === 3 ? <StepBillingConfirm snapshot={snapshot} /> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
