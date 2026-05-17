export type PlanTier = "starter" | "pro" | "team" | "enterprise";
export type BillingCycle = "monthly" | "annual";
export type WorkspaceType = "solo" | "team";

/** v2: adds account verification fields; do not store passwords here */
export const SIGNUP_STORAGE_KEY = "nexus-os-signup-state-v2";

const LEGACY_SIGNUP_STORAGE_KEY = "nexus-os-signup-state-v1";

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
  /** Set after signUp when email confirmation is required (no session yet). Never store passwords. */
  accountEmail: string;
  accountFullName: string;
  accountPhone: string;
  accountVerificationPending: boolean;
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
  accountVerificationPending: false,
});

function mergeSnapshot(parsed: Partial<SignupSnapshot>): SignupSnapshot {
  return { ...defaultSignupSnapshot(), ...parsed };
}

export function loadSignupSnapshot(): SignupSnapshot {
  if (typeof window === "undefined") return defaultSignupSnapshot();
  try {
    const rawV2 = sessionStorage.getItem(SIGNUP_STORAGE_KEY);
    if (rawV2) {
      const parsed = JSON.parse(rawV2) as Partial<SignupSnapshot>;
      return mergeSnapshot(parsed);
    }
    const rawV1 = sessionStorage.getItem(LEGACY_SIGNUP_STORAGE_KEY);
    if (rawV1) {
      const parsed = JSON.parse(rawV1) as Partial<SignupSnapshot>;
      const merged = mergeSnapshot(parsed);
      try {
        sessionStorage.setItem(SIGNUP_STORAGE_KEY, JSON.stringify(merged));
        sessionStorage.removeItem(LEGACY_SIGNUP_STORAGE_KEY);
      } catch {
        // ignore quota / private mode
      }
      return merged;
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
