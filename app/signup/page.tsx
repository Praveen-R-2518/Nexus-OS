"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
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
import { parsePlanFromUrl } from "@/lib/pricing/plans";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { fetchInvitePreview, type InvitePreview } from "@/lib/invites";

const STEP_LABELS = [
  "Account",
  "Workspace",
  "Plan",
  "Payment",
  "Gmail",
  "Done",
] as const;

const STEP_FROM_PARAM: Record<string, number> = {
  account: 1,
  workspace: 2,
  plan: 3,
  payment: 4,
  gmail: 5,
  done: 6,
};

function stepFromParam(raw: string | null): number | null {
  if (!raw) return null;
  return STEP_FROM_PARAM[raw.trim().toLowerCase()] ?? null;
}

function hasSignupProgress(snapshot: SignupSnapshot): boolean {
  return (
    snapshot.currentStep > 2 ||
    Boolean(snapshot.workspaceId) ||
    Boolean(snapshot.subscriptionId) ||
    snapshot.gmailConnected !== null
  );
}

export default function SignupPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [snapshot, setSnapshot] = useState<SignupSnapshot>(() => defaultSignupSnapshot());
  const [hydrated, setHydrated] = useState(false);

  // Invite link handling: ?invite=<token>. We resolve the org name + validity via
  // the public invite_preview RPC so we can pre-warn on expired/used links before
  // the auth.users trigger silently falls through to creating a brand-new org.
  const inviteToken = (searchParams.get("invite") ?? "").trim() || null;
  const [invitePreview, setInvitePreview] = useState<InvitePreview | null>(null);
  const [inviteStatusError, setInviteStatusError] = useState<string | null>(null);

  const patchSnapshot = useCallback((patch: Partial<SignupSnapshot>) => {
    setSnapshot((s) => ({ ...s, ...patch }));
  }, []);

  useEffect(() => {
    if (!inviteToken) {
      setInvitePreview(null);
      setInviteStatusError(null);
      return;
    }
    const supabase = createSupabaseBrowserClient();
    let cancelled = false;
    (async () => {
      try {
        const preview = await fetchInvitePreview(supabase, inviteToken);
        if (cancelled) return;
        if (!preview) {
          setInvitePreview(null);
          setInviteStatusError(
            "This invite link is invalid. You can still create your own workspace below.",
          );
          return;
        }
        setInvitePreview(preview);
        if (preview.status === "expired") {
          setInviteStatusError(
            `This invite to ${preview.organization_name} has expired. You can still create your own workspace below.`,
          );
        } else if (preview.status === "accepted") {
          setInviteStatusError(
            `This invite to ${preview.organization_name} was already used. Sign in instead, or create your own workspace below.`,
          );
        } else {
          setInviteStatusError(null);
        }
      } catch {
        if (!cancelled) {
          setInvitePreview(null);
          setInviteStatusError(
            "We couldn't verify this invite link. You can still create your own workspace below.",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [inviteToken]);

  const validInvite = invitePreview?.status === "pending";

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
      const requestedStep = stepFromParam(searchParams.get("step"));
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;

      if (session) {
        let teamId: string | null = null;
        let workspaceId: string | null = null;

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("team_id")
          .eq("id", session.user.id)
          .maybeSingle();

        if (!profileError) {
          const rawTeamId = profile && (profile as { team_id?: unknown }).team_id;
          teamId =
            typeof rawTeamId === "string" && rawTeamId.trim()
              ? rawTeamId.trim()
              : null;
        }

        if (teamId) {
          const { data: workspace } = await supabase
            .from("workspaces")
            .select("id")
            .eq("team_id", teamId)
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle();

          const rawWorkspaceId =
            workspace && (workspace as { id?: unknown }).id;
          workspaceId =
            typeof rawWorkspaceId === "string" && rawWorkspaceId.trim()
              ? rawWorkspaceId.trim()
              : null;
        }

        if (cancelled) return;

        let shouldRedirectDashboard = false;

        setSnapshot((s) => {
          const progressExists = hasSignupProgress(s);
          const next: SignupSnapshot = {
            ...s,
            accountEmail: s.accountEmail || session.user.email || "",
            accountVerificationPending: false,
            workspaceId: s.workspaceId || workspaceId,
          };

          if (!requestedStep && teamId && workspaceId && !progressExists) {
            shouldRedirectDashboard = true;
            return next;
          }

          if (requestedStep) {
            next.currentStep = Math.max(next.currentStep, requestedStep);
          } else if (next.currentStep === 1) {
            next.currentStep = teamId && workspaceId ? 3 : 2;
          }

          if (!teamId && !next.workspaceId && next.currentStep > 2) {
            next.currentStep = 2;
          }

          return next;
        });
        if (shouldRedirectDashboard) {
          router.replace("/dashboard");
        }
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
            planTier: s.planTier ?? "starter",
            billingCycle: s.billingCycle ?? "monthly",
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
  }, [hydrated, router, searchParams]);

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
          <p className="nexus-meta text-nexus-approval">
            Onboard workspace
          </p>
          <h1 className="mt-4 nexus-section-title text-atmospheric-grey">
            Revenue command center
          </h1>
          <p className="mx-auto mt-3 max-w-lg nexus-body text-muted">
            Create a workspace, connect Gmail, and choose the automation setup that fits your team.
          </p>
          <p className="mt-4 text-sm text-muted">
            Already registered?{" "}
            <Link href="/login" className="cursor-pointer font-medium text-nexus-approval underline underline-offset-4">
              Sign in
            </Link>
          </p>
          {inviteToken && inviteStatusError ? (
            <p
              role="alert"
              className="mx-auto mt-5 max-w-lg rounded-xl border border-status-warning-border bg-status-warning-surface px-4 py-3 text-sm text-status-warning"
            >
              {inviteStatusError}
            </p>
          ) : validInvite && invitePreview ? (
            <p className="mx-auto mt-5 max-w-lg rounded-xl border border-nexus-approval-border bg-nexus-approval-soft px-4 py-3 text-sm text-nexus-approval">
              You&apos;re joining <span className="font-semibold">{invitePreview.organization_name}</span>.
            </p>
          ) : null}
        </header>
        <div className="app-glass-card rounded-2xl p-4 sm:p-8">
          <ProgressBar currentStep={snapshot.currentStep} steps={STEP_LABELS} />
          <div className="mt-8 hairline-t pt-8 sm:mt-10">
            {snapshot.currentStep === 1 ? (
              <StepAccount
                snapshot={snapshot}
                onPatch={patchSnapshot}
                onNext={() => goToStep(2)}
                inviteToken={validInvite ? inviteToken : null}
                inviteOrgName={validInvite ? invitePreview?.organization_name ?? null : null}
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
