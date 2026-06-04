export type PlanTier = "starter" | "pro" | "team" | "enterprise";
export type BillingCycle = "monthly" | "annual";
export type WorkspaceType = "solo" | "team";

/** v3: localStorage-backed resume state; do not store passwords here */
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
  planTier: "starter",
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
    const rawCurrent = window.localStorage.getItem(SIGNUP_STORAGE_KEY);
    if (rawCurrent) {
      const parsed = JSON.parse(rawCurrent) as Partial<SignupSnapshot>;
      return mergeSnapshot(parsed);
    }

    for (const key of LEGACY_SIGNUP_STORAGE_KEYS) {
      const rawLegacy =
        window.localStorage.getItem(key) ?? window.sessionStorage.getItem(key);
      if (rawLegacy) {
        const parsed = JSON.parse(rawLegacy) as Partial<SignupSnapshot>;
        const merged = mergeSnapshot(parsed);
        try {
          window.localStorage.setItem(SIGNUP_STORAGE_KEY, JSON.stringify(merged));
          window.localStorage.removeItem(key);
          window.sessionStorage.removeItem(key);
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
    window.localStorage.setItem(SIGNUP_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // ignore quota / private mode
  }
}

export function clearSignupSnapshot() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(SIGNUP_STORAGE_KEY);
    for (const key of LEGACY_SIGNUP_STORAGE_KEYS) {
      window.localStorage.removeItem(key);
      window.sessionStorage.removeItem(key);
    }
  } catch {
    // ignore quota / private mode
  }
}
