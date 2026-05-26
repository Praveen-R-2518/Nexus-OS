"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
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
          return { ...s, currentStep: 2, accountVerificationPending: false };
        });
        return;
      }

      setSnapshot((s) => {
        if (s.accountVerificationPending) {
          if (s.currentStep !== 1) {
            return { ...s, currentStep: 1 };
          }
          return s;
        }
        if (s.currentStep > 1) {
          return {
            ...defaultSignupSnapshot(),
            accountEmail: s.accountEmail,
            accountFullName: s.accountFullName,
            accountPhone: s.accountPhone,
            accountVerificationPending: false,
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
    <div className="min-h-screen px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8 hairline-b pb-8 text-center sm:mb-10">
          <p className="font-mono text-[10px] uppercase tracking-[0.35em] text-black/55 dark:text-white/50">
            [ ONBOARD / WORKSPACE ]
          </p>
          <h1 className="mt-4 font-sans text-2xl font-black uppercase tracking-tight text-black sm:text-3xl dark:text-white">
            Revenue command center
          </h1>
          <p className="mx-auto mt-3 max-w-lg font-mono text-xs leading-relaxed text-black/75 dark:text-white/70">
            Multi-step signup — flat panels, monospace labels, navy primary actions.
          </p>
          <p className="mt-4 font-mono text-[10px] uppercase tracking-widest text-black/50 dark:text-white/45">
            Already registered?{" "}
            <Link href="/login" className="cursor-pointer text-[#0f2336] underline underline-offset-4 dark:text-[#a8bdd4]">
              Sign in
            </Link>
          </p>
        </header>
        <div className="border border-border bg-white p-4 sm:p-8 dark:border-border dark:bg-surface-card">
          <ProgressBar currentStep={snapshot.currentStep} steps={STEP_LABELS} />
          <div className="mt-8 border-t border-dashed border-border pt-8 sm:mt-10 dark:border-border">
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
