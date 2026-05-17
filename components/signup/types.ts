export type PlanTier = "starter" | "pro" | "team" | "enterprise";
export type BillingCycle = "monthly" | "annual";
export type WorkspaceType = "solo" | "team";

/** v3: account fields only (no verification gate); do not store passwords */
export const SIGNUP_STORAGE_KEY = "nexus-os-signup-state-v3";

const LEGACY_SIGNUP_STORAGE_KEYS = [
  "nexus-os-signup-state-v2",
  "nexus-os-signup-state-v1",
] as const;

export type SignupSnapshot = {
  currentStep: number;
  workspaceId: string | null;
  subscriptionId: string | null;
  companyName: string;
  industry: string;
  companySize: string;
  workspaceType: WorkspaceType;
  teamSize: number;
  teamEmails: string[];
  planTier: PlanTier | null;
  billingCycle: BillingCycle | null;
  gmailConnected: boolean | null;
  accountEmail: string;
  accountFullName: string;
  accountPhone: string;
};

export const defaultSignupSnapshot = (): SignupSnapshot => ({
  currentStep: 1,
  workspaceId: null,
  subscriptionId: null,
  companyName: "",
  industry: "",
  companySize: "",
  workspaceType: "solo",
  teamSize: 2,
  teamEmails: [""],
  planTier: null,
  billingCycle: "monthly",
  gmailConnected: null,
  accountEmail: "",
  accountFullName: "",
  accountPhone: "",
});

function mergeSnapshot(parsed: Record<string, unknown>): SignupSnapshot {
  const { accountVerificationPending, ...rest } = parsed;
  void accountVerificationPending;
  return { ...defaultSignupSnapshot(), ...(rest as Partial<SignupSnapshot>) };
}

export function loadSignupSnapshot(): SignupSnapshot {
  if (typeof window === "undefined") return defaultSignupSnapshot();
  try {
    const rawV3 = sessionStorage.getItem(SIGNUP_STORAGE_KEY);
    if (rawV3) {
      const parsed = JSON.parse(rawV3) as Record<string, unknown>;
      return mergeSnapshot(parsed);
    }
    for (const legacyKey of LEGACY_SIGNUP_STORAGE_KEYS) {
      const raw = sessionStorage.getItem(legacyKey);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const merged = mergeSnapshot(parsed);
        try {
          sessionStorage.setItem(SIGNUP_STORAGE_KEY, JSON.stringify(merged));
          sessionStorage.removeItem(legacyKey);
        } catch {
          // ignore quota / private mode
        }
        return merged;
      }
    }
    return defaultSignupSnapshot();
  } catch {
    return defaultSignupSnapshot();
  }
}

export function saveSignupSnapshot(snapshot: SignupSnapshot) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(SIGNUP_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // ignore quota / private mode
  }
}
