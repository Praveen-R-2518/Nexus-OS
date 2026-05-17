"use client";

import { useCallback, useEffect, useState } from "react";
import ProgressBar from "@/components/signup/ProgressBar";
import StepAccount from "@/components/signup/StepAccount";
import StepDone from "@/components/signup/StepDone";
import StepGmail from "@/components/signup/StepGmail";
import StepPayment from "@/components/signup/StepPayment";
import StepPlan from "@/components/signup/StepPlan";
import StepWorkspace from "@/components/signup/StepWorkspace";
import {
  defaultSignupSnapshot,
  loadSignupSnapshot,
  saveSignupSnapshot,
  type SignupSnapshot,
} from "@/components/signup/types";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

const STEP_LABELS = [
  "Account",
  "Workspace",
  "Plan",
  "Payment",
  "Gmail",
  "Done",
] as const;

export default function SignupPage() {
  const [snapshot, setSnapshot] = useState<SignupSnapshot>(() => defaultSignupSnapshot());
  const [hydrated, setHydrated] = useState(false);

  const patchSnapshot = useCallback((patch: Partial<SignupSnapshot>) => {
    setSnapshot((s) => ({ ...s, ...patch }));
  }, []);

  useEffect(() => {
    setSnapshot(loadSignupSnapshot());
    setHydrated(true);
  }, []);

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
          if (s.currentStep !== 1) return s;
          return { ...s, currentStep: 2 };
        });
        return;
      }

      setSnapshot((s) => {
        if (s.currentStep > 1) {
          return {
            ...defaultSignupSnapshot(),
            accountEmail: s.accountEmail,
            accountFullName: s.accountFullName,
            accountPhone: s.accountPhone,
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
      currentStep: Math.min(6, Math.max(1, step)),
    }));
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-gradient-to-b dark:from-slate-950 dark:to-slate-900 px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8 text-center sm:mb-10">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#1B6B3A] dark:text-emerald-400">
            NexusOS
          </p>
          <h1 className="mt-2 text-2xl font-bold text-slate-900 dark:text-foreground sm:text-3xl">
            Revenue Command Center
          </h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Multi-step signup — optimized for a clean live demo.
          </p>
        </header>
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 surface-card p-4 shadow-xl shadow-black/5 dark:shadow-black/30 sm:p-8">
          <ProgressBar currentStep={snapshot.currentStep} steps={STEP_LABELS} />
          <div className="mt-8 sm:mt-10">
            {snapshot.currentStep === 1 ? (
              <StepAccount
                snapshot={snapshot}
                onPatch={patchSnapshot}
                onNext={() => goToStep(2)}
              />
            ) : null}
            {snapshot.currentStep === 2 ? (
              <StepWorkspace
                snapshot={snapshot}
                onComplete={(patch) => goToStep(3, patch)}
              />
            ) : null}
            {snapshot.currentStep === 3 ? (
              <StepPlan snapshot={snapshot} onComplete={(patch) => goToStep(4, patch)} />
            ) : null}
            {snapshot.currentStep === 4 ? (
              <StepPayment snapshot={snapshot} onNext={() => goToStep(5)} />
            ) : null}
            {snapshot.currentStep === 5 ? (
              <StepGmail
                snapshot={snapshot}
                onComplete={(patch) => goToStep(6, patch)}
              />
            ) : null}
            {snapshot.currentStep === 6 ? <StepDone snapshot={snapshot} /> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
